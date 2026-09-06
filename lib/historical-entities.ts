import { z } from 'zod';
import { ResearchStore } from './store';
import { HttpError } from './errors';
import { citationSchema } from './platform/types';
export const entityInput = z
  .object({
    id: z.uuid().optional(),
    expected: z.number().int().positive().optional(),
    project_id: z.uuid(),
    kind: z.enum(['person', 'place', 'organization', 'event']),
    name: z.string().trim().min(1).max(200),
    aliases: z.array(z.string().trim().min(1).max(200)).max(30),
    date_start: z.number().int().min(-10000).max(3000).nullable(),
    date_end: z.number().int().min(-10000).max(3000).nullable(),
    evidence: z.array(citationSchema).max(30),
    status: z.enum(['candidate', 'confirmed', 'rejected']),
    reason: z.string().trim().min(1).max(2000),
  })
  .refine(
    (v) =>
      v.date_start === null ||
      v.date_end === null ||
      v.date_start <= v.date_end,
    '日期范围倒置。',
  );
export type HistoricalEntity = {
  id: string;
  project_id: string;
  kind: 'person' | 'place' | 'organization' | 'event';
  name: string;
  aliases: string[];
  date_start: number | null;
  date_end: number | null;
  evidence: z.infer<typeof citationSchema>[];
  status: 'candidate' | 'confirmed' | 'rejected';
  canonical_id: string | null;
  revision: number;
};
function decode(row: Record<string, unknown>): HistoricalEntity {
  return {
    ...row,
    aliases: JSON.parse(String(row.aliases)),
    evidence: JSON.parse(String(row.evidence)),
  } as HistoricalEntity;
}
export async function listEntities(store: ResearchStore, project: string) {
  const p = await store.project(project);
  const entities = (
    await store.db
      .prepare(
        'SELECT * FROM entities WHERE project_id=? ORDER BY name LIMIT 1000',
      )
      .bind(project)
      .all()
  ).results.map(decode);
  const history = (
    await store.db
      .prepare(
        "SELECT r.*,u.name actor FROM entity_relations r LEFT JOIN user u ON u.id=json_extract(CASE WHEN json_valid(r.basis) THEN r.basis ELSE '{}' END,'$.actor') WHERE r.project_id=? AND r.kind IN ('revision','merge','unmerge') ORDER BY r.created_at DESC LIMIT 100",
      )
      .bind(project)
      .all()
  ).results;
  return {
    entities,
    history,
    writable: p.role !== 'viewer',
    reviewable: ['owner', 'reviewer'].includes(p.role),
  };
}
async function readEntity(store: ResearchStore, id: string) {
  const row = await store.db
    .prepare('SELECT * FROM entities WHERE id=?')
    .bind(id)
    .first();
  if (!row) throw new HttpError(404, '研究条目不存在。');
  await store.project(String(row.project_id));
  return decode(row);
}
export async function saveEntity(store: ResearchStore, raw: unknown) {
  const input = entityInput.parse(raw);
  await store.project(
    input.project_id,
    input.status === 'confirmed' ? 'review' : 'write',
  );
  if (input.status === 'confirmed' && !input.evidence.length)
    throw new HttpError(400, '确认条目前请添加原文出处。');
  for (const c of input.evidence) {
    const version = await store.version(c.version_id);
    if (
      version.project_id !== input.project_id ||
      !version.pages.find((p) => p.page === c.page)?.text.includes(c.quote)
    )
      throw new HttpError(400, '条目出处必须来自当前项目的固定原文。');
  }
  const time = new Date().toISOString(),
    id = input.id || crypto.randomUUID();
  if (input.id) {
    const old = await readEntity(store, id);
    if (old.project_id !== input.project_id || old.revision !== input.expected)
      throw new HttpError(409, '条目已有更新，请重新打开。');
    if (old.canonical_id)
      throw new HttpError(409, '请先取消合并再编辑该条目。');
    if (old.status === 'confirmed')
      await store.project(input.project_id, 'review');
    const result = await store.db.batch([
      store.db
        .prepare(
          "INSERT INTO entity_relations(id,project_id,from_id,to_id,kind,basis,created_at) SELECT ?,?,id,id,'revision',?,? FROM entities WHERE id=? AND revision=?",
        )
        .bind(
          crypto.randomUUID(),
          input.project_id,
          JSON.stringify({
            actor: store.owner,
            reason: input.reason,
            before: old,
          }),
          time,
          id,
          input.expected,
        ),
      store.db
        .prepare(
          'UPDATE entities SET kind=?,name=?,aliases=?,date_start=?,date_end=?,evidence=?,status=?,revision=revision+1 WHERE id=? AND project_id=? AND revision=?',
        )
        .bind(
          input.kind,
          input.name,
          JSON.stringify([...new Set(input.aliases)]),
          input.date_start,
          input.date_end,
          JSON.stringify(input.evidence),
          input.status,
          id,
          input.project_id,
          input.expected,
        ),
    ]);
    if (!result[1].meta.changes)
      throw new HttpError(409, '条目已有更新，请重试。');
  } else {
    await store.db
      .prepare(
        'INSERT INTO entities(id,project_id,kind,name,aliases,date_start,date_end,evidence,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        input.project_id,
        input.kind,
        input.name,
        JSON.stringify([...new Set(input.aliases)]),
        input.date_start,
        input.date_end,
        JSON.stringify(input.evidence),
        input.status,
        store.owner,
        time,
      )
      .run();
  }
  return id;
}
export async function mergeEntity(
  store: ResearchStore,
  id: string,
  target: string | null,
  expected: number,
  reason: string,
) {
  const source = await readEntity(store, id);
  await store.project(source.project_id, 'review');
  if (source.revision !== expected)
    throw new HttpError(409, '条目已有更新，请刷新。');
  if (target) {
    const other = await readEntity(store, target);
    if (
      source.id === other.id ||
      source.project_id !== other.project_id ||
      source.kind !== other.kind ||
      other.canonical_id ||
      source.canonical_id ||
      source.status !== 'confirmed' ||
      other.status !== 'confirmed'
    )
      throw new HttpError(
        400,
        '请选择同一项目中已确认、同类别且未合并的条目。',
      );
    if (
      await store.db
        .prepare('SELECT id FROM entities WHERE canonical_id=? LIMIT 1')
        .bind(source.id)
        .first()
    )
      throw new HttpError(409, '该条目已有合并成员，请先分别取消合并。');
  } else if (!source.canonical_id) throw new HttpError(409, '此条目尚未合并。');
  // Recheck both ends inside the atomic batch: two concurrent inverse merges must not create a cycle.
  const guard = target
    ? " AND canonical_id IS NULL AND status='confirmed' AND NOT EXISTS(SELECT 1 FROM entities child WHERE child.canonical_id=entities.id) AND EXISTS(SELECT 1 FROM entities dest WHERE dest.id=? AND dest.project_id=entities.project_id AND dest.kind=entities.kind AND dest.status='confirmed' AND dest.canonical_id IS NULL)"
    : ' AND canonical_id IS NOT NULL';
  const extra = target ? [target] : [];
  const results = await store.db.batch([
    store.db
      .prepare(
        'INSERT INTO entity_relations(id,project_id,from_id,to_id,kind,basis,created_at) SELECT ?,?,id,?,?,?,? FROM entities WHERE id=? AND revision=?' +
          guard,
      )
      .bind(
        crypto.randomUUID(),
        source.project_id,
        target || source.canonical_id,
        target ? 'merge' : 'unmerge',
        JSON.stringify({ actor: store.owner, reason }),
        new Date().toISOString(),
        id,
        expected,
        ...extra,
      ),
    store.db
      .prepare(
        'UPDATE entities SET canonical_id=?,revision=revision+1 WHERE id=? AND revision=?' +
          guard,
      )
      .bind(target, id, expected, ...extra),
  ]);
  if (!results[1].meta.changes)
    throw new HttpError(409, '条目或合并关系已有更新，请刷新。');
}
