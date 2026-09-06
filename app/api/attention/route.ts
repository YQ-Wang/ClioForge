import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { researchAttention } from '@/lib/research-attention';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    return Response.json(await researchAttention(store), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request),
      v = z
        .object({ tasks: z.boolean(), mentions: z.boolean() })
        .parse(await jsonBody(request));
    await store.db
      .prepare(
        'INSERT INTO attention_preferences(owner_id,tasks,mentions) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET tasks=excluded.tasks,mentions=excluded.mentions',
      )
      .bind(store.owner, v.tasks ? 1 : 0, v.mentions ? 1 : 0)
      .run();
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
