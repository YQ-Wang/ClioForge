import { env, waitUntil } from 'cloudflare:workers';
import { createAuth, authConfigured, type AppEnv } from '@/lib/auth';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const settings = env as unknown as AppEnv;
  if (!authConfigured(settings))
    return Response.json({ message: '账户服务尚未配置。' }, { status: 503 });
  return createAuth(settings, waitUntil).handler(request);
}
export { handle as GET, handle as POST };
