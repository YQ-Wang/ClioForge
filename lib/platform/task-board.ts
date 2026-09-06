import { z } from 'zod';
import { HttpError } from '../errors';
import { orderedTasks, taskColumn } from '../task-presentation';
import type { MissionStore } from './missions';
import type { MissionTask, MissionView } from './types';

type Board = NonNullable<MissionView['board']>;
export function humanBoardStage(row: {
  id: string;
  revision: number;
  status: string;
  board_body: string | null;
}) {
  if (!row.board_body || row.status !== 'ready') return undefined;
  const entry = (JSON.parse(row.board_body) as Board).stages[row.id];
  return entry?.revision === row.revision ? entry.stage : undefined;
}
export const boardBodySchema = z.object({
  order: z.array(z.uuid()).max(1200),
  stages: z.record(
    z.uuid(),
    z.object({
      stage: z.enum(['planned', 'active', 'waiting']),
      revision: z.number().int().positive(),
    }),
  ),
});
export async function loadBoard(
  db: D1Database,
  mission: string,
  tasks: MissionTask[],
) {
  const row = await db
    .prepare('SELECT revision,body FROM mission_boards WHERE mission_id=?')
    .bind(mission)
    .first<{ revision: number; body: string }>();
  const board: Board = row
    ? { ...boardBodySchema.parse(JSON.parse(row.body)), revision: row.revision }
    : { revision: 0, order: [], stages: {} };
  return {
    board,
    tasks: tasks.map((task) => ({
      ...task,
      board_stage:
        board.stages[task.id]?.revision === task.revision
          ? board.stages[task.id].stage
          : undefined,
    })),
  };
}
export const boardMoveInput = z.object({
  task_id: z.uuid(),
  target: z.enum(['planned', 'active', 'waiting', 'review', 'done']),
  before_id: z.uuid().nullable(),
  expected: z.number().int().nonnegative(),
  task_revision: z.number().int().positive(),
});
export type BoardMove = z.infer<typeof boardMoveInput>;
export async function moveBoardTask(
  store: MissionStore,
  projectId: string,
  missionId: string,
  raw: unknown,
) {
  const input = boardMoveInput.parse(raw);
  const mission = await store.mission(missionId, 'write');
  if (mission.project_id !== projectId)
    throw new HttpError(404, '研究计划不属于此项目。');
  const view = await store.view(missionId),
    board = view.board!;
  const task = view.tasks.find((t) => t.id === input.task_id);
  if (!task) throw new HttpError(404, '任务不属于此研究计划。');
  if (
    board.revision !== input.expected ||
    task.revision !== input.task_revision
  )
    throw new HttpError(409, '看板或任务已更新，请刷新后重试。');
  const from = taskColumn(task, mission),
    crossing = from !== input.target;
  if (
    crossing &&
    !(
      task.executor === 'human' &&
      task.status === 'ready' &&
      mission.status === 'active' &&
      input.target !== 'done'
    )
  )
    throw new HttpError(
      409,
      '此状态由执行或人工审读决定，请打开任务完成对应操作。',
    );
  if (
    crossing &&
    view.edges.some(
      (e) =>
        e.task_id === task.id &&
        !view.tasks.some(
          (t) =>
            t.id === e.depends_on &&
            ['succeeded', 'accepted'].includes(t.status),
        ),
    )
  )
    throw new HttpError(409, '请先完成前置任务，再安排这一步。');
  const before =
    input.before_id && view.tasks.find((t) => t.id === input.before_id);
  if (
    input.before_id &&
    (!before ||
      before.id === task.id ||
      taskColumn(before, mission) !== input.target)
  )
    throw new HttpError(409, '放置位置已变化，请刷新看板。');
  const natural = orderedTasks(view.tasks, view.edges).map((t) => t.id);
  const order = [
    ...new Set([
      ...board.order.filter((id) => natural.includes(id)),
      ...natural,
    ]),
  ].filter((id) => id !== task.id);
  order.splice(
    input.before_id ? order.indexOf(input.before_id) : order.length,
    0,
    task.id,
  );
  const stages = { ...board.stages };
  if (crossing) {
    if (input.target === 'review') delete stages[task.id];
    else
      stages[task.id] = {
        stage: input.target as 'planned' | 'active' | 'waiting',
        revision: task.revision,
      };
  }
  const snapshot = JSON.stringify(
      view.tasks.map((t) => ({ id: t.id, revision: t.revision })),
    ),
    token = crypto.randomUUID(),
    date = new Date().toISOString();
  const saved = await store.db.batch([
    store.db
      .prepare('INSERT OR IGNORE INTO mission_boards(mission_id) VALUES(?)')
      .bind(missionId),
    store.db
      .prepare(
        "UPDATE mission_boards SET body=?,revision=revision+1,mutation_token=? WHERE mission_id=? AND revision=? AND EXISTS(SELECT 1 FROM missions WHERE id=? AND revision=?) AND (SELECT COUNT(*) FROM mission_tasks WHERE mission_id=?)=? AND NOT EXISTS(SELECT 1 FROM mission_tasks t LEFT JOIN json_each(?) s ON json_extract(s.value,'$.id')=t.id WHERE t.mission_id=? AND (s.value IS NULL OR t.revision<>json_extract(s.value,'$.revision')))",
      )
      .bind(
        JSON.stringify({ order, stages }),
        token,
        missionId,
        input.expected,
        missionId,
        mission.revision,
        missionId,
        view.tasks.length,
        snapshot,
        missionId,
      ),
    store.db
      .prepare(
        "INSERT INTO task_events(task_id,mission_id,actor,kind,detail,created_at) SELECT ?,mission_id,?,'board_moved',?,? FROM mission_boards WHERE mission_id=? AND mutation_token=?",
      )
      .bind(
        task.id,
        store.owner,
        JSON.stringify({
          title: task.title,
          from,
          to: input.target,
          before: input.before_id,
        }),
        date,
        missionId,
        token,
      ),
  ]);
  if (!saved[1].meta.changes)
    throw new HttpError(409, '任务或看板已有更新，请刷新后重试。');
  // Presentation and human work intent never dispatch agents or accept findings.
  return store.view(missionId);
}
