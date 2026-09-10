import { z } from 'zod';
import { sha256 } from '../platform/search';
import { taskInputSchema, resultSchema } from '../platform/types';
import {
  researchAction,
  researchActionKey,
  researchMemory,
  validateResearchReport,
} from './research-tools';
import type { MissionStore } from '../platform/missions';
import { HttpError } from '../errors';
import { orderedTasks } from '../task-presentation';
const traceData = z.object({
  format: z.enum(['clioforge-agent-trace', 'canwoo-agent-trace']),
  version: z.literal(1),
  mission: z.object({
    id: z.uuid(),
    project_id: z.uuid(),
    title: z.string(),
    question: z.string(),
    status: z.string(),
  }),
  tasks: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        executor: z.string(),
        status: z.string(),
        attempt: z.number(),
        created_at: z.string(),
        failure_stage: z.string().nullable().optional(),
        cost_units: z.number(),
        input: taskInputSchema,
        result: resultSchema.nullable(),
      }),
    )
    .max(1200),
  edges: z
    .array(z.object({ task_id: z.uuid(), depends_on: z.uuid() }))
    .max(36000),
  jobs: z
    .array(
      z.object({
        id: z.string(),
        task_id: z.string().nullable(),
        status: z.string(),
        result: z.string().nullable(),
        provider: z.string(),
        model: z.string(),
        diagnostics: z.string().nullable(),
        effort: z.string().nullable(),
        input_tokens: z.number(),
        output_tokens: z.number(),
        reserved_units: z.number(),
      }),
    )
    .max(2400),
  pages: z
    .array(
      z.object({
        version_id: z.uuid(),
        page: z.number().int().positive(),
        text: z.string().max(100000),
      }),
    )
    .max(100),
});
export type AgentTrace = { data: z.infer<typeof traceData>; sha256: string };
type TraceTask = AgentTrace['data']['tasks'][number];
function validateToolLedger(task: TraceTask, data: AgentTrace['data']) {
  const memory = researchMemory.parse(task.result?.data);
  const deps = data.tasks.filter((t) =>
    data.edges.some((e) => e.task_id === task.id && e.depends_on === t.id),
  );
  const prior = deps.filter((t) => t.input.parameters.agent_stage === 'tool');
  const decisions = deps.filter(
    (t) => t.input.parameters.agent_stage === 'decision',
  );
  if (prior.length > 1 || decisions.length !== 1)
    throw new Error('Ambiguous investigation dependencies');
  const decisionTools = data.edges
    .filter((e) => e.task_id === decisions[0].id)
    .map((e) => data.tasks.find((t) => t.id === e.depends_on))
    .filter((t) => t?.input.parameters.agent_stage === 'tool');
  if (
    decisionTools.length !== prior.length ||
    (prior.length && decisionTools[0]?.id !== prior[0].id)
  )
    throw new Error('Decision did not receive the preceding tool ledger');
  const before = prior.length
    ? researchMemory.parse(prior[0].result?.data)
    : { stopped: false, steps: [] };
  const action = researchAction.parse(decisions[0].result?.data);
  if (
    JSON.stringify(memory.steps.slice(0, before.steps.length)) !==
    JSON.stringify(before.steps)
  )
    throw new Error('Earlier tool records were rewritten');
  const noAppend =
    before.stopped ||
    before.steps.length >= 6 ||
    before.steps.some(
      (s) => researchActionKey(s.action) === researchActionKey(action),
    );
  if (
    memory.steps.length !== before.steps.length + (noAppend ? 0 : 1) ||
    (!noAppend &&
      JSON.stringify(memory.steps.at(-1)?.action) !== JSON.stringify(action)) ||
    (noAppend ||
      action.tool === 'finish' ||
      task.input.parameters.agent_last === true) !== memory.stopped
  )
    throw new Error(
      'Tool ledger does not follow its decision or stopping boundary',
    );
  if (before.stopped && JSON.stringify(memory) !== JSON.stringify(before))
    throw new Error('Stopped investigation was modified');
  const flattened = [
    ...new Map(
      memory.steps
        .flatMap((s) => s.citations)
        .map((c) => [JSON.stringify(c), c]),
    ).values(),
  ];
  if (JSON.stringify(flattened) !== JSON.stringify(task.result?.citations))
    throw new Error('Tool quotations do not match the ledger');
  for (const step of memory.steps) {
    const action = step.action;
    for (const citation of step.citations) {
      const page = data.pages.find(
        (p) => p.version_id === citation.version_id && p.page === citation.page,
      );
      if (
        !task.input.version_ids.includes(citation.version_id) ||
        !task.input.page_refs?.some(
          (p) =>
            p.version_id === citation.version_id && p.page === citation.page,
        ) ||
        !page ||
        !page.text.includes(citation.quote) ||
        (citation.start !== undefined &&
          page.text.slice(
            citation.start,
            citation.start + citation.quote.length,
          ) !== citation.quote)
      )
        throw new Error('Tool excerpt does not match a selected source');
    }
    if (action.tool === 'finish' && (step.citations.length || step.reading))
      throw new Error('Finish cannot return source text');
    if (action.tool === 'search' && (step.citations.length > 6 || step.reading))
      throw new Error('Invalid search result');
    if (action.tool !== 'read_page') continue;
    const page = data.pages.find(
      (p) => p.version_id === action.version_id && p.page === action.page,
    );
    if (
      !page ||
      !task.input.version_ids.includes(action.version_id) ||
      !task.input.page_refs?.some(
        (p) => p.version_id === action.version_id && p.page === action.page,
      )
    )
      throw new Error('Read outside the recorded scope');
    const start = action.start ?? 0,
      end = Math.min(start + 8000, page.text.length);
    if (start > page.text.length || (start === page.text.length && start > 0))
      throw new Error('Invalid reading position');
    const quote = page.text.slice(start, end);
    const expected = quote.trim()
      ? [{ version_id: action.version_id, page: action.page, quote, start }]
      : [];
    if (JSON.stringify(step.citations) !== JSON.stringify(expected))
      throw new Error('Read result differs from the requested source range');
    if (
      step.reading &&
      JSON.stringify(step.reading) !==
        JSON.stringify({
          start,
          end,
          total: page.text.length,
          next_start: end < page.text.length ? end : null,
        })
    )
      throw new Error('Incorrect reading coverage');
  }
}

