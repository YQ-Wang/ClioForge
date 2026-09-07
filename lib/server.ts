import { ZodError } from 'zod';
import { env } from 'cloudflare:workers';
import { createAuth, authConfigured, type AppEnv } from './auth';
import { ResearchStore } from './store';
import { HttpError } from './errors';
import { ApiLimitError, enforceApiLimit } from './api-limits';
export { HttpError, textField } from './errors';
export async function authenticate(request: Request) {
  const settings = env as unknown as AppEnv;
  if (!authConfigured(settings)) throw new HttpError(503, '账户服务尚未配置。');
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('origin') !== new URL(settings.BETTER_AUTH_URL!).origin
  )
    throw new HttpError(403, '请求来源无效。');
  const session = await createAuth(settings).api.getSession({
    headers: request.headers,
  });
  if (!session) throw new HttpError(401, '请先登录。');
  if (
    await settings.DB.prepare(
      'SELECT 1 FROM account_deletions WHERE owner_id=?',
    )
      .bind(session.user.id)
      .first()
  )
    throw new HttpError(401, '账号已关闭。');
  await enforceApiLimit(settings.DB, session.user.id, request.method);
  return {
    user: session.user,
    session: session.session,
    store: new ResearchStore(settings.DB, session.user.id),
    settings,
  };
}
export async function jsonBody(request: Request, max = 32_000) {
  // Enforce the limit on streamed bytes, not a caller-controlled Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '缺少请求内容。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      throw new HttpError(413, '请求内容过大。');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Expected object');
    return value;
  } catch {
    throw new HttpError(400, '请求格式无效。');
  }
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    error = new HttpError(400, '请求参数无效，请检查输入。');
  return Response.json(
    {
      error:
        error instanceof HttpError ? error.message : '操作失败，请稍后重试。',
    },
    {
      status: error instanceof HttpError ? error.status : 500,
      headers: {
        'Cache-Control': 'private, no-store',
        ...(error instanceof ApiLimitError
          ? { 'Retry-After': String(error.retryAfter) }
          : {}),
      },
    },
  );
}
