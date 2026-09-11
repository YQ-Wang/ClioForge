import type { SourceCandidate } from '../harness/source-search-tools';

export type SourceSearchCase = {
  id: string;
  locale: 'zh-CN' | 'en';
  request: string;
  anchors: string[];
  exclusions: string[];
};

export const sourceSearchCases: SourceSearchCase[] = [
  {
    id: 'ming-succession-donglin',
    locale: 'zh-CN',
    request:
      '检索万历国本之争、1593 年癸巳京察、内阁人事与东林群体形成的一手史料和中英文研究；排除古罗马铭文、当代中国政治和只因出现“党争”二字而命中的材料。',
    anchors: ['万历', '国本', '癸巳京察', '1593', 'donglin', 'succession'],
    exclusions: ['roma', 'roman inscription', 'communist party', '当代中国'],
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
  return {
    candidate_count: candidates.length,
    anchor_coverage: covered.length / testCase.anchors.length,
    covered_anchors: covered,
    exclusion_hits: excluded.map((candidate) => candidate.id),
    clean_precision_proxy:
      candidates.length === 0
        ? 0
        : (candidates.length - excluded.length) / candidates.length,
  };
}
