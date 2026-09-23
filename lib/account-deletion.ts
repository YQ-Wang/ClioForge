import { HttpError } from './errors';
import { sha256 } from './platform/search';
import { purgeProject } from './project-purge';
export async function deletionPreview(db: D1Database, owner: string) {
  const projects = (
    await db
      .prepare('SELECT id,title FROM projects WHERE owner_id=? ORDER BY id')
      .bind(owner)
      .all<{ id: string; title: string }>()
  ).results;
  const shared = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM project_members WHERE user_id=? AND project_id NOT IN (SELECT id FROM projects WHERE owner_id=?)',
    )
    .bind(owner, owner)
    .first<{ n: number }>();
  return {
    projects,
    shared_projects: shared?.n || 0,
    digest: await sha256(JSON.stringify(projects)),
  };
}
export async function requestAccountDeletion(
  db: D1Database,
  owner: string,
  sessionId: string,
  email: string,
  digest: string,
) {
  const session = await db
    .prepare(
      'SELECT created_at FROM session WHERE id=? AND user_id=? AND expires_at>?',
    )
    .bind(sessionId, owner, Date.now())
    .first<{ created_at: number }>();
  if (!session || Date.now() - session.created_at > 15 * 60 * 1000)
    throw new HttpError(
      403,
      '删除账号前，请退出并重新登录，然后在 15 分钟内确认。',
    );
  const user = await db
    .prepare('SELECT email FROM user WHERE id=?')
    .bind(owner)
    .first<{ email: string }>();
  if (!user || user.email.toLowerCase() !== email.trim().toLowerCase())
    throw new HttpError(400, '请输入当前账号的完整邮箱。');
  const preview = await deletionPreview(db, owner);
  if (preview.digest !== digest)
    throw new HttpError(409, '项目清单已改变，请重新查看后确认。');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO account_deletions(owner_id,status,created_at) VALUES(?,CASE WHEN (SELECT json_group_array(json_object('id',id,'title',title)) FROM (SELECT id,title FROM projects WHERE owner_id=? ORDER BY id))=? AND EXISTS(SELECT 1 FROM session WHERE id=? AND user_id=? AND expires_at>? AND created_at>?) THEN 'pending' ELSE NULL END,?)",
      )
      .bind(
        owner,
        owner,
        JSON.stringify(preview.projects),
        sessionId,
        owner,
        Date.now(),
        Date.now() - 15 * 60 * 1000,
        now,
      ),
    db
      .prepare(
        "INSERT INTO project_lifecycle SELECT id,'deleting',? FROM projects WHERE owner_id=? ON CONFLICT(project_id) DO UPDATE SET state='deleting'",
      )
      .bind(now, owner),
    db.prepare('DELETE FROM session WHERE user_id=?').bind(owner),
    db.prepare('DELETE FROM account WHERE user_id=?').bind(owner),
    db
      .prepare(
        'DELETE FROM verification WHERE value=? OR lower(identifier)=lower(?)',
      )
      .bind(owner, email),
    db.prepare('DELETE FROM oauth_states WHERE owner_id=?').bind(owner),
    db.prepare('DELETE FROM cloud_connections WHERE owner_id=?').bind(owner),
    ...[
      'search_connections',
      'search_allowances',
      'discovery_sessions',
      'catalog_cache',
    ].map((table) =>
      db.prepare(`DELETE FROM ${table} WHERE owner_id=?`).bind(owner),
    ),
    db.prepare('DELETE FROM model_checks WHERE owner_id=?').bind(owner),
    db.prepare('DELETE FROM model_policies WHERE owner_id=?').bind(owner),
    db.prepare('DELETE FROM model_connections WHERE owner_id=?').bind(owner),
    db
      .prepare(
        'DELETE FROM agent_credentials WHERE owner_id=? OR project_id IN (SELECT id FROM projects WHERE owner_id=?)',
      )
      .bind(owner, owner),
    db.prepare('DELETE FROM project_members WHERE user_id=?').bind(owner),
    db
      .prepare(
        'DELETE FROM project_invitations WHERE lower(email)=lower(?) OR invited_by=?',
      )
      .bind(email, owner),
    db.prepare('DELETE FROM account_preferences WHERE owner_id=?').bind(owner),
    db.prepare('DELETE FROM attention_receipts WHERE owner_id=?').bind(owner),
    db
      .prepare('DELETE FROM attention_preferences WHERE owner_id=?')
      .bind(owner),
    db
      .prepare(
        "UPDATE material_preparations SET status='cancelled',detail='Account closed; execution stopped.',updated_at=? WHERE (owner_id=? OR project_id IN (SELECT id FROM projects WHERE owner_id=?)) AND status IN ('queued','running','pause_requested','cancel_requested','paused','uncertain')",
      )
      .bind(now, owner, owner),
    db.prepare('DELETE FROM discussion_mentions WHERE user_id=?').bind(owner),
    db
      .prepare(
        'UPDATE research_watches SET enabled=0 WHERE owner_id=? OR project_id IN (SELECT id FROM projects WHERE owner_id=?)',
      )
      .bind(owner, owner),
    db
      .prepare(
        "UPDATE research_jobs SET status='cancelled',error='Account closed; execution stopped.' WHERE (owner_id=? OR project_id IN (SELECT id FROM projects WHERE owner_id=?)) AND status IN ('queued','paused','running')",
      )
      .bind(owner, owner),
    db
      .prepare(
        "UPDATE research_runs SET status='failed',error='Account closed; execution stopped.' WHERE owner_id=? AND status='running'",
      )
      .bind(owner),
    db
      .prepare(
        "UPDATE missions SET status='paused' WHERE created_by=? OR project_id IN (SELECT id FROM projects WHERE owner_id=?)",
      )
      .bind(owner, owner),
    db
      .prepare(
        "UPDATE mission_tasks SET status='cancelled',lease_hash=NULL,review_token=NULL WHERE mission_id IN (SELECT id FROM missions WHERE created_by=? OR project_id IN (SELECT id FROM projects WHERE owner_id=?)) AND status IN ('blocked','ready','queued','running')",
      )
      .bind(owner, owner),
    db
      .prepare(
        "UPDATE user SET name='Deleted researcher',email='closed-'||id||'@clioforge.invalid',email_verified=0,image=NULL,updated_at=? WHERE id=?",
      )
      .bind(Date.now(), owner),
  ]);
  return { requested: true };
}
export async function processAccountDeletions(db: D1Database, files: R2Bucket) {
  const requests = (
    await db
      .prepare(
        "SELECT owner_id FROM account_deletions WHERE status='pending' LIMIT 5",
      )
      .all<{ owner_id: string }>()
  ).results;
  for (const { owner_id: owner } of requests)
    try {
      const projects = (
        await db
          .prepare('SELECT id FROM projects WHERE owner_id=?')
          .bind(owner)
          .all<{ id: string }>()
      ).results;
      for (const { id } of projects) await purgeProject(db, files, id);
      // Shared sources remain owned by their project and retain their immutable
      // object paths. Attribute their storage reservation to that project's owner.
      await db
        .prepare(
          'UPDATE upload_reservations SET owner_id=(SELECT owner_id FROM projects WHERE id=project_id) WHERE owner_id=?',
        )
        .bind(owner)
        .run();
      await db
        .prepare(
          'UPDATE upload_receipts SET owner_id=(SELECT owner_id FROM projects WHERE id=project_id) WHERE owner_id=?',
        )
        .bind(owner)
        .run();
      // Remove incomplete uploads under this user's prefix, retaining shared originals.
      const keep = new Set(
        (
          await db
            .prepare('SELECT object_path FROM sources WHERE object_path LIKE ?')
            .bind(`${owner}/%`)
            .all<{ object_path: string }>()
        ).results.map((s) => s.object_path),
      );
      let cursor: string | undefined;
      do {
        const list = await files.list({
          prefix: `${owner}/`,
          cursor,
          limit: 100,
        });
        const remove = list.objects
          .filter((o) => !keep.has(o.key))
          .map((o) => o.key);
        if (remove.length) await files.delete(remove);
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
      await db
        .prepare(
          "UPDATE account_deletions SET status='complete',finished_at=?,error=NULL WHERE owner_id=?",
        )
        .bind(new Date().toISOString(), owner)
        .run();
    } catch {
      await db
        .prepare(
          "UPDATE account_deletions SET error='Cleanup is pending; it will retry automatically.' WHERE owner_id=?",
        )
        .bind(owner)
        .run();
    }
}
