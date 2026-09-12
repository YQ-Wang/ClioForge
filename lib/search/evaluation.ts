import {
  sourceCandidates,
  type SourceCandidate,
  type SourceSearchMemory,
} from '../harness/source-search-tools';

export type SourceSearchCase = {
  id: string;
  locale: 'zh-CN' | 'en';
  request: string;
  anchors: string[];
  exclusions: string[];
  knownRelevantTitles?: string[];
};

export const sourceSearchCases: SourceSearchCase[] = [
  {
    id: 'ming-succession-donglin',
    locale: 'zh-CN',
    request:
      '检索万历国本之争、1593 年癸巳京察、内阁人事与东林群体形成的一手史料和中英文研究；排除古罗马铭文、当代中国政治和只因出现“党争”二字而命中的材料。',
    anchors: ['万历', '国本', '癸巳京察', '1593', 'donglin', 'succession'],
    exclusions: [
      'roma',
      'roman inscription',
      'communist party',
      '中国共产党',
      '中共',
      '当代中国',
      'putin',
      'russian democracy',
      '日本产业',
      'marketing academy',
      'mechanical engineers',
      'safavid',
    ],
    knownRelevantTitles: [
      '明代京察访单之研究',
      'a decade of considerable significance',
      '东林党与王锡爵内阁',
      '阁部冲突与明万历朝的党争',
      '東林黨考',
      '明代内阁与吏部铨选权之争',
      '明神宗实录',
      '万历疏钞',
      '东林始末',
    ],
  },
  {
    id: 'han-frontier-governance',
    locale: 'zh-CN',
    request:
      '寻找西汉河西四郡行政、屯田与边疆交通的出土文书、传世史料、考古报告和同行评议研究，区分汉代与现代甘肃治理。',
    anchors: ['西汉', '河西', '屯田', '汉简', 'hexi', 'han dynasty'],
    exclusions: ['现代治理', 'tourism', '旅游'],
  },
  {
    id: 'qing-granary-local-state',
    locale: 'zh-CN',
    request:
      '检索清代常平仓、地方官员和灾荒救济的档案、地方志与研究，重点 18 世纪并排除中华人民共和国粮食政策。',
    anchors: ['清代', '常平仓', '灾荒', 'granary', 'qing', 'famine relief'],
    exclusions: ['people’s republic', '中华人民共和国', '粮食安全新闻'],
  },
  {
    id: 'medieval-investiture',
    locale: 'en',
    request:
      'Find primary-source editions and scholarship on the Investiture Contest under Gregory VII and Henry IV, especially Canossa and episcopal appointment; exclude modern corporate investiture ceremonies.',
    anchors: [
      'investiture',
      'gregory vii',
      'henry iv',
      'canossa',
      'dictatus papae',
    ],
    exclusions: ['corporate', 'business ceremony'],
  },
  {
    id: 'early-modern-french-league',
    locale: 'en',
    request:
      'Find pamphlets, correspondence, archival descriptions, and scholarship on the Catholic League and politiques during the French Wars of Religion, 1576–1598; exclude twentieth-century political parties.',
    anchors: [
      'catholic league',
      'politiques',
      'wars of religion',
      '1576',
      '1598',
    ],
    exclusions: ['football', 'twentieth-century party'],
  },
  {
    id: 'industrial-aging-europe',
    locale: 'en',
    request:
      'Find historical demographic datasets and scholarship on old age, household structure, and poor relief in industrializing Britain and France, 1750–1914; exclude clinical anti-aging products.',
    anchors: [
      'old age',
      'poor relief',
      'household',
      '1750',
      '1914',
      'historical demography',
    ],
    exclusions: ['supplement', 'skincare', 'anti-aging product'],
  },
];

const normalize = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase();

export function evaluateCandidates(
  testCase: SourceSearchCase,
  candidates: SourceCandidate[],
) {
  const texts = candidates.map((candidate) =>
    normalize(
      [
        candidate.title,
        candidate.creators.join(' '),
        candidate.issued_date,
        candidate.institution,
        candidate.collection,
        candidate.snippet,
      ].join(' '),
    ),
  );
  const covered = testCase.anchors.filter((anchor) =>
    texts.some((value) => value.includes(normalize(anchor))),
  );
  const excluded = candidates.filter((_, index) =>
    testCase.exclusions.some((term) => texts[index].includes(normalize(term))),
  );
  const knownRelevant = candidates.filter((_, index) =>
    (testCase.knownRelevantTitles || []).some((term) =>
      texts[index].includes(normalize(term)),
    ),
  );
  return {
    candidate_count: candidates.length,
    topic_term_coverage: covered.length / testCase.anchors.length,
    covered_topic_terms: covered,
    explicit_noise_hits: excluded.map((candidate) => candidate.id),
    explicit_noise_hit_rate:
      candidates.length === 0 ? 0 : excluded.length / candidates.length,
    known_relevant_title_hits: knownRelevant.map((candidate) => candidate.id),
    known_relevant_title_hit_count: knownRelevant.length,
  };
}

const rate = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : 0;

export function evaluateSourceSearchRun(
  testCase: SourceSearchCase,
  memory: SourceSearchMemory,
) {
  const candidates = sourceCandidates(memory);
  const inspected = new Set<string>();
  const resolutionAttempted = new Set<string>();
  const retained = new Set<string>();
  const rejected = new Set<string>();
  const unsupportedClaims: number[] = [];
  for (const [index, step] of memory.steps.entries()) {
    const action = step.action;
    if (action.tool === 'inspect_result') inspected.add(action.result_id);
    if (action.tool === 'resolve_full_text') {
      inspected.add(action.result_id);
      resolutionAttempted.add(action.result_id);
    }
    if (action.tool === 'save_source_lead' || action.tool === 'import_source')
      retained.add(action.result_id);
    if (action.tool === 'reject_result') rejected.add(action.result_id);
    if (action.tool === 'triage_results')
      for (const item of action.decisions) {
        inspected.add(item.result_id);
        if (item.decision === 'reject') rejected.add(item.result_id);
      }
    if (
      /(?:已?排除|rejected?|excluded?)/i.test(step.outcome) &&
      action.tool !== 'reject_result' &&
      !(
        action.tool === 'triage_results' &&
        action.decisions.some((item) => item.decision === 'reject')
      )
    )
      unsupportedClaims.push(index);
  }
  const ids = new Set(candidates.keys());
  const terminal = new Set([...retained, ...rejected]);
  const contradictory = [...retained].filter((id) => rejected.has(id));
  const lexical = evaluateCandidates(testCase, [...candidates.values()]);
  const finished = memory.steps.some((step) => step.action.tool === 'finish');
  return {
    ...lexical,
    inspected_count: inspected.size,
    resolution_attempted_count: resolutionAttempted.size,
    retained_count: retained.size,
    rejected_count: rejected.size,
    terminal_decision_count: terminal.size,
    undecided_count: [...ids].filter((id) => !terminal.has(id)).length,
    unreviewed_count: [...ids].filter((id) => !inspected.has(id)).length,
    inspection_coverage: rate(inspected.size, ids.size),
    disposition_coverage: rate(terminal.size, ids.size),
    unreviewed_rate: rate(
      [...ids].filter((id) => !inspected.has(id)).length,
      ids.size,
    ),
    contradictory_dispositions: contradictory,
    finished,
    budget_exhausted: memory.stopped && !finished,
    unsupported_workflow_claim_steps: unsupportedClaims,
  };
}
