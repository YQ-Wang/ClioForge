import { z } from 'zod';
import { sourceSearchSystem } from '../harness/source-search-prompt';
import { taskInputSchema, type MissionDraft, type TaskDraft } from './types';

const optionsSchema = z.object({
  request: z.string().trim().min(1).max(12000),
  selection_criteria: z.string().trim().min(1).max(6000).optional(),
  locale: z.enum(['zh-CN', 'en']).default('zh-CN'),
  model_id: z.uuid(),
  input_rate: z.number().positive().max(10000),
  output_rate: z.number().positive().max(10000),
  max_output: z.number().int().min(512).default(16384),
  max_steps: z.number().int().min(2).max(12).default(8),
  effort: z.enum(['low', 'high', 'max']).default('max'),
  search_provider: z.enum(['catalogs', 'brave', 'tavily']).default('catalogs'),
});

export type SourceSearchOptions = z.input<typeof optionsSchema>;

export function defaultSourceSelectionCriteria(locale: 'zh-CN' | 'en') {
  return locale === 'en'
    ? 'Prefer primary sources, critical editions, finding aids, peer-reviewed scholarship, and stable institutional records. Require direct topical, chronological, and geographic relevance. Reject generic keyword overlap, unrelated periods or places, SEO pages, and records whose identity cannot be verified.'
    : '优先选择一手史料、校勘本、档案说明、同行评议研究与稳定的机构馆藏记录。必须直接符合主题、年代和地域；排除仅有泛化关键词重合、时代或地点不符、SEO 页面及身份无法核实的记录。';
}

export function sourceSearchRecipe(raw: SourceSearchOptions): MissionDraft {
  const options = optionsSchema.parse(raw);
  const L = (zh: string, en: string) => (options.locale === 'en' ? en : zh);
  const criteria =
    options.selection_criteria ||
    defaultSourceSelectionCriteria(options.locale);
  const tasks: TaskDraft[] = [];
  const add = (
    title: string,
    executor: TaskDraft['executor'],
    dependencies: string[],
    parameters: Record<string, unknown>,
    prompt = '',
  ) => {
    const id = crypto.randomUUID();
    tasks.push({
      id,
      title,
      kind: 'search',
      executor,
      assignee: '',
      dependencies,
      input: taskInputSchema.parse({
        version_ids: [],
        query: options.request,
        prompt,
        locale: options.locale,
        ...(executor === 'model'
          ? {
              model_id: options.model_id,
              input_rate: options.input_rate,
              output_rate: options.output_rate,
              max_output: options.max_output,
              effort: options.effort,
            }
          : {}),
        parameters: {
          source_search: true,
          source_search_request: options.request,
          source_selection_criteria: criteria,
          search_provider: options.search_provider,
          ...parameters,
        },
      }),
    });
    return id;
  };

  let previous = add(
    L('准备资料检索记录', 'Initialize source-search ledger'),
    'builtin',
    [],
    { source_agent_stage: 'init' },
  );
  for (let round = 0; round < options.max_steps; round++) {
    const decision = add(
      L(
        `选择资料检索步骤 ${round + 1}`,
        `Choose source-search step ${round + 1}`,
      ),
      'model',
      [previous],
      {
        recipe: 'source_search',
        source_agent_stage: 'decision',
        source_agent_round: round + 1,
        output_schema: 'source_search_tool_v1',
        output_repair_attempts: 1,
      },
      `${sourceSearchSystem}\n\nResearch request:\n${options.request}\n\nResearcher-controlled source selection criteria (mandatory):\n${criteria}\n\nConfigured search mode: ${options.search_provider}. When it is "catalogs", do not choose the web provider. When it is "brave" or "tavily", web search is available in addition to catalogs.\n\nChoose exactly one next operation. The application executes it and returns a new ledger.`,
    );
    previous = add(
      L(
        `执行资料检索步骤 ${round + 1}`,
        `Execute source-search step ${round + 1}`,
      ),
      'builtin',
      [previous, decision],
      {
        source_agent_stage: 'tool',
        source_agent_round: round + 1,
        source_agent_last: round === options.max_steps - 1,
      },
    );
  }
  return {
    title: L('AI 资料搜索', 'AI source search'),
    question: options.request,
    scope: L(
      '跨网页、学术索引与机构数字馆藏检索；候选资料须经核查、全文解析与权限判断。',
      'Search web, scholarly indexes and institutional collections; inspect candidates and resolve access before import.',
    ),
    acceptance: L(
      '相关且可安全取得的资料已导入；无法自动取得的相关资料已保存为可操作的待补资料；无关结果有排除理由。',
      'Relevant safely downloadable sources are imported; other relevant records become actionable leads; irrelevant results have rejection reasons.',
    ),
    tasks,
  };
}
