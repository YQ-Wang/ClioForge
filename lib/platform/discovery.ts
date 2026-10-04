import { z } from 'zod';
import type { ResearchStore } from '../store';
import { indexVersion, searchPages } from './search';
import type { MissionTask, TaskResult } from './types';
import {
  candidateSchema,
  type Candidate,
  type Catalog,
  type CatalogResult,
} from '../literature-types';
import {
  literatureQueries,
  mergeCandidates,
  rankCandidates,
  searchCatalog,
} from '../literature-catalogs';
export { candidateSchema } from '../literature-types';
export type { Candidate } from '../literature-types';
export function plannedQueries(
  deps: { result: TaskResult | null }[],
  fallback: string,
) {
  const values = deps.flatMap((dep) => {
    const parsed = z
      .object({ queries: z.array(z.string().trim().min(1).max(200)).max(3) })
      .safeParse(dep.result?.data);
    return parsed.success ? parsed.data.queries : [];
  });
  return [...new Set(values.length ? values : [fallback.trim().slice(0, 200)])]
    .filter(Boolean)
    .slice(0, 3);
}

export type SourceDiscoveryInput = {
  project_id: string;
  version_ids: string[];
  page_refs?: { version_id: string; page: number }[];
  queries: string[];
  external: boolean;
  expand_chinese?: boolean;
  use_exa?: boolean;
  catalog_search?: (catalog: Catalog, query: string) => Promise<CatalogResult>;
  locale: 'zh-CN' | 'en';
};

const genericCatalogTerms = new Set([
  'article',
  'book',
  'catalog',
  'china',
  'chinese',
  'court',
  'faction',
  'history',
  'journal',
  'paper',
  'politics',
  'primary',
  'research',
  'scholarly',
  'source',
  'studies',
  'study',
  '中国',
  '中文',
  '历史',
  '原文',
  '史料',
  '学术',
  '政治',
  '相关',
  '研究',
  '英文',
  '论文',
  '资料',
]);

