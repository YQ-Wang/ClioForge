import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import {
  createOcrBatch,
  stageOcrImage,
  controlOcrBatch,
  ocrBatchStatus,
  ocrBatchInput,
} from '@/lib/ocr-batches';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      params = new URL(request.url).searchParams;
    return Response.json(
      await ocrBatchStatus(
        store,
        z.uuid().parse(params.get('project_id')),
        z.uuid().parse(params.get('version_id')),
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { store, settings } = await authenticate(request);
    const raw = await jsonBody(request, 2_700_000);
    if ('action' in raw && raw.action === 'create')
      return Response.json(
        await createOcrBatch(store, settings, ocrBatchInput.parse(raw)),
      );
    const input = z
      .object({
        id: z.uuid(),
        action: z.enum(['stage', 'start', 'pause', 'resume', 'cancel']),
        page: z.number().int().min(1).max(500).optional(),
        image: z.string().max(2_666_800).optional(),
      })
      .parse(raw);
    if (input.action === 'stage') {
      await stageOcrImage(
        store,
        settings,
        input.id,
        z.number().int().parse(input.page),
        z.string().parse(input.image),
      );
      return Response.json({ saved: true });
    }
    return Response.json(
      await controlOcrBatch(store, settings, input.id, input.action),
    );
  } catch (error) {
    return failure(error);
  }
}
