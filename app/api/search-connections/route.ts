import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { LiteratureStore } from '@/lib/literature-store';
const provider = z.enum(['exa', 'openalex']);
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    return Response.json(
      { connections: await new LiteratureStore(store).connections() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { store, settings } = await authenticate(request);
    const input = z
      .object({
        provider,
        key: z.string().trim().min(1).max(4000).optional(),
        monthly_limit: z.number().int().min(0).max(10000),
      })
      .parse(await jsonBody(request));
    await new LiteratureStore(
      store,
      settings.FOLIOTRACE_ENCRYPTION_KEY,
    ).configure(input.provider, input.key, input.monthly_limit);
    return Response.json({ saved: true });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const { store } = await authenticate(request);
    const input = z.object({ provider }).parse(await jsonBody(request));
    await new LiteratureStore(store).remove(input.provider);
    return Response.json({ removed: true });
  } catch (error) {
    return failure(error);
  }
}
