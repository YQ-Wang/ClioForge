import { parseRichDocument } from './rich-document';
import { boardBodySchema } from './platform/task-board';
import { removeTemporaryObject } from './object-cleanup';
import { ResearchStore, validatePages } from './store';
import { HttpError } from './errors';
import { sha256, indexText } from './platform/search';
import {
  packageMetadata,
  packageManifest,
  checkManifest,
  restoreTables,
  MAX_METADATA_BYTES,
} from './backup-format';
import {
  MAX_FILE_BYTES,
  USER_STORAGE_BYTES,
  SITE_STORAGE_BYTES,
  mediaExtensions,
} from './files';

type Row = Record<string, unknown>;
type Planned = { table: string; row: Row };
type Restore = {
  id: string;
  owner_id: string;
  project_id: string;
  status: string;
  cursor: number;
  total: number;
  plan_path: string;
  digest: string;
};
const date = () => new Date().toISOString();
const actorColumns = new Set([
  'owner_id',
  'created_by',
  'author',
  'reviewer',
  'added_by',
  'invited_by',
]);
const jsonColumns = new Set([
  'pages',
  'document',
  'config',
  'metrics',
  'results',
  'csl',
  'model_snapshot',
  'source_version_ids',
  'version_ids',
  'input',
  'result',
  'scopes',
  'variants',
  'body',
  'source_versions',
  'manifest',
  'changes',
  'aliases',
  'evidence',
  'metadata',
  'dependencies',
  'region',
]);
export class ProjectRestore {
  constructor(
    readonly store: ResearchStore,
    readonly files: R2Bucket,
  ) {}
  async read(id: string) {
    const row = await this.store.db
      .prepare('SELECT * FROM project_restores WHERE id=? AND owner_id=?')
      .bind(id, this.store.owner)
      .first<Restore>();
    if (!row) throw new HttpError(404, '恢复记录不存在。');
    return row;
  }
  async active() {
    return (
      await this.store.db
        .prepare(
          "SELECT id,project_id,status,cursor,total,digest FROM project_restores WHERE owner_id=? AND status IN ('uploading','records','cancelled')",
        )
        .bind(this.store.owner)
        .all()
    ).results;
  }
  async start(raw: unknown, rawManifest: unknown, title: string) {
    const metadata = packageMetadata.parse(raw),
      manifest = packageManifest.parse(rawManifest);
    checkManifest(manifest);
    if ((await this.active()).length)
      throw new HttpError(409, '已有恢复尚未完成，请继续或取消它。');
    const encoded = new TextEncoder().encode(JSON.stringify(metadata));
    if (encoded.byteLength > MAX_METADATA_BYTES)
      throw new HttpError(413, '项目记录过大。');
    // The original serialized metadata hash is checked by the upload API/client;
    // this digest identifies the normalized plan for retries.
    const digest = await sha256(JSON.stringify({ metadata, manifest }));
    for (const key of Object.keys(metadata.records))
      if (![...restoreTables, 'project_members'].includes(key as never))
        throw new HttpError(400, '备份包含不支持的记录类型。');
    const count = Object.values(metadata.records).reduce(
      (n, rows) => n + rows.length,
      0,
    );
    if (count > 50000)
      throw new HttpError(413, '单次恢复最多 50,000 条研究记录。');
    const id = crypto.randomUUID(),
      projectId = crypto.randomUUID(),
      path = `${this.store.owner}/${projectId}/restore-plan.json`;
    const ids = new Map<string, string>([[metadata.project.id, projectId]]),
      people = new Map<string, string>();
    const sourceRows = metadata.records.sources || [];
    if (sourceRows.length > 500)
      throw new HttpError(413, '单次恢复最多 500 份材料。');
    for (const table of restoreTables) {
      const seen = new Set<string>();
      for (const row of metadata.records[table] || []) {
        if (
          row.project_id !== undefined &&
          row.project_id !== metadata.project.id
        )
          throw new HttpError(400, '备份混入了其他项目的记录。');
        if (typeof row.id === 'string') {
          if (seen.has(row.id) || row.id === metadata.project.id)
            throw new HttpError(400, '备份包含重复记录 ID。');
          seen.add(row.id);
          if (!ids.has(row.id)) ids.set(row.id, crypto.randomUUID());
        }
        for (const [key, value] of Object.entries(row))
          if (
            actorColumns.has(key) &&
            typeof value === 'string' &&
            !people.has(value)
          )
            people.set(value, crypto.randomUUID());
      }
    }
    // IDs in textual quotations are not rewritten. Only exact structured IDs and
    // internal Canwoo citation URL query values are remapped.
    function remap(value: unknown, key = ''): unknown {
      if (['quote', 'text'].includes(key)) return value;
      if (typeof value === 'string') {
        if (actorColumns.has(key) || (key === 'assignee' && people.has(value)))
          return people.get(value) || value;
        if (ids.has(value)) return ids.get(value);
        return value.replace(/\/(?:\?)project=[^\s)\]"<>]+/g, (link) => {
          try {
            const url = new URL(link, 'https://canwoo.com');
            for (const field of [
              'project',
              'version',
              'note',
              'evidence',
              'annotation',
              'mission',
              'task',
            ]) {
              const old = url.searchParams.get(field);
              if (old && ids.has(old))
                url.searchParams.set(field, ids.get(old)!);
            }
            return url.pathname + url.search;
          } catch {
            return link;
          }
        });
      }
      if (Array.isArray(value)) return value.map((v) => remap(v, key));
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, remap(v, k)]),
        );
      return value;
    }
    const plan: Planned[] = [];
    const peopleNames = new Map(
      (metadata.people || []).map((p) => [p.id, p.name]),
    );
    for (const [old, newId] of people) {
      plan.push({
        table: 'user',
        row: {
          id: newId,
          name: `${peopleNames.get(old) || 'Contributor'} · imported record`,
          email: `imported-${newId}@canwoo.invalid`,
          email_verified: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      });
      plan.push({
        table: 'restore_people',
        row: { project_id: projectId, user_id: newId, original_id: old },
      });
    }
    const originals = [] as {
      source_id: string;
      path: string;
      bytes: number;
      sha256: string;
      media_type: string;
    }[];
    for (const source of sourceRows) {
      const entry = manifest.files.find((f) => f.source_id === source.id);
      const type = String(source.media_type);
      if (
        !entry ||
        !mediaExtensions[type] ||
        entry.bytes < 1 ||
        entry.bytes > MAX_FILE_BYTES ||
        entry.path !== `originals/${String(source.id)}.${mediaExtensions[type]}`
      )
        throw new HttpError(400, '原件清单与研究记录不匹配。');
      originals.push({
        source_id: ids.get(String(source.id))!,
        path: `${this.store.owner}/${projectId}/${ids.get(String(source.id))}/original.${mediaExtensions[type]}`,
        bytes: entry.bytes,
        sha256: entry.sha256,
        media_type: type,
      });
    }
    if (manifest.files.length !== originals.length + 1)
      throw new HttpError(400, '备份包含未登记的原件。');
    const columns = await this.store.db.batch<{ name: string }>(
      restoreTables.map((t) =>
        this.store.db.prepare(`PRAGMA table_info(${t})`),
      ),
    );
    const foreignKeys = await this.store.db.batch<{
      id: number;
      from: string;
      to: string;
      table: string;
    }>(
      restoreTables.map((t) =>
        this.store.db.prepare(`PRAGMA foreign_key_list(${t})`),
      ),
    );
    for (const [index, table] of restoreTables.entries()) {
      const allowed = new Set(
        columns[index].results.map((c) => String(c.name)),
      );
      const keyGroups = new Map<
        number,
        (typeof foreignKeys)[number]['results']
      >();
      for (const fk of foreignKeys[index].results)
        keyGroups.set(fk.id, [...(keyGroups.get(fk.id) || []), fk]);
      const relationships = [...keyGroups.values()].map((group) => ({
        group,
        values: new Set(
          (group[0].table === 'projects'
            ? [metadata.project]
            : metadata.records[group[0].table] || []
          ).map((target) =>
            JSON.stringify(group.map((fk) => (target as Row)[fk.to])),
          ),
        ),
      }));
      let rows = [...(metadata.records[table] || [])];
      if (table === 'notes')
        for (const row of rows) {
          if (row.document != null) {
            try {
              if (typeof row.document !== 'string')
                throw new Error('Invalid document');
              parseRichDocument(row.document);
            } catch {
              throw new HttpError(400, '备份中的完整文稿无效或过大。');
            }
          }
        }
      if (table === 'notes' || table === 'source_versions')
        rows.sort((a, b) => Number(a.revision) - Number(b.revision));
      if (table === 'artifacts' || table === 'entities') {
        const pending = rows;
        rows = [];
        const done = new Set<string>();
        while (pending.length) {
          const at = pending.findIndex((r) =>
            [r.derived_from, r.supersedes, r.canonical_id].every(
              (v) =>
                !v ||
                !pending.some((p) => p.id === v) ||
                done.has(typeof v === 'string' ? v : ''),
            ),
          );
          if (at < 0) throw new HttpError(400, '备份包含循环引用。');
          const row = pending.splice(at, 1)[0];
          rows.push(row);
          done.add(String(row.id));
        }
      }
      for (const original of rows) {
        const row: Row = {};
        for (const [key, value] of Object.entries(original)) {
          if (!allowed.has(key))
            throw new HttpError(400, '备份字段与当前版本不兼容。');
          if (
            [
              'lease_hash',
              'review_token',
              'merge_token',
              'mutation_token',
            ].includes(key) ||
            (table === 'task_events' && key === 'id')
          )
            continue;
          if (jsonColumns.has(key) && typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              row[key] = JSON.stringify(
                key === 'pages' ? parsed : remap(parsed),
              );
            } catch {
              row[key] = remap(value, key);
            }
          } else row[key] = remap(value, key);
        }
        if (table === 'sources')
          row.object_path = originals.find((o) => o.source_id === row.id)!.path;
        if (table === 'source_versions') {
          validatePages(JSON.parse(String(row.pages)));
        }
        if (table === 'research_jobs') {
          if (['running', 'queued', 'paused'].includes(String(row.status))) {
            row.status = 'cancelled';
            row.error = 'Restored historical request; no model was called.';
          }
          row.model_id = '';
          row.dispatched_at = null;
          row.stage = 'restored';
        }
        if (table === 'research_runs' && row.status === 'running') {
          row.status = 'failed';
          row.error = 'Restored unfinished request; no model was called.';
          row.finished_at = date();
        }
        if (
          table === 'direct_run_costs' &&
          ['calling', 'reserved'].includes(String(row.phase))
        )
          row.phase = 'uncertain';
        if (table === 'project_budgets') {
          row.limit_units = 0;
          row.committed_units = 0;
        }
        if (table === 'research_watches') row.enabled = 0;
        if (table === 'research_inbox')
          row.item_key = `restored:${id}:${String(row.item_key)}`;
        if (table === 'missions') row.status = 'paused';
        if (table === 'mission_boards') {
          let body: unknown;
          try {
            body = JSON.parse(String(row.body));
          } catch {
            throw new HttpError(400, '备份中的看板安排无效。');
          }
          const parsed = boardBodySchema.safeParse(body);
          if (!parsed.success)
            throw new HttpError(400, '备份中的看板安排无效。');
          // Restored plans are paused. Preserve the order, not a claim that
          // someone is still working on the newly restored copy.
          row.body = JSON.stringify({ order: parsed.data.order, stages: {} });
          row.revision = 0;
        }
        if (table === 'mission_tasks') {
          if (
            ['blocked', 'ready', 'queued', 'running'].includes(
              String(row.status),
            )
          )
            row.status = 'stale';
          row.lease_until = null;
          row.claimed_by = null;
          row.input = JSON.stringify({
            ...JSON.parse(String(row.input)),
            model_id: undefined,
          });
        }
        if (
          table === 'ingestion_items' &&
          !['complete', 'completed', 'succeeded'].includes(String(row.status))
        )
          row.status = 'cancelled';
        if (table === 'artifacts') {
          for (const key of ['derived_from', 'supersedes'])
            if (
              original[key] &&
              !ids.has(typeof original[key] === 'string' ? original[key] : '')
            )
              row[key] = null;
          row.sha256 = await sha256(String(row.body));
        }
        if (table === 'project_snapshots')
          row.sha256 = await sha256(String(row.manifest));
        if (
          table === 'artifact_dependencies' &&
          (!ids.has(String(original.depends_on)) ||
            !ids.has(String(original.artifact_id)))
        )
          continue;
        for (const { group, values } of relationships) {
          if (
            group.some(
              (fk) => original[fk.from] == null || row[fk.from] === null,
            )
          )
            continue;
          const valid =
            group[0].table === 'user'
              ? group.every((fk) => people.has(String(original[fk.from])))
              : values.has(
                  JSON.stringify(group.map((fk) => original[fk.from])),
                );
          if (!valid)
            throw new HttpError(
              400,
              '备份有指向包外或不一致的引用，无法完整恢复。',
            );
        }
        plan.push({ table, row });
      }
    }
    const indexed = new Set(
      plan
        .filter((p) => p.table === 'source_pages')
        .map((p) => `${String(p.row.version_id)}:${String(p.row.page)}`),
    );
    for (const { row } of plan.filter((p) => p.table === 'source_versions')) {
      const pages = JSON.parse(String(row.pages)) as {
        page: number;
        text: string;
      }[];
      for (const page of pages) {
        const pageId = `${String(row.id)}:${page.page}`;
        if (!indexed.has(pageId))
          plan.push({
            table: 'source_pages',
            row: {
              id: pageId,
              project_id: projectId,
              source_id: row.source_id,
              version_id: row.id,
              page: page.page,
              text: page.text,
              normalized: indexText(page.text),
              content_hash: await sha256(page.text),
            },
          });
      }
    }
    if (plan.length > 51000)
      throw new HttpError(413, '恢复后的记录和页码索引超过上限，请拆分项目。');
    const planBody = JSON.stringify({
      plan,
      originals,
      metadata,
      manifest,
      ids: Object.fromEntries(ids),
    });
    if (new TextEncoder().encode(planBody).byteLength > 24 * 1024 * 1024)
      throw new HttpError(413, '恢复计划过大，请联系支持。');
    const totalBytes = originals.reduce((n, o) => n + o.bytes, 0);
    await this.store.db
      .batch([
        this.store.db
          .prepare(
            'INSERT INTO projects(id,owner_id,title,description,created_at) SELECT ?,?,?,?,? WHERE COALESCE((SELECT SUM(bytes) FROM upload_reservations WHERE owner_id=?),0)+?<=? AND COALESCE((SELECT SUM(bytes) FROM upload_reservations),0)+?<=?',
          )
          .bind(
            projectId,
            this.store.owner,
            title.trim().slice(0, 200) ||
              `${metadata.project.title} · restored`.slice(0, 200),
            metadata.project.description,
            date(),
            this.store.owner,
            totalBytes,
            USER_STORAGE_BYTES,
            totalBytes,
            SITE_STORAGE_BYTES,
          ),
        this.store.db
          .prepare("INSERT INTO project_lifecycle VALUES(?,'restoring',?)")
          .bind(projectId, date()),
        this.store.db
          .prepare(
            "INSERT INTO project_restores VALUES(?,?,?,?,'uploading',0,?,?,?,?)",
          )
          .bind(
            id,
            this.store.owner,
            projectId,
            digest,
            plan.length,
            path,
            date(),
            date(),
          ),
        ...Array.from({ length: Math.ceil(originals.length / 15) }, (_, i) => {
          const group = originals.slice(i * 15, (i + 1) * 15);
          return [
            this.store.db
              .prepare(
                `INSERT INTO restore_files VALUES${group.map(() => '(?,?,?,?,?,?,0)').join(',')}`,
              )
              .bind(
                ...group.flatMap((o) => [
                  id,
                  o.source_id,
                  o.path,
                  o.bytes,
                  o.sha256,
                  o.media_type,
                ]),
              ),
            this.store.db
              .prepare(
                `INSERT INTO upload_reservations VALUES${group.map(() => '(?,?,?,?,?)').join(',')}`,
              )
              .bind(
                ...group.flatMap((o) => [
                  o.source_id,
                  this.store.owner,
                  projectId,
                  o.bytes,
                  date(),
                ]),
              ),
          ];
        }).flat(),
      ])
      .catch(() => {
        throw new HttpError(
          409,
          '无法开始恢复：请检查可用存储空间或已有恢复任务。',
        );
      });
    await this.files.put(path, planBody, {
      httpMetadata: { contentType: 'application/json' },
    });
    try {
      await this.read(id);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404)
        await removeTemporaryObject(this.store.db, this.files, path);
      throw error;
    }
    return {
      id,
      project_id: projectId,
      digest,
      total: plan.length,
      files: originals.map((o) => ({
        source_id: o.source_id,
        original_id: [...ids].find(([, v]) => v === o.source_id)![0],
      })),
    };
  }
  async resume(id: string, raw: unknown, rawManifest: unknown) {
    const restore = await this.read(id),
      metadata = packageMetadata.parse(raw),
      manifest = packageManifest.parse(rawManifest);
    if (
      restore.digest !== (await sha256(JSON.stringify({ metadata, manifest })))
    )
      throw new HttpError(409, '请选择开始恢复时使用的同一份备份。');
    if (restore.status === 'complete') return { ...restore, files: [] };
    const object = await this.files.get(restore.plan_path);
    if (!object) throw new HttpError(409, '恢复计划不存在，请取消后重新开始。');
    const plan = await object.json<{ ids: Record<string, string> }>();
    const files = (
      await this.store.db
        .prepare(
          'SELECT source_id,uploaded FROM restore_files WHERE restore_id=?',
        )
        .bind(id)
        .all<{ source_id: string; uploaded: number }>()
    ).results;
    return {
      ...restore,
      files: files.map((file) => ({
        ...file,
        original_id: Object.entries(plan.ids).find(
          ([, v]) => v === file.source_id,
        )?.[0],
      })),
    };
  }
  async upload(id: string, sourceId: string, bytes: Uint8Array) {
    const restore = await this.read(id);
    if (restore.status !== 'uploading')
      throw new HttpError(409, '恢复不在上传阶段。');
    const file = await this.store.db
      .prepare('SELECT * FROM restore_files WHERE restore_id=? AND source_id=?')
      .bind(id, sourceId)
      .first<{
        path: string;
        bytes: number;
        sha256: string;
        media_type: string;
      }>();
    if (
      !file ||
      file.bytes !== bytes.byteLength ||
      file.sha256 !== (await sha256(bytes))
    )
      throw new HttpError(400, '原件校验失败，未写入。');
    await this.files.put(file.path, bytes, {
      httpMetadata: { contentType: file.media_type },
    });
    const marked = await this.store.db
      .prepare(
        "UPDATE restore_files SET uploaded=1 WHERE restore_id=? AND source_id=? AND EXISTS(SELECT 1 FROM project_restores WHERE id=? AND status='uploading')",
      )
      .bind(id, sourceId, id)
      .run();
    if (!marked.meta.changes) {
      const current = await this.store.db
        .prepare('SELECT status FROM project_restores WHERE id=?')
        .bind(id)
        .first<{ status: string }>();
      if (!current || current.status === 'cancelled')
        await removeTemporaryObject(this.store.db, this.files, file.path);
      throw new HttpError(409, '恢复状态已改变，请重新打开恢复窗口。');
    }
  }
  async step(id: string) {
    const restore = await this.read(id);
    if (restore.status === 'complete')
      return { complete: true, project_id: restore.project_id };
    if (restore.status === 'cancelled')
      throw new HttpError(409, '恢复已取消。');
    const missing = await this.store.db
      .prepare(
        'SELECT COUNT(*) AS n FROM restore_files WHERE restore_id=? AND uploaded=0',
      )
      .bind(id)
      .first<{ n: number }>();
    if (missing?.n) throw new HttpError(409, '请先上传所有原件。');
    const object = await this.files.get(restore.plan_path);
    if (!object) throw new HttpError(409, '恢复计划尚未保存，请取消后重试。');
    const { plan } = await object.json<{ plan: Planned[] }>();
    const chunk = plan.slice(restore.cursor, restore.cursor + 40);
    const statements = chunk.map(({ table, row }) => {
      if (
        ![...restoreTables, 'user', 'restore_people'].includes(table as never)
      )
        throw new Error('Invalid stored plan');
      const keys = Object.keys(row);
      if (keys.some((k) => !/^\w+$/.test(k)))
        throw new Error('Invalid stored column');
      return this.store.db
        .prepare(
          `INSERT INTO ${table}(${keys.map((k) => `"${k}"`).join(',')}) SELECT ${keys.map(() => '?').join(',')} WHERE EXISTS(SELECT 1 FROM project_restores WHERE id=? AND owner_id=? AND cursor=? AND status IN ('uploading','records'))`,
        )
        .bind(
          ...keys.map((k) => row[k] ?? null),
          id,
          this.store.owner,
          restore.cursor,
        );
    });
    // Persisted cursor is part of the same transaction as inserts. A retry never
    // inserts duplicate versions, and a cancelled restore cannot resume.
    await this.store.db.batch([
      ...statements,
      this.store.db
        .prepare(
          "UPDATE project_restores SET cursor=cursor+?,status='records',updated_at=? WHERE id=? AND cursor=? AND status IN ('uploading','records')",
        )
        .bind(chunk.length, date(), id, restore.cursor),
    ]);
    if (restore.cursor + chunk.length < plan.length)
      return {
        complete: false,
        cursor: restore.cursor + chunk.length,
        total: plan.length,
      };
    await this.store.db.batch([
      this.store.db
        .prepare(
          "DELETE FROM project_lifecycle WHERE project_id=? AND state='restoring' AND EXISTS(SELECT 1 FROM project_restores WHERE id=? AND status='records' AND cursor=total)",
        )
        .bind(restore.project_id, id),
      this.store.db
        .prepare(
          "UPDATE project_restores SET status='complete',updated_at=? WHERE id=? AND status='records' AND cursor=total",
        )
        .bind(date(), id),
    ]);
    const completed = await this.read(id);
    if (completed.status !== 'complete')
      throw new HttpError(409, '恢复状态已改变，请重新打开恢复窗口。');
    // The archive has been materialized. Do not retain another unmetered copy of its plan.
    await this.files.delete(restore.plan_path).catch(() => {
      /* The completed project is available; scheduled cleanup retries the temporary plan. */
    });
    return { complete: true, project_id: restore.project_id };
  }
}
