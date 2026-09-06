import { HttpError } from '../errors';
import type { ResearchStore } from '../store';
export async function discussionTarget(
  store: ResearchStore,
  projectId: string,
  target: string,
) {
  await store.project(projectId);
  if (target === projectId) return;
  for (const table of [
    'sources',
    'source_versions',
    'evidence',
    'claims',
    'notes',
    'mission_tasks',
    'missions',
  ]) {
    if (
      await store.db
        .prepare(`SELECT id FROM ${table} WHERE id=? AND project_id=?`)
        .bind(target, projectId)
        .first()
    )
      return;
  }
  throw new HttpError(404, '讨论对象不属于此项目。');
}
