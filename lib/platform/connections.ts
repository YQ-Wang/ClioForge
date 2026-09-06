import { saveOriginalUpload } from '../original-upload';
import { z } from 'zod';
import { encrypt, decrypt } from '../crypto';
import { HttpError } from '../errors';
import { boundedBytes, MAX_FILE_BYTES, mediaExtensions } from '../files';
import { validatePages } from '../store';
import type { PageText } from '../types';
import { MissionStore } from './missions';
import { sha256 } from './search';
import { safeWorkspaceReturn } from '../navigation';
export const cloudProvider = z.literal('google');
export type CloudProvider = z.infer<typeof cloudProvider>;
export type ConnectionEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  BETTER_AUTH_URL?: string;
  FOLIOTRACE_ENCRYPTION_KEY?: string;
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  GOOGLE_PICKER_API_KEY?: string;
  GOOGLE_CLOUD_PROJECT_NUMBER?: string;
};
export function cloudConfig(env: ConnectionEnv, provider: CloudProvider) {
  cloudProvider.parse(provider);
  return {
    id: env.GOOGLE_DRIVE_CLIENT_ID,
    secret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/drive.file',
  };
}
export const callbackUrl = (env: ConnectionEnv, provider: CloudProvider) =>
  `${env.BETTER_AUTH_URL}/api/connections/callback/${provider}`;
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive().default(3600),
});
async function boundedJSON(
  response: Response,
  max = 2_000_000,
): Promise<unknown> {
  if (!response.ok)
    throw new HttpError(
      502,
      `云盘服务返回 HTTP ${response.status}。请检查连接与权限。`,
    );
  const bytes = await boundedBytes(
    new Request('https://canwoo.invalid', {
      method: 'POST',
      body: response.body,
      duplex: 'half',
    } as RequestInit),
    max,
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function startOAuth(
  env: ConnectionEnv,
  owner: string,
  provider: CloudProvider,
  returnTo = '/',
) {
  const config = cloudConfig(env, provider);
  if (!config.id || !config.secret || !env.FOLIOTRACE_ENCRYPTION_KEY)
    throw new HttpError(503, '此连接器尚未配置应用凭据。请查看配置说明。');
  const state = crypto.randomUUID() + crypto.randomUUID(),
    verifier =
      crypto.randomUUID().replaceAll('-', '') +
      crypto.randomUUID().replaceAll('-', '');
  const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ),
    challenge = btoa(String.fromCharCode(...digest))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<?')
    .bind(new Date().toISOString())
    .run();
  await env.DB.prepare(
    'INSERT INTO oauth_states(id,owner_id,provider,verifier,expires_at,return_to) VALUES(?,?,?,?,?,?)',
  )
    .bind(
      await sha256(state),
      owner,
      provider,
      verifier,
      new Date(Date.now() + 10 * 60_000).toISOString(),
      safeWorkspaceReturn(returnTo),
    )
    .run();
  const url = new URL(config.authorize);
  url.search = new URLSearchParams({
    client_id: config.id,
    redirect_uri: callbackUrl(env, provider),
    response_type: 'code',
    scope: config.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  }).toString();
  return url.toString();
}
export async function completeOAuth(
  env: ConnectionEnv,
  owner: string,
  provider: CloudProvider,
  state: string,
  code: string,
  fetcher: typeof fetch = fetch,
) {
  const config = cloudConfig(env, provider);
  if (!config.id || !config.secret || !env.FOLIOTRACE_ENCRYPTION_KEY)
    throw new HttpError(503, '连接器未配置。');
  const row = await env.DB.prepare(
    'DELETE FROM oauth_states WHERE id=? AND owner_id=? AND provider=? AND expires_at>? RETURNING verifier,return_to',
  )
    .bind(await sha256(state), owner, provider, new Date().toISOString())
    .first<{ verifier: string; return_to: string }>();
  if (!row) throw new HttpError(400, '授权状态已过期或不匹配，请重新连接。');
  const response = await fetcher(config.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.id,
      client_secret: config.secret,
      code,
      code_verifier: row.verifier,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl(env, provider),
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  const token = tokenSchema.parse(await boundedJSON(response));
  const current = await env.DB.prepare(
    'SELECT id,encrypted_token FROM cloud_connections WHERE owner_id=? AND provider=?',
  )
    .bind(owner, provider)
    .first<{ id: string; encrypted_token: string }>();
  const id = current?.id || crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO cloud_connections VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,provider) DO UPDATE SET encrypted_token=excluded.encrypted_token,expires_at=excluded.expires_at',
  )
    .bind(
      id,
      owner,
      provider,
      await encrypt(
        JSON.stringify(token),
        env.FOLIOTRACE_ENCRYPTION_KEY,
        `cloud:${owner}:${provider}`,
      ),
      new Date(Date.now() + token.expires_in * 1000).toISOString(),
      new Date().toISOString(),
    )
    .run();
  return safeWorkspaceReturn(row.return_to);
}
export async function cancelOAuth(
  env: ConnectionEnv,
  owner: string,
  state: string,
) {
  const row = await env.DB.prepare(
    "DELETE FROM oauth_states WHERE id=? AND owner_id=? AND provider='google' AND expires_at>? RETURNING return_to",
  )
    .bind(await sha256(state), owner, new Date().toISOString())
    .first<{ return_to: string }>();
  if (!row) throw new HttpError(400, '授权已过期，请重新选择 Google 账号。');
  return safeWorkspaceReturn(row.return_to);
}
export async function cloudToken(
  env: ConnectionEnv,
  owner: string,
  provider: CloudProvider,
  fetcher: typeof fetch = fetch,
) {
  if (!env.FOLIOTRACE_ENCRYPTION_KEY)
    throw new HttpError(503, '密钥服务未配置。');
  const row = await env.DB.prepare(
    'SELECT * FROM cloud_connections WHERE owner_id=? AND provider=?',
  )
    .bind(owner, provider)
    .first<{ id: string; encrypted_token: string; expires_at: string }>();
  if (!row) throw new HttpError(409, '请先连接云盘。');
  const token = tokenSchema.parse(
    JSON.parse(
      await decrypt(
        row.encrypted_token,
        env.FOLIOTRACE_ENCRYPTION_KEY,
        `cloud:${owner}:${provider}`,
      ),
    ),
  );
  if (Date.parse(row.expires_at) > Date.now() + 60000)
    return token.access_token;
  const config = cloudConfig(env, provider);
  if (!token.refresh_token || !config.id || !config.secret)
    throw new HttpError(409, '云盘授权已到期，请重新连接。');
  const response = await fetcher(config.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.id,
      client_secret: config.secret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  const updated = tokenSchema.parse(await boundedJSON(response));
  updated.refresh_token ||= token.refresh_token;
  await env.DB.prepare(
    'UPDATE cloud_connections SET encrypted_token=?,expires_at=? WHERE id=? AND encrypted_token=?',
  )
    .bind(
      await encrypt(
        JSON.stringify(updated),
        env.FOLIOTRACE_ENCRYPTION_KEY,
        `cloud:${owner}:${provider}`,
      ),
      new Date(Date.now() + updated.expires_in * 1000).toISOString(),
      row.id,
      row.encrypted_token,
    )
    .run();
  return updated.access_token;
}
export type CloudFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  revision: string;
  url: string;
  folder: boolean;
};

const googleFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  version: z.string().min(1),
  size: z.coerce.number().nonnegative().default(0),
  webViewLink: z.url().optional(),
  trashed: z.boolean().optional(),
  capabilities: z.object({ canDownload: z.boolean().optional() }).optional(),
});
const nativeExports = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
]);
export async function googleFile(
  env: ConnectionEnv,
  owner: string,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<CloudFile> {
  const token = await cloudToken(env, owner, 'google', fetcher);
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`,
  );
  url.search = new URLSearchParams({
    fields:
      'id,name,mimeType,size,version,webViewLink,trashed,capabilities(canDownload)',
    supportsAllDrives: 'true',
  }).toString();
  const meta = googleFileSchema.parse(
    await boundedJSON(
      await fetcher(url, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
      }),
    ),
  );
  if (meta.trashed || meta.capabilities?.canDownload === false)
    throw new HttpError(403, '此 Google Drive 文件不允许下载。');
  if (!(meta.mimeType in mediaExtensions) && !nativeExports.has(meta.mimeType))
    throw new HttpError(
      400,
      '请选择 PDF、图片、文本或 Google 文档、表格、演示文稿。',
    );
  if (meta.size > MAX_FILE_BYTES) throw new HttpError(413, '文件超过 20 MiB。');
  return {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    size: meta.size,
    revision: meta.version,
    url:
      meta.webViewLink ||
      `https://drive.google.com/file/d/${encodeURIComponent(meta.id)}/view`,
    folder: false,
  };
}

