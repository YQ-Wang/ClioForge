import { z } from 'zod';
import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import {
  semanticSearch,
  indexSemantic,
  semanticStatus,
} from '@/lib/platform/semantic';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      id = z.uuid().parse(new URL(request.url).searchParams.get('project_id'));
    return Response.json(await semanticStatus(store, id), {
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
        .object({
          project_id: z.uuid(),
          connection_id: z.uuid(),
          run_id: z.uuid(),
          action: z.enum(['index', 'search']),
          query: z.string().trim().min(1).max(2000).optional(),
        })
        .parse(await jsonBody(request));
    if (!settings.FOLIOTRACE_ENCRYPTION_KEY)
      throw new HttpError(503, '模型连接未配置。');
    if (input.action === 'index') {
      await store.project(input.project_id, 'write');
      if (
        await store.db
          .prepare(
            "SELECT id FROM material_preparations WHERE project_id=? AND status IN ('queued','running','pause_requested','cancel_requested','paused','uncertain')",
          )
          .bind(input.project_id)
          .first()
      )
        throw new HttpError(409, '请在材料准备中继续现有任务，避免重复处理。');
    }
    const result =
      input.action === 'index'
        ? await indexSemantic(
            store,
            settings.FOLIOTRACE_ENCRYPTION_KEY,
            input.project_id,
            input.connection_id,
            input.run_id,
          )
        : await semanticSearch(
            store,
            settings.FOLIOTRACE_ENCRYPTION_KEY,
            input.project_id,
            input.connection_id,
            input.run_id,
            z.string().min(1).parse(input.query),
          );
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
