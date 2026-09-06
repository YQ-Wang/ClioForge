import { authenticate, failure, jsonBody } from '@/lib/server';
import { researchInbox, seeInboxItem } from '@/lib/research-inbox';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    return Response.json(await researchInbox(store), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request);
    await seeInboxItem(store, await jsonBody(request));
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
