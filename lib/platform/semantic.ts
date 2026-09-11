import { z } from 'zod';
import { ResearchStore } from '../store';
import { HttpError } from '../errors';
import { boundedBytes } from '../files';
import { decrypt } from '../crypto';
import { reserveDirectRun, finishDirectRun } from '../direct-research';
import { searchPages, sha256, type SearchHit } from './search';
export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 256;
const current =
  'v.revision=(SELECT MAX(v2.revision) FROM source_versions v2 WHERE v2.source_id=v.source_id) AND NOT EXISTS(SELECT 1 FROM source_organization o WHERE o.source_id=v.source_id AND o.trashed_at IS NOT NULL)';
export function textChunks(text: string) {
  const chunks: { start: number; text: string }[] = [];
  for (let start = 0; start < text.length; start += 2100) {
    const chunk = text.slice(start, start + 2400);
    if (chunk.trim()) chunks.push({ start, text: chunk });
  }
  return chunks;
}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
async function readJSON(response: Response) {
  if (!response.ok)
    throw new HttpError(502, `检索模型服务返回 HTTP ${response.status}。`);
  return JSON.parse(
    new TextDecoder().decode(await boundedBytes(response, 2_000_000)),
  ) as unknown;
}
export async function embeddingRate(fetcher: typeof fetch = fetch) {
  try {
    const catalog = z
      .object({
        data: z.array(
          z.object({
            id: z.string(),
            pricing: z.object({ prompt: z.string() }),
          }),
        ),
      })
      .parse(
        await readJSON(
          await fetcher('https://openrouter.ai/api/v1/embeddings/models', {
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
          }),
        ),
      );
    const rate =
      Number(
        catalog.data.find((m) => m.id === EMBEDDING_MODEL)?.pricing.prompt,
      ) * 1_000_000;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 0.1)
      throw new HttpError(409, '检索模型费率未知或超过预设上限，未开始调用。');
    return rate;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, '暂时无法确认检索模型费率，尚未开始付费调用。');
  }
}
export async function embed(
  store: ResearchStore,
  secret: string,
  connectionId: string,
  runId: string,
  projectId: string,
  texts: string[],
  versions: string[],
  fetcher: typeof fetch = fetch,
) {
  const connection = await store.model(connectionId);
  if (connection.provider !== 'openrouter')
    throw new HttpError(400, '请选择 OpenRouter 连接。');
  const rate = await embeddingRate(fetcher);
  const key = await decrypt(
    connection.encrypted_key,
    secret,
    `${store.owner}:${connection.id}`,
  );
  const reserved = await reserveDirectRun(
    store,
    {
      id: runId,
      project_id: projectId,
      kind: 'analysis',
      prompt: 'Semantic search / indexing',
      model_snapshot: {
        provider: 'openrouter',
        model_id: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
      },
      source_version_ids: versions,
    },
    { input_rate: rate, output_rate: 0, max_output: 0 },
    texts.reduce((n, t) => n + new TextEncoder().encode(t).length, 64),
  );
  if (!reserved)
    throw new HttpError(409, '此请求已经执行或结果尚待确认，未重复调用。');
  try {
    const response = z
      .object({
        model: z.enum([EMBEDDING_MODEL, 'text-embedding-3-small']),
        data: z.array(
          z.object({
            index: z.number().int().nonnegative(),
            embedding: z.array(z.number()).length(EMBEDDING_DIMENSIONS),
          }),
        ),
        usage: z.object({ prompt_tokens: z.number().int().positive() }),
      })
      .parse(
        await readJSON(
          await fetcher('https://openrouter.ai/api/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: EMBEDDING_MODEL,
              input: texts,
              dimensions: EMBEDDING_DIMENSIONS,
              encoding_format: 'float',
            }),
            redirect: 'manual',
            signal: AbortSignal.timeout(45000),
          }),
        ),
      );
    if (
      response.data.length !== texts.length ||
      new Set(response.data.map((v) => v.index)).size !== texts.length ||
      response.data.some(
        (v) => v.index >= texts.length || !v.embedding.some((x) => x !== 0),
      )
    )
      throw new Error('Invalid embedding response');
    await finishDirectRun(
      store,
      runId,
      {
        status: 'succeeded',
        result: JSON.stringify({
          model: EMBEDDING_MODEL,
          provider_model: response.model,
          dimensions: EMBEDDING_DIMENSIONS,
          inputs: texts.length,
        }),
        input_tokens: response.usage.prompt_tokens,
        output_tokens: 0,
      },
      true,
    );
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((v) => v.embedding);
  } catch {
    await finishDirectRun(
      store,
      runId,
      {
        status: 'failed',
        error: '检索模型未返回可确认结果；保留预算，不自动重试。',
      },
      true,
    );
    throw new HttpError(
      502,
      '检索模型未返回可确认结果。流程已停止；请检查用量后再重试。',
    );
  }
}
export async function semanticStatus(store: ResearchStore, projectId: string) {
  const project = await store.project(projectId);
  const indexed = await store.db
    .prepare(
      `SELECT COUNT(*) AS n FROM semantic_chunks c JOIN source_versions v ON v.id=c.version_id WHERE c.project_id=? AND c.model=? AND ${current}`,
    )
    .bind(projectId, EMBEDDING_MODEL)
    .first<{ n: number }>();
  return {
    indexed: indexed?.n || 0,
    model: EMBEDDING_MODEL,
    limit: 5000,
    writable: project.role !== 'viewer',
  };
}
export async function indexSemantic(
  store: ResearchStore,
  secret: string,
  projectId: string,
  connectionId: string,
  runId: string,
  fetcher: typeof fetch = fetch,
  beforeEmbed?: () => Promise<void>,
) {
  await store.project(projectId, 'write');
  // The cache is derived from fixed versions. Superseded versions never enter
  // current search and can be rebuilt from originals after a backup restore.
  await store.db
    .prepare(
      `DELETE FROM semantic_chunks WHERE project_id=? AND version_id IN (SELECT v.id FROM source_versions v WHERE v.project_id=? AND NOT (${current}))`,
    )
    .bind(projectId, projectId)
    .run();
  const cached = (
    await store.db
      .prepare(
        'SELECT version_id,page,start FROM semantic_chunks WHERE project_id=? AND model=?',
      )
      .bind(projectId, EMBEDDING_MODEL)
      .all<{ version_id: string; page: number; start: number }>()
  ).results;
  const done = new Set(
    cached.map((c) => `${c.version_id}:${c.page}:${c.start}`),
  );
  const pending: {
    version_id: string;
    page: number;
    start: number;
    text: string;
  }[] = [];
  let total = 0;
  for (let offset = 0; ; offset += 10) {
    const pages = (
      await store.db
        .prepare(
          `SELECT sp.version_id,sp.page,sp.text FROM source_pages sp JOIN source_versions v ON v.id=sp.version_id WHERE sp.project_id=? AND ${current} ORDER BY sp.version_id,sp.page LIMIT 10 OFFSET ?`,
        )
        .bind(projectId, offset)
        .all<{ version_id: string; page: number; text: string }>()
    ).results;
    for (const page of pages)
      for (const chunk of textChunks(page.text)) {
        total++;
        if (total > 5000)
          throw new HttpError(
            400,
            '当前语义检索支持最多 5,000 段文字，请将大型资料集分为研究项目。',
          );
        if (
          pending.length < 16 &&
          !done.has(`${page.version_id}:${page.page}:${chunk.start}`)
        )
          pending.push({ ...page, ...chunk });
      }
    if (pages.length < 10) break;
  }
  await beforeEmbed?.();
  if (!pending.length) return { indexed: done.size, total, done: true };
  const vectors = await embed(
    store,
    secret,
    connectionId,
    runId,
    projectId,
    pending.map((c) => c.text),
    [...new Set(pending.map((c) => c.version_id))],
    fetcher,
  );
  await store.project(projectId, 'write');
  await store.db.batch(
    await Promise.all(
      pending.map(async (c, i) =>
        store.db
          .prepare(
            'INSERT OR IGNORE INTO semantic_chunks VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            await sha256(
              `${c.version_id}:${c.page}:${c.start}:${EMBEDDING_MODEL}`,
            ),
            projectId,
            c.version_id,
            c.page,
            c.start,
            c.text,
            EMBEDDING_MODEL,
            JSON.stringify(vectors[i]),
            new Date().toISOString(),
          ),
      ),
    ),
  );
  return {
    indexed: done.size + pending.length,
    total,
    done: done.size + pending.length >= total,
  };
}
export async function semanticSearch(
  store: ResearchStore,
  secret: string,
  projectId: string,
  connectionId: string,
  runId: string,
  query: string,
  fetcher: typeof fetch = fetch,
) {
  await store.project(projectId, 'write');
  const status = await semanticStatus(store, projectId);
  if (!status.indexed) throw new HttpError(409, '请先为资料准备语义检索。');
  const [vector] = await embed(
    store,
    secret,
    connectionId,
    runId,
    projectId,
    [query],
    [],
    fetcher,
  );
  const best: { id: string; score: number; snippet: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const rows = (
      await store.db
        .prepare(
          `SELECT c.version_id,c.page,c.text,c.vector FROM semantic_chunks c JOIN source_versions v ON v.id=c.version_id WHERE c.project_id=? AND c.model=? AND ${current} ORDER BY c.id LIMIT 100 OFFSET ?`,
        )
        .bind(projectId, EMBEDDING_MODEL, offset)
        .all<{
          version_id: string;
          page: number;
          text: string;
          vector: string;
        }>()
    ).results;
    for (const row of rows) {
      const id = `${row.version_id}:${row.page}`,
        score = cosine(vector, JSON.parse(row.vector)),
        old = best.find((r) => r.id === id);
      if (old && old.score >= score) continue;
      if (old) best.splice(best.indexOf(old), 1);
      best.push({ id, score, snippet: row.text.slice(0, 450) });
      best.sort((a, b) => b.score - a.score);
      best.splice(30);
    }
    if (rows.length < 100) break;
  }
  const keyword = await searchPages(store, projectId, query),
    ranks = new Map(
      keyword.map((hit, i) => [hit.id, { hit, score: 1 / (60 + i + 1) }]),
    );
  for (const [i, b] of best.entries()) {
    const old = ranks.get(b.id);
    if (old) {
      old.score += 1 / (60 + i + 1);
      continue;
    }
    const hit = await store.db
      .prepare(
        `SELECT sp.id,sp.source_id,sp.version_id,sp.page,sp.text,s.title,v.revision FROM source_pages sp JOIN sources s ON s.id=sp.source_id JOIN source_versions v ON v.id=sp.version_id WHERE sp.id=? AND sp.project_id=? AND ${current}`,
      )
      .bind(b.id, projectId)
      .first<SearchHit>();
    if (hit)
      ranks.set(b.id, {
        hit: { ...hit, snippet: b.snippet },
        score: 1 / (60 + i + 1),
      });
  }
  return {
    hits: [...ranks.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((r) => ({ ...r.hit, score: r.score })),
    indexed: status.indexed,
  };
}
