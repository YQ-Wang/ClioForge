import { ResearchStore } from './store';
import { HttpError } from './errors';
import type { WorkbenchInput } from './workbench-inputs';
import type { WorkbenchData, BibliographyEntry } from './workbench-types';
const now = () => new Date().toISOString();
export class WorkbenchStore extends ResearchStore {
  async ownedRow(
    table:
      | 'research_questions'
      | 'claims'
      | 'evidence'
      | 'bibliography_entries'
      | 'research_watches'
      | 'research_inbox',
    id: string,
    projectId: string,
  ) {
    await this.project(projectId);
    const row = await this.db
      .prepare(`SELECT * FROM ${table} WHERE id=? AND project_id=?`)
      .bind(id, projectId)
      .first();
    if (!row) throw new HttpError(404, '记录不属于此项目。');
    return row;
  }
  async workbench(projectId: string): Promise<WorkbenchData> {
    await this.project(projectId);
    const tables = [
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
    const collections = await Promise.all(
      tables.map(async (table) => {
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += 100) {
          const result = await this.db
            .prepare(
              `SELECT * FROM ${table} WHERE project_id=? ORDER BY created_at DESC LIMIT 100 OFFSET ?`,
            )
            .bind(projectId, offset)
            .all();
          for (const row of result.results) {
            for (const key of ['csl', 'model_snapshot', 'version_ids'])
              if (typeof row[key] === 'string')
                row[key] = JSON.parse(row[key] as string);
            rows.push(row);
          }
          if (result.results.length < 100) return rows;
        }
      }),
    );
    return {
      bibliography: collections[0],
      questions: collections[1],
      claims: collections[2],
      claim_evidence: collections[3],
      source_relations: collections[4],
      search_logs: collections[5],
      evidence_reviews: collections[6],
      jobs: collections[7],
      watches: collections[8],
      inbox: collections[9],
      budget: await this.db
        .prepare('SELECT * FROM project_budgets WHERE project_id=?')
        .bind(projectId)
        .first(),
    } as WorkbenchData;
  }
  async mutate(input: WorkbenchInput): Promise<unknown> {
    const projectId = input.project_id;
    await this.project(
      projectId,
      input.action === 'budget'
        ? 'admin'
        : input.action === 'review_evidence'
          ? 'review'
          : 'write',
    );
    const date = now(),
      id = crypto.randomUUID();
    switch (input.action) {
      case 'bibliography': {
        if (
          input.source_id &&
          (await this.source(input.source_id)).project_id !== projectId
        )
          throw new HttpError(400, '资料不属于此项目。');
        const csl = JSON.stringify(input.csl);
        if (input.id) {
          await this.ownedRow('bibliography_entries', input.id, projectId);
          const results = await this.db.batch([
            this.db
              .prepare(
                'UPDATE bibliography_entries SET csl=?,source_id=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=?',
              )
              .bind(
                csl,
                input.source_id,
                date,
                input.id,
                projectId,
                input.expected ?? 0,
              ),
            this.db
              .prepare(
                'INSERT OR IGNORE INTO bibliography_history SELECT ?,id,revision,csl,updated_at FROM bibliography_entries WHERE id=? AND revision=?',
              )
              .bind(id, input.id, (input.expected ?? 0) + 1),
          ]);
          if (!results[0].meta.changes)
            throw new HttpError(409, '书目信息已有新版本，请刷新。');
          return input.id;
        }
        await this.db.batch([
          this.db
            .prepare('INSERT INTO bibliography_entries VALUES(?,?,?,?,1,?,?)')
            .bind(id, projectId, input.source_id, csl, date, date),
          this.db
            .prepare('INSERT INTO bibliography_history VALUES(?,?,1,?,?)')
            .bind(crypto.randomUUID(), id, csl, date),
        ]);
        return id;
      }
      case 'import_bibliography': {
        // One bounded batch is atomic; repeated imports deduplicate normalized CSL data.
        const current = (await this.workbench(projectId)).bibliography;
        const identity = (csl: BibliographyEntry['csl']) =>
          csl.DOI
            ? `doi:${csl.DOI.toLowerCase().replace(/^https?:\/\/(dx\.)?doi.org\//, '')}`
            : JSON.stringify([csl.title, csl.author, csl.issued]);
        const seen = new Set(current.map((entry) => identity(entry.csl)));
        const statements: D1PreparedStatement[] = [];
        for (const csl of input.entries) {
          const key = identity(csl);
          if (seen.has(key)) continue;
          seen.add(key);
          const digest = new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(projectId + ':' + key),
            ),
          );
          const hex = Array.from(digest, (b) =>
            b.toString(16).padStart(2, '0'),
          ).join('');
          const itemId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
            value = JSON.stringify(csl);
          statements.push(
            this.db
              .prepare(
                'INSERT OR IGNORE INTO bibliography_entries VALUES(?,?,NULL,?,1,?,?)',
              )
              .bind(itemId, projectId, value, date, date),
          );
          statements.push(
            this.db
              .prepare(
                'INSERT OR IGNORE INTO bibliography_history SELECT ?,id,revision,csl,updated_at FROM bibliography_entries WHERE id=? AND revision=1',
              )
              .bind(crypto.randomUUID(), itemId),
          );
        }
        const results = statements.length
          ? await this.db.batch(statements)
          : [];
        const imported = results.reduce(
          (sum, result, index) =>
            sum + (index % 2 === 0 ? result.meta.changes : 0),
          0,
        );
        return { imported, skipped: input.entries.length - imported };
      }
      case 'question': {
        if (input.id) {
          const result = await this.db
            .prepare(
              'UPDATE research_questions SET title=?,detail=?,revision=revision+1 WHERE id=? AND project_id=? AND revision=?',
            )
            .bind(
              input.title,
              input.detail,
              input.id,
              projectId,
              input.expected ?? 0,
            )
            .run();
          if (!result.meta.changes)
            throw new HttpError(409, '问题已更新或不可访问。');
          return input.id;
        }
        await this.db
          .prepare('INSERT INTO research_questions VALUES(?,?,?,?,1,?)')
          .bind(id, projectId, input.title, input.detail, date)
          .run();
        return id;
      }
      case 'claim': {
        if (input.status === 'reviewed')
          await this.project(projectId, 'review');
        await this.ownedRow('research_questions', input.question_id, projectId);
        if (input.id) {
          const result = await this.db
            .prepare(
              'UPDATE claims SET question_id=?,body=?,kind=?,status=?,revision=revision+1 WHERE id=? AND project_id=? AND revision=?',
            )
            .bind(
              input.question_id,
              input.body,
              input.kind,
              input.status,
              input.id,
              projectId,
              input.expected ?? 0,
            )
            .run();
          if (!result.meta.changes)
            throw new HttpError(409, '论证已更新或不可访问。');
          return input.id;
        }
        await this.db
          .prepare('INSERT INTO claims VALUES(?,?,?,?,?,?,1,?)')
          .bind(
            id,
            projectId,
            input.question_id,
            input.body,
            input.kind,
            input.status,
            date,
          )
          .run();
        return id;
      }
      case 'link_evidence': {
        await this.ownedRow('claims', input.claim_id, projectId);
        await this.ownedRow('evidence', input.evidence_id, projectId);
        await this.db
          .prepare(
            'INSERT INTO claim_evidence VALUES(?,?,?,?,?,?) ON CONFLICT(claim_id,evidence_id) DO UPDATE SET relation=excluded.relation',
          )
          .bind(
            id,
            projectId,
            input.claim_id,
            input.evidence_id,
            input.relation,
            date,
          )
          .run();
        return id;
      }
      case 'source_relation': {
        const a = await this.source(input.from_source),
          b = await this.source(input.to_source);
        if (
          a.project_id !== projectId ||
          b.project_id !== projectId ||
          a.id === b.id
        )
          throw new HttpError(400, '请选择本项目中两份不同资料。');
        await this.db
          .prepare(
            'INSERT INTO source_relations VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(from_source,to_source,kind) DO UPDATE SET certainty=excluded.certainty,basis=excluded.basis',
          )
          .bind(
            id,
            projectId,
            a.id,
            b.id,
            input.kind,
            input.certainty,
            input.basis,
            date,
          )
          .run();
        return id;
      }
      case 'search_log': {
        if (input.outcome === 'no_hits' && input.result_count !== 0)
          throw new HttpError(400, '未命中记录的结果数必须为 0。');
        await this.db
          .prepare('INSERT INTO search_logs VALUES(?,?,?,?,?,?,?,?,?)')
          .bind(
            id,
            projectId,
            input.query,
            input.scope,
            input.searched_at,
            input.outcome,
            input.result_count,
            input.notes,
            date,
          )
          .run();
        return id;
      }
      case 'review_evidence': {
        const evidence = await this.ownedRow(
            'evidence',
            input.evidence_id,
            projectId,
          ),
          version = await this.version(input.version_id);
        if (
          version.source_id !== evidence.source_id ||
          version.project_id !== projectId
        )
          throw new HttpError(400, '复核版本与证据来源不符。');
        await this.db
          .prepare('INSERT OR IGNORE INTO evidence_reviews VALUES(?,?,?,?)')
          .bind(input.evidence_id, version.id, projectId, date)
          .run();
        return id;
      }
      case 'budget': {
        await this.db
          .prepare(
            'INSERT INTO project_budgets VALUES(?,?,0) ON CONFLICT(project_id) DO UPDATE SET limit_units=excluded.limit_units',
          )
          .bind(projectId, input.limit_units)
          .run();
        return id;
      }
      case 'inbox': {
        await this.ownedRow('research_inbox', input.id, projectId);
        await this.db
          .prepare(
            'UPDATE research_inbox SET status=? WHERE id=? AND project_id=?',
          )
          .bind(input.status, input.id, projectId)
          .run();
        return input.id;
      }
      case 'watch': {
        await this.db
          .prepare(
            'INSERT INTO research_watches(id,owner_id,project_id,query,interval_days,enabled,next_run,created_at) VALUES(?,?,?,?,?,1,?,?)',
          )
          .bind(
            id,
            this.owner,
            projectId,
            input.query,
            input.interval_days,
            date,
            date,
          )
          .run();
        return id;
      }
      case 'toggle_watch': {
        await this.ownedRow('research_watches', input.id, projectId);
        await this.db
          .prepare(
            'UPDATE research_watches SET enabled=? WHERE id=? AND project_id=?',
          )
          .bind(input.enabled ? 1 : 0, input.id, projectId)
          .run();
        return input.id;
      }
    }
  }
}