export async function readGoogleFile(
  env: ConnectionEnv,
  owner: string,
  id: string,
  expectedRevision?: string,
  fetcher: typeof fetch = fetch,
) {
  const file = await googleFile(env, owner, id, fetcher);
  if (expectedRevision && expectedRevision !== file.revision)
    throw new HttpError(409, '云端文件已更新，请重新选择后导入。');
  const token = await cloudToken(env, owner, 'google', fetcher),
    native = nativeExports.has(file.mimeType);
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}${native ? '/export?mimeType=application%2Fpdf' : '?alt=media&supportsAllDrives=true'}`;
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new HttpError(502, `Google Drive 下载返回 HTTP ${response.status}。`);
  if (Number(response.headers.get('content-length') || 0) > MAX_FILE_BYTES) {
    await response.body?.cancel();
    throw new HttpError(413, '文件超过 20 MiB。');
  }
  let bytes: Uint8Array;
  try {
    bytes = await boundedBytes(
      new Request('https://canwoo.invalid', {
        method: 'POST',
        body: response.body,
        duplex: 'half',
      } as RequestInit),
      MAX_FILE_BYTES,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Too large')
      throw new HttpError(413, '文件超过 20 MiB。');
    throw error;
  }
  const after = await googleFile(env, owner, id, fetcher);
  if (after.revision !== file.revision)
    throw new HttpError(409, '下载期间云端文件发生变化，请重试。');
  return { file, bytes, mimeType: native ? 'application/pdf' : file.mimeType };
}

export async function importCloudText(
  env: ConnectionEnv,
  store: MissionStore,
  projectId: string,
  provider: CloudProvider,
  selected: Pick<CloudFile, 'id' | 'revision'>,
  fetcher: typeof fetch = fetch,
  pages?: PageText[],
) {
  cloudProvider.parse(provider);
  await store.project(projectId, 'write');
  if (pages) validatePages(pages);
  const file = await googleFile(env, store.owner, selected.id, fetcher);
  if (file.revision !== selected.revision)
    throw new HttpError(409, '云端文件已更新，请重新选择后导入。');
  const date = new Date().toISOString(),
    id = crypto.randomUUID();
  // The unique key and conditional update arbitrate concurrent imports in D1.
  const claim = await store.db
    .prepare(
      "INSERT INTO ingestion_items(id,project_id,owner_id,provider,external_id,revision,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'running',?,?) ON CONFLICT(project_id,provider,external_id,revision) DO UPDATE SET status='running',error=NULL,updated_at=excluded.updated_at WHERE ingestion_items.status='failed' RETURNING id",
    )
    .bind(
      id,
      projectId,
      store.owner,
      provider,
      file.id,
      file.revision,
      file.name,
      date,
      date,
    )
    .first<{ id: string }>();
  if (!claim) {
    const existing = await store.db
      .prepare(
        'SELECT source_id,status FROM ingestion_items WHERE project_id=? AND provider=? AND external_id=? AND revision=?',
      )
      .bind(projectId, provider, file.id, file.revision)
      .first<{ source_id: string | null; status: string }>();
    if (existing?.status === 'completed')
      return { source_id: existing.source_id, skipped: true };
    throw new HttpError(409, '此文件正在导入，请稍后刷新。');
  }
  const sourceId = claim.id;
  try {
    const exists = await store.db
      .prepare('SELECT id FROM sources WHERE id=? AND project_id=?')
      .bind(sourceId, projectId)
      .first();
    if (!exists) {
      const { bytes, mimeType } = await readGoogleFile(
        env,
        store.owner,
        file.id,
        file.revision,
        fetcher,
      );
      const contentHash = await sha256(bytes);
      // Drive's version changes for metadata too. Preserve an existing source
      // when the same cloud file still has exactly the same downloaded bytes.
      const duplicate = await store.db
        .prepare(
          'SELECT s.id FROM sources s JOIN source_origins o ON o.source_id=s.id WHERE s.project_id=? AND o.provider=? AND o.external_id=? AND o.content_hash=? AND s.media_type=? ORDER BY s.created_at LIMIT 1',
        )
        .bind(projectId, provider, file.id, contentHash, mimeType)
        .first<{ id: string }>();
      if (duplicate) {
        await store.db
          .prepare(
            "UPDATE ingestion_items SET status='completed',source_id=?,updated_at=? WHERE id=?",
          )
          .bind(duplicate.id, new Date().toISOString(), claim.id)
          .run();
        return { source_id: duplicate.id, skipped: true };
      }
      const path = `${store.owner}/${projectId}/${sourceId}/original`;
      const reservation = await store.db
        .prepare('SELECT owner_id,bytes FROM upload_reservations WHERE id=?')
        .bind(sourceId)
        .first<{ owner_id: string; bytes: number }>();
      if (
        reservation &&
        (reservation.owner_id !== store.owner ||
          reservation.bytes !== bytes.length)
      )
        throw new HttpError(409, '上次导入尚有未清理的原件，请联系管理员。');
      if (!reservation)
        await store.reserveUpload(sourceId, projectId, bytes.length);
      await saveOriginalUpload(
        store,
        env.FILES,
        sourceId,
        projectId,
        path,
        bytes,
        mimeType,
      );
      await store.importSource({
        p_id: sourceId,
        p_project: projectId,
        p_title: file.name,
        p_path: path,
        p_type: mimeType,
        p_pages: pages || [
          {
            page: 1,
            text: mimeType.startsWith('text/')
              ? new TextDecoder().decode(bytes)
              : '',
          },
        ],
      });
      await store.db
        .prepare('INSERT OR IGNORE INTO source_origins VALUES(?,?,?,?,?,?,?,?)')
        .bind(
          sourceId,
          provider,
          file.id,
          file.url,
          'User-provided; rights retained',
          date,
          contentHash,
          JSON.stringify({ revision: file.revision, exported_as: mimeType }),
        )
        .run();
    } else {
      // Recover a confirmed source write after a later bookkeeping failure without creating another source.
      const source = await store.source(sourceId);
      const original = await env.FILES.get(source.object_path);
      if (!original)
        throw new HttpError(409, '原件缺失，请联系管理员检查导入记录。');
      await store.db
        .prepare('INSERT OR IGNORE INTO source_origins VALUES(?,?,?,?,?,?,?,?)')
        .bind(
          sourceId,
          provider,
          file.id,
          file.url,
          'User-provided; rights retained',
          date,
          await sha256(new Uint8Array(await original.arrayBuffer())),
          JSON.stringify({ revision: file.revision }),
        )
        .run();
    }
    await store.db
      .prepare(
        "UPDATE ingestion_items SET status='completed',source_id=?,updated_at=? WHERE id=?",
      )
      .bind(sourceId, new Date().toISOString(), claim.id)
      .run();
    return { source_id: sourceId, skipped: false };
  } catch (error) {
    await store.db
      .prepare(
        "UPDATE ingestion_items SET status='failed',error=?,updated_at=? WHERE id=?",
      )
      .bind(
        error instanceof HttpError ? error.message : '导入失败，请检查后重试。',
        new Date().toISOString(),
        claim.id,
      )
      .run();
    throw error;
  }
}
