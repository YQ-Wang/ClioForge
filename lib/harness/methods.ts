import { HttpError } from '../errors';
import { methodSchema } from '../platform/research-recipes';
import type { MissionStore } from '../platform/missions';

// Each save creates a new immutable edition. Branches retain their parent.
export async function saveMethod(
  store: MissionStore,
  projectId: string,
  raw: unknown,
) {
  await store.project(projectId, 'write');
  const method = methodSchema.parse(raw);
  let version = 1;
  if (method.parent_id) {
    const parent = await store.db
      .prepare('SELECT body FROM research_methods WHERE id=? AND project_id=?')
      .bind(method.parent_id, projectId)
      .first<{ body: string }>();
    if (!parent) throw new HttpError(404, '研究方法不存在。');
    version = (methodSchema.parse(JSON.parse(parent.body)).version || 1) + 1;
  }
  const body = methodSchema.parse({ ...method, version });
  const id = crypto.randomUUID();
  await store.db
    .prepare(
      'INSERT INTO research_methods(id,project_id,title,body,created_by,created_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      id,
      projectId,
      body.title,
      JSON.stringify(body),
      store.owner,
      new Date().toISOString(),
    )
    .run();
  return id;
}
