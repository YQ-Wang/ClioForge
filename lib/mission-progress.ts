import type { Mission, MissionTask } from './platform/types';

type ProgressTask = Pick<MissionTask, 'id' | 'title' | 'executor' | 'status'>;
export function missionProgress(
  mission: Pick<Mission, 'status'>,
  tasks: ProgressTask[],
) {
  const automatic = tasks.filter(
    (t) =>
      ['queued', 'running', 'ready'].includes(t.status) &&
      ['builtin', 'model'].includes(t.executor),
  );
  const attention = tasks.filter((t) =>
    ['failed', 'uncertain', 'stale', 'rejected'].includes(t.status),
  );
  const review = tasks.filter(
    (t) =>
      t.status === 'review' ||
      (t.executor === 'human' && ['ready', 'running'].includes(t.status)),
  );
  const external = tasks.filter(
    (t) =>
      t.executor === 'external' &&
      ['ready', 'queued', 'running'].includes(t.status),
  );
  const done = tasks.filter((t) =>
    ['accepted', 'succeeded'].includes(t.status),
  ).length;
  const state =
    mission.status !== 'active'
      ? mission.status
      : automatic.length
        ? 'working'
        : attention.length
          ? 'attention'
          : review.length
            ? 'review'
            : external.length
              ? 'external'
              : 'waiting';
  return {
    state,
    automatic,
    attention,
    review,
    external,
    done,
    total: tasks.length,
  };
}
