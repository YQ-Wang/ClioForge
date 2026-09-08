import { z } from 'zod';
import { HttpError } from '../errors';
import { dossierPassages } from '../dossier-output';
import type { MissionStore } from '../platform/missions';
import { indexVersion, searchPages } from '../platform/search';
import {
  citationSchema,
  type MissionTask,
  type TaskResult,
} from '../platform/types';

export const researchAction = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('search'),
    query: z.string().trim().min(1).max(300),
  }),
  z.object({
    tool: z.literal('read_page'),
    version_id: z.uuid(),
    page: z.number().int().positive(),
    start: z.number().int().min(0).max(100000).optional(),
  }),
  z.object({
    tool: z.literal('finish'),
    reason: z.string().trim().min(1).max(1000),
  }),
]);
const entry = z.object({
  action: researchAction,
  outcome: z.string().max(2000),
  citations: z.array(citationSchema).max(8),
  reading: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      next_start: z.number().int().nonnegative().nullable(),
    })
    .optional(),
});
export const researchMemory = z.object({
  version: z.literal(1),
  stopped: z.boolean(),
  stop_reason: z.string().max(1000),
  steps: z.array(entry).max(6),
});
export type ResearchMemory = z.infer<typeof researchMemory>;
export function researchActionKey(action: z.infer<typeof researchAction>) {
  if (action.tool === 'search')
    return JSON.stringify([
      'search',
      action.query.trim().replace(/\s+/g, ' ').toLowerCase(),
    ]);
  if (action.tool === 'read_page')
    return JSON.stringify([
      'read_page',
      action.version_id,
      action.page,
      action.start ?? 0,
    ]);
  return JSON.stringify(action);
}
export function priorResearch(deps: MissionTask[]): ResearchMemory {
  const prior = deps.find(
    (d) =>
      d.executor === 'builtin' && d.input.parameters.agent_stage === 'tool',
  );
  return prior
    ? researchMemory.parse(prior.result?.data)
    : { version: 1, stopped: false, stop_reason: '', steps: [] };
}
export function researchContext(memory: ResearchMemory) {
  return {
    ...memory,
    source_policy:
      'Only the returned excerpts below have been read. Search matches are not full-page reading. Unvisited pages remain unread. All interpretations remain unreviewed.',
  };
}
// Reuse the immutable v1 segmentation, restricted to text actually returned by tools.
export function researchPassages(memory: ResearchMemory) {
  return [
    ...new Map(
      memory.steps
        .flatMap((s) => s.citations)
        .flatMap((c) =>
          dossierPassages([
            { id: c.version_id, pages: [{ page: c.page, text: c.quote }] },
          ]).map((p) => ({ ...p, start: (c.start || 0) + (p.start || 0) })),
        )
        .map((p) => [JSON.stringify(p), p]),
    ).values(),
  ];
}
export function researchReportContext(memory: ResearchMemory) {
  return {
    coverage: memory.steps.map((s) => ({
      action: s.action,
      outcome: s.outcome,
      ...(s.reading ? { reading: s.reading } : {}),
    })),
    stop_reason: memory.stop_reason,
    passages: researchPassages(memory).map((p, i) => ({
      label: `[P${i + 1}]`,
      ...p,
    })),
    policy:
      'Only these passages were returned by tools. Select passage numbers; do not copy quotations or offsets. Search coverage is not evidence of absence.',
  };
}
export function validateResearchAction(result: TaskResult) {
  if (result.citations.length)
    throw new HttpError(400, 'Tool decisions cannot manufacture quotations.');
  researchAction.parse(result.data);
}
export function validateResearchReport(
  result: TaskResult,
  memory: ResearchMemory,
) {
  const seen = memory.steps.flatMap((step) => step.citations);
  for (const citation of result.citations) {
    if (
      !seen.some(
        (c) =>
          c.version_id === citation.version_id &&
          c.page === citation.page &&
          c.quote.includes(citation.quote) &&
          (citation.start === undefined ||
            c.start === undefined ||
            (citation.start >= c.start &&
              c.quote.slice(
                citation.start - c.start,
                citation.start - c.start + citation.quote.length,
              ) === citation.quote)),
      )
    )
      throw new HttpError(
        400,
        'The report cites a passage not returned by a research tool.',
      );
  }
  if (seen.length && !result.citations.length)
    throw new HttpError(
      400,
      'The research report must cite the excerpts it used.',
    );
}
export async function researchTool(
  store: MissionStore,
  task: MissionTask,
  deps: MissionTask[],
): Promise<TaskResult> {
  const L = (zh: string, en: string) => (task.input.locale === 'en' ? en : zh);
  const memory = priorResearch(deps);
  if (task.input.parameters.agent_stage === 'report') {
    if (memory.steps.some((s) => s.citations.length))
      throw new Error('A report with evidence requires model synthesis.');
    return {
      summary: L(
        '本轮没有取得可引用的原文，无法据此形成研究结论。请调整检索词或选定材料后继续。',
        'No citable source text was retrieved. This run cannot support a conclusion. Review the search terms or selected sources before continuing.',
      ),
      citations: [],
      checks: [],
      data: {
        limitations: [memory.stop_reason],
        next_steps: [
          L(
            '检查选定资料是否有可读文字。',
            'Check that the selected sources contain readable text.',
          ),
        ],
      },
    };
  }
  if (task.input.parameters.agent_stage === 'decision') {
    if (!memory.stopped) throw new Error('Research is not finished.');
    return {
      summary: L(
        '已停止探索，不再调用模型。',
        'Exploration stopped; no model call.',
      ),
      citations: [],
      checks: [],
      data: { tool: 'finish', reason: memory.stop_reason },
    };
  }
  const decision = deps.find(
    (d) => d.input.parameters.agent_stage === 'decision',
  );
  const action = researchAction.parse(decision?.result?.data);
  if (!memory.stopped) {
    const repeated = memory.steps.some(
      (step) => researchActionKey(step.action) === researchActionKey(action),
    );
    if (repeated || memory.steps.length >= 6) {
      memory.stopped = true;
      memory.stop_reason = L(
        '重复操作或已达到步骤上限，请审读现有发现。',
        'Repeated operation or step limit; review the existing findings.',
      );
    } else if (action.tool === 'finish') {
      memory.stopped = true;
      memory.stop_reason = action.reason;
      memory.steps.push({ action, outcome: action.reason, citations: [] });
    } else {
      await store.project(task.project_id, 'write');
      const citations: TaskResult['citations'] = [];
      let outcome = '';
      let reading: ResearchMemory['steps'][number]['reading'];
      if (action.tool === 'search') {
        for (const id of task.input.version_ids)
          await indexVersion(store.db, await store.version(id));
        const hits = await searchPages(store, task.project_id, action.query, {
          version_ids: task.input.version_ids,
          page_refs: task.input.page_refs,
          history: true,
          limit: 6,
        });
        for (const hit of hits)
          if (hit.snippet)
            citations.push({
              version_id: hit.version_id,
              page: hit.page,
              quote: hit.snippet,
              start: hit.text.indexOf(hit.snippet),
            });
        outcome = L(
          `找到 ${hits.length} 个片段；尚未阅读整页。未找到不代表历史上不存在。`,
          `${hits.length} excerpts found; whole pages have not been read. No match is not evidence of historical absence.`,
        );
      } else {
        if (
          !task.input.version_ids.includes(action.version_id) ||
          !task.input.page_refs?.some(
            (p) => p.version_id === action.version_id && p.page === action.page,
          )
        )
          throw new HttpError(
            400,
            'The requested page is outside the authorized research scope.',
          );
        const version = await store.version(action.version_id);
        if (version.project_id !== task.project_id)
          throw new Error('Source belongs to another project.');
        const page = version.pages.find((p) => p.page === action.page);
        if (!page) throw new Error('Source page unavailable.');
        const start = action.start ?? 0;
        if (
          start > page.text.length ||
          (start === page.text.length && start > 0)
        )
          throw new HttpError(
            400,
            'The reading position is beyond the selected page.',
          );
        const quote = page.text.slice(start, start + 8000);
        const end = start + quote.length;
        reading = {
          start,
          end,
          total: page.text.length,
          next_start: end < page.text.length ? end : null,
        };
        if (quote.trim())
          citations.push({
            version_id: version.id,
            page: page.page,
            quote,
            start,
          });
        outcome =
          reading.next_start !== null
            ? L(
                `已读取本页第 ${start + 1}–${end} 字符（共 ${page.text.length}）；可从位置 ${end} 继续。未读部分仍未覆盖。`,
                `Read characters ${start + 1}–${end} of ${page.text.length}; continue with start ${end}. Remaining text is unread.`,
              )
            : L(
                start > 0
                  ? `已读取本页第 ${start + 1}–${end} 字符，抵达转录末尾；前面的内容只有实际读过才算已覆盖。`
                  : '已读取该页现有转录；未辨认的文字仍需核对原件。',
                start > 0
                  ? `Read characters ${start + 1}–${end}, reaching the transcription end; earlier text is covered only if previously read.`
                  : 'Read the available page transcription; unclear text still requires checking the original.',
              );
      }
      memory.steps.push({
        action,
        outcome,
        citations,
        ...(reading ? { reading } : {}),
      });
    }
    if (task.input.parameters.agent_last === true && !memory.stopped) {
      memory.stopped = true;
      memory.stop_reason = L(
        '本轮探索次数已用完，转交研究者审读。',
        'Exploration allowance reached; hand off for researcher review.',
      );
    }
  }
  const citations = [
    ...new Map(
      memory.steps
        .flatMap((step) => step.citations)
        .map((c) => [JSON.stringify(c), c]),
    ).values(),
  ];
  return {
    summary: memory.stopped
      ? memory.stop_reason
      : memory.steps.at(-1)?.outcome || '',
    citations,
    data: memory,
    checks: [
      {
        name: 'tool_scope',
        passed: true,
        detail: L(
          `${memory.steps.length} 次操作；仅限固定资料范围。`,
          `${memory.steps.length} operations within fixed source scope.`,
        ),
      },
    ],
  };
}
