import { z } from 'zod';
import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import { zoteroLibrary, zoteroAttachments, zoteroFile } from '@/lib/zotero';
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request),
      input = zoteroLibrary
        .extend({
          project_id: z.uuid(),
          action: z.enum(['list', 'download']),
          start: z.number().int().min(0).max(100000).default(0),
          item: z
            .string()
            .regex(/^[A-Z0-9]{8}$/)
            .optional(),
        })
        .parse(await jsonBody(request));
    await store.project(input.project_id);
    if (input.action === 'list')
      return Response.json(await zoteroAttachments(input, input.start), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    if (!input.item) throw new HttpError(400, '请选择附件。');
    const bytes = await zoteroFile(input, input.item);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'attachment',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
