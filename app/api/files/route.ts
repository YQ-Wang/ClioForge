import { saveOriginalUpload } from '@/lib/original-upload';
import { env } from 'cloudflare:workers';
import { authenticate, failure, HttpError } from '@/lib/server';
import { boundedBytes, MAX_FILE_BYTES, mediaExtensions } from '@/lib/files';
export const dynamic = 'force-dynamic';
function bucket() {
  const files = (env as unknown as { FILES?: R2Bucket }).FILES;
  if (!files) throw new HttpError(503, '原件存储尚未配置。');
  return files;
}
export async function POST(request: Request) {
  try {
    const { user, store } = await authenticate(request);
    const project = new URL(request.url).searchParams.get('project_id');
    const data = await store.project(project || '');
    if (!data) throw new HttpError(404, '项目不存在。');
    const mediaType = request.headers.get('content-type')?.split(';')[0] || '';
    if (!mediaExtensions[mediaType])
      throw new HttpError(400, '文件类型不受支持。');
    let bytes;
    try {
      bytes = await boundedBytes(request, MAX_FILE_BYTES);
    } catch {
      throw new HttpError(413, '上传失败，单份资料最多 20 MB。');
    }
    if (!bytes.length) throw new HttpError(400, '文件内容为空。');
    const id = crypto.randomUUID();
    const path = `${user.id}/${data.id}/${id}/original.${mediaExtensions[mediaType]}`;
    const files = bucket();
    // Reserve atomically before R2 writes; uncertain failures keep their reservation.
    await store.reserveUpload(id, data.id, bytes.byteLength);
    await saveOriginalUpload(store, files, id, data.id, path, bytes, mediaType);
    return Response.json({ id, path });
  } catch (error) {
    return failure(error);
  }
}
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    const id = new URL(request.url).searchParams.get('source_id');
    const data = await store.source(id || '');
    if (!data) throw new HttpError(404, '资料不存在。');
    const object = await bucket().get(data.object_path);
    if (!object) throw new HttpError(404, '找不到原件，请联系管理员。');
    return new Response(object.body, {
      headers: {
        'Content-Type': data.media_type.startsWith('text/')
          ? 'text/plain; charset=utf-8'
          : data.media_type,
        'Content-Length': String(object.size),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(data.title)}`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
