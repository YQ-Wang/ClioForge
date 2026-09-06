import { z } from 'zod';
import { authenticate } from '@/lib/server';
import {
  cancelOAuth,
  completeOAuth,
  type ConnectionEnv,
} from '@/lib/platform/connections';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  let origin = new URL(request.url).origin;
  try {
    const auth = await authenticate(request);
    origin = new URL(auth.settings.BETTER_AUTH_URL!).origin;
    const provider = z.literal('google').parse((await params).provider);
    const url = new URL(request.url);
    const state = z
      .string()
      .min(1)
      .max(200)
      .parse(url.searchParams.get('state'));
    const cancelled = url.searchParams.has('error');
    const path = cancelled
      ? await cancelOAuth(auth.settings as ConnectionEnv, auth.user.id, state)
      : await completeOAuth(
          auth.settings as ConnectionEnv,
          auth.user.id,
          provider,
          state,
          z.string().min(1).max(5000).parse(url.searchParams.get('code')),
        );
    const destination = new URL(path, origin);
    destination.searchParams.set(
      'drive',
      cancelled ? 'cancelled' : 'connected',
    );
    return redirect(destination.toString());
  } catch {
    return redirect(`${origin}/?drive=error`);
  }
}
function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
