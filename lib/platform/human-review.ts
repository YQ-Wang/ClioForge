import { z } from 'zod';
import { HttpError } from '../errors';
import type { MissionStore } from './missions';
import { sha256 } from './search';
import type { TaskResult } from './types';

export const humanReviewInput = z.object({
  summary: z
    .string()
    .min(1)
    .max(100000)
    .refine((value) => !!value.trim()),
  expected: z.number().int().positive(),
});

// Human writing is already complete when submitted. Save it directly, without
// a client-held execution lease that a failed response could strand.
export async function submitHumanReview(
  store: MissionStore,
  id: string,
  raw: unknown,
) {
  const input = humanReviewInput.parse(raw);
  const task = await store.task(id, 'write');
  if (task.executor !== 'human')
    throw new HttpError(400, '请选择人工核查步骤。');
  const signature = await sha256(
    JSON.stringify({ id, actor: store.owner, ...input }),
  );
  const previous = () =>
    store.db
      .prepare(
        "SELECT attempt FROM task_attempts WHERE task_id=? AND actor=? AND json_extract(result,'$.data.human_submission.signature')=? LIMIT 1",
      )
      .bind(id, store.owner, signature)
      .first();
  // A lost response may be retried after the task has already been reviewed.
  // The immutable attempt identifies the saved submission, not current status.
  if (await previous()) return store.task(id);
  if (task.status !== 'ready' || task.revision !== input.expected)
    throw new HttpError(409, '任务已有更新，请重新检查后提交。');

  const dependencies = (
    await store.db
      .prepare(
        'SELECT p.id,p.revision,p.attempt,p.input,p.result FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=? ORDER BY p.created_at,p.id',
      )
      .bind(id)
      .all<{
        id: string;
        revision: number;
        attempt: number;
        input: string;
        result: string | null;
      }>()
  ).results.map((row) => ({
    ...row,
    input: JSON.parse(row.input),
    result: row.result ? (JSON.parse(row.result) as TaskResult) : null,
  }));
  const result: TaskResult = {
    summary: input.summary,
    citations: dependencies
      .flatMap((dep) => dep.result?.citations || [])
      .slice(0, 100),
    checks: [],
    data: { human_submission: { expected: input.expected, signature } },
  };
  result.checks = await store.checkResult(task, result);
  const serialized = JSON.stringify(result),
    snapshot = JSON.stringify(dependencies),
    date = new Date().toISOString(),
    token = crypto.randomUUID();
  const saved = await store.db.batch([
    store.db
      .prepare(
        "UPDATE mission_tasks SET result=?,status='review',attempt=attempt+1,claimed_by=?,error=NULL,lease_hash=NULL,lease_until=NULL,review_token=?,revision=revision+1,updated_at=? WHERE id=? AND executor='human' AND status='ready' AND revision=? AND EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_id AND m.status='active') AND (SELECT COUNT(*) FROM task_dependencies d WHERE d.task_id=mission_tasks.id)=? AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on LEFT JOIN json_each(?) s ON json_extract(s.value,'$.id')=p.id WHERE d.task_id=mission_tasks.id AND (p.status NOT IN ('succeeded','accepted') OR s.value IS NULL OR p.revision<>json_extract(s.value,'$.revision')))",
      )
      .bind(
        serialized,
        store.owner,
        token,
        date,
        id,
        input.expected,
        dependencies.length,
        snapshot,
      ),
    store.db
      .prepare(
        "INSERT INTO task_attempts(task_id,attempt,actor,input,dependencies,result,status,created_at,finished_at) SELECT id,attempt,claimed_by,input,?,result,'review',?,? FROM mission_tasks WHERE id=? AND review_token=?",
      )
      .bind(snapshot, date, date, id, token),
    store.db
      .prepare(
        "INSERT INTO task_events(task_id,mission_id,actor,kind,detail,created_at) SELECT id,mission_id,claimed_by,'review',?,? FROM mission_tasks WHERE id=? AND review_token=?",
      )
      .bind(input.summary.slice(0, 1000), date, id, token),
  ]);
  if (!saved[0].meta.changes) {
    if (await previous()) return store.task(id);
    throw new HttpError(409, '任务或前置材料已有更新，请重新检查后提交。');
  }
  // Review is a human gate: saving never accepts it or dispatches paid work.
  return store.task(id);
}
