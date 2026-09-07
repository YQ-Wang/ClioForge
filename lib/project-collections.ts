import type { ResearchStore } from './store';
import { HttpError } from './errors';

export const projectCollections = [
  'sources',
  'source_versions',
  'notes',
  'note_state',
  'evidence',
  'research_runs',
  'bibliography_entries',
  'research_questions',
  'claims',
  'claim_evidence',
  'source_relations',
  'search_logs',
  'evidence_reviews',
  'research_jobs',
  'research_watches',
  'research_inbox',
] as const;
export type ProjectCollection = (typeof projectCollections)[number];
export type CollectionPage<T = Record<string, unknown>> = {
  rows: T[];
  next: string | null;
};
export const COLLECTION_PAGE_BYTES = 4 * 1024 * 1024;

// Page by insertion identity rather than OFFSET: newer imports do not shift or
// duplicate rows while a client is walking an existing collection.
export async function readCollection(
  store: ResearchStore,
  projectId: string,
  collection: string,
  before: string | null = null,
): Promise<CollectionPage> {
  await store.project(projectId);
  if (!projectCollections.includes(collection as ProjectCollection))
    throw new HttpError(400, '未知资料集合。');
  if (
    before !== null &&
    (!/^[1-9]\d{0,15}$/.test(before) || !Number.isSafeInteger(Number(before)))
  )
    throw new HttpError(400, '分页位置无效，请刷新重试。');
  const upper = before === null ? Number.MAX_SAFE_INTEGER : Number(before);
  // Table names are allowlisted. Schema-derived identifiers are quoted; callers
  // cannot request arbitrary columns or inject a SQL expression.
  const columns = (
    await store.db
      .prepare(`PRAGMA table_info("${collection}")`)
      .all<{ name: string }>()
  ).results;
  const jsonColumns = new Set([
    'pages',
    'model_snapshot',
    'source_version_ids',
    'region',
    'csl',
    'version_ids',
  ]);
  const sizes = columns.map(({ name }) => {
    const column = `"${name.replaceAll('"', '""')}"`;
    const size = jsonColumns.has(name)
      ? `COALESCE(length(CAST(${column} AS BLOB)),4)`
      : `length(CAST(json_quote(${column}) AS BLOB))`;
    return `${new TextEncoder().encode(JSON.stringify(name)).length + 1}+${size}`;
  });
  const sizeExpression = `${columns.length + 1}+${sizes.join('+')}`;
  const candidates = (
    await store.db
      .prepare(
        `SELECT rowid AS position,(${sizeExpression}) AS bytes
     FROM "${collection}" WHERE project_id=? AND rowid<? ORDER BY rowid DESC LIMIT 51`,
      )
      .bind(projectId, upper)
      .all<{ position: number; bytes: number }>()
  ).results;
  let bytes = 0;
  const selected = [];
  for (const row of candidates) {
    if (selected.length === 50 || bytes + row.bytes + 1 > COLLECTION_PAGE_BYTES)
      break;
    selected.push(row);
    bytes += row.bytes + 1;
  }
  if (!selected.length) {
    if (candidates.length)
      throw new HttpError(413, '单条记录过大，无法在页面中加载。请联系支持。');
    return { rows: [], next: null };
  }
  const last = selected.at(-1)!.position;
  // The bounded identifier list prevents a new insert from entering this page
  // between sizing and loading. Mutable records are checked again after reading.
  const rows = (
    await store.db
      .prepare(
        `SELECT * FROM "${collection}" WHERE project_id=? AND rowid IN (${selected.map(() => '?').join(',')}) ORDER BY rowid DESC`,
      )
      .bind(projectId, ...selected.map((row) => row.position))
      .all()
  ).results;
  for (const row of rows)
    for (const key of jsonColumns)
      if (typeof row[key] === 'string') row[key] = JSON.parse(row[key]);
  if (
    new TextEncoder().encode(JSON.stringify(rows)).byteLength >
    COLLECTION_PAGE_BYTES + 2
  )
    throw new HttpError(409, '记录在读取时发生变化，请刷新重试。');
  return {
    rows,
    next: selected.length < candidates.length ? String(last) : null,
  };
}

export type CollectionCheckpoint = Record<ProjectCollection, string>;
// Capture all insertion boundaries in one SQL read so a newly imported source
// and its evidence cannot enter different halves of an initial project load.
export async function collectionCheckpoint(
  store: ResearchStore,
  projectId: string,
): Promise<CollectionCheckpoint> {
  await store.project(projectId);
  const row = await store.db
    .prepare(
      `SELECT ${projectCollections
        .map(
          (table) =>
            `(SELECT COALESCE(MAX(rowid),0)+1 FROM "${table}" WHERE project_id=?) AS "${table}"`,
        )
        .join(',')}`,
    )
    .bind(...projectCollections.map(() => projectId))
    .first<Record<ProjectCollection, number>>();
  return Object.fromEntries(
    Object.entries(row!).map(([key, value]) => [key, String(value)]),
  ) as CollectionCheckpoint;
}
