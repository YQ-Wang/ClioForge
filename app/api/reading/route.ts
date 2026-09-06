import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { MissionStore } from '@/lib/platform/missions';
import { dispatchMission } from '@/lib/platform/execute';
import {
  readingPage,
  readingThread,
  startReadingAssistant,
} from '@/lib/reading-assistant';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  try {
    const auth = await authenticate(request);
    const store = new MissionStore(auth.store.db, auth.user.id);
    const params = new URL(request.url).searchParams;
    const projectId = z.uuid().parse(params.get('project_id'));
    const value = params.has('evidence_id')
      ? await readingThread(
          store,
          projectId,
          z.uuid().parse(params.get('evidence_id')),
        )
      : await readingPage(
          store,
          projectId,
          z.uuid().parse(params.get('version_id')),
          z.coerce.number().int().positive().parse(params.get('page')),
          params.has('annotation_id')
            ? z.uuid().parse(params.get('annotation_id'))
            : undefined,
        );
    return Response.json(value, { headers });
  } catch (error) {
    const response = failure(error);
    response.headers.set('Cache-Control', headers['Cache-Control']);
    return response;
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticate(request);
    const store = new MissionStore(auth.store.db, auth.user.id);
    const result = await startReadingAssistant(
      store,
      await jsonBody(request),
      (id) => dispatchMission(auth.settings, id),
    );
    return Response.json(result, { headers });
  } catch (error) {
    const response = failure(error);
    response.headers.set('Cache-Control', headers['Cache-Control']);
    return response;
  }
}
