// Keep a durable retry marker for late writes whose project was already purged.
// A fresh ID prevents an older cleanup attempt from clearing a newer marker.
export async function removeTemporaryObject(
  db: D1Database,
  files: R2Bucket,
  path: string,
) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO object_cleanup VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET id=excluded.id,created_at=excluded.created_at',
    )
    .bind(id, path, new Date().toISOString())
    .run();
  await files.delete(path);
  await db.prepare('DELETE FROM object_cleanup WHERE id=?').bind(id).run();
}
export async function retryObjectCleanup(db: D1Database, files: R2Bucket) {
  const items = await db
    .prepare('SELECT id,path FROM object_cleanup ORDER BY created_at LIMIT 100')
    .all<{ id: string; path: string }>();
  if (!items.results.length) return;
  try {
    await files.delete(items.results.map((item) => item.path));
    await db
      .prepare(
        `DELETE FROM object_cleanup WHERE id IN (${items.results.map(() => '?').join(',')})`,
      )
      .bind(...items.results.map((item) => item.id))
      .run();
  } catch {
    /* Keep markers until storage is available again. */
  }
}
