import { boundedBytes } from './files';
import { cslInput } from './workbench-inputs';
import {
  candidateSchema,
  type Candidate,
  type Catalog,
  type CatalogResult,
} from './literature-types';
import { Converter } from 'opencc-js';
const traditional = Converter({ from: 'cn', to: 'tw' });
const simplified = Converter({ from: 'tw', to: 'cn' });

// Keep original queries first. Variants broaden retrieval, never rewrite sources.
export function literatureQueries(values: string[], expand = true) {
  const original = [
    ...new Set(values.map((s) => s.trim().slice(0, 200)).filter(Boolean)),
  ].slice(0, 3);
  return [
    ...new Set([
      ...original,
      ...(expand
        ? original.flatMap((q) => [traditional(q), simplified(q)])
        : []),
    ]),
  ].slice(0, 6);
}
export function safeLiteratureUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    return url.href;
  } catch {
    return;
  }
}
export function normalizeDoi(value: unknown) {
  if (typeof value !== 'string') return '';
  const doi = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : '';
}
const text = (v: unknown, max = 1000) =>
  typeof v === 'string' ? v.replace(/<[^>]*>/g, '').slice(0, max) : '';
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export function parseCatalog(
  catalog: Catalog,
  raw: unknown,
  query: string,
): Candidate[] {
  const data = object(raw);
  const rows =
    catalog === 'crossref' ? object(data.message).items : data.results;
  if (!Array.isArray(rows)) throw new Error('Invalid catalog response');
  const candidates: Candidate[] = [];
  for (const row of rows.slice(0, 5)) {
    const item = object(row);
    const doi = normalizeDoi(item.DOI || item.doi || item.url || item.id);
    const title = text(
      Array.isArray(item.title)
        ? item.title.join(' · ')
        : item.title || item.display_name,
    );
    const location = object(item.best_oa_location);
    const url = doi
      ? `https://doi.org/${doi}`
      : safeLiteratureUrl(catalog === 'exa' ? item.url : item.id);
    if (
      !title ||
      !url ||
      (catalog === 'loc' && new URL(url).hostname !== 'www.loc.gov')
    )
      continue;
    const typeMap: Record<string, string> = {
      'journal-article': 'article-journal',
      article: 'article-journal',
      'book-chapter': 'chapter',
      dissertation: 'thesis',
      book: 'book',
      chapter: 'chapter',
      thesis: 'thesis',
      'book-review': 'review-book',
      review: 'review',
      'proceedings-article': 'paper-conference',
    };
    const type =
      typeMap[text(item.type)] || (catalog === 'exa' ? 'webpage' : 'document');
    const authors =
      catalog === 'crossref' && Array.isArray(item.author)
        ? item.author.slice(0, 30).map((a: unknown) => ({
            family: text(object(a).family),
            given: text(object(a).given),
          }))
        : catalog === 'openalex' && Array.isArray(item.authorships)
          ? item.authorships.slice(0, 30).map((a: unknown) => ({
              literal: text(object(object(a).author).display_name),
            }))
          : typeof item.author === 'string'
            ? [{ literal: text(item.author) }]
            : [];
    const parts = object(item.issued)['date-parts'];
    const year =
      catalog === 'openalex'
        ? item.publication_year
        : catalog === 'crossref' &&
            Array.isArray(parts) &&
            Array.isArray(parts[0])
          ? (parts[0][0] as unknown)
          : undefined;
    const publisher = text(item.publisher);
    const date = text(item.date || item.publishedDate, 100);
    const parsed = cslInput.safeParse({
      type,
      title,
      author: authors,
      ...(Number.isInteger(year) ? { issued: { 'date-parts': [[year]] } } : {}),
      publisher,
      DOI: doi || undefined,
      URL: url,
      'container-title': text(
        Array.isArray(item['container-title'])
          ? item['container-title'][0]
          : item['container-title'] ||
              (type === 'article-journal'
                ? object(object(item.primary_location).source).display_name
                : ''),
      ),
      volume: text(item.volume),
      issue: text(item.issue),
      page: text(item.page),
    });
    if (!parsed.success) continue;
    const csl = parsed.data;
    const candidate = candidateSchema.safeParse({
      id: doi ? `doi:${doi}` : url,
      title,
      url,
      access: 'catalog_only',
      catalogs: [catalog],
      matched_queries: [query],
      csl,
      fulltext_url: safeLiteratureUrl(
        location.pdf_url || location.landing_page_url,
      ),
      license: text(location.license, 500),
      detail: [
        authors
          .map((a) =>
            'literal' in a
              ? a.literal
              : [a.given, a.family].filter(Boolean).join(' '),
          )
          .join('; '),
        typeof year === 'number' ? String(year) : date,
        publisher,
        text(
          item.description instanceof Array
            ? item.description.join(' ')
            : item.description,
          1000,
        ),
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 4000),
    });
    if (candidate.success) candidates.push(candidate.data);
  }
  return candidates;
}
export function rankCandidates(items: Candidate[]): Candidate[] {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'find',
    'sources',
    'research',
    'about',
    'of',
    'in',
    'to',
  ]);
  return items
    .map((item) => {
      if (item.access === 'project_text') return { ...item, match_score: 1 };
      const title = simplified(item.title).toLowerCase();
      let best = 0;
      const matched = new Set<string>();
      for (const query of item.matched_queries || []) {
        const tokens = [
          ...new Set(
            (
              simplified(query)
                .toLowerCase()
                .match(/[a-z0-9]{2,}|[\p{Script=Han}]+/gu) || []
            )
              .flatMap((word) =>
                /[\p{Script=Han}]/u.test(word) && word.length > 2
                  ? Array.from({ length: word.length - 1 }, (_, i) =>
                      word.slice(i, i + 2),
                    )
                  : [word],
              )
              .filter((word) => !stop.has(word)),
          ),
        ];
        const hits = tokens.filter((word) => title.includes(word));
        hits.forEach((word) => matched.add(word));
        best = Math.max(best, tokens.length ? hits.length / tokens.length : 0);
      }
      return { ...item, match_score: best, matched_terms: [...matched] };
    })
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
}
export function mergeCandidates(items: Candidate[]): Candidate[] {
  const found = new Map<string, Candidate>();
  for (const item of items) {
    const old = found.get(item.id);
    found.set(
      item.id,
      old
        ? {
            ...old,
            fulltext_url: old.fulltext_url || item.fulltext_url,
            license: old.license || item.license,
            catalogs: [
              ...new Set([...(old.catalogs || []), ...(item.catalogs || [])]),
            ],
            matched_queries: [
              ...new Set([
                ...(old.matched_queries || []),
                ...(item.matched_queries || []),
              ]),
            ],
          }
        : item,
    );
  }
  return [...found.values()];
}
export async function searchCatalog(
  catalog: Catalog,
  query: string,
  request: typeof fetch = fetch,
  key?: string,
): Promise<CatalogResult> {
  const url = new URL(
    {
      crossref: 'https://api.crossref.org/works',
      openalex: 'https://api.openalex.org/works',
      loc: 'https://www.loc.gov/search/',
      exa: 'https://api.exa.ai/search',
    }[catalog],
  );
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;
  if (catalog === 'exa') {
    if (!key) return { candidates: [], status: 'unavailable' };
    headers['x-api-key'] = key;
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ query, type: 'auto', numResults: 5 });
  } else {
    url.searchParams.set(
      catalog === 'crossref'
        ? 'query'
        : catalog === 'openalex'
          ? 'search'
          : 'q',
      query,
    );
    url.searchParams.set(
      catalog === 'crossref'
        ? 'rows'
        : catalog === 'openalex'
          ? 'per-page'
          : 'c',
      '5',
    );
    if (catalog === 'loc') url.searchParams.set('fo', 'json');
    if (catalog === 'openalex') {
      url.searchParams.set(
        'select',
        'id,doi,title,type,publication_year,authorships,primary_location,best_oa_location',
      );
      if (key) headers.Authorization = `Bearer ${key}`;
    }
  }
  try {
    const response = await request(url, {
      method: body ? 'POST' : 'GET',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok)
      return {
        candidates: [],
        status: response.status === 429 ? 'rate_limited' : 'unavailable',
      };
    const raw: unknown = JSON.parse(
      new TextDecoder().decode(await boundedBytes(response, 2_000_000)),
    );
    return {
      candidates: parseCatalog(catalog, raw, query),
      status: 'completed',
    };
  } catch {
    return {
      candidates: [],
      status: catalog === 'exa' ? 'uncertain' : 'unavailable',
    };
  }
}
