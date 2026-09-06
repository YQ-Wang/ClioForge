'use client';
import { useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  closestCenter,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/i18n/provider';
import { taskColumns, taskColumn } from '@/lib/task-presentation';
import type { MissionView, MissionTask } from '@/lib/platform/types';
import type { BoardMove } from '@/lib/platform/task-board';
import './task-board.css';

const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (args.pointerCoordinates)
    return hits.filter((hit) => !String(hit.id).startsWith('column:')).length
      ? hits.filter((hit) => !String(hit.id).startsWith('column:'))
      : hits;
  return closestCenter(args);
};
function Column({
  id,
  title,
  count,
  children,
  register,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
  register: (node: HTMLElement | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${id}` });
  return (
    <section
      ref={(node) => {
        setNodeRef(node);
        register(node);
      }}
      tabIndex={-1}
      className={`research-kanban-column ${isOver ? 'is-drop-target' : ''}`}
      aria-label={title}
    >
      <h3>
        {title}
        <span>{count}</span>
      </h3>
      <div>{children}</div>
    </section>
  );
}
function MovableCard({
  task,
  disabled,
  readOnly,
  children,
  move,
  first,
  last,
}: {
  task: MissionTask;
  disabled: boolean;
  readOnly: boolean;
  children: ReactNode;
  move: (target: string, where: 'top' | 'bottom' | 'up' | 'down') => void;
  first: boolean;
  last: boolean;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`board-card-wrap ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children}
      {!readOnly && (
        <div className="board-card-controls">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="board-drag-handle"
            disabled={disabled}
            aria-label={L(
              `拖动任务：${task.title}`,
              `Drag task: ${task.title}`,
            )}
            title={L(
              '拖动调整位置；也可按空格、方向键、空格',
              'Drag to move; or Space, arrow keys, Space',
            )}
          >
            <GripVertical size={16} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="icon-xs" variant="ghost" />}
              disabled={disabled}
              aria-label={L(
                `移动任务：${task.title}`,
                `Move task: ${task.title}`,
              )}
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={first} onClick={() => move('', 'up')}>
                <ArrowUp size={14} />
                {L('上移一位', 'Move up')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={last}
                onClick={() => move('', 'down')}
              >
                <ArrowDown size={14} />
                {L('下移一位', 'Move down')}
              </DropdownMenuItem>
              {taskColumns.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => move(c.id, 'top')}>
                  {L(`移至${c.zh}`, `Move to ${c.en}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
export default function TaskBoard({
  view,
  tasks,
  status,
  limit,
  onMore,
  card,
  onMove,
  onSelect,
  canWrite,
}: {
  view: MissionView;
  tasks: MissionTask[];
  status: string;
  limit: number;
  onMore: () => void;
  card: (t: MissionTask) => ReactNode;
  onMove: (move: BoardMove) => Promise<void>;
  onSelect: (id: string, explanation?: string) => void;
  canWrite: boolean;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [dragging, setDragging] = useState(''),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(''),
    [failed, setFailed] = useState(false);
  const pending = useRef(false),
    dragSnapshot = useRef({ revision: 0, taskRevision: 0 }),
    board = useRef<HTMLDivElement>(null),
    cols = useRef<Record<string, HTMLElement | null>>({});
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const rank = new Map((view.board?.order || []).map((id, i) => [id, i]));
  const sorted = [...tasks].sort(
    (a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9),
  );
  const group = (target: string) =>
    sorted.filter((t) => taskColumn(t, view.mission) === target);
  async function move(
    task: MissionTask,
    target: string,
    before: string | null,
    expected = view.board?.revision || 0,
    taskRevision = task.revision,
  ) {
    if (pending.current || !canWrite) return;
    const current = taskColumn(task, view.mission);
    setFailed(false);
    if (
      target !== current &&
      !(
        task.executor === 'human' &&
        task.status === 'ready' &&
        view.mission.status === 'active' &&
        target !== 'done'
      )
    ) {
      onSelect(
        task.id,
        L(
          '卡片尚未改变状态。请在这里提交成果、完成审读或处理等待原因，然后再继续。',
          'The status has not changed. Submit your work, complete the review or resolve the blocker here to continue.',
        ),
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setFeedback(L('正在保存看板…', 'Saving board…'));
    try {
      await onMove({
        task_id: task.id,
        target: target as BoardMove['target'],
        before_id: before,
        expected,
        task_revision: taskRevision,
      });
      if (target !== current)
        requestAnimationFrame(() => {
          const column = cols.current[target];
          if (column && board.current)
            board.current.scrollLeft +=
              column.getBoundingClientRect().left -
              board.current.getBoundingClientRect().left;
        });
      setFeedback(
        L(
          '看板已保存，项目成员会看到最新安排。',
          'Board saved. Project members see the updated arrangement.',
        ),
      );
    } catch (e) {
      setFailed(true);
      setFeedback(
        e instanceof Error
          ? e.message
          : L('保存失败，请重试。', 'Could not save. Please try again.'),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function menuMove(
    task: MissionTask,
    target: string,
    where: 'top' | 'bottom' | 'up' | 'down',
  ) {
    const column = target || taskColumn(task, view.mission),
      peers = group(column),
      at = peers.findIndex((t) => t.id === task.id);
    const remaining = peers.filter((t) => t.id !== task.id);
    const before =
      where === 'up'
        ? peers[at - 1]?.id
        : where === 'down'
          ? peers[at + 2]?.id
          : where === 'top'
            ? remaining[0]?.id
            : undefined;
    void move(task, column, before || null);
  }
  function dropped(event: DragEndEvent) {
    setDragging('');
    if (!event.over) {
      setFeedback(
        L(
          '已取消移动，原来的安排已保留。',
          'Move cancelled. The arrangement is unchanged.',
        ),
      );
      return;
    }
    if (event.active.id === event.over.id) return;
    const task = tasks.find((t) => t.id === event.active.id);
    if (!task) return;
    const over = tasks.find((t) => t.id === event.over!.id),
      target = over
        ? taskColumn(over, view.mission)
        : String(event.over.id).replace('column:', '');
    const peers = group(target).filter((t) => t.id !== task.id);
    const below =
      event.active.rect.current.translated &&
      event.active.rect.current.translated.top +
        event.active.rect.current.translated.height / 2 >
        event.over.rect.top + event.over.rect.height / 2;
    const before = over
      ? below
        ? peers[peers.findIndex((t) => t.id === over.id) + 1]?.id
        : over.id
      : undefined;
    void move(
      task,
      target,
      before || null,
      dragSnapshot.current.revision,
      dragSnapshot.current.taskRevision,
    );
  }
  return (
    <div className="task-board" aria-busy={busy}>
      <p className="board-help">
        {canWrite
          ? L(
              '拖动手柄或用 ⋯ 菜单调整安排。人工任务可标记进行或暂缓；完成需要提交与审读。排序不改变任务依赖与助手执行顺序。',
              'Drag the handle or use the ⋯ menu. Mark human work as in progress or on hold; completion requires submission and review. Ordering does not change dependencies or agent execution order.',
            )
          : L(
              '你可以查看看板；调整任务需要项目编辑权限。',
              'You can view this board. Editing permission is required to move tasks.',
            )}
      </p>
      {feedback && (
        <output
          className={`board-feedback ${failed ? 'is-error' : ''}`}
          role={failed ? 'alert' : 'status'}
        >
          {feedback}
        </output>
      )}
      {status === 'all' && (
        <nav
          className="kanban-jump-controls"
          aria-label={L('跳转到看板状态', 'Jump to a board status')}
        >
          {taskColumns.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant="outline"
              onClick={() => {
                const el = cols.current[c.id];
                if (el && board.current) {
                  board.current.scrollLeft +=
                    el.getBoundingClientRect().left -
                    board.current.getBoundingClientRect().left;
                  el.focus({ preventScroll: true });
                }
              }}
            >
              {L(c.zh, c.en)}
              <span>{group(c.id).length}</span>
            </Button>
          ))}
        </nav>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        onDragStart={(e) => {
          const t = tasks.find((t) => t.id === e.active.id);
          dragSnapshot.current = {
            revision: view.board?.revision || 0,
            taskRevision: t?.revision || 0,
          };
          setDragging(String(e.active.id));
        }}
        onDragCancel={() => {
          setDragging('');
          setFeedback(L('已取消移动。', 'Move cancelled.'));
        }}
        onDragEnd={dropped}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) =>
              L(
                `已拾起：${tasks.find((t) => t.id === active.id)?.title}`,
                `Picked up: ${tasks.find((t) => t.id === active.id)?.title}`,
              ),
            onDragOver: ({ over }) => {
              const target = tasks.find((t) => t.id === over?.id);
              const column = taskColumns.find(
                (c) => `column:${c.id}` === over?.id,
              );
              return over
                ? L(
                    `当前位置：${target?.title || column?.zh}`,
                    `Over: ${target?.title || column?.en}`,
                  )
                : L(
                    '看板外，放开将取消移动。',
                    'Outside the board. Dropping will cancel.',
                  );
            },
            onDragEnd: () =>
              L('已放下，请留意保存结果。', 'Dropped. Check the save status.'),
            onDragCancel: () => L('已取消移动。', 'Move cancelled.'),
          },
          screenReaderInstructions: {
            draggable: L(
              '按空格拾起任务，用方向键移动，再按空格放下。按 Escape 取消。也可使用移动菜单。',
              'Press Space to pick up, arrows to move, Space to drop, or Escape to cancel. The move menu is also available.',
            ),
          },
        }}
      >
        <div
          className={`research-kanban ${status !== 'all' ? 'is-filtered' : ''}`}
          ref={board}
        >
          {taskColumns
            .filter((c) => status === 'all' || status === c.id)
            .map((c) => {
              const items = group(c.id).slice(0, limit);
              return (
                <Column
                  key={c.id}
                  id={c.id}
                  title={L(c.zh, c.en)}
                  count={group(c.id).length}
                  register={(node) => {
                    cols.current[c.id] = node;
                  }}
                >
                  <SortableContext
                    items={items.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {items.map((t, i) => (
                      <MovableCard
                        key={t.id}
                        task={t}
                        disabled={!canWrite || busy}
                        readOnly={!canWrite}
                        first={i === 0}
                        last={i === group(c.id).length - 1}
                        move={(target, where) => menuMove(t, target, where)}
                      >
                        {card(t)}
                      </MovableCard>
                    ))}
                  </SortableContext>
                  {!items.length && (
                    <p className="kanban-empty">
                      {dragging
                        ? L('放到这里', 'Drop here')
                        : L('此状态暂无任务', 'No tasks in this status')}
                    </p>
                  )}
                  {group(c.id).length > limit && (
                    <Button variant="ghost" onClick={onMore}>
                      {L('显示更多任务', 'Show more tasks')}
                    </Button>
                  )}
                </Column>
              );
            })}
        </div>
        <DragOverlay>
          {dragging && (
            <div className="board-drag-preview">
              {tasks.find((t) => t.id === dragging)?.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
