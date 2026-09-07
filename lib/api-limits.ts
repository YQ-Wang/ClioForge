import { HttpError } from './errors';

export class ApiLimitError extends HttpError {
  constructor(readonly retryAfter: number) {
    super(429, '操作较频繁，请稍后重试。未提交的内容仍保留在当前页面。');
  }
}

// Separate reads from writes so polling cannot prevent a researcher from saving.
// Keep one reusable row per account and lane in the existing auth rate-limit table.
export async function enforceApiLimit(
  db: D1Database,
  subject: string,
  method: string,
  time = Date.now(),
) {
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  const maximum = read ? 600 : 120;
  const window = 60_000;
  const start = Math.floor(time / window) * window;
  const key = `canwoo:api:${read ? 'read' : 'write'}:${subject}`;
  const accepted = await db
    .prepare(
      `INSERT INTO rate_limit(id,key,count,last_request) VALUES(?,?,1,?)
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN last_request<? THEN 1 ELSE count+1 END,
       last_request=CASE WHEN last_request<? THEN excluded.last_request ELSE last_request END
     WHERE last_request<? OR count<? RETURNING count`,
    )
    .bind(key, key, start, start, start, start, maximum)
    .first();
  if (!accepted)
    throw new ApiLimitError(
      Math.max(1, Math.ceil((start + window - time) / 1000)),
    );
}
