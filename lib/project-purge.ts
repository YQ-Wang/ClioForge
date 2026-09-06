import { HttpError } from './errors';

// Called only after the project has been made inaccessible. Retrying is safe:
// R2 removal precedes the database transaction, so a storage failure cannot
// report completion while originals remain live.
export async function purgeProject(
  db: D1Database,
  files: R2Bucket,
  projectId: string,
) {
  if (
    !(await db
      .prepare(
        "SELECT 1 FROM project_lifecycle WHERE project_id=? AND state='deleting'",
      )
      .bind(projectId)
      .first())
  )
    throw new HttpError(409, '项目尚未进入删除流程。');
  const paths = await db
    .prepare(
      'SELECT object_path AS path FROM sources WHERE project_id=? UNION SELECT object_path AS path FROM upload_receipts WHERE project_id=? UNION SELECT f.path FROM restore_files f JOIN project_restores r ON r.id=f.restore_id WHERE r.project_id=? UNION SELECT plan_path AS path FROM project_restores WHERE project_id=?',
    )
    .bind(projectId, projectId, projectId, projectId)
    .all<{ path: string }>();
  for (let i = 0; i < paths.results.length; i += 100)
    await files.delete(
      paths.results
        .slice(i, i + 100)
        .map((r) => r.path)
        .filter(Boolean),
    );
  // Uploads interrupted before receipt creation also live under this exact project prefix.
  const owners = await db
    .prepare(
      'SELECT owner_id FROM projects WHERE id=? UNION SELECT owner_id FROM upload_reservations WHERE project_id=?',
    )
    .bind(projectId, projectId)
    .all<{ owner_id: string }>();
  for (const { owner_id } of owners.results) {
    let cursor: string | undefined;
    do {
      const list = await files.list({
        prefix: `${owner_id}/${projectId}/`,
        cursor,
        limit: 100,
      });
      if (list.objects.length)
        await files.delete(list.objects.map((o) => o.key));
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  }
  const queries = [
    "INSERT OR IGNORE INTO artifact_lineage SELECT a.id,b.id,'depends_on',b.sha256 FROM artifacts a JOIN artifact_dependencies d ON d.artifact_id=a.id JOIN artifacts b ON b.id=d.depends_on WHERE b.project_id=? AND a.project_id<>?",
    // External references must be detached without erasing the other project's copy.
    "INSERT OR IGNORE INTO artifact_lineage SELECT a.id,b.id,'derived_from',b.sha256 FROM artifacts a JOIN artifacts b ON b.id=a.derived_from WHERE b.project_id=? AND a.project_id<>?",
    "INSERT OR IGNORE INTO artifact_lineage SELECT a.id,b.id,'supersedes',b.sha256 FROM artifacts a JOIN artifacts b ON b.id=a.supersedes WHERE b.project_id=? AND a.project_id<>?",
    'INSERT OR IGNORE INTO artifact_cleanup_permits SELECT id FROM artifacts WHERE project_id<>? AND (derived_from IN (SELECT id FROM artifacts WHERE project_id=?) OR supersedes IN (SELECT id FROM artifacts WHERE project_id=?))',
    'UPDATE artifacts SET derived_from=CASE WHEN derived_from IN (SELECT id FROM artifacts WHERE project_id=?) THEN NULL ELSE derived_from END,supersedes=CASE WHEN supersedes IN (SELECT id FROM artifacts WHERE project_id=?) THEN NULL ELSE supersedes END WHERE id IN (SELECT artifact_id FROM artifact_cleanup_permits)',
    'DELETE FROM artifact_cleanup_permits',
    'DELETE FROM artifact_lineage WHERE artifact_id IN (SELECT id FROM artifacts WHERE project_id=?)',
    'DELETE FROM artifact_grants WHERE project_id=? OR artifact_id IN (SELECT id FROM artifacts WHERE project_id=?)',
    'DELETE FROM artifact_dependencies WHERE artifact_id IN (SELECT id FROM artifacts WHERE project_id=?) OR depends_on IN (SELECT id FROM artifacts WHERE project_id=?)',
    'DELETE FROM artifact_reviews WHERE artifact_id IN (SELECT id FROM artifacts WHERE project_id=?)',
    'DELETE FROM branch_reviews WHERE branch_id IN (SELECT id FROM research_branches WHERE project_id=?)',
    'DELETE FROM task_reviews WHERE task_id IN (SELECT id FROM mission_tasks WHERE project_id=?)',
    'DELETE FROM task_attempts WHERE task_id IN (SELECT id FROM mission_tasks WHERE project_id=?)',
    'DELETE FROM task_inputs WHERE task_id IN (SELECT id FROM mission_tasks WHERE project_id=?)',
    'DELETE FROM task_events WHERE mission_id IN (SELECT id FROM missions WHERE project_id=?)',
    'DELETE FROM task_dependencies WHERE mission_id IN (SELECT id FROM missions WHERE project_id=?)',
    'DELETE FROM mission_boards WHERE mission_id IN (SELECT id FROM missions WHERE project_id=?)',
    'DELETE FROM bibliography_history WHERE entry_id IN (SELECT id FROM bibliography_entries WHERE project_id=?)',
    'DELETE FROM source_origins WHERE source_id IN (SELECT id FROM sources WHERE project_id=?)',
    ...[
      'agent_credentials',
      'project_invitations',
      'claim_evidence',
      'evidence_reviews',
      'source_relations',
      'bibliography_entries',
      'claims',
      'research_questions',
      'evidence',
      'source_pages',
      'note_state',
      'notes',
      'research_branches',
      'project_snapshots',
      'artifacts',
      'task_corrections',
      'research_methods',
      'mission_tasks',
      'missions',
      'direct_run_costs',
      'research_jobs',
      'research_runs',
      'project_budgets',
      'research_watches',
      'research_inbox',
      'project_comments',
      'project_members',
      'search_logs',
      'search_aliases',
      'entity_relations',
      'entities',
      'evaluation_runs',
      'ingestion_items',
      'source_versions',
      'sources',
      'upload_receipts',
      'upload_reservations',
    ].map((t) => `DELETE FROM ${t} WHERE project_id=?`),
    "UPDATE user SET name='Imported contributor',email='closed-'||id||'@canwoo.invalid',image=NULL WHERE id IN (SELECT user_id FROM restore_people WHERE project_id=?)",
    'DELETE FROM restore_people WHERE project_id=?',
    'DELETE FROM restore_files WHERE restore_id IN (SELECT id FROM project_restores WHERE project_id=?)',
    'DELETE FROM project_restores WHERE project_id=?',
    'DELETE FROM project_lifecycle WHERE project_id=?',
    'DELETE FROM projects WHERE id=?',
  ];
  await db.batch([
    db.prepare('PRAGMA defer_foreign_keys=ON'),
    ...queries.map((sql) =>
      db.prepare(sql).bind(...Array.from(sql.matchAll(/\?/g), () => projectId)),
    ),
  ]);
}

// Both states follow an explicit user action. Never purge an uploading or paused restore.
export async function cleanRestoreFiles(db: D1Database, files: R2Bucket) {
  const pending = await db
    .prepare(
      "SELECT id,project_id,plan_path,status FROM project_restores WHERE status='cancelled' OR (status='complete' AND plan_path<>'') LIMIT 5",
    )
    .all<{
      id: string;
      project_id: string;
      plan_path: string;
      status: string;
    }>();
  for (const row of pending.results) {
    try {
      if (row.status === 'cancelled')
        await purgeProject(db, files, row.project_id);
      else {
        await files.delete(row.plan_path);
        await db
          .prepare(
            "UPDATE project_restores SET plan_path='' WHERE id=? AND status='complete'",
          )
          .bind(row.id)
          .run();
      }
    } catch {
      /* Preserve the cleanup marker for the next scheduled run. */
    }
  }
}