function normalizedCatalogText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function catalogQueryTerms(query: string) {
  const terms = new Map<string, number>();
  const add = (value: string, weight: number) => {
    const normalized = normalizedCatalogText(value);
    if (!normalized || genericCatalogTerms.has(normalized)) return;
    terms.set(normalized, Math.max(terms.get(normalized) || 0, weight));
  };
  for (const match of query.matchAll(/["“”]([^"“”]+)["“”]/g)) add(match[1], 3);
  for (const token of query.match(/[\p{L}\p{N}]+/gu) || []) {
    if (/^\p{Script=Han}+$/u.test(token)) {
      if (token.length >= 2) add(token, 2);
      if (/(?:党|皇帝|之争)$/.test(token) && token.length > 2)
        add(token.slice(0, 2), 2);
    } else if (/^\d{3,4}$/.test(token)) add(token, 1);
    else if (token.length >= 4)
      add(token, /^[A-Z][\p{Ll}]/u.test(token) ? 2 : 1);
  }
  return [...terms];
}

export function catalogRecordMatches(query: string, title: string) {
  const terms = catalogQueryTerms(query);
  if (!terms.length) return false;
  const normalizedTitle = normalizedCatalogText(title);
  const score = terms.reduce(
    (total, [term, weight]) =>
      total + (normalizedTitle.includes(term) ? weight : 0),
    0,
  );
  return score >= (terms.length === 1 ? 1 : 3);
}

// This is the bounded search tool used by both the lightweight search agent
// and the longer research-plan recipe. Keeping the network search here makes
// it possible to enrich one search agent without coupling it to mission UI.
export async function searchSourceCandidates(
  store: ResearchStore,
  input: SourceDiscoveryInput,
  request: typeof fetch = fetch,
): Promise<TaskResult> {
  const queries = literatureQueries(
    input.queries,
    input.expand_chinese !== false,
  );
  if (!queries.length) throw new Error('没有可执行的检索词，请检查搜索问题。');
  for (const id of input.version_ids)
    await indexVersion(store.db, await store.version(id));
  const candidates = new Map<string, Candidate>();
  const citations: TaskResult['citations'] = [];
  const searches: {
    query: string;
    catalog: string;
    returned: number;
    filtered: number;
    cap: number;
    status: string;
    searched_at: string;
    cached?: boolean;
  }[] = [];
  for (const query of queries) {
    const hits = input.version_ids.length
      ? await searchPages(store, input.project_id, query, {
          version_ids: input.version_ids,
          page_refs: input.page_refs,
          history: true,
          limit: 10,
        })
      : [];
    for (const h of hits) {
      const id = `page:${h.version_id}:${h.page}`;
      candidates.set(id, {
        id,
        title: h.title || 'Project source',
        url: `/?project=${input.project_id}&tab=sources&version=${h.version_id}&page=${h.page}`,
        access: 'project_text',
        detail: h.snippet,
      });
      if (
        h.text &&
        !citations.some(
          (c) => c.version_id === h.version_id && c.page === h.page,
        )
      )
        citations.push({
          version_id: h.version_id,
          page: h.page,
          quote: h.snippet,
          start: h.text.indexOf(h.snippet),
        });
    }
    if (input.version_ids.length)
      searches.push({
        query,
        catalog: 'project',
        returned: hits.length,
        filtered: 0,
        cap: 10,
        status: 'completed',
        searched_at: new Date().toISOString(),
      });
    if (!input.external) continue;
    // Only explicitly supplied search queries are sent to fixed catalog hosts.
    const catalogs: Catalog[] = [
      'crossref',
      'openalex',
      'loc',
      ...(input.use_exa ? ['exa' as const] : []),
    ];
    const results = await Promise.all(
      catalogs.map(async (catalog) => ({
        catalog,
        result: await (input.catalog_search
          ? input.catalog_search(catalog, query)
          : searchCatalog(catalog, query, request)),
      })),
    );
    for (const { catalog, result } of results) {
      for (const item of result.candidates) {
        const merged = mergeCandidates([
          ...(candidates.has(item.id) ? [candidates.get(item.id)!] : []),
          item,
        ]);
        candidates.set(item.id, merged[0]);
      }
      searches.push({
        query,
        catalog,
        returned: result.candidates.length,
        filtered: 0,
        cap: 5,
        status: result.status,
        searched_at: new Date().toISOString(),
        cached: result.cached,
      });
    }
  }
  const failed = searches.filter((s) => s.status !== 'completed').length;
  return {
    summary:
      input.locale === 'en'
        ? `${candidates.size} candidate passages/catalog records. Catalog records have not been read as full text. ${failed ? `${failed} searches could not complete. ` : ''}See coverage and failures below.`
        : `找到 ${candidates.size} 条候选段落或目录记录。目录记录尚未取得全文；${failed ? `${failed} 次检索未完成。` : ''}检索范围与失败情况保留在下方。`,
    citations,
    checks: [],
    data: {
      queries,
      candidates: rankCandidates([...candidates.values()]),
      searches,
      engine: 'bounded-discovery-v2',
    },
  };
}

export async function discoverSources(
  store: ResearchStore,
  task: MissionTask,
  deps: { result: TaskResult | null }[],
  request: typeof fetch = fetch,
): Promise<TaskResult> {
  const queries = plannedQueries(
    deps,
    task.input.query || task.input.prompt || '',
  );
  return searchSourceCandidates(
    store,
    {
      project_id: task.project_id,
      version_ids: task.input.version_ids,
      page_refs: task.input.page_refs,
      queries,
      external: task.input.parameters.external === true,
      locale: task.input.locale,
    },
    request,
  );
}
export function validateShortlist(
  result: TaskResult,
  deps: { result: TaskResult | null }[],
) {
  const allowed = new Map(
    deps.flatMap((dep) => {
      const p = z
        .object({ candidates: z.array(candidateSchema) })
        .safeParse(dep.result?.data);
      return p.success ? p.data.candidates.map((c) => [c.id, c] as const) : [];
    }),
  );
  const data = z
    .object({
      shortlist: z
        .array(
          z.object({
            id: z.string(),
            reason: z.string().min(1).max(3000),
            limitation: z.string().max(3000),
          }),
        )
        .max(30),
      queries: z.array(z.string().min(1).max(200)).max(3).optional(),
    })
    .parse(result.data);
  if (data.shortlist.some((c) => !allowed.has(c.id)))
    throw new Error('候选来源不在实际检索结果中。');
  return {
    ...data,
    shortlist: data.shortlist.map((item) => ({
      ...item,
      title: allowed.get(item.id)!.title,
      url: allowed.get(item.id)!.url,
      access: allowed.get(item.id)!.access,
    })),
  };
}
