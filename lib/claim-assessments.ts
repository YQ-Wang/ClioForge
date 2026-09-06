import { ResearchStore } from './store';
import { HttpError } from './errors';
import { sha256 } from './platform/search';
import { claimReviewData } from './claim-review';
import { z } from 'zod';
// Freeze assessments once the researcher has approved the final audit step.
const openAudit = `EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_tasks.mission_id AND m.status IN ('active','paused')) AND NOT EXISTS(SELECT 1 FROM mission_tasks gate WHERE gate.mission_id=mission_tasks.mission_id AND gate.executor='human' AND gate.status='accepted' AND json_extract(gate.input,'$.parameters.recipe')='audit')`;
export async function claimAssessments(store: ResearchStore, id: string) {
  const row = await store.db
    .prepare('SELECT * FROM mission_tasks WHERE id=?')
    .bind(id)
    .first<{
      id: string;
      project_id: string;
      revision: number;
      status: string;
      result: string | null;
      input: string;
    }>();
  if (!row) throw new HttpError(404, '研究步骤不存在。');
  const project = await store.project(row.project_id);
  if (
    !row.result ||
    JSON.parse(row.input).parameters?.output_schema !== 'claim_review_v1'
  )
    throw new HttpError(400, '此步骤没有逐条论述核查结果。');
  const findings = claimReviewData.parse(JSON.parse(row.result).data).findings,
    hash = await sha256(row.result);
  const reviews = (
    await store.db
      .prepare(
        'SELECT a.*,u.name reviewer_name FROM claim_assessments a JOIN user u ON u.id=a.reviewer WHERE a.task_id=? AND a.result_hash=? ORDER BY a.claim_index',
      )
      .bind(id, hash)
      .all<{
        claim_index: number;
        decision: 'accept' | 'revise' | 'reject';
        reason: string;
        reviewer_name: string;
      }>()
  ).results;
  const open = await store.db
    .prepare(`SELECT id FROM mission_tasks WHERE id=? AND ${openAudit}`)
    .bind(id)
    .first();
  return {
    project_id: row.project_id,
    revision: row.revision,
    status: row.status,
    hash,
    findings,
    reviews,
    reviewable:
      !!open &&
      ['owner', 'reviewer'].includes(project.role) &&
      ['succeeded', 'review', 'accepted'].includes(row.status),
  };
}
export async function assessClaim(store: ResearchStore, raw: unknown) {
  const v = z
    .object({
      task_id: z.uuid(),
      index: z.number().int().min(0).max(19),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      revision: z.number().int().positive(),
      decision: z.enum(['accept', 'revise', 'reject']),
      reason: z.string().trim().min(1).max(2000),
    })
    .parse(raw);
  const current = await claimAssessments(store, v.task_id);
  await store.project(current.project_id, 'review');
  if (
    !current.reviewable ||
    v.hash !== current.hash ||
    v.revision !== current.revision ||
    !current.findings[v.index]
  )
    throw new HttpError(409, '核查结果已变化，请重新打开后审读。');
  const token = crypto.randomUUID(),
    date = new Date().toISOString();
  const saved = await store.db.batch([
    store.db
      .prepare(
        `UPDATE mission_tasks SET revision=revision+1,review_token=?,updated_at=? WHERE id=? AND revision=? AND status IN ('succeeded','review','accepted') AND ${openAudit}`,
      )
      .bind(token, date, v.task_id, v.revision),
    store.db
      .prepare(
        'INSERT INTO claim_assessments(project_id,task_id,claim_index,result_hash,decision,reason,reviewer,updated_at) SELECT project_id,id,?,?,?,?,?,? FROM mission_tasks WHERE id=? AND review_token=? ON CONFLICT(task_id,claim_index,result_hash) DO UPDATE SET decision=excluded.decision,reason=excluded.reason,reviewer=excluded.reviewer,updated_at=excluded.updated_at',
      )
      .bind(
        v.index,
        v.hash,
        v.decision,
        v.reason,
        store.owner,
        date,
        v.task_id,
        token,
      ),
    store.db
      .prepare(
        "INSERT INTO task_events(task_id,mission_id,actor,kind,detail,created_at) SELECT id,mission_id,?,'claim_assessment',?,? FROM mission_tasks WHERE id=? AND review_token=?",
      )
      .bind(
        store.owner,
        JSON.stringify({
          claim_index: v.index,
          result_hash: v.hash,
          before:
            current.reviews.find((r) => r.claim_index === v.index) || null,
          after: { decision: v.decision, reason: v.reason },
        }),
        date,
        v.task_id,
        token,
      ),
  ]);
  if (!saved[0].meta.changes)
    throw new HttpError(409, '核查结果已有更新，请刷新。');
}
export async function requireClaimAssessments(
  store: ResearchStore,
  mission: string,
) {
  const tasks = (
    await store.db
      .prepare(
        "SELECT id FROM mission_tasks WHERE mission_id=? AND json_extract(input,'$.parameters.output_schema')='claim_review_v1'",
      )
      .bind(mission)
      .all<{ id: string }>()
  ).results;
  for (const task of tasks) {
    const value = await claimAssessments(store, task.id);
    if (value.reviews.length !== value.findings.length)
      throw new HttpError(
        409,
        '请先在逐条核查结果下，为每条论述保存你的判断与理由。',
      );
  }
}
