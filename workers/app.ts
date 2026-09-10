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
    const staticAsset = new URL(request.url).pathname.startsWith(
      '/_next/static/',
    );
    const response = staticAsset
      ? await env.ASSETS.fetch(request)
      : await handler.fetch(request, env, ctx);
    return privateAccessRequired(env, request)
      ? privateResponse(response)
      : response;
  },
};

export default app;
