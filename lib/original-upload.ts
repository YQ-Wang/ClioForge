import { removeTemporaryObject } from './object-cleanup';
import type { ResearchStore } from './store';
// R2 can finish after a concurrently requested account deletion. Recheck after
// registration, while retaining any source already committed to a shared project.
export async function saveOriginalUpload(
  store: ResearchStore,
  files: R2Bucket,
  id: string,
  projectId: string,
  path: string,
  bytes: Uint8Array,
  mediaType: string,
) {
  try {
    await store.project(projectId, 'write');
    await files.put(path, bytes, { httpMetadata: { contentType: mediaType } });
    const receipt = await store.db
      .prepare('SELECT id FROM upload_receipts WHERE id=? AND owner_id=?')
      .bind(id, store.owner)
      .first();
    if (!receipt) await store.recordUpload(id, projectId, path, mediaType);
  } finally {
    const closed = await store.db
      .prepare(
        "SELECT 1 WHERE EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?) OR NOT EXISTS(SELECT 1 FROM projects WHERE id=?) OR EXISTS(SELECT 1 FROM project_lifecycle WHERE project_id=? AND state='deleting')",
      )
      .bind(store.owner, projectId, projectId)
      .first();
    if (
      closed &&
      !(await store.db
        .prepare('SELECT 1 FROM sources WHERE object_path=?')
        .bind(path)
        .first())
    ) {
      await removeTemporaryObject(store.db, files, path);
      await store.db.batch([
        store.db
          .prepare('DELETE FROM upload_receipts WHERE id=? AND owner_id=?')
          .bind(id, store.owner),
        store.db
          .prepare('DELETE FROM upload_reservations WHERE id=? AND owner_id=?')
          .bind(id, store.owner),
      ]);
    }
  }
}