function graphFailures(data: AgentTrace['data']) {
  const ids = new Set(data.tasks.map((t) => t.id));
  const edgeKeys = new Set(
    data.edges.map((e) => `${e.task_id}:${e.depends_on}`),
  );
  if (
    ids.size !== data.tasks.length ||
    edgeKeys.size !== data.edges.length ||
    data.edges.some((e) => !ids.has(e.task_id) || !ids.has(e.depends_on))
  )
    return ['Task graph contains duplicate or missing identifiers'];
  const remaining = new Map(data.tasks.map((t) => [t.id, 0]));
  const children = new Map<string, string[]>();
  for (const e of data.edges) {
    remaining.set(e.task_id, remaining.get(e.task_id)! + 1);
    children.set(e.depends_on, [
      ...(children.get(e.depends_on) || []),
      e.task_id,
    ]);
  }
  const queue = [...remaining].filter(([, n]) => n === 0).map(([id]) => id);
  for (let i = 0; i < queue.length; i++)
    for (const child of children.get(queue[i]) || []) {
      const count = remaining.get(child)! - 1;
      remaining.set(child, count);
      if (!count) queue.push(child);
    }
  return queue.length === ids.size
    ? []
    : ['Task graph contains a dependency cycle'];
}
export async function replayTrace(raw: unknown) {
  const envelope = z
    .object({ data: traceData, sha256: z.string().regex(/^[a-f0-9]{64}$/) })
    .parse(raw);
  if ((await sha256(JSON.stringify(envelope.data))) !== envelope.sha256)
    throw new Error('Trace checksum mismatch.');
  const failures = graphFailures(envelope.data);
  if (
    new Set(envelope.data.pages.map((p) => `${p.version_id}:${p.page}`))
      .size !== envelope.data.pages.length
  )
    failures.push('Trace contains duplicate source pages');
  let checked = 0;
  for (const task of envelope.data.tasks) {
    if (!task.result) continue;
    checked++;
    for (const citation of task.result.citations) {
      const page = envelope.data.pages.find(
        (p) => p.version_id === citation.version_id && p.page === citation.page,
      );
      if (
        !page ||
        (task.executor === 'model' &&
          !!task.input.page_refs &&
          !task.input.page_refs.some(
            (p) =>
              p.version_id === citation.version_id && p.page === citation.page,
          )) ||
        !page.text.includes(citation.quote) ||
        (citation.start !== undefined &&
          page.text.slice(
            citation.start,
            citation.start + citation.quote.length,
          ) !== citation.quote)
      )
        failures.push(
          `${task.title}: quotation does not match the recorded page`,
        );
    }
    try {
      if (task.input.parameters.agent_stage === 'decision') {
        researchAction.parse(task.result.data);
        if (task.result.citations.length)
          throw new Error('Decision contains quotations');
      }
      if (task.input.parameters.agent_stage === 'tool') {
        validateToolLedger(task, envelope.data);
      }
      if (task.input.parameters.agent_stage === 'report') {
        const memories = envelope.data.tasks
          .filter(
            (t) =>
              t.input.parameters.agent_stage === 'tool' &&
              t.result &&
              envelope.data.edges.some(
                (e) => e.task_id === task.id && e.depends_on === t.id,
              ),
          )
          .map((t) => researchMemory.parse(t.result!.data))
          .sort((a, b) => b.steps.length - a.steps.length);
        if (!memories[0]) throw new Error('Missing research tool ledger');
        validateResearchReport(task.result, memories[0]);
      }
    } catch {
      failures.push(`${task.title}: tool or report contract failed`);
    }
  }
  return {
    trace: envelope,
    checked,
    pending: envelope.data.tasks.filter((t) => !t.result).length,
    failures,
    cost_units: envelope.data.jobs.reduce((n, j) => n + j.reserved_units, 0),
    note: 'Offline source and tool-contract checks only. No model calls; historical interpretation still requires independent review.',
  };
}
export async function exportTrace(
  store: MissionStore,
  projectId: string,
  missionId: string,
): Promise<AgentTrace> {
  await store.project(projectId);
  const mission = await store.mission(missionId);
  if (mission.project_id !== projectId)
    throw new HttpError(404, '研究计划不存在。');
  const size = await store.db
    .prepare(
      "SELECT COALESCE((SELECT SUM(length(CAST(input AS BLOB))+COALESCE(length(CAST(result AS BLOB)),0)) FROM mission_tasks WHERE mission_id=?),0) + COALESCE((SELECT SUM(COALESCE(length(CAST(j.result AS BLOB)),0)) FROM research_jobs j JOIN mission_tasks t ON t.id=json_extract(j.model_snapshot,'$.mission_task.id') WHERE t.mission_id=? AND j.project_id=?),0) bytes",
    )
    .bind(missionId, missionId, projectId)
    .first<{ bytes: number }>();
  if ((size?.bytes || 0) > 4 * 1024 * 1024)
    throw new HttpError(
      413,
      '研究记录过大，请选择范围较小的研究计划导出回放。',
    );
  const view = await store.view(missionId);
  if (view.mission.project_id !== projectId)
    throw new HttpError(404, '研究计划不存在。');
  const refs = [
    ...new Map(
      view.tasks
        .flatMap((t) => [
          ...(t.input.page_refs || []),
          ...(t.result?.citations || []).map((c) => ({
            version_id: c.version_id,
            page: c.page,
          })),
        ])
        .map((p) => [`${p.version_id}:${p.page}`, p]),
    ).values(),
  ];
  if (refs.length > 100)
    throw new HttpError(413, '回放最多包含 100 页，请选择范围较小的研究计划。');
  const pages = [];
  for (const id of new Set(refs.map((p) => p.version_id))) {
    const version = await store.version(id);
    if (version.project_id !== projectId)
      throw new HttpError(404, '资料不存在。');
    for (const ref of refs.filter((p) => p.version_id === id)) {
      const page = version.pages.find((p) => p.page === ref.page);
      if (page)
        pages.push({ version_id: id, page: page.page, text: page.text });
    }
  }
  const jobs = (
    await store.db
      .prepare(
        "SELECT j.id,json_extract(j.model_snapshot,'$.mission_task.id') task_id,j.status,j.result,json_extract(j.model_snapshot,'$.provider') provider,json_extract(j.model_snapshot,'$.model_id') model,j.diagnostics,json_extract(j.model_snapshot,'$.effort') effort,j.input_tokens,j.output_tokens,j.reserved_units FROM research_jobs j JOIN mission_tasks t ON t.id=json_extract(j.model_snapshot,'$.mission_task.id') WHERE t.mission_id=? AND t.project_id=? AND j.project_id=? ORDER BY j.created_at LIMIT 2401",
      )
      .bind(missionId, projectId, projectId)
      .all()
  ).results;
  // Schema projection deliberately omits leases, credentials and internal tokens.
  const data = traceData.parse({
    format: 'clioforge-agent-trace',
    version: 1,
    mission: view.mission,
    tasks: orderedTasks(view.tasks, view.edges),
    edges: view.edges,
    jobs,
    pages,
  });
  const encoded = JSON.stringify(data);
  if (new TextEncoder().encode(encoded).length > 8 * 1024 * 1024)
    throw new HttpError(413, '回放记录超过 8 MB，请缩小研究范围。');
  return { data, sha256: await sha256(encoded) };
}
