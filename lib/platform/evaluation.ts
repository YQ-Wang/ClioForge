import { z } from 'zod';
import { HttpError } from '../errors';
import { extractionSchema } from './research-recipes';
import { sha256 } from './search';
import type { MissionStore } from './missions';
export const evaluationInput = z.object({
  expected: z.number().int().nonnegative(),
  missed: z.number().int().min(0).max(10000),
  false_inclusions: z.number().int().min(0).max(10000),
  wrong_values: z.number().int().min(0).max(100000),
  wrong_categories: z.number().int().min(0).max(100000),
  review_minutes: z.number().min(0).max(100000),
  manual_minutes: z.number().min(0).max(100000).nullable(),
  notes: z.string().trim().min(1).max(4000),
});
export type Evaluation = {
  id: string;
  current?: number;
  config: {
    task_id: string;
    revision: number;
    phase: string;
    result_hash: string;
  };
  metrics: z.infer<typeof evaluationInput> & {
    records: number;
    fields: number;
  };
  created_at: string;
  created_by: string;
};
export async function saveEvaluation(
  store: MissionStore,
  taskId: string,
  raw: unknown,
) {
  const task = await store.task(taskId, 'review'),
    value = evaluationInput.parse(raw);
  const data = extractionSchema.safeParse(task.result?.data);
  if (
    !task.result ||
    !data.success ||
    task.input.parameters.extraction !== true ||
    !['review', 'succeeded', 'accepted'].includes(task.status)
  )
    throw new HttpError(409, '请选择已完成的摘录。');
  const fields = data.data.records.reduce((n, r) => n + r.cells.length, 0);
  if (
    value.false_inclusions > data.data.records.length ||
    value.wrong_values > fields ||
    value.wrong_categories > fields
  )
    throw new HttpError(400, '错误数不能超过本页记录或栏目总数。');
  const id = crypto.randomUUID(),
    config = {
      task_id: task.id,
      revision: task.revision,
      phase:
        typeof task.input.parameters.phase === 'string'
          ? task.input.parameters.phase
          : 'unspecified',
      result_hash: await sha256(JSON.stringify(task.result)),
    };
  const saved = await store.db
    .prepare(
      "INSERT INTO evaluation_runs SELECT ?,project_id,title,?,?,?, ?,?,? FROM mission_tasks WHERE id=? AND revision=? AND status IN ('review','succeeded','accepted')",
    )
    .bind(
      id,
      task.mission_id,
      JSON.stringify(config),
      JSON.stringify({ ...value, records: data.data.records.length, fields }),
      JSON.stringify({ result: task.result, pages: task.input.page_refs }),
      store.owner,
      new Date().toISOString(),
      task.id,
      value.expected,
    )
    .run();
  if (!saved.meta.changes)
    throw new HttpError(409, '摘录已更新，请重新核查后记录评估。');
  return id;
}
