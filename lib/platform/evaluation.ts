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
  scope_checked: z.enum(['whole', 'partial']).optional(),
  chatgpt_minutes: z.number().min(0).max(100000).nullable().optional(),
  timing: z
    .object({
      preparation_minutes: z.number().min(0).max(100000).nullable(),
      configuration_minutes: z.number().min(0).max(100000).nullable(),
      analysis_minutes: z.number().min(0).max(100000).nullable(),
      writing_minutes: z.number().min(0).max(100000).nullable(),
      waiting_minutes: z.number().min(0).max(100000).nullable(),
    })
    .optional(),
});
export type Evaluation = {
  id: string;
  current?: number;
  config: {
    task_id: string;
    revision: number;
    phase: string;
    result_hash: string;
    recipe?: string;
    model_id?: string;
    kind?: 'extraction' | 'investigation';
    method_version?: number;
  };
  metrics: z.infer<typeof evaluationInput> & {
    records: number;
    fields: number;
    missing_fields?: number;
    inferred_fields?: number;
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
  const investigation = task.input.parameters.agent_stage === 'report';
  if (
    !task.result ||
    (!investigation &&
      (!data.success || task.input.parameters.extraction !== true)) ||
    !['review', 'succeeded', 'accepted'].includes(task.status)
  )
    throw new HttpError(409, '请选择已完成的摘录或查证报告。');
  const records = investigation
    ? task.result.citations.length
    : data.success
      ? data.data.records.length
      : 0;
  const fields = investigation
    ? 100000
    : data.success
      ? data.data.records.reduce((n, r) => n + r.cells.length, 0)
      : 0;
  if (
    (!investigation && value.false_inclusions > records) ||
    value.wrong_values > fields ||
    value.wrong_categories > fields
  )
    throw new HttpError(400, '错误数不能超过本页记录或栏目总数。');
  const execution = await store.db
    .prepare(
      "SELECT json_extract(model_snapshot,'$.provider') provider,json_extract(model_snapshot,'$.model_id') model_name FROM research_jobs WHERE project_id=? AND json_extract(model_snapshot,'$.mission_task.id')=? AND json_extract(model_snapshot,'$.mission_task.attempt')=? AND status='succeeded' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(task.project_id, task.id, task.attempt)
    .first<{ provider: string; model_name: string }>();
  const id = crypto.randomUUID(),
    config = {
      task_id: task.id,
      recipe:
        typeof task.input.parameters.recipe === 'string'
          ? task.input.parameters.recipe
          : '',
      kind: investigation ? 'investigation' : 'extraction',
      model_id: task.input.model_id,
      ...execution,
      method_version:
        (task.input.parameters.method as { version?: number } | undefined)
          ?.version || 1,
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
      JSON.stringify({
        ...value,
        records,
        fields: investigation ? 0 : fields,
        ...(!investigation && data.success
          ? {
              missing_fields: data.data.records.reduce(
                (n, r) =>
                  n + r.cells.filter((c) => c.status === 'missing').length,
                0,
              ),
              inferred_fields: data.data.records.reduce(
                (n, r) =>
                  n + r.cells.filter((c) => c.status === 'inferred').length,
                0,
              ),
            }
          : {}),
      }),
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
