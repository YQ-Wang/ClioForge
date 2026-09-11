import { z } from 'zod';
import { boundedBytes } from '../files';
import type { MissionStore } from './missions';
import { indexVersion, searchPages } from './search';
import type { MissionTask, TaskResult } from './types';
export const candidateSchema = z.object({
  id: z.string().max(1000),
  title: z.string().max(2000),
  url: z
    .string()
    .max(2000)
    .refine(
      (value) => value.startsWith('/?project=') || /^https:\/\//i.test(value),
    ),
  access: z.enum(['project_text', 'catalog_only']),
  detail: z.string().max(4000),
});
export type Candidate = z.infer<typeof candidateSchema>;
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
export async function discoverSources(
  store: MissionStore,
  task: MissionTask,
  deps: { result: TaskResult | null }[],
  request: typeof fetch = fetch,
): Promise<TaskResult> {
  const queries = plannedQueries(
    deps,
    task.input.query || task.input.prompt || '',
  );
  if (!queries.length)
    throw new Error('没有可执行的检索词，请检查上一步的检索计划。');
  for (const id of task.input.version_ids)
    await indexVersion(store.db, await store.version(id));
  const candidates = new Map<string, Candidate>();
  const citations: TaskResult['citations'] = [];
  const searches: {
    query: string;
    catalog: string;
    returned: number;
    cap: number;
    status: string;
    searched_at: string;
  }[] = [];
  for (const query of queries) {
    const hits = task.input.version_ids.length
      ? await searchPages(store, task.project_id, query, {
          version_ids: task.input.version_ids,
          page_refs: task.input.page_refs,
          history: true,
          limit: 10,
        })
      : [];
    for (const h of hits) {
      const id = `page:${h.version_id}:${h.page}`;
      candidates.set(id, {
        id,
        title: h.title || 'Project source',
        url: `/?project=${task.project_id}&tab=sources&version=${h.version_id}&page=${h.page}`,
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
    if (task.input.version_ids.length)
      searches.push({
        query,
        catalog: 'project',
        returned: hits.length,
        cap: 10,
        status: 'completed',
        searched_at: new Date().toISOString(),
      });
    if (task.input.parameters.external !== true) continue;
    // Only public catalog queries leave the project. No originals, API keys,
    // model-generated hostnames or redirects are sent to third-party endpoints.
    for (const catalog of ['crossref', 'loc']) {
      const url =
        catalog === 'crossref'
          ? new URL('https://api.crossref.org/works')
          : new URL('https://www.loc.gov/search/');
      url.searchParams.set(catalog === 'crossref' ? 'query' : 'q', query);
      url.searchParams.set(catalog === 'crossref' ? 'rows' : 'c', '5');
      if (catalog === 'loc') url.searchParams.set('fo', 'json');
      const log = {
        query,
        catalog,
        returned: 0,
        cap: 5,
        status: 'completed',
        searched_at: new Date().toISOString(),
      };
      try {
        const response = await request(url, {
          headers: { Accept: 'application/json' },
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('Catalog unavailable');
        const raw = JSON.parse(
          new TextDecoder().decode(await boundedBytes(response, 2_000_000)),
        );
        const records =
          catalog === 'crossref' ? raw.message?.items : raw.results;
        if (!Array.isArray(records))
          throw new Error('Invalid catalog response');
        for (const item of records.slice(0, 5)) {
          const doi = typeof item.DOI === 'string' ? item.DOI : '';
          const urlText =
            catalog === 'crossref'
              ? `https://doi.org/${doi}`
              : typeof item.id === 'string'
                ? item.id
                : '';
          if (
            !urlText.startsWith('https://') ||
            (catalog === 'loc' && new URL(urlText).hostname !== 'www.loc.gov')
          )
            continue;
          const id =
            catalog === 'crossref' ? `doi:${doi.toLowerCase()}` : urlText;
          const title = Array.isArray(item.title)
            ? item.title.join(' · ')
            : String(item.title || 'Untitled');
          candidates.set(id, {
            id,
            title: title.slice(0, 500),
            url: urlText.slice(0, 2000),
            access: 'catalog_only',
            detail: String(item.date || item.publisher || '').slice(0, 4000),
          });
          log.returned++;
        }
      } catch {
        log.status = 'unavailable';
      }
      searches.push(log);
    }
  }
  return {
    summary:
      task.input.locale === 'en'
        ? `${candidates.size} candidate passages/catalog records. Catalog records have not been read as full text. See coverage and failures below.`
        : `找到 ${candidates.size} 条候选段落或目录记录。目录记录尚未取得全文；检索范围与失败情况保留在下方。`,
    citations,
    checks: [],
    data: {
      candidates: [...candidates.values()],
      searches,
      engine: 'bounded-discovery-v1',
    },
  };
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
