import handler from 'vinext/server/fetch-handler';
import {
  privateAccessGate,
  privateAccessRequired,
  privateResponse,
  type PrivateAccessEnv,
} from '../lib/private-access';

const app = {
  async fetch(
    request: Request,
    env: Cloudflare.Env & PrivateAccessEnv,
    ctx: ExecutionContext,
  ) {
    const blocked = await privateAccessGate(request, env);
    if (blocked) return blocked;
    // Worker-first assets need explicit delivery after the access gate.
    const pathname = new URL(request.url).pathname;
    const developmentModule =
      import.meta.env?.DEV === true &&
      [
        '/@react-refresh',
        '/@id/',
        '/@vite/',
        '/@fs/',
        '/node_modules/',
        '/app/',
        '/components/',
        '/hooks/',
        '/lib/',
      ].some((prefix) => pathname.startsWith(prefix));
    const staticAsset =
      pathname.startsWith('/_next/static/') || developmentModule;
    const response = staticAsset
      ? await env.ASSETS.fetch(request)
      : await handler.fetch(request, env, ctx);
    return privateAccessRequired(env, request)
      ? privateResponse(response)
      : response;
  },
};

export default app;
