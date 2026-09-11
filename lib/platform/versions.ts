import { z } from 'zod';
import { MissionStore } from './missions';
import { HttpError } from '../errors';
import { sha256 } from './search';
import { validatePages } from '../store';
type Manifest = {
  source_versions: {
    source_id: string;
    version_id: string;
    revision: number;
  }[];
  notes: { id: string; revision: number }[];
  artifacts: string[];
};
export const branchChange = z.object({
  source_id: z.uuid(),
  base_version: z.uuid(),
  pages: z
    .array(
      z.object({
        page: z.number().int().positive(),
        text: z.string().max(100000),
      }),
    )
    .min(1)
    .max(500),
  reason: z.string().min(1).max(10000),
});
export class VersionStore extends MissionStore {
  async snapshot(projectId: string, title: string) {
    await this.project(projectId, 'write');
    const [versions, notes, artifacts] = await Promise.all([
      this.db
        .prepare(
          'SELECT source_id,id AS version_id,revision FROM source_versions v WHERE project_id=? AND revision=(SELECT MAX(revision) FROM source_versions v2 WHERE v2.source_id=v.source_id) AND NOT EXISTS(SELECT 1 FROM source_organization o WHERE o.source_id=v.source_id AND o.trashed_at IS NOT NULL) ORDER BY source_id',
        )
        .bind(projectId)
        .all(),
      this.db
        .prepare(
          'SELECT id,revision FROM notes n WHERE project_id=? AND NOT EXISTS(SELECT 1 FROM notes child WHERE child.parent_id=n.id) ORDER BY id',
        )
        .bind(projectId)
        .all(),
      this.db
        .prepare('SELECT id FROM artifacts WHERE project_id=? ORDER BY id')
        .bind(projectId)
        .all<{ id: string }>(),
    ]);
    const manifest = JSON.stringify({
        source_versions: versions.results,
        notes: notes.results,
        artifacts: artifacts.results.map((item) => item.id),
      }),
      id = crypto.randomUUID();
    await this.db
      .prepare('INSERT INTO project_snapshots VALUES(?,?,?,?,?,?,?)')
      .bind(
        id,
        projectId,
        title,
        manifest,
        await sha256(manifest),
        this.owner,
        new Date().toISOString(),
      )
      .run();
    return id;
  }
  async branch(projectId: string, title: string, snapshotId: string) {
    await this.project(projectId, 'write');
    if (
      !(await this.db
        .prepare('SELECT id FROM project_snapshots WHERE id=? AND project_id=?')
        .bind(snapshotId, projectId)
        .first())
    )
      throw new HttpError(404, '项目快照不存在。');
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        'INSERT INTO research_branches(id,project_id,title,base_snapshot,changes,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        projectId,
        title,
        snapshotId,
        '[]',
        this.owner,
        new Date().toISOString(),
      )
      .run();
    return id;
  }
  async branchRow(projectId: string, id: string) {
    await this.project(projectId);
    const row = await this.db
      .prepare('SELECT * FROM research_branches WHERE id=? AND project_id=?')
      .bind(id, projectId)
      .first<{
        id: string;
        project_id: string;
        base_snapshot: string;
        changes: string;
        revision: number;
        status: string;
      }>();
    if (!row) throw new HttpError(404, '研究分支不存在。');
    return row;
  }
  async editBranch(
    projectId: string,
    id: string,
    raw: unknown,
    expected: number,
  ) {
    await this.project(projectId, 'write');
    const branch = await this.branchRow(projectId, id);
    if (branch.status !== 'draft')
      throw new HttpError(409, '仅草案分支可编辑。');
    const changes = z.array(branchChange).max(20).parse(raw);
    const snapshot = await this.db
      .prepare('SELECT manifest FROM project_snapshots WHERE id=?')
      .bind(branch.base_snapshot)
      .first<{ manifest: string }>();
    const manifest = JSON.parse(snapshot!.manifest) as Manifest;
    const seen = new Set<string>();
    for (const change of changes) {
      validatePages(change.pages);
      if (seen.has(change.source_id))
        throw new HttpError(400, '一份材料只能有一项分支修改。');
      seen.add(change.source_id);
      if (
        !manifest.source_versions.some(
          (source) =>
            source.source_id === change.source_id &&
            source.version_id === change.base_version,
        )
      )
        throw new HttpError(400, '修改不基于此分支的固定快照。');
    }
    const result = await this.db
      .prepare(
        "UPDATE research_branches SET changes=?,revision=revision+1 WHERE id=? AND revision=? AND status='draft'",
      )
      .bind(JSON.stringify(changes), id, expected)
      .run();
    if (!result.meta.changes) throw new HttpError(409, '分支已有更新。');
  }
  async requestReview(projectId: string, id: string, expected: number) {
    await this.project(projectId, 'write');
    const branch = await this.branchRow(projectId, id);
    if (JSON.parse(branch.changes).length === 0)
      throw new HttpError(400, '请先添加分支修改。');
    const result = await this.db
      .prepare(
        "UPDATE research_branches SET status='review',revision=revision+1 WHERE id=? AND revision=? AND status='draft'",
      )
      .bind(id, expected)
      .run();
    if (!result.meta.changes) throw new HttpError(409, '分支状态已变更。');
  }
  async merge(projectId: string, id: string, expected: number, reason: string) {
    await this.project(projectId, 'review');
    const branch = await this.branchRow(projectId, id);
    if (branch.status !== 'review' || branch.revision !== expected)
      throw new HttpError(409, '分支不是当前待审版本。');
    const changes = JSON.parse(branch.changes) as z.infer<
      typeof branchChange
    >[];
    const clauses: string[] = [],
      guards: (string | number)[] = [];
    for (const change of changes) {
      const base = await this.version(change.base_version);
      clauses.push(
        '(SELECT MAX(revision) FROM source_versions WHERE source_id=?)=?',
      );
      guards.push(change.source_id, base.revision);
    }
    const date = new Date().toISOString(),
      reviewId = crypto.randomUUID();
    const statements = [
      this.db
        .prepare(
          `UPDATE research_branches SET status='merged',revision=revision+1,merge_token=? WHERE id=? AND revision=? AND status='review' AND ${clauses.join(' AND ')}`,
        )
        .bind(reviewId, id, expected, ...guards),
    ];
    for (const change of changes)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO source_versions(id,source_id,project_id,revision,pages,method,created_at) SELECT ?,?,?,(SELECT MAX(revision)+1 FROM source_versions WHERE source_id=?),?,'manual',? WHERE EXISTS(SELECT 1 FROM research_branches WHERE id=? AND status='merged' AND revision=? AND merge_token=?)",
          )
          .bind(
            crypto.randomUUID(),
            change.source_id,
            projectId,
            change.source_id,
            JSON.stringify(change.pages),
            date,
            id,
            expected + 1,
            reviewId,
          ),
      );
    statements.push(
      this.db
        .prepare(
          "INSERT INTO branch_reviews SELECT ?,id,?,'merged',?,? FROM research_branches WHERE id=? AND status='merged' AND revision=? AND merge_token=?",
        )
        .bind(reviewId, this.owner, reason, date, id, expected + 1, reviewId),
    );
    const results = await this.db.batch(statements);
    if (!results[0].meta.changes)
      throw new HttpError(
        409,
        '主线材料已有修改，分支未合并。请对比冲突后创建新的分支。',
      );
    return id;
  }
}
