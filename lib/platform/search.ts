import type { ResearchStore } from '../store';
import type { SourceVersion } from '../types';
import { HttpError } from '../errors';
export async function sha256(value: string | Uint8Array) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : new Uint8Array(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
export function indexText(value: string) {
  const plain = normalize(value);
  const han = plain.match(/[\p{Script=Han}]+/gu) || [];
  return (
    plain +
    ' ' +
    han
      .flatMap((word) =>
        Array.from(word).map(
          (letter, index) => letter + (Array.from(word)[index + 1] || ''),
        ),
      )
      .join(' ')
  );
}
export async function indexVersion(db: D1Database, version: SourceVersion) {
  for (let offset = 0; offset < version.pages.length; offset += 40) {
    const statements = await Promise.all(
      version.pages
        .slice(offset, offset + 40)
        .map(async (page) =>
          db
            .prepare(
              'INSERT OR IGNORE INTO source_pages(id,project_id,source_id,version_id,page,text,normalized,content_hash) VALUES(?,?,?,?,?,?,?,?)',
            )
            .bind(
              `${version.id}:${page.page}`,
              version.project_id,
              version.source_id,
              version.id,
              page.page,
              page.text,
              indexText(page.text),
              await sha256(page.text),
            ),
        ),
    );
    if (statements.length) await db.batch(statements);
  }
}
export type SearchHit = {
  id: string;
  source_id: string;
  version_id: string;
  page: number;
  text: string;
  title: string;
  revision: number;
  score: number;
  snippet: string;
};
export async function searchPages(
  store: ResearchStore,
  projectId: string,
  query: string,
  options: {
    limit?: number;
    offset?: number;
    history?: boolean;
    source_id?: string;
    language?: string;
    year_start?: number;
    year_end?: number;
    version_ids?: string[];
    page_refs?: { version_id: string; page: number }[];
  } = {},
) {
  await store.project(projectId);
  const terms = query.split('|').map(normalize).filter(Boolean).slice(0, 10);
  if (!terms.length || query.length > 2000)
    throw new HttpError(400, '请输入检索词。');
  const aliases = (
    await store.db
      .prepare('SELECT term,variants FROM search_aliases WHERE project_id=?')
      .bind(projectId)
      .all<{ term: string; variants: string }>()
  ).results;
  for (const alias of aliases)
    if (terms.includes(normalize(alias.term)))
      terms.push(...(JSON.parse(alias.variants) as string[]).map(normalize));
  // Reviewed identities expand wording only; candidates never affect retrieval.
  const names = (
    await store.db
      .prepare(
        "SELECT id,name,aliases,canonical_id FROM entities WHERE project_id=? AND status='confirmed' LIMIT 1000",
      )
      .bind(projectId)
      .all<{
        id: string;
        name: string;
        aliases: string;
        canonical_id: string | null;
      }>()
  ).results;
  const groups = new Map<string, string[]>();
  for (const entry of names) {
    const key = entry.canonical_id || entry.id;
    groups.set(key, [
      ...(groups.get(key) || []),
      entry.name,
      ...(JSON.parse(entry.aliases) as string[]),
    ]);
  }
  const original = new Set(terms);
  for (const group of groups.values())
    if (group.some((name) => original.has(normalize(name))))
      terms.push(...group.map(normalize));
  const expression = [...new Set(terms)]
    .slice(0, 30)
    .map((term) => {
      const han = term.match(/^[\p{Script=Han}]+$/u);
      if (han && Array.from(term).length > 1) {
        const chars = Array.from(term);
        return (
          '(' +
          chars
            .slice(0, -1)
            .map((char, i) => '"' + char + chars[i + 1] + '"')
            .join(' AND ') +
          ')'
        );
      }
      return '"' + term.replace(/"/g, '""') + '"';
    })
    .join(' OR ');
  const conditions = ['page_fts MATCH ?', 'sp.project_id=?'],
    bindings: (string | number)[] = [expression, projectId];
  if (!options.history)
    conditions.push(
      'v.revision=(SELECT MAX(v2.revision) FROM source_versions v2 WHERE v2.source_id=sp.source_id)',
    );
  if (options.source_id) {
    conditions.push('sp.source_id=?');
    bindings.push(options.source_id);
  }
  if (options.language) {
    conditions.push('sp.language=?');
    bindings.push(options.language);
  }
  if (options.year_start !== undefined) {
    conditions.push('sp.year_end>=?');
    bindings.push(options.year_start);
  }
  if (options.year_end !== undefined) {
    conditions.push('sp.year_start<=?');
    bindings.push(options.year_end);
  }
  if (options.version_ids?.length) {
    conditions.push(
      `sp.version_id IN (${options.version_ids.map(() => '?').join(',')})`,
    );
    bindings.push(...options.version_ids);
  }
  if (options.page_refs) {
    if (!options.page_refs.length) return [];
    if (options.page_refs.length > 100)
      throw new HttpError(400, '请减少所选页数。');
    conditions.push(
      "EXISTS(SELECT 1 FROM json_each(?) ref WHERE json_extract(ref.value,'$.version_id')=sp.version_id AND json_extract(ref.value,'$.page')=sp.page)",
    );
    bindings.push(JSON.stringify(options.page_refs));
  }
  const result = await store.db
    .prepare(
      `SELECT sp.id,sp.source_id,sp.version_id,sp.page,sp.text,s.title,v.revision,bm25(page_fts) AS score FROM page_fts JOIN source_pages sp ON sp.id=page_fts.page_id JOIN sources s ON s.id=sp.source_id JOIN source_versions v ON v.id=sp.version_id WHERE ${conditions.join(' AND ')} ORDER BY score,sp.id LIMIT ? OFFSET ?`,
    )
    .bind(
      ...bindings,
      Math.min(options.limit || 30, 100),
      Math.max(options.offset || 0, 0),
    )
    .all<Omit<SearchHit, 'snippet'>>();
  return result.results.map((hit) => {
    const at = Math.max(
      0,
      ...terms.map((term) => normalize(hit.text).indexOf(term)),
    );
    return { ...hit, snippet: hit.text.slice(Math.max(0, at - 70), at + 250) };
  });
}
export async function reindexProject(
  store: ResearchStore,
  projectId: string,
  after = '',
) {
  await store.project(projectId, 'write');
  const rows = (
    await store.db
      .prepare(
        'SELECT * FROM source_versions WHERE project_id=? AND id>? ORDER BY id LIMIT 10',
      )
      .bind(projectId, after)
      .all<Record<string, unknown>>()
  ).results;
  for (const row of rows)
    await indexVersion(store.db, {
      ...row,
      pages: JSON.parse(String(row.pages)),
    } as SourceVersion);
  return {
    indexed: rows.length,
    next: rows.length === 10 ? String(rows.at(-1)!.id) : null,
  };
}
