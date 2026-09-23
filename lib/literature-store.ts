import { z } from 'zod';
import { encrypt, decrypt } from './crypto';
import { HttpError } from './errors';
import type { ResearchStore } from './store';
import { searchCatalog } from './literature-catalogs';
import {
  candidateSchema,
  type Catalog,
  type CatalogResult,
} from './literature-types';
import { sha256 } from './platform/search';
import { resultSchema, type TaskResult } from './platform/types';
import { WorkbenchStore } from './workbench-store';

export class LiteratureStore {
  constructor(
    readonly store: ResearchStore,
    readonly secret?: string,
  ) {}
  async connections() {
    const rows = await this.store.db
      .prepare(
        'SELECT c.provider,c.monthly_limit,COALESCE(a.attempts,0) AS attempts FROM search_connections c LEFT JOIN search_allowances a ON a.owner_id=c.owner_id AND a.provider=c.provider AND a.month=? WHERE c.owner_id=?',
      )
      .bind(new Date().toISOString().slice(0, 7), this.store.owner)
      .all<{
        provider: 'exa' | 'openalex';
        monthly_limit: number;
        attempts: number;
      }>();
    return rows.results;
  }
  async configure(
    provider: 'exa' | 'openalex',
    key: string | undefined,
    limit: number,
  ) {
    if (!key) {
      const updated = await this.store.db
        .prepare(
          'UPDATE search_connections SET monthly_limit=? WHERE owner_id=? AND provider=?',
        )
        .bind(limit, this.store.owner, provider)
        .run();
      if (!updated.meta.changes)
        throw new HttpError(400, '新连接需要填写 API key。');
      return;
    }
    if (!this.secret) throw new HttpError(503, '尚未配置服务端密钥加密。');
    await this.store.db
      .prepare(
        `INSERT INTO search_connections (owner_id, provider, encrypted_key, monthly_limit)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(owner_id, provider) DO UPDATE SET
           encrypted_key = excluded.encrypted_key,
           monthly_limit = excluded.monthly_limit`,
      )
      .bind(
        this.store.owner,
        provider,
        await encrypt(
          key,
          this.secret,
          `${this.store.owner}:search:${provider}`,
        ),
        limit,
      )
      .run();
  }
  async remove(provider: 'exa' | 'openalex') {
    await this.store.db
      .prepare('DELETE FROM search_connections WHERE owner_id=? AND provider=?')
      .bind(this.store.owner, provider)
      .run();
  }
  async history(project: string) {
    await this.store.project(project);
    return (
      await this.store.db
        .prepare(
          'SELECT id,query,status,created_at FROM discovery_sessions WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 20',
        )
        .bind(this.store.owner, project)
        .all<{
          id: string;
          query: string;
          status: string;
          created_at: string;
        }>()
    ).results;
  }
  async session(project: string, id: string) {
    await this.store.project(project);
    return this.store.db
      .prepare(
        'SELECT id,query,result,status,created_at FROM discovery_sessions WHERE id=? AND owner_id=? AND project_id=?',
      )
      .bind(id, this.store.owner, project)
      .first<{
        id: string;
        query: string;
        result: string | null;
        status: string;
        created_at: string;
      }>();
  }
  async begin(project: string, id: string, query: string) {
    await this.store.project(project, 'write');
    const inserted = await this.store.db
      .prepare(
        'INSERT OR IGNORE INTO discovery_sessions(id,owner_id,project_id,query,created_at) VALUES(?,?,?,?,?)',
      )
      .bind(id, this.store.owner, project, query, new Date().toISOString())
      .run();
    if (!inserted.meta.changes) {
      const old = await this.session(project, id);
      if (old?.query === query && old.result)
        return resultSchema.parse(JSON.parse(old.result));
      throw new HttpError(
        409,
        '这次检索已开始或未完成。请查看历史记录；不会自动重复请求。',
      );
    }
    return null;
  }
  async finish(project: string, id: string, result: TaskResult | null) {
    await this.store.db
      .prepare(
        "UPDATE discovery_sessions SET result=?,status=? WHERE id=? AND owner_id=? AND project_id=? AND status='running'",
      )
      .bind(
        result ? JSON.stringify(result) : null,
        result ? 'completed' : 'failed',
        id,
        this.store.owner,
        project,
      )
      .run();
  }
  async search(
    project: string,
    catalog: Catalog,
    query: string,
    request: typeof fetch = fetch,
  ): Promise<CatalogResult> {
    await this.store.project(project, 'write');
    const now = Date.now();
    const cacheKey = `${catalog}:v1:${await sha256(query)}`;
    const cached = await this.store.db
      .prepare(
        'SELECT result FROM catalog_cache WHERE owner_id=? AND project_id=? AND cache_key=? AND expires_at>?',
      )
      .bind(this.store.owner, project, cacheKey, now)
      .first<{ result: string }>();
    if (cached) return { ...JSON.parse(cached.result), cached: true };
    let key: string | undefined;
    if (catalog === 'exa' || catalog === 'openalex') {
      const connection = await this.store.db
        .prepare(
          'SELECT encrypted_key,monthly_limit FROM search_connections WHERE owner_id=? AND provider=?',
        )
        .bind(this.store.owner, catalog)
        .first<{ encrypted_key: string; monthly_limit: number }>();
      if (catalog === 'exa' && !connection)
        return { candidates: [], status: 'unavailable' };
      if (connection) {
        if (!this.secret) return { candidates: [], status: 'unavailable' };
        key = await decrypt(
          connection.encrypted_key,
          this.secret,
          `${this.store.owner}:search:${catalog}`,
        );
        // Atomically reserve before dispatch. Failed or uncertain requests retain the reservation.
        const reserved = await this.store.db
          .prepare(
            'INSERT INTO search_allowances(owner_id,provider,month,attempts) SELECT ?,?,?,1 WHERE ?>0 ON CONFLICT(owner_id,provider,month) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts',
          )
          .bind(
            this.store.owner,
            catalog,
            new Date().toISOString().slice(0, 7),
            connection.monthly_limit,
            connection.monthly_limit,
          )
          .first();
        if (!reserved) return { candidates: [], status: 'budget_exhausted' };
      }
    }
    const result = await searchCatalog(catalog, query, request, key);
    if (result.status === 'completed')
      await this.store.db
        .prepare(
          'INSERT INTO catalog_cache VALUES(?,?,?,?,?) ON CONFLICT(owner_id,project_id,cache_key) DO UPDATE SET result=excluded.result,expires_at=excluded.expires_at',
        )
        .bind(
          this.store.owner,
          project,
          cacheKey,
          JSON.stringify(result),
          now + 86_400_000,
        )
        .run();
    await this.store.db
      .prepare('DELETE FROM catalog_cache WHERE owner_id=? AND expires_at<?')
      .bind(this.store.owner, now)
      .run();
    return result;
  }
  async saveCandidate(project: string, sessionId: string, candidateId: string) {
    await this.store.project(project, 'write');
    const session = await this.session(project, sessionId);
    const result = session?.result
      ? resultSchema.parse(JSON.parse(session.result))
      : null;
    const candidates = z
      .object({ candidates: z.array(candidateSchema) })
      .safeParse(result?.data);
    const candidate = candidates.success
      ? candidates.data.candidates.find((c) => c.id === candidateId)
      : undefined;
    if (!candidate?.csl)
      throw new HttpError(404, '这条书目不在已保存的检索结果中。');
    const imported = await new WorkbenchStore(
      this.store.db,
      this.store.owner,
    ).mutate({
      action: 'import_bibliography',
      project_id: project,
      entries: [
        {
          ...candidate.csl,
          note: `Discovery query: ${session!.query}\nCatalogs: ${(candidate.catalogs || []).join(', ')}\nRetrieved: ${session!.created_at}\nSearch record: ${sessionId}\nCatalog metadata only; full text has not been read.`,
        },
      ],
    });
    if (candidates.success) {
      const index = candidates.data.candidates.findIndex(
        (c) => c.id === candidateId,
      );
      await this.store.db
        .prepare(
          "UPDATE discovery_sessions SET result=json_set(result,?,json('true')) WHERE id=? AND owner_id=? AND project_id=?",
        )
        .bind(
          `$.data.candidates[${index}].saved_to_bibliography`,
          sessionId,
          this.store.owner,
          project,
        )
        .run();
    }
    return imported;
  }
}
