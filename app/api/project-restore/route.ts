import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import { z } from 'zod';
import { ProjectRestore } from '@/lib/project-restore';
import { purgeProject } from '@/lib/project-purge';
import { boundedBytes, MAX_FILE_BYTES } from '@/lib/files';
import { MAX_METADATA_BYTES } from '@/lib/backup-format';
import { sha256 } from '@/lib/platform/search';
export async function GET(request: Request) {
  try {
    const { store, settings } = await authenticate(request);
    return Response.json(
      { restores: await new ProjectRestore(store, settings.FILES).active() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { store, settings } = await authenticate(request);
    const engine = new ProjectRestore(store, settings.FILES);
    const input = (await jsonBody(
      request,
      MAX_METADATA_BYTES * 2 + 1024 * 1024,
    )) as Record<string, unknown>;
    if (input.action === 'start') {
      const value = z
        .object({
          metadata: z.string().max(MAX_METADATA_BYTES),
          manifest: z.unknown(),
          title: z.string().max(200),
        })
        .parse(input);
      const manifest = z
        .object({
          files: z.array(z.object({ path: z.string(), sha256: z.string() })),
        })
        .parse(value.manifest);
      if (
        (await sha256(value.metadata)) !==
        manifest.files.find((f) => f.path === 'project.json')?.sha256
      )
        throw new HttpError(400, '项目记录的校验值不匹配。');
      return Response.json(
        await engine.start(
          JSON.parse(value.metadata),
          value.manifest,
          value.title,
        ),
      );
    }
    const id = z.uuid().parse(input.id);
    if (input.action === 'resume')
      return Response.json(
        await engine.resume(
          id,
          JSON.parse(z.string().parse(input.metadata)),
          input.manifest,
        ),
      );
    if (input.action === 'step') return Response.json(await engine.step(id));
    if (input.action === 'cancel') {
      const restore = await engine.read(id);
      if (restore.status === 'complete')
        throw new HttpError(409, '恢复已完成，不能作为未完成任务取消。');
      await store.db.batch([
        store.db
          .prepare(
            "UPDATE project_restores SET status='cancelled' WHERE id=? AND status IN ('uploading','records')",
          )
          .bind(id),
        store.db
          .prepare(
            "UPDATE project_lifecycle SET state='deleting' WHERE project_id=? AND state='restoring'",
          )
          .bind(restore.project_id),
      ]);
      await purgeProject(store.db, settings.FILES, restore.project_id);
      return Response.json({ cancelled: true });
    }
    throw new HttpError(400, '恢复操作无效。');
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    const { store, settings } = await authenticate(request);
    const url = new URL(request.url),
      id = z.uuid().parse(url.searchParams.get('id')),
      source = z.uuid().parse(url.searchParams.get('source'));
    let bytes;
    try {
      bytes = await boundedBytes(request, MAX_FILE_BYTES);
    } catch {
      throw new HttpError(413, '原件超过 20 MB。');
    }
    await new ProjectRestore(store, settings.FILES).upload(id, source, bytes);
    return Response.json({ uploaded: true });
  } catch (error) {
    return failure(error);
  }
}
