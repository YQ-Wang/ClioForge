import { MissionStore } from './missions';
import { sha256 } from './search';
import type { MissionDraft } from './types';
export async function updateMission(
  store: MissionStore,
  projectId: string,
  id: string,
) {
  const view = await store.view(id);
  await store.project(projectId, 'write');
  if (view.mission.project_id !== projectId)
    throw new Error('研究计划不属于此项目。');
  if (view.tasks.some((t) => ['running', 'queued'].includes(t.status)))
    throw new Error('请先暂停并等待正在执行的步骤结束。');
  const changed = new Set(
    view.tasks.filter((t) => t.status === 'stale').map((t) => t.id),
  );
  if (!changed.size) throw new Error('此计划没有需要更新的步骤。');
  let size = -1;
  while (size !== changed.size) {
    size = changed.size;
    for (const edge of view.edges)
      if (changed.has(edge.depends_on)) changed.add(edge.task_id);
  }
  const ids = new Map(view.tasks.map((t) => [t.id, crypto.randomUUID()]));
  const latest = new Map<string, string>();
  for (const versionId of new Set(
    view.tasks
      .filter((t) => changed.has(t.id))
      .flatMap((t) => t.input.version_ids),
  )) {
    const v = await store.version(versionId);
    const row = await store.db
      .prepare(
        'SELECT id FROM source_versions WHERE source_id=? ORDER BY revision DESC LIMIT 1',
      )
      .bind(v.source_id)
      .first<{ id: string }>();
    latest.set(versionId, row!.id);
  }
  const tasks: MissionDraft['tasks'] = [];
  for (const t of view.tasks) {
    const reuse =
      !changed.has(t.id) &&
      ['accepted', 'succeeded'].includes(t.status) &&
      !!t.result;
    tasks.push({
      id: ids.get(t.id)!,
      title: t.title,
      kind: reuse ? 'verify' : t.kind,
      executor: reuse ? 'builtin' : t.executor,
      assignee: reuse
        ? t.input.locale === 'en'
          ? 'Reuse prior work'
          : '沿用已有工作'
        : t.assignee,
      dependencies: reuse
        ? []
        : view.edges
            .filter((e) => e.task_id === t.id)
            .map((e) => ids.get(e.depends_on)!),
      input: reuse
        ? {
            ...t.input,
            model_id: undefined,
            parameters: {
              reuse_task: t.id,
              expected_hash: await sha256(JSON.stringify(t.result)),
            },
          }
        : {
            ...t.input,
            version_ids: t.input.version_ids.map((v) => latest.get(v) || v),
            page_refs: t.input.page_refs?.map((p) => ({
              ...p,
              version_id: latest.get(p.version_id) || p.version_id,
            })),
          },
    });
  }
  return store.create(projectId, {
    title:
      `${view.mission.title} · ${view.tasks[0]?.input.locale === 'en' ? 'Updated sources' : '材料更新'}`.slice(
        0,
        200,
      ),
    question: view.mission.question,
    scope: view.mission.scope,
    acceptance: view.mission.acceptance,
    tasks,
  });
}
