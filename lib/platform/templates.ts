import { taskInputSchema, type MissionDraft, type TaskDraft } from './types';
export function researchTemplate(options: {
  title: string;
  question: string;
  scope: string;
  acceptance: string;
  query: string;
  version_ids: string[];
  locale: 'zh-CN' | 'en';
  model_id?: string;
  input_rate?: number;
  output_rate?: number;
}): MissionDraft {
  if (options.model_id) {
    const L = (zh: string, en: string) => (options.locale === 'en' ? en : zh);
    const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
    const input = taskInputSchema.parse({
      version_ids: options.version_ids,
      locale: options.locale,
    });
    return {
      title: options.title,
      question: options.question,
      scope: options.scope,
      acceptance: options.acceptance,
      tasks: [
        {
          id: ids[0],
          title: L(
            '比较材料与竞争解释',
            'Compare sources and alternative explanations',
          ),
          kind: 'compare',
          executor: 'model',
          assignee: L('研究助手', 'Research assistant'),
          dependencies: [],
          input: {
            ...input,
            model_id: options.model_id,
            input_rate: options.input_rate ?? 0,
            output_rate: options.output_rate ?? 0,
            max_output: 3072,
            effort: 'low',
            prompt: `${options.question}\nScope: ${options.scope}\nAcceptance: ${options.acceptance}\nCompare the selected primary sources in at most three concise paragraphs (about 250 words), followed by short exact quotations. Focus on the requested question; leave wider investigation for a follow-up. Distinguish document text, interpretation, alternative explanations and what the sources cannot establish. Each substantive finding must refer to a numbered citation in the citations array. Copy short quotations verbatim from ONE provided page; never join text across pages. If a document quotes another, identify that dependency. In summary use readable paragraphs with [1], [2] citation markers. Include at least one exact citation from each source used, at most 12 citations. Return data only as {limitations: [up to three source limitations]}; put comparison, alternatives and next checks in summary.`,
            parameters: {
              require_citations: true,
              output_schema: 'comparison_answer_v1',
            },
          },
        },
        {
          id: ids[1],
          title: L('逐条核对引文', 'Check each quotation'),
          kind: 'verify',
          executor: 'builtin',
          assignee: L('出处核对', 'Source checks'),
          dependencies: [ids[0]],
          input,
        },
        {
          id: ids[2],
          title: L('审读解释与材料缺口', 'Review interpretations and gaps'),
          kind: 'review',
          executor: 'human',
          assignee: L('研究者', 'Researcher'),
          dependencies: [ids[0], ids[1]],
          input,
        },
        {
          id: ids[3],
          title: L('整理带出处的研究成果', 'Assemble an attributed finding'),
          kind: 'publish',
          executor: 'builtin',
          assignee: L('成果整理', 'Report assembly'),
          dependencies: [ids[0], ids[2]],
          input,
        },
      ],
    };
  }
  const labels =
    options.locale === 'en'
      ? [
          'Find source passages',
          'Compare textual parallels',
          'Count terms reproducibly',
          'Verify exact citations',
          'Review evidence and alternative explanations',
          'Assemble research artifact',
        ]
      : [
          '检索材料片段',
          '比较平行文本',
          '复算词项分布',
          '核查原文引文',
          '复核证据与竞争解释',
          '汇编研究成果',
        ];
  const ids = labels.map(() => crypto.randomUUID());
  const input = taskInputSchema.parse({
    version_ids: options.version_ids,
    query: options.query,
    locale: options.locale,
    parameters: { keywords: options.query, threshold: 0.15 },
  });
  const tasks: TaskDraft[] = [
    {
      id: ids[0],
      title: labels[0],
      kind: 'search',
      executor: 'builtin',
      assignee: 'Search',
      dependencies: [],
      input,
    },
    {
      id: ids[1],
      title: labels[1],
      kind: 'compare',
      executor: 'builtin',
      assignee: 'Comparison',
      dependencies: [ids[0]],
      input,
    },
    {
      id: ids[2],
      title: labels[2],
      kind: 'compute',
      executor: 'builtin',
      assignee: 'Analysis',
      dependencies: [],
      input,
    },
    {
      id: ids[3],
      title: labels[3],
      kind: 'verify',
      executor: 'builtin',
      assignee: 'Verification',
      dependencies: [ids[1], ids[2]],
      input,
    },
    {
      id: ids[4],
      title: labels[4],
      kind: 'review',
      executor: 'human',
      assignee: options.locale === 'en' ? 'Researcher' : '研究者',
      dependencies: [ids[3]],
      input,
    },
    {
      id: ids[5],
      title: labels[5],
      kind: 'publish',
      executor: 'builtin',
      assignee: 'Publication',
      dependencies: [ids[4]],
      input,
    },
  ];
  return {
    title: options.title,
    question: options.question,
    scope: options.scope,
    acceptance: options.acceptance,
    tasks,
  };
}
