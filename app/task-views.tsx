'use client';
import { useMemo, useState } from 'react';
import {
  Search,
  UserRound,
  Bot,
  ArrowRight,
  Cog,
  Plug,
  X,
  ListChecks,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useI18n } from '@/lib/i18n/provider';
import {
  taskColumns,
  taskColumn,
  taskProgressLabels,
  orderedTasks,
  unfinishedDependencyCounts,
} from '@/lib/task-presentation';
import TaskBoard from './task-board';
import type { BoardMove } from '@/lib/platform/task-board';
import type { MissionView, MissionTask } from '@/lib/platform/types';

export default function TaskViews({
  view,
  mode,
  members,
  onSelect,
  selected,
  onMove,
  canWrite,
}: {
  view: MissionView;
  mode: 'list' | 'board';
  members: { user_id: string; name: string }[];
  onSelect: (id: string, explanation?: string) => void;
  selected: string;
  onMove: (move: BoardMove) => Promise<void>;
  canWrite: boolean;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [query, setQuery] = useState(''),
    [who, setWho] = useState('all'),
    [status, setStatus] = useState('all'),
    [limit, setLimit] = useState(40);
  const sorted = useMemo(
      () => orderedTasks(view.tasks, view.edges),
      [view.tasks, view.edges],
    ),
    unfinished = useMemo(
      () => unfinishedDependencyCounts(view.tasks, view.edges),
      [view.tasks, view.edges],
    ),
    search = query.trim().toLocaleLowerCase(locale),
    matching = sorted.filter(
      (task) =>
        task.title.toLocaleLowerCase(locale).includes(search) &&
        (who === 'all' || task.executor === who),
    ),
    tasks = matching.filter(
      (task) => status === 'all' || taskColumn(task, view.mission) === status,
    ),
    hasFilters = !!search || who !== 'all' || status !== 'all';
  const counts = new Map(
    taskColumns.map((column) => [
      column.id,
      matching.filter((task) => taskColumn(task, view.mission) === column.id)
        .length,
    ]),
  );
  function resetFilters() {
    setQuery('');
    setWho('all');
    setStatus('all');
    setLimit(40);
  }
  function executorLabel(task: MissionTask) {
    if (task.executor === 'builtin') return L('自动步骤', 'Automatic step');
    if (task.executor === 'model') return L('模型助手', 'Model assistant');
    if (task.executor === 'external')
      return L('外部助手', 'External assistant');
    return (
      members.find(
        (member) => member.user_id === (task.assignee || task.claimed_by),
      )?.name ||
      (task.assignee && /^[a-f0-9-]{36}$/i.test(task.assignee)
        ? L('已分配研究者', 'Assigned researcher')
        : ['accepted', 'succeeded'].includes(task.status)
          ? L('研究者', 'Researcher')
          : L('待安排研究者', 'Researcher to assign'))
    );
  }
  function taskNote(task: MissionTask) {
    if (task.status === 'uncertain')
      return L(
        '检查费用与记录后再决定重试。',
        'Check cost and records before retrying.',
      );
    if (task.status === 'succeeded' && task.executor === 'model')
      return L(
        '模型产物，尚不代表研究判断已通过。',
        'Model output; not an accepted research finding.',
      );
    if (task.board_stage === 'active')
      return L('研究者正在处理', 'Researcher is working on this');
    if (task.board_stage === 'waiting')
      return L('研究者暂缓处理', 'Researcher put this on hold');
    if (task.status !== 'blocked') return '';
    const count = unfinished.get(task.id) || 0;
    if (count)
      return L(
        `等待 ${count} 个未完成的前置步骤`,
        `Waiting for ${count} unfinished ${count === 1 ? 'dependency' : 'dependencies'}`,
      );
    if (view.mission.status === 'draft')
      return L(
        '启动研究计划后可开展。',
        'Available when the research plan starts.',
      );
    if (view.mission.status === 'paused')
      return L(
        '恢复研究计划后可继续。',
        'Continue after resuming the research plan.',
      );
    if (view.mission.status === 'cancelled')
      return L('所在研究计划已取消。', 'This research plan was cancelled.');
    return L(
      '前置步骤已完成，等待状态更新。',
      'Dependencies complete; waiting for a status update.',
    );
  }
  function card(task: MissionTask) {
    const note = taskNote(task),
      ExecutorIcon =
        task.executor === 'human'
          ? UserRound
          : task.executor === 'builtin'
            ? Cog
            : task.executor === 'external'
              ? Plug
              : Bot;
    return (
      <button
        type="button"
        key={task.id}
        className={`research-task-card ${task.id === selected ? 'is-selected' : ''}`}
        onClick={() => onSelect(task.id)}
        aria-pressed={task.id === selected}
      >
        <span className="task-card-title">
          <span className={`flow-status state-${task.status}`}>
            {taskProgressLabels(task, view.mission)[locale === 'en' ? 1 : 0]}
          </span>
          <strong>{task.title}</strong>
          {note && <small className="task-card-note">{note}</small>}
        </span>
        <span className="task-card-footer">
          <span className="task-card-owner">
            <ExecutorIcon size={14} aria-hidden="true" />
            {executorLabel(task)}
          </span>
          <span className="task-card-meta">
            {L(
              `${task.input.version_ids.length} 份材料`,
              `${task.input.version_ids.length} ${task.input.version_ids.length === 1 ? 'source' : 'sources'}`,
            )}
            {task.cost_units > 0
              ? ` · $${(task.cost_units / 1e6).toFixed(4)}`
              : ''}
          </span>
          <span className="task-card-open">
            {L('查看任务', 'Open task')}
            <ArrowRight size={14} aria-hidden="true" />
          </span>
        </span>
      </button>
    );
  }
  return (
    <section
      className="research-task-view"
      aria-label={L('研究任务', 'Research tasks')}
    >
      <div className="task-view-filters">
        <div className="task-search-input">
          <Search size={16} aria-hidden="true" />
          <Input
            type="search"
            aria-label={L('搜索研究任务', 'Search research tasks')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(40);
            }}
            placeholder={L(
              '查找研究问题或步骤',
              'Find a research question or step',
            )}
          />
        </div>
        <NativeSelect
          size="sm"
          className="task-executor-filter"
          aria-label={L('筛选执行者', 'Filter executor')}
          value={who}
          onChange={(e) => {
            setWho(e.target.value);
            setLimit(40);
          }}
        >
          <NativeSelectOption value="all">
            {L('全部执行者', 'All executors')}
          </NativeSelectOption>
          <NativeSelectOption value="human">
            {L('研究者', 'Researchers')}
          </NativeSelectOption>
          <NativeSelectOption value="model">
            {L('模型助手', 'Model assistants')}
          </NativeSelectOption>
          <NativeSelectOption value="builtin">
            {L('自动步骤', 'Automatic steps')}
          </NativeSelectOption>
          <NativeSelectOption value="external">
            {L('外部助手', 'External assistants')}
          </NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          size="sm"
          className="task-status-filter"
          aria-label={L('筛选任务状态', 'Filter task status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setLimit(40);
          }}
        >
          <NativeSelectOption value="all">
            {L('全部状态', 'All statuses')}
          </NativeSelectOption>
          {taskColumns.map((column) => (
            <NativeSelectOption key={column.id} value={column.id}>
              {L(column.zh, column.en)} · {counts.get(column.id)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="task-filter-reset"
            onClick={resetFilters}
          >
            <X size={14} aria-hidden="true" />
            {L('清除筛选', 'Clear filters')}
          </Button>
        )}
      </div>
      <div className="task-view-summary">
        <p className="task-view-caption">
          {L(
            '打开任务可安排成员、继续追问或处理等待事项。',
            'Open a task to assign a researcher, follow up or resolve a blocker.',
          )}
        </p>
        <output className="task-result-count">
          {hasFilters
            ? L(
                `${tasks.length} / ${view.tasks.length} 个步骤`,
                `${tasks.length} of ${view.tasks.length} steps`,
              )
            : L(
                `${tasks.length} 个步骤`,
                `${tasks.length} ${tasks.length === 1 ? 'step' : 'steps'}`,
              )}
        </output>
      </div>
      {!tasks.length ? (
        <div className="task-view-empty">
          <ListChecks size={26} strokeWidth={1.5} aria-hidden="true" />
          <h3>
            {hasFilters
              ? L('没有匹配的任务', 'No matching tasks')
              : L('研究计划还没有任务', 'No tasks in this plan yet')}
          </h3>
          <p>
            {hasFilters
              ? L(
                  '尝试其他关键词、执行者或状态，或清除筛选查看全部步骤。',
                  'Try another search, executor or status, or clear filters to see every step.',
                )
              : L(
                  '添加研究步骤后，可以在这里跟进执行与审读进展。',
                  'Research steps will appear here as they are added to this plan.',
                )}
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              {L('清除筛选', 'Clear filters')}
            </Button>
          )}
        </div>
      ) : mode === 'board' ? (
        <TaskBoard
          view={view}
          tasks={tasks}
          status={status}
          limit={limit}
          onMore={() => setLimit((n) => n + 40)}
          card={card}
          onMove={async (move) => {
            if (status !== 'all' && status !== move.target) setStatus('all');
            await onMove(move);
          }}
          onSelect={onSelect}
          canWrite={canWrite}
        />
      ) : (
        <div className="research-task-list">
          {tasks.slice(0, limit).map(card)}
          {tasks.length > limit && (
            <Button
              variant="outline"
              className="task-show-more"
              onClick={() => setLimit((count) => count + 40)}
            >
              {L(
                `再显示 ${Math.min(40, tasks.length - limit)} 个步骤`,
                `Show ${Math.min(40, tasks.length - limit)} more ${tasks.length - limit === 1 ? 'step' : 'steps'}`,
              )}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
