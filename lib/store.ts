import { indexVersion } from './platform/search';
import { parseRichDocument, richMarkdown } from './rich-document';
import { withNoteState, type NoteState } from './notes';
import { HttpError, textField } from './errors';
import {
  MAX_FILE_BYTES,
  USER_STORAGE_BYTES,
  SITE_STORAGE_BYTES,
} from './files';
import type {
  PageText,
  Project,
  Source,
  SourceVersion,
  Model,
  Run,
  Note,
  SourceGroup,
  SourceOrganization,
} from './types';
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
type ImportInput = {
  p_id: string;
  p_project: string;
  p_title: unknown;
  p_path: string;
  p_type: string;
  p_pages: unknown;
};
type RevisionInput = {
  p_source: string;
  p_expected: number;
  p_pages: unknown;
  p_method: string;
};
type NoteInput = {
  p_id?: string;
  p_project: string;
  p_parent: string | null;
  p_title: unknown;
  p_body: string;
  p_document?: string | null;
};
type EvidenceInput = {
  p_version: string;
  p_page: number;
  p_quote: string;
  p_question: unknown;
  p_interpretation: string;
  p_relation: string;
  p_start?: number;
  p_region?: import('./workbench-types').Region | null;
};
type RunInput = {
  id: string;
  project_id: string;
  kind: string;
  prompt: string;
  model_snapshot: object;
  source_version_ids: string[];
};
type ResultInput = {
  status: string;
  result?: string;
  error?: string;
  input_tokens?: number;
  output_tokens?: number;
};
function decode<T>(row: Row | null): T | null {
  if (!row) return null;
  for (const key of ['pages', 'model_snapshot', 'source_version_ids', 'region'])
    if (typeof row[key] === 'string') row[key] = JSON.parse(row[key]);
  if ('vision' in row) row.vision = !!row.vision;
  return row as T;
}
export function validatePages(pages: unknown): asserts pages is PageText[] {
  if (
    !Array.isArray(pages) ||
    !pages.length ||
    pages.length > 500 ||
    pages.some(
      (p, i) =>
        !p ||
        p.page !== i + 1 ||
        typeof p.text !== 'string' ||
        p.text.length > 100000,
    ) ||
    new TextEncoder().encode(JSON.stringify(pages)).length > 1800000
  )
    throw new HttpError(400, '页内文字格式无效或过长，请拆分材料。');
}
export class ResearchStore {
  constructor(
    readonly db: D1Database,
    readonly owner: string,
  ) {}
  async project(
    id: string,
    permission: 'read' | 'write' | 'review' | 'admin' = 'read',
  ) {
    const row = await this.db
      .prepare(
        `SELECT p.*, CASE WHEN p.owner_id=? THEN 'owner' ELSE m.role END AS role FROM projects p LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=? WHERE p.id=? AND NOT EXISTS(SELECT 1 FROM project_lifecycle l WHERE l.project_id=p.id) AND NOT EXISTS(SELECT 1 FROM account_deletions d WHERE d.owner_id=?) AND (p.owner_id=? OR m.user_id IS NOT NULL)`,
      )
      .bind(this.owner, this.owner, id, this.owner, this.owner)
      .first<Project & { owner_id: string; role: string }>();
    if (!row) throw new HttpError(404, '项目不存在。');
    const permitted =
      permission === 'read' ||
      row.role === 'owner' ||
      (permission === 'write' && ['editor', 'reviewer'].includes(row.role)) ||
      (permission === 'review' && row.role === 'reviewer');
    if (!permitted)
      throw new HttpError(403, '当前项目角色没有执行此操作的权限。');
    return row;
  }
  async source(id: string, permission: 'read' | 'write' = 'read') {
    const row = await this.db
      .prepare(
        'SELECT * FROM sources s WHERE id=? AND NOT EXISTS(SELECT 1 FROM source_organization o WHERE o.source_id=s.id AND o.trashed_at IS NOT NULL)',
      )
      .bind(id)
      .first<Source>();
    if (!row) throw new HttpError(404, '资料不存在。');
    await this.project(row.project_id, permission);
    return row;
  }
  async version(id: string) {
    const row = await this.db
      .prepare(
        'SELECT * FROM source_versions v WHERE id=? AND NOT EXISTS(SELECT 1 FROM source_organization o WHERE o.source_id=v.source_id AND o.trashed_at IS NOT NULL)',
      )
      .bind(id)
      .first();
    if (!row) throw new HttpError(404, '资料版本不存在。');
    await this.project(String(row.project_id));
    return decode<SourceVersion>(row)!;
  }
  async listProjects() {
    return (
      await this.db
        .prepare(
          `SELECT p.*, CASE WHEN p.owner_id=? THEN 'owner' ELSE m.role END AS role FROM projects p LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=? WHERE (p.owner_id=? OR m.user_id IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM project_lifecycle l WHERE l.project_id=p.id) ORDER BY p.created_at DESC`,
        )
        .bind(this.owner, this.owner, this.owner)
        .all<Project>()
    ).results;
  }
  async createProject(title: unknown, description: unknown) {
    const project = {
      id: crypto.randomUUID(),
      owner_id: this.owner,
      title: textField(title, '项目名称', 200),
      description:
        typeof description === 'string' ? description.slice(0, 10000) : '',
      created_at: now(),
    };
    await this.db
      .prepare('INSERT INTO projects VALUES(?,?,?,?,?)')
      .bind(
        project.id,
        this.owner,
        project.title,
        project.description,
        project.created_at,
      )
      .run();
    return project;
  }
  async updateProject(input: {
    id: string;
    title: string;
    description: string;
    expected_title: string;
    expected_description: string;
  }) {
    await this.project(input.id, 'admin');
    const result = await this.db
      .prepare(
        'UPDATE projects SET title=?,description=? WHERE id=? AND owner_id=? AND title=? AND description=?',
      )
      .bind(
        textField(input.title, '项目名称', 200),
        input.description,
        input.id,
        this.owner,
        input.expected_title,
        input.expected_description,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, '项目资料已有更新，请刷新后再保存。');
    return this.project(input.id);
  }
  async overview(id: string) {
    const project = await this.project(id);
    const [sources, counts] = await Promise.all([
      this.db
        .prepare(
          'SELECT * FROM sources s WHERE project_id=? AND NOT EXISTS(SELECT 1 FROM source_organization o WHERE o.source_id=s.id AND o.trashed_at IS NOT NULL) ORDER BY created_at DESC,id DESC LIMIT 6',
        )
        .bind(id)
        .all<Source>(),
      this.db
        .prepare(`SELECT
        (SELECT COUNT(*) FROM sources s WHERE project_id=? AND NOT EXISTS(SELECT 1 FROM source_organization o WHERE o.source_id=s.id AND o.trashed_at IS NOT NULL)) AS sources,
        (SELECT COUNT(*) FROM evidence WHERE project_id=?) AS evidence,
        (SELECT COUNT(*) FROM notes n WHERE n.project_id=? AND n.parent_id IS NULL
          AND NOT EXISTS(SELECT 1 FROM note_state s WHERE s.note_id=n.id AND s.archived=1)) AS notes`)
        .bind(id, id, id)
        .first<{ sources: number; evidence: number; notes: number }>(),
    ]);
    return { project, sources: sources.results, counts: counts! };
  }
  async sourceManagement(id: string) {
    await this.project(id);
    const [sources, groups, organization, leads] = await Promise.all([
      this.db
        .prepare(
          'SELECT * FROM sources WHERE project_id=? ORDER BY created_at DESC,id DESC',
        )
        .bind(id)
        .all<Source>(),
      this.db
        .prepare(
          'SELECT * FROM source_groups WHERE project_id=? ORDER BY name,id',
        )
        .bind(id)
        .all<SourceGroup>(),
      this.db
        .prepare(
          'SELECT * FROM source_organization WHERE project_id=? ORDER BY updated_at DESC',
        )
        .bind(id)
        .all<SourceOrganization>(),
      this.db
        .prepare(
          `SELECT l.id,l.status,l.access_note,l.relevance_reason,l.created_at,l.updated_at,r.title,r.creators,r.issued_date,r.institution,r.landing_url,r.rights,r.license
           FROM source_leads l JOIN library_records r ON r.id=l.record_id
           WHERE l.project_id=? AND l.status IN ('needs_file','access_restricted','ready')
           ORDER BY l.updated_at DESC LIMIT 100`,
        )
        .bind(id)
        .all<Record<string, unknown>>(),
    ]);
    return {
      sources: sources.results,
      groups: groups.results,
      organization: organization.results,
      leads: leads.results.map(
        (lead) =>
          ({
            ...lead,
            creators: JSON.parse(String(lead.creators)) as string[],
          }) as Record<string, unknown> & { creators: string[] },
      ),
    };
  }
  async dismissSourceLead(projectId: string, id: string) {
    await this.project(projectId, 'write');
    const changed = await this.db
      .prepare(
        "UPDATE source_leads SET status='dismissed',updated_at=? WHERE id=? AND project_id=? AND status IN ('needs_file','access_restricted','ready')",
      )
      .bind(now(), id, projectId)
      .run();
    if (!changed.meta.changes) throw new HttpError(404, '待补资料不存在。');
    return { id };
  }
  private async managedSources(projectId: string, sourceIds: string[]) {
    const ids = [...new Set(sourceIds)];
    if (!ids.length || ids.length > 100)
      throw new HttpError(400, '每次请选择 1 至 100 份资料。');
    const rows = await this.db
      .prepare(
        `SELECT s.id,s.title,o.trashed_at FROM sources s LEFT JOIN source_organization o ON o.source_id=s.id WHERE s.project_id=? AND s.id IN (${ids.map(() => '?').join(',')})`,
      )
      .bind(projectId, ...ids)
      .all<{ id: string; title: string; trashed_at: string | null }>();
    if (rows.results.length !== ids.length)
      throw new HttpError(404, '部分资料不存在或不属于当前项目。');
    return rows.results;
  }
  async createSourceGroup(projectId: string, value: string) {
    await this.project(projectId, 'write');
    const group = {
      id: crypto.randomUUID(),
      project_id: projectId,
      name: textField(value, '分组名称', 100),
      created_at: now(),
    };
    try {
      await this.db
        .prepare('INSERT INTO source_groups VALUES(?,?,?,?)')
        .bind(group.id, group.project_id, group.name, group.created_at)
        .run();
    } catch {
      throw new HttpError(409, '已有同名资料分组。');
    }
    return group;
  }
  async moveSources(
    projectId: string,
    sourceIds: string[],
    groupId: string | null,
  ) {
    await this.project(projectId, 'write');
    const sources = await this.managedSources(projectId, sourceIds);
    if (sources.some((source) => source.trashed_at))
      throw new HttpError(409, '请先恢复回收站中的资料，再移动分组。');
    if (
      groupId &&
      !(await this.db
        .prepare('SELECT 1 FROM source_groups WHERE id=? AND project_id=?')
        .bind(groupId, projectId)
        .first())
    )
      throw new HttpError(404, '资料分组不存在。');
    const updated = now();
    await this.db.batch(
      sources.map((source) =>
        this.db
          .prepare(
            'INSERT INTO source_organization(source_id,project_id,group_id,trashed_at,updated_at) VALUES(?,?,?,NULL,?) ON CONFLICT(source_id) DO UPDATE SET group_id=excluded.group_id,updated_at=excluded.updated_at',
          )
          .bind(source.id, projectId, groupId, updated),
      ),
    );
    return { moved: sources.length };
  }
  async deleteSourceGroup(projectId: string, groupId: string) {
    await this.project(projectId, 'write');
    const group = await this.db
      .prepare('SELECT id FROM source_groups WHERE id=? AND project_id=?')
      .bind(groupId, projectId)
      .first();
    if (!group) throw new HttpError(404, '资料分组不存在。');
    await this.db.batch([
      this.db
        .prepare(
          'UPDATE source_organization SET group_id=NULL,updated_at=? WHERE project_id=? AND group_id=?',
        )
        .bind(now(), projectId, groupId),
      this.db
        .prepare('DELETE FROM source_groups WHERE id=? AND project_id=?')
        .bind(groupId, projectId),
    ]);
    return { id: groupId };
  }
  async trashSources(projectId: string, sourceIds: string[]) {
    await this.project(projectId, 'admin');
    const sources = await this.managedSources(projectId, sourceIds);
    if (sources.some((source) => source.trashed_at))
      throw new HttpError(409, '选择中包含已在回收站的资料。');
    const ids = sources.map((source) => source.id);
    const placeholders = ids.map(() => '?').join(',');
    const used = await this.db
      .prepare(
        `SELECT DISTINCT s.title FROM sources s WHERE s.id IN (${placeholders}) AND (EXISTS(SELECT 1 FROM evidence e WHERE e.source_id=s.id) OR EXISTS(SELECT 1 FROM bibliography_entries b WHERE b.source_id=s.id) OR EXISTS(SELECT 1 FROM source_relations r WHERE r.from_source=s.id OR r.to_source=s.id) OR EXISTS(SELECT 1 FROM task_inputs ti JOIN source_versions v ON v.id=ti.version_id WHERE v.source_id=s.id) OR EXISTS(SELECT 1 FROM research_runs r, json_each(r.source_version_ids) j JOIN source_versions v ON v.id=j.value WHERE r.project_id=? AND v.source_id=s.id) OR EXISTS(SELECT 1 FROM research_jobs j, json_each(j.version_ids) x JOIN source_versions v ON v.id=x.value WHERE j.project_id=? AND v.source_id=s.id) OR EXISTS(SELECT 1 FROM artifacts a, json_each(a.source_versions) x JOIN source_versions v ON v.id=x.value WHERE a.project_id=? AND v.source_id=s.id)) LIMIT 4`,
      )
      .bind(...ids, projectId, projectId, projectId)
      .all<{ title: string }>();
    if (used.results.length)
      throw new HttpError(
        409,
        `这些资料已用于研究，不能移入回收站：${used.results.map((row) => row.title).join('、')}。请先移除相关证据、书目或任务引用。`,
      );
    const updated = now();
    await this.db.batch(
      ids.map((id) =>
        this.db
          .prepare(
            'INSERT INTO source_organization(source_id,project_id,group_id,trashed_at,updated_at) VALUES(?,?,NULL,?,?) ON CONFLICT(source_id) DO UPDATE SET group_id=NULL,trashed_at=excluded.trashed_at,updated_at=excluded.updated_at',
          )
          .bind(id, projectId, updated, updated),
      ),
    );
    return { trashed: ids.length };
  }
  async restoreSources(projectId: string, sourceIds: string[]) {
    await this.project(projectId, 'admin');
    const sources = await this.managedSources(projectId, sourceIds);
    if (sources.some((source) => !source.trashed_at))
      throw new HttpError(409, '选择中包含不在回收站的资料。');
    const updated = now();
    await this.db.batch(
      sources.map((source) =>
        this.db
          .prepare(
            'UPDATE source_organization SET trashed_at=NULL,updated_at=? WHERE source_id=? AND project_id=?',
          )
          .bind(updated, source.id, projectId),
      ),
    );
    return { restored: sources.length };
  }
  async readProject(id: string) {
    const project = await this.project(id);
    const tables = [
      'sources',
      'source_versions',
      'notes',
      'evidence',
      'research_runs',
    ] as const;
    const results = await Promise.all(
      tables.map(async (table) => {
        const rows: Row[] = [];
        for (let offset = 0; ; offset += 100) {
          const result = await this.db
            .prepare(
              `SELECT * FROM ${table} WHERE project_id=? ORDER BY created_at DESC,id LIMIT 100 OFFSET ?`,
            )
            .bind(id, offset)
            .all();
          rows.push(...result.results.map((row) => decode<Row>(row)!));
          if (result.results.length < 100) return rows;
        }
      }),
    );
    return {
      project,
      sources: results[0],
      source_versions: results[1],
      notes: withNoteState(
        results[2] as Note[],
        (
          await this.db
            .prepare('SELECT * FROM note_state WHERE project_id=?')
            .bind(id)
            .all<NoteState>()
        ).results,
      ),
      evidence: results[3],
      research_runs: results[4],
      models: await this.models(),
    };
  }
  async reserveUpload(id: string, projectId: string, bytes: number) {
    await this.project(projectId, 'write');
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_FILE_BYTES)
      throw new HttpError(400, '上传大小无效。');
    const result = await this.db
      .prepare(
        'INSERT INTO upload_reservations(id,owner_id,project_id,bytes,created_at) SELECT ?,?,?,?,? WHERE COALESCE((SELECT SUM(bytes) FROM upload_reservations WHERE owner_id=?),0)+?<=? AND COALESCE((SELECT SUM(bytes) FROM upload_reservations),0)+?<=?',
      )
      .bind(
        id,
        this.owner,
        projectId,
        bytes,
        now(),
        this.owner,
        bytes,
        USER_STORAGE_BYTES,
        bytes,
        SITE_STORAGE_BYTES,
      )
      .run();
    if (result.meta.changes !== 1)
      throw new HttpError(
        413,
        '已达到内测原件存储额度（每账户 500 MiB，工作站共 5 GB）。请联系管理员调整。',
      );
  }
  async recordUpload(
    id: string,
    projectId: string,
    path: string,
    type: string,
  ) {
    await this.project(projectId, 'write');
    await this.db
      .prepare('INSERT INTO upload_receipts VALUES(?,?,?,?,?,?)')
      .bind(id, this.owner, projectId, path, type, now())
      .run();
  }
  async importSource(input: ImportInput) {
    await this.project(input.p_project, 'write');
    validatePages(input.p_pages);
    const receipt = await this.db
      .prepare(
        'SELECT * FROM upload_receipts WHERE id=? AND owner_id=? AND project_id=? AND object_path=? AND media_type=?',
      )
      .bind(input.p_id, this.owner, input.p_project, input.p_path, input.p_type)
      .first();
    if (!receipt) throw new HttpError(400, '原件不存在或不属于本项目。');
    const existing = await this.db
      .prepare(
        'SELECT id FROM source_versions WHERE source_id=? AND project_id=? ORDER BY revision LIMIT 1',
      )
      .bind(input.p_id, input.p_project)
      .first<{ id: string }>();
    if (existing) {
      // Retrying registration after a lost response must not upload or duplicate the original.
      await indexVersion(this.db, await this.version(existing.id));
      return existing.id;
    }
    const versionId = crypto.randomUUID(),
      date = now();
    await this.db.batch([
      this.db
        .prepare('INSERT INTO sources VALUES(?,?,?,?,?,?)')
        .bind(
          input.p_id,
          input.p_project,
          textField(input.p_title, '资料名称', 300),
          input.p_path,
          input.p_type,
          date,
        ),
      this.db
        .prepare('INSERT INTO source_versions VALUES(?,?,?,?,?,?,?)')
        .bind(
          versionId,
          input.p_id,
          input.p_project,
          1,
          JSON.stringify(input.p_pages),
          'import',
          date,
        ),
    ]);
    await indexVersion(this.db, await this.version(versionId));
    return versionId;
  }
  async reviseSource(input: RevisionInput) {
    const source = await this.source(input.p_source, 'write');
    validatePages(input.p_pages);
    if (
      !['manual', 'ocr-reviewed', 'restore'].includes(input.p_method) ||
      !Number.isSafeInteger(input.p_expected)
    )
      throw new HttpError(400, '版本参数无效。');
    const id = crypto.randomUUID();
    // One SQL statement makes the expected-version check and append atomic in D1.
    const result = await this.db
      .prepare(
        'INSERT INTO source_versions(id,source_id,project_id,revision,pages,method,created_at) SELECT ?,?,?,?+1,?,?,? WHERE (SELECT MAX(revision) FROM source_versions WHERE source_id=?)=?',
      )
      .bind(
        id,
        source.id,
        source.project_id,
        input.p_expected,
        JSON.stringify(input.p_pages),
        input.p_method,
        now(),
        source.id,
        input.p_expected,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, '资料已有新版本，请刷新后再保存。');
    await indexVersion(this.db, await this.version(id));
    return id;
  }
  async saveNote(input: NoteInput) {
    await this.project(input.p_project, 'write');
    const title = textField(input.p_title, '笔记标题', 200);
    if (input.p_document) {
      try {
        input = {
          ...input,
          p_body: richMarkdown(parseRichDocument(input.p_document)),
        };
      } catch {
        throw new HttpError(400, '文稿格式无效或过大。');
      }
    }
    if (typeof input.p_body !== 'string' || input.p_body.length > 100000)
      throw new HttpError(400, '笔记过长。');
    const id = input.p_id || crypto.randomUUID();
    const existing = await this.db
      .prepare('SELECT * FROM notes WHERE id=?')
      .bind(id)
      .first<Note>();
    if (existing) {
      if (
        existing.project_id === input.p_project &&
        existing.parent_id === input.p_parent &&
        existing.title === title &&
        existing.body === input.p_body &&
        (existing.document || null) === (input.p_document || null)
      )
        return id;
      throw new HttpError(
        409,
        '这份笔记已经保存。请刷新项目，查看已保存内容后再继续编辑。',
      );
    }
    const result = input.p_parent
      ? await this.db
          .prepare(
            'INSERT INTO notes (id,project_id,parent_id,revision,title,body,created_at,document) SELECT ?,project_id,id,revision+1,?,?,?,? FROM notes WHERE id=? AND project_id=? AND NOT EXISTS(SELECT 1 FROM notes child WHERE child.parent_id=?)',
          )
          .bind(
            id,
            title,
            input.p_body,
            now(),
            input.p_document || null,
            input.p_parent,
            input.p_project,
            input.p_parent,
          )
          .run()
      : await this.db
          .prepare(
            'INSERT INTO notes (id,project_id,parent_id,revision,title,body,created_at,document) VALUES(?,?,NULL,1,?,?,?,?)',
          )
          .bind(
            id,
            input.p_project,
            title,
            input.p_body,
            now(),
            input.p_document || null,
          )
          .run();
    if (!result.meta.changes)
      throw new HttpError(409, '笔记已有新版本或不属于本项目。');
    return id;
  }
  async setNoteState(input: {
    p_project: string;
    p_note: string;
    pinned?: boolean;
    archived?: boolean;
  }) {
    await this.project(input.p_project, 'write');
    const root = await this.db
      .prepare(
        'WITH RECURSIVE ancestry(id,parent_id) AS (SELECT id,parent_id FROM notes WHERE id=? AND project_id=? UNION SELECT n.id,n.parent_id FROM notes n JOIN ancestry a ON n.id=a.parent_id WHERE n.project_id=?) SELECT id FROM ancestry WHERE parent_id IS NULL',
      )
      .bind(input.p_note, input.p_project, input.p_project)
      .first<{ id: string }>();
    if (!root) throw new HttpError(404, '笔记不存在。');
    await this.db
      .prepare(
        'INSERT INTO note_state(note_id,project_id,pinned,archived) VALUES(?,?,COALESCE(?,0),COALESCE(?,0)) ON CONFLICT(note_id) DO UPDATE SET pinned=COALESCE(?,pinned),archived=COALESCE(?,archived)',
      )
      .bind(
        root.id,
        input.p_project,
        input.pinned === undefined ? null : Number(input.pinned),
        input.archived === undefined ? null : Number(input.archived),
        input.pinned === undefined ? null : Number(input.pinned),
        input.archived === undefined ? null : Number(input.archived),
      )
      .run();
    return root.id;
  }
  async addEvidence(input: EvidenceInput) {
    const version = await this.version(input.p_version);
    await this.project(version.project_id, 'write');
    const page = version.pages.find((p) => p.page === input.p_page);
    const quote = input.p_quote;
    if (
      typeof quote !== 'string' ||
      !quote.trim() ||
      quote.length > 10000 ||
      !page?.text.includes(quote)
    )
      throw new HttpError(400, '引文必须与所选版本页内文字完全一致。');
    if (!['supports', 'challenges', 'context'].includes(input.p_relation))
      throw new HttpError(400, '证据关系无效。');
    const interpretation =
      typeof input.p_interpretation === 'string' ? input.p_interpretation : '';
    if (interpretation.length > 10000) throw new HttpError(400, '解释过长。');
    const start = input.p_start ?? page.text.indexOf(quote);
    if (page.text.slice(start, start + quote.length) !== quote)
      throw new HttpError(400, '引文定位与原文不一致。');
    const id = crypto.randomUUID();
    await this.db
      .prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(
        id,
        version.project_id,
        version.source_id,
        version.id,
        input.p_page,
        quote,
        textField(input.p_question, '研究问题', 2000),
        interpretation,
        input.p_relation,
        now(),
        start,
        start + quote.length,
        input.p_region ? JSON.stringify(input.p_region) : null,
      )
      .run();
    return id;
  }
  async models() {
    return (
      await this.db
        .prepare(
          'SELECT id,label,provider,model_id,vision,key_hint,created_at FROM model_connections WHERE owner_id=? ORDER BY created_at',
        )
        .bind(this.owner)
        .all()
    ).results.map((row) => decode<Model>(row)!);
  }
  async model(id: string) {
    const row = await this.db
      .prepare('SELECT * FROM model_connections WHERE id=? AND owner_id=?')
      .bind(id, this.owner)
      .first();
    if (!row) throw new HttpError(404, '模型连接不存在。');
    return decode<Model & { encrypted_key: string }>(row)!;
  }
  async saveModel(
    model: Pick<
      Model,
      'id' | 'label' | 'provider' | 'model_id' | 'vision' | 'key_hint'
    > & { encrypted_key: string },
  ) {
    await this.db
      .prepare('INSERT INTO model_connections VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(
        model.id,
        this.owner,
        model.label,
        model.provider,
        model.model_id,
        model.vision ? 1 : 0,
        model.key_hint,
        model.encrypted_key,
        now(),
      )
      .run();
  }
  async removeModel(id: string) {
    await this.db.batch([
      this.db
        .prepare('DELETE FROM model_policies WHERE model_id=? AND owner_id=?')
        .bind(id, this.owner),
      this.db
        .prepare('DELETE FROM model_connections WHERE id=? AND owner_id=?')
        .bind(id, this.owner),
    ]);
  }
  async run(id: string) {
    return decode(
      await this.db
        .prepare('SELECT * FROM research_runs WHERE id=? AND owner_id=?')
        .bind(id, this.owner)
        .first(),
    ) as Run | null;
  }
  async startRun(input: RunInput) {
    await this.project(input.project_id, 'write');
    try {
      await this.db
        .prepare(
          'INSERT INTO research_runs(id,owner_id,project_id,kind,status,prompt,model_snapshot,source_version_ids,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          input.id,
          this.owner,
          input.project_id,
          input.kind,
          'running',
          input.prompt,
          JSON.stringify(input.model_snapshot),
          JSON.stringify(input.source_version_ids),
          now(),
        )
        .run();
    } catch {
      throw new HttpError(
        409,
        '已有任务运行中，或此请求已被接收。请刷新任务记录。',
      );
    }
  }
  async finishRun(id: string, result: ResultInput) {
    await this.db
      .prepare(
        'UPDATE research_runs SET status=?,result=?,error=?,input_tokens=?,output_tokens=?,finished_at=? WHERE id=? AND owner_id=?',
      )
      .bind(
        result.status,
        result.result ?? null,
        result.error ?? null,
        result.input_tokens ?? 0,
        result.output_tokens ?? 0,
        now(),
        id,
        this.owner,
      )
      .run();
    return this.run(id);
  }
}
