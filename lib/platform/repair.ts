import { canRepairProse } from '../review-citations';
import { checkCitationNumbers } from '../reading-output';
import { z } from 'zod';
import { HttpError } from '../errors';
import { citationSchema, resultSchema } from './types';
import type { MissionStore } from './missions';

const repairInput = z.object({
  summary: z.string().trim().min(1).max(30000),
  citations: z.array(citationSchema).min(1).max(100),
  reason: z.string().trim().min(1).max(10000),
  expected: z.number().int().positive(),
});

export async function repairProse(
  store: MissionStore,
  id: string,
  raw: unknown,
) {
  const input = repairInput.parse(raw);
  const task = await store.task(id, 'review');
  if (!canRepairProse(task) || task.revision !== input.expected)
    throw new HttpError(409, '稿件已有更新或当前步骤不能修订，请刷新。');
  const dependencies = (
    await store.db
      .prepare(
        'SELECT p.id,p.revision,p.status FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=?',
      )
      .bind(id)
      .all<{ id: string; revision: number; status: string }>()
  ).results;
  if (
    dependencies.some((dep) => !['succeeded', 'accepted'].includes(dep.status))
  )
    throw new HttpError(409, '前置材料尚未通过核查，请先处理前置步骤。');
  const previousData = z
    .object({ limitations: z.array(z.string()).max(3) })
    .safeParse(task.result?.data);
  const result = resultSchema.parse({
    summary: input.summary,
    citations: input.citations,
    data: previousData.success ? previousData.data : { limitations: [] },
  });
  checkCitationNumbers(result);
  result.checks = await store.checkResult(task, result);
  const correction = crypto.randomUUID(),
    date = new Date().toISOString();
  // A repair is a new reviewed candidate, never an acceptance or a paid retry.
  // Original provider responses and attempts remain immutable.
  const saved = await store.db.batch([
    store.db
      .prepare(
        "UPDATE mission_tasks SET result=?,status='review',error=NULL,revision=revision+1,updated_at=?,review_token=? WHERE id=? AND revision=? AND status IN ('review','succeeded','uncertain','failed') AND EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_id AND m.status IN ('active','paused')) AND (SELECT COUNT(*) FROM task_dependencies d WHERE d.task_id=mission_tasks.id)=? AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on LEFT JOIN json_each(?) s ON json_extract(s.value,'$.id')=p.id WHERE d.task_id=mission_tasks.id AND (p.status NOT IN ('succeeded','accepted') OR s.value IS NULL OR p.revision<>json_extract(s.value,'$.revision')))",
      )
      .bind(
        JSON.stringify(result),
        date,
        correction,
        id,
        input.expected,
        dependencies.length,
        JSON.stringify(dependencies),
      ),
    store.db
      .prepare(
        'INSERT INTO task_corrections SELECT ?,project_id,id,?,?,?,? FROM mission_tasks WHERE id=? AND review_token=?',
      )
      .bind(
        correction,
        JSON.stringify({ before: task.result, after: result }),
        input.reason,
        store.owner,
        date,
        id,
        correction,
      ),
    store.db
      .prepare(
        "WITH RECURSIVE affected(id) AS (SELECT task_id FROM task_dependencies WHERE depends_on=? UNION SELECT d.task_id FROM task_dependencies d JOIN affected a ON d.depends_on=a.id) UPDATE mission_tasks SET status='stale',revision=revision+1,updated_at=? WHERE id IN (SELECT id FROM affected) AND status IN ('running','succeeded','accepted','review','ready','queued') AND EXISTS(SELECT 1 FROM task_corrections WHERE id=?)",
      )
      .bind(id, date, correction),
    store.db
      .prepare(
        "INSERT INTO task_events(task_id,mission_id,actor,kind,detail,created_at) SELECT id,mission_id,?,'corrected',?,? FROM mission_tasks WHERE id=? AND review_token=?",
      )
      .bind(store.owner, input.reason, date, id, correction),
  ]);
  if (!saved[0].meta.changes)
    throw new HttpError(409, '稿件已有更新，请重新检查。');
  return store.task(id);
}
