import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { TeamStore } from '@/lib/project-team';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    return Response.json(
      { invitations: await new TeamStore(store.db, store.owner).inbox() },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request);
    const input = z
      .object({ id: z.uuid(), action: z.enum(['accept', 'decline']) })
      .parse(await jsonBody(request));
    const projectId = await new TeamStore(store.db, store.owner).respond(
      input.id,
      input.action === 'accept',
    );
    return Response.json({ projectId }, { headers });
  } catch (error) {
    return failure(error);
  }
}
