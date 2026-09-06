import { authenticate, failure, jsonBody } from '@/lib/server';
import { z } from 'zod';
import {
  deletionPreview,
  requestAccountDeletion,
  processAccountDeletions,
} from '@/lib/account-deletion';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    return Response.json(await deletionPreview(store.db, store.owner), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { store, session, settings } = await authenticate(request);
    const input = z
      .object({
        email: z.email(),
        digest: z.string().length(64),
        confirm: z.literal(true),
      })
      .parse(await jsonBody(request));
    const result = await requestAccountDeletion(
      store.db,
      store.owner,
      session.id,
      input.email,
      input.digest,
    );
    await processAccountDeletions(store.db, settings.FILES);
    return Response.json(result);
  } catch (error) {
    return failure(error);
  }
}
