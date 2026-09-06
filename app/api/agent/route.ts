import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { failure, jsonBody, HttpError } from '@/lib/server';
import { agentAuth } from '@/lib/platform/agent-auth';
import { searchPages } from '@/lib/platform/search';
import { dispatchMission } from '@/lib/platform/execute';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const auth = await agentAuth(env.DB, request),
      { store, key, actor, scopes } = auth;
    const input = z
      .object({
        action: z.enum([
          'missions',
          'mission',
          'search',
          'version',
          'claim',
          'heartbeat',
          'submit',
        ]),
        id: z.uuid().optional(),
        query: z.string().max(2000).optional(),
        lease: z.string().max(100).optional(),
        result: z.unknown().optional(),
      })
      .parse(await jsonBody(request, 500000));
    const permission = ['claim', 'heartbeat'].includes(input.action)
      ? 'claim'
      : input.action === 'submit'
        ? 'submit'
        : 'read';
    if (!scopes.includes(permission))
      throw new HttpError(403, 'Credential scope does not permit this action.');
    let result: unknown;
    if (input.action === 'missions') result = await store.list(key.project_id);
    else if (input.action === 'search')
      result = await searchPages(store, key.project_id, input.query || '');
    else if (input.action === 'version') {
      const version = await store.version(input.id || '');
      if (version.project_id !== key.project_id)
        throw new HttpError(404, 'Version outside credential scope.');
      result = version;
    } else if (input.action === 'mission') {
      const view = await store.view(input.id || '');
      if (view.mission.project_id !== key.project_id)
        throw new HttpError(404, 'Mission outside credential scope.');
      result = view;
    } else {
      const task = await store.task(input.id || '');
      if (task.project_id !== key.project_id || task.executor !== 'external')
        throw new HttpError(404, 'External task outside credential scope.');
      if (input.action === 'claim')
        result = await store.claim(task.id, actor, 'external');
      else if (input.action === 'heartbeat')
        result = await store.heartbeat(task.id, input.lease || '', actor);
      else {
        result = await store.submit(
          task.id,
          input.lease || '',
          actor,
          input.result,
        );
        await dispatchMission(env, task.mission_id);
      }
    }
    return Response.json(
      { result },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
