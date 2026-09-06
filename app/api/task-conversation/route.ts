import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { MissionStore } from '@/lib/platform/missions';
import { dispatchMission } from '@/lib/platform/execute';
import { taskConversation, startTaskMessage } from '@/lib/task-conversation';
export async function GET(request: Request) {
  try {
    const auth = await authenticate(request);
    return Response.json(
      await taskConversation(
        new MissionStore(auth.store.db, auth.user.id),
        z.uuid().parse(new URL(request.url).searchParams.get('task_id')),
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticate(request);
    return Response.json(
      await startTaskMessage(
        new MissionStore(auth.store.db, auth.user.id),
        await jsonBody(request),
        (id) => dispatchMission(auth.settings, id),
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
