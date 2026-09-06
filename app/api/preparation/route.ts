import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import {
  preparationStatus,
  startPreparation,
  controlPreparation,
} from '@/lib/material-preparation';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      project = z
        .uuid()
        .parse(new URL(request.url).searchParams.get('project_id'));
    return Response.json(await preparationStatus(store, project), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { store, settings } = await authenticate(request),
      input = z
        .discriminatedUnion('action', [
          z.object({
            action: z.literal('start'),
            id: z.uuid(),
            project_id: z.uuid(),
            connection_id: z.uuid(),
          }),
          z.object({
            action: z.enum(['pause', 'resume', 'cancel']),
            id: z.uuid(),
          }),
        ])
        .parse(await jsonBody(request));
    return Response.json(
      input.action === 'start'
        ? await startPreparation(
            store,
            settings,
            input.project_id,
            input.connection_id,
            input.id,
          )
        : await controlPreparation(store, settings, input.id, input.action),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
