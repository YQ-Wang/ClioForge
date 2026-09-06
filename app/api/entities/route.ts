import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import {
  listEntities,
  saveEntity,
  mergeEntity,
  entityInput,
} from '@/lib/historical-entities';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    return Response.json(
      await listEntities(
        store,
        z.uuid().parse(new URL(request.url).searchParams.get('project_id')),
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request),
      input = z
        .discriminatedUnion('action', [
          z.object({ action: z.literal('save'), value: entityInput }),
          z.object({
            action: z.literal('merge'),
            id: z.uuid(),
            target: z.uuid().nullable(),
            expected: z.number().int().positive(),
            reason: z.string().trim().min(1).max(2000),
          }),
        ])
        .parse(await jsonBody(request));
    const result =
      input.action === 'save'
        ? await saveEntity(store, input.value)
        : await mergeEntity(
            store,
            input.id,
            input.target,
            input.expected,
            input.reason,
          );
    return Response.json({ result: result || true });
  } catch (e) {
    return failure(e);
  }
}
