import { ResearchStore } from './store';
import { HttpError } from './errors';
import { indexSemantic, semanticStatus } from './platform/semantic';
import { sha256 } from './platform/search';
import type { JobsEnv } from './jobs';
export type Preparation = {
  id: string;
  project_id: string;
  owner_id: string;
  connection_id: string;
  snapshot: string;
  status:
    | 'queued'
    | 'running'
    | 'pause_requested'
    | 'cancel_requested'
    | 'paused'
    | 'cancelled'
    | 'completed'
    | 'uncertain'
    | 'stale';
  step_id: string;
  indexed: number;
  total: number;
  detail: string;
  updated_at: string;
  created_at: string;
};
const now = () => new Date().toISOString();
async function snapshot(store: ResearchStore, project: string) {
  const rows = (
    await store.db
      .prepare(
        'SELECT source_id,MAX(revision) revision FROM source_versions WHERE project_id=? GROUP BY source_id ORDER BY source_id',
      )
      .bind(project)
      .all()
  ).results;
  return sha256(JSON.stringify(rows));
}
export async function preparationStatus(store: ResearchStore, project: string) {
  const status = await semanticStatus(store, project);
  const latest = await store.db
    .prepare(
      'SELECT * FROM material_preparations WHERE project_id=? ORDER BY created_at DESC LIMIT 1',
    )
    .bind(project)
    .first<Preparation>();
  const sources = (
    await store.db
      .prepare(
        `SELECT s.id,s.title,v.id version_id,COUNT(p.page) pages,SUM(CASE WHEN trim(p.text)<>'' THEN 1 ELSE 0 END) readable FROM sources s JOIN source_versions v ON v.source_id=s.id AND v.revision=(SELECT MAX(v2.revision) FROM source_versions v2 WHERE v2.source_id=s.id) LEFT JOIN source_pages p ON p.version_id=v.id WHERE s.project_id=? GROUP BY s.id ORDER BY s.created_at DESC LIMIT 500`,
      )
      .bind(project)
      .all<{
        id: string;
        title: string;
        version_id: string;
        pages: number;
        readable: number;
      }>()
  ).results;
  return {
    ...status,
    preparation: latest
      ? { ...latest, controllable: latest.owner_id === store.owner }
      : null,
    sources,
  };
}
export async function startPreparation(
  store: ResearchStore,
  env: JobsEnv,
  project: string,
  connection: string,
  id: string,
) {
  await store.project(project, 'write');
  await store.model(connection);
  if (!env.JOB_QUEUE || !env.FOLIOTRACE_ENCRYPTION_KEY)
    throw new HttpError(503, '后台准备服务尚未配置。');
  const existing = await store.db
    .prepare('SELECT * FROM material_preparations WHERE id=?')
    .bind(id)
    .first<Preparation>();
  if (existing) {
    if (existing.project_id !== project || existing.owner_id !== store.owner)
      throw new HttpError(409, '请求编号已使用。');
    return preparationStatus(store, project);
  }
  const time = now();
  try {
    await store.db
      .prepare(
        "INSERT INTO material_preparations(id,project_id,owner_id,connection_id,snapshot,status,step_id,updated_at,created_at) VALUES(?,?,?,?,?,'queued',?,?,?)",
      )
      .bind(
        id,
        project,
        store.owner,
        connection,
        await snapshot(store, project),
        crypto.randomUUID(),
        time,
        time,
      )
      .run();
  } catch (error) {
    if (
      await store.db
        .prepare(
          "SELECT id FROM material_preparations WHERE project_id=? AND status IN ('queued','running','pause_requested','cancel_requested','paused','uncertain')",
        )
        .bind(project)
        .first()
    )
      throw new HttpError(409, '此项目已有准备任务，请先继续或取消它。');
    throw error;
  }
  // Queued state is the outbox; cron safely dispatches again after delivery failure.
  try {
    await env.JOB_QUEUE.send({ id, kind: 'preparation' });
  } catch {
    /* durable queued row remains recoverable */
  }
  return preparationStatus(store, project);
}
export async function controlPreparation(
  store: ResearchStore,
  env: JobsEnv,
  id: string,
  action: 'pause' | 'resume' | 'cancel',
) {
  const row = await store.db
    .prepare('SELECT * FROM material_preparations WHERE id=?')
    .bind(id)
    .first<Preparation>();
  if (!row) throw new HttpError(404, '准备任务不存在。');
  await store.project(row.project_id, 'write');
  if (row.owner_id !== store.owner)
    throw new HttpError(403, '请由使用该模型账号的研究者管理准备任务。');
  if (action === 'resume') {
    if (!['paused', 'uncertain'].includes(row.status))
      throw new HttpError(409, '只有暂停或待确认的任务可以继续。');
    if ((await snapshot(store, row.project_id)) !== row.snapshot) {
      await store.db
        .prepare(
          "UPDATE material_preparations SET status='stale',detail='资料已更新，请重新准备。',updated_at=? WHERE id=? AND status IN ('paused','uncertain')",
        )
        .bind(now(), id)
        .run();
      return preparationStatus(store, row.project_id);
    }
    const result = await store.db
      .prepare(
        "UPDATE material_preparations SET status='queued',step_id=?,detail='',updated_at=? WHERE id=? AND status IN ('paused','uncertain')",
      )
      .bind(crypto.randomUUID(), now(), id)
      .run();
    if (result.meta.changes && env.JOB_QUEUE)
      try {
        await env.JOB_QUEUE.send({ id, kind: 'preparation' });
      } catch {
        /* cron recovery */
      }
  } else {
    await store.db
      .prepare(
        `UPDATE material_preparations SET status=CASE WHEN status IN ('running','pause_requested','cancel_requested') THEN ? ELSE ? END,updated_at=? WHERE id=? AND status IN ('queued','running','pause_requested','paused','uncertain')`,
      )
      .bind(
        action === 'pause' ? 'pause_requested' : 'cancel_requested',
        action === 'pause' ? 'paused' : 'cancelled',
        now(),
        id,
      )
      .run();
  }
  return preparationStatus(store, row.project_id);
}
export async function executePreparation(
  env: JobsEnv,
  id: string,
  fetcher: typeof fetch = fetch,
) {
  const claimed = await env.DB.prepare(
    "UPDATE material_preparations SET status='running',updated_at=? WHERE id=? AND status='queued' RETURNING *",
  )
    .bind(now(), id)
    .first<Preparation>();
  if (!claimed) return;
  const store = new ResearchStore(env.DB, claimed.owner_id);
  try {
    await store.project(claimed.project_id, 'write');
    if (!env.FOLIOTRACE_ENCRYPTION_KEY)
      throw new Error('Preparation credentials unavailable');
    if ((await snapshot(store, claimed.project_id)) !== claimed.snapshot) {
      await env.DB.prepare(
        "UPDATE material_preparations SET status='stale',detail='资料已更新，请重新准备。',updated_at=? WHERE id=? AND status IN ('running','pause_requested','cancel_requested')",
      )
        .bind(now(), id)
        .run();
      return;
    }
    const result = await indexSemantic(
      store,
      env.FOLIOTRACE_ENCRYPTION_KEY,
      claimed.project_id,
      claimed.connection_id,
      claimed.step_id,
      fetcher,
      async () => {
        if ((await snapshot(store, claimed.project_id)) !== claimed.snapshot)
          throw new HttpError(409, '资料已更新，请重新准备。');
      },
    );
    const stale =
      (await snapshot(store, claimed.project_id)) !== claimed.snapshot;
    const changed = await env.DB.prepare(
      "UPDATE material_preparations SET indexed=?,total=?,status=CASE WHEN status='cancel_requested' THEN 'cancelled' WHEN ? THEN 'stale' WHEN status='pause_requested' THEN 'paused' WHEN ? THEN 'completed' ELSE 'queued' END,step_id=?,updated_at=? WHERE id=? AND status IN ('running','pause_requested','cancel_requested') RETURNING status",
    )
      .bind(
        result.indexed,
        result.total,
        stale ? 1 : 0,
        result.done ? 1 : 0,
        crypto.randomUUID(),
        now(),
        id,
      )
      .first<{ status: string }>();
    if (changed?.status === 'queued' && env.JOB_QUEUE)
      try {
        await env.JOB_QUEUE.send({ id, kind: 'preparation' });
      } catch {
        /* cron recovery */
      }
  } catch {
    await env.DB.prepare(
      "UPDATE material_preparations SET status=CASE WHEN status='cancel_requested' THEN 'cancelled' ELSE 'uncertain' END,detail='本批未能确认完成。请检查模型用量；继续可能产生新的费用。',updated_at=? WHERE id=? AND status IN ('running','pause_requested','cancel_requested')",
    )
      .bind(now(), id)
      .run();
  }
}
export async function recoverPreparations(env: JobsEnv) {
  const cutoff = new Date(Date.now() - 5 * 60000).toISOString();
  await env.DB.prepare(
    "UPDATE material_preparations SET status=CASE WHEN status='cancel_requested' THEN 'cancelled' ELSE 'uncertain' END,detail='执行中断，结果尚待确认。继续前请检查用量。',updated_at=? WHERE status IN ('running','pause_requested','cancel_requested') AND updated_at<?",
  )
    .bind(now(), cutoff)
    .run();
  if (!env.JOB_QUEUE) return;
  const rows = (
    await env.DB.prepare(
      "SELECT id FROM material_preparations WHERE status='queued' ORDER BY updated_at LIMIT 20",
    ).all<{ id: string }>()
  ).results;
  for (const row of rows)
    await env.JOB_QUEUE.send({ id: row.id, kind: 'preparation' });
}
