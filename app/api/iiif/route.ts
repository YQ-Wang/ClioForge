import { z } from 'zod';
import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import { parseIiif } from '@/lib/iiif';
import { sha256 } from '@/lib/platform/search';
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request),
      input = z
        .object({
          project_id: z.uuid(),
          source_id: z.uuid(),
          canvas: z.string().max(4000),
          manifest: z.unknown(),
        })
        .parse(await jsonBody(request, 2_000_000));
    await store.project(input.project_id, 'write');
    const manifest = parseIiif(input.manifest),
      page = manifest.pages.find((p) => p.id === input.canvas);
    if (!page) throw new HttpError(400, '清单中没有此页。');
    const receipt = await store.db
      .prepare(
        'SELECT * FROM upload_receipts WHERE id=? AND project_id=? AND owner_id=?',
      )
      .bind(input.source_id, input.project_id, store.owner)
      .first<{ object_path: string; media_type: string }>();
    if (
      !receipt ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(receipt.media_type)
    )
      throw new HttpError(400, '请先上传此页图像。');
    const version = await store.importSource({
      p_id: input.source_id,
      p_project: input.project_id,
      p_title: `${manifest.title} · ${page.order} · ${page.label}`.slice(
        0,
        200,
      ),
      p_path: receipt.object_path,
      p_type: receipt.media_type,
      p_pages: [{ page: 1, text: '' }],
    });
    await store.db
      .prepare('INSERT OR IGNORE INTO source_origins VALUES(?,?,?,?,?,?,?,?)')
      .bind(
        input.source_id,
        'iiif',
        page.id,
        manifest.id,
        manifest.rights,
        new Date().toISOString(),
        await sha256(JSON.stringify(input.manifest)),
        JSON.stringify({
          manifest_id: manifest.id,
          canvas_id: page.id,
          canvas_order: page.order,
          image: page.image,
          attribution: manifest.attribution,
          manifest: input.manifest,
        }),
      )
      .run();
    return Response.json({ version });
  } catch (e) {
    return failure(e);
  }
}
