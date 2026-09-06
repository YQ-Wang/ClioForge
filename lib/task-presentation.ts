import type { MissionTask, Mission } from './platform/types';
export const taskColumns = [
  { id: 'planned', zh: '待开展', en: 'To do' },
  { id: 'active', zh: '进行中', en: 'In progress' },
  { id: 'waiting', zh: '等待与需处理', en: 'Waiting & attention' },
  { id: 'review', zh: '待审读', en: 'To review' },
  { id: 'done', zh: '已完成', en: 'Completed' },
] as const;
export function taskColumn(
  task: Pick<MissionTask, 'status' | 'executor' | 'board_stage'>,
  mission: Pick<Mission, 'status'>,
) {
  if (task.status === 'accepted' || task.status === 'succeeded') return 'done';
  if (
    task.status === 'ready' &&
    ['paused', 'cancelled'].includes(mission.status)
  )
    return 'waiting';
  if (
    task.executor === 'human' &&
    task.status === 'ready' &&
    mission.status === 'active' &&
    task.board_stage
  )
    return task.board_stage;
  if (
    task.status === 'review' ||
    (task.status === 'ready' && task.executor === 'human')
  )
    return 'review';
  if (['running', 'queued'].includes(task.status)) return 'active';
  if (
    ['failed', 'uncertain', 'stale', 'rejected', 'cancelled'].includes(
      task.status,
    ) ||
    mission.status === 'paused' ||
    mission.status === 'cancelled'
  )
    return 'waiting';
  if (task.status === 'blocked' && mission.status !== 'draft') return 'waiting';
  return 'planned';
}
export const taskStatusLabels: Record<MissionTask['status'], [string, string]> =
  {
    blocked: ['等待前置步骤', 'Waiting for dependencies'],
    ready: ['可以开始', 'Ready'],
    queued: ['排队中', 'Queued'],
    running: ['进行中', 'Working'],
    succeeded: ['产物已生成', 'Output produced'],
    review: ['待审读', 'Needs review'],
    accepted: ['已审读通过', 'Accepted after review'],
    rejected: ['需修订', 'Revision requested'],
    failed: ['执行失败', 'Failed'],
    uncertain: ['需确认调用结果', 'Check uncertain response'],
    cancelled: ['已取消', 'Cancelled'],
    stale: ['需对照更新', 'Check changed sources'],
  };

export function taskProgressLabels(
  task: MissionTask,
  mission: Mission,
): [string, string] {
  if (
    task.status === 'ready' &&
    task.executor === 'human' &&
    mission.status === 'active'
  ) {
    if (task.board_stage === 'active')
      return ['人工处理中', 'Researcher working'];
    if (task.board_stage === 'waiting') return ['人工暂缓', 'On hold'];
    if (task.board_stage === 'planned') return ['待开展', 'To do'];
  }
  return taskStatusLabels[task.status];
}

type TaskOrderEntry = Pick<MissionTask, 'id' | 'title' | 'created_at'>;
type DependencyEdge = { task_id: string; depends_on: string };

// Keep dependencies before their consumers even when all creation timestamps tie.
export function orderedTasks<T extends TaskOrderEntry>(
  tasks: readonly T[],
  edges: readonly DependencyEdge[],
): T[] {
  const byId = new Map(tasks.map((task) => [task.id, task])),
    dependencies = new Map(tasks.map((task) => [task.id, new Set<string>()])),
    consumers = new Map(tasks.map((task) => [task.id, new Set<string>()]));
  for (const edge of edges) {
    if (!byId.has(edge.task_id) || !byId.has(edge.depends_on)) continue;
    dependencies.get(edge.task_id)!.add(edge.depends_on);
    consumers.get(edge.depends_on)!.add(edge.task_id);
  }
  const compare = (a: T, b: T) =>
    a.created_at.localeCompare(b.created_at) ||
    a.title.localeCompare(b.title, 'en', { numeric: true }) ||
    a.id.localeCompare(b.id);
  const ready = tasks
      .filter((task) => !dependencies.get(task.id)!.size)
      .sort(compare),
    ordered: T[] = [],
    visited = new Set<string>();
  while (ready.length) {
    const task = ready.shift()!;
    ordered.push(task);
    visited.add(task.id);
    for (const id of consumers.get(task.id)!) {
      const remaining = dependencies.get(id)!;
      remaining.delete(task.id);
      if (!remaining.size) ready.push(byId.get(id)!);
    }
    ready.sort(compare);
  }
  // A malformed imported graph must not silently hide its remaining tasks.
  return ordered.concat(
    tasks.filter((task) => !visited.has(task.id)).sort(compare),
  );
}

export function unfinishedDependencyCounts(
  tasks: readonly Pick<MissionTask, 'id' | 'status'>[],
  edges: readonly DependencyEdge[],
): Map<string, number> {
  const completed = new Set(
      tasks
        .filter((task) => ['succeeded', 'accepted'].includes(task.status))
        .map((task) => task.id),
    ),
    unfinished = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (completed.has(edge.depends_on)) continue;
    const pending = unfinished.get(edge.task_id) || new Set<string>();
    pending.add(edge.depends_on);
    unfinished.set(edge.task_id, pending);
  }
  return new Map(
    tasks.map((task) => [task.id, unfinished.get(task.id)?.size || 0]),
  );
}
