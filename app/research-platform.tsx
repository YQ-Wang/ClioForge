'use client';
import ResearchRepair from './research-repair';
import ResearchLibrary from './research-library';
import { canRepairProse } from '@/lib/review-citations';
import { importSampleBatches, type SampleBatch } from '@/lib/sample-import';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Download,
  FileCheck2,
  FolderOpen,
  GitBranch,
  KeyRound,
  LayoutGrid,
  Link2,
  List,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Square,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import {
  navigateWorkspace,
  useWorkspaceSearch,
} from '@/hooks/use-workspace-route';
import { useReviewDraft } from '@/hooks/use-review-draft';
import {
  missionPath,
  researchRoute,
  type TaskViewMode,
} from '@/lib/research-navigation';
import './research-workbench.css';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import CloudConnections from './cloud-connections';
import { formText } from '@/lib/form-values';
import { api, downloadJson } from '@/lib/client-api';
import ProjectMembers from './project-members';
import { useI18n } from '@/lib/i18n/provider';
import {
  graphLevels,
  type MissionView,
  type MissionTask,
  type MissionDraft,
} from '@/lib/platform/types';
import StudyRecords from './study-records';
import SeminarTranscript from './seminar-transcript';
import ReviewDashboard from './review-dashboard';
import MethodEvaluation from './method-evaluation';
import MethodReportPanel from './method-report';
import EvidenceDiscussion from './evidence-discussion';
import SemanticSearch from './semantic-search';
import ResearchRecords from './research-records';
import ResearchCandidates from './research-candidates';
import {
  agentRecipe,
  interleavePages,
  recipeKinds,
  recipeLabels,
  type RecipeKind,
  type ResearchMethod,
} from '@/lib/platform/research-recipes';
import { researchTemplate } from '@/lib/platform/templates';
import type { Project, Source, SourceVersion } from '@/lib/types';
import type { SearchHit } from '@/lib/platform/search';
import ClaimAssessments from './claim-assessments';
import TaskViews from './task-views';
import { taskStatusLabels, taskProgressLabels } from '@/lib/task-presentation';
import TaskConversation from './task-conversation';
import ResearchResult from './research-result';
import { reportMarkdown } from '@/lib/research-report';
import { sourcePath } from '@/lib/navigation';
import { DEFAULT_RESEARCH_MODEL, GLM_PRICE_CEILING } from '@/lib/model-routing';
import type { Model } from '@/lib/types';
import type { WorkbenchData } from '@/lib/workbench-types';
import type { Artifact } from '@/lib/platform/types';
type Overview = {
  project: Project & { role: string };
  missions: {
    id: string;
    title: string;
    status: string;
    task_count: number;
    done_count: number;
  }[];
  members: { user_id: string; role: string; name: string; email: string }[];
  comments: {
    id: string;
    body: string;
    author_name: string;
    created_at: string;
    resolved: number;
    target_id: string;
  }[];
  artifacts: {
    id: string;
    title: string;
    research_title?: string | null;
    mission_id?: string | null;
    summary_excerpt?: string | null;
    kind: string;
    sha256: string;
    outdated?: number;
    license: string;
    created_by: string;
    created_at: string;
  }[];
  credentials: {
    id: string;
    label: string;
    expires_at: string;
    revoked_at: string | null;
    last_used_at: string | null;
  }[];
  aliases: { id: string; term: string; variants: string; basis: string }[];
  index: { versions: number; indexed_versions: number; pages: number };
};
const stateText: Record<string, [string, string]> = {
  draft: ['草案', 'Draft'],
  active: ['已启动', 'Started'],
  paused: ['已暂停', 'Paused'],
  completed: ['已完成', 'Completed'],
  ...taskStatusLabels,
};
function useWords() {
  const { locale } = useI18n();
  return {
    locale,
    L: (zh: string, en: string) => (locale === 'en' ? en : zh),
    S: (state: string) => stateText[state]?.[locale === 'en' ? 1 : 0] || state,
  };
}
function roleLabel(value: string, L: (zh: string, en: string) => string) {
  const labels: Record<string, [string, string]> = {
    builtin: ['自动整理', 'Automatic assistance'],
    model: ['研究助手', 'Research assistant'],
    human: ['研究者', 'Researcher'],
    external: ['协作工具', 'Connected tool'],
    Search: ['寻找材料', 'Source discovery'],
    Comparison: ['材料比较', 'Source comparison'],
    Analysis: ['词语统计', 'Term analysis'],
    Verification: ['引文检查', 'Citation checks'],
    Publication: ['成果汇编', 'Report preparation'],
    Researcher: ['研究者', 'Researcher'],
  };
  return labels[value] ? L(...labels[value]) : value;
}
function assigneeLabel(
  task: MissionTask,
  members: Overview['members'],
  L: (zh: string, en: string) => string,
) {
  return (
    members.find((m) => m.user_id === task.assignee)?.name ||
    roleLabel(
      task.executor === 'human' ? 'human' : task.assignee || task.executor,
      L,
    )
  );
}
function Status({ status }: { status: string }) {
  const { S } = useWords();
  return (
    <span className={`flow-status state-${status}`}>
      <i />
      {S(status)}
    </span>
  );
}
export default function ResearchPlatform({
  userId,
  project,
  sources,
  versions,
  onOpenSource,
  onRefresh,
  onImport,
  models,
  budget,
  onNote,
  section = 'missions',
}: {
  userId: string;
  section?: string;
  project: Project;
  sources: Source[];
  versions: SourceVersion[];
  onOpenSource: (sourceId: string, versionId: string, page: number) => void;
  onRefresh: () => Promise<unknown>;
  onImport: () => void;
  models: Model[];
  budget: WorkbenchData['budget'];
  onNote: (title: string, text: string) => void;
}) {
  const { L, locale } = useWords();
  const [overview, setOverview] = useState<Overview | null>(null),
    [view, setView] = useState<MissionView | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [create, setCreate] = useState(false),
    [query, setQuery] = useState(''),
    [approximate, setApproximate] = useState(true),
    [searched, setSearched] = useState(false),
    [hits, setHits] = useState<SearchHit[]>([]),
    [secret, setSecret] = useState('');
  const [discussionTargetId, setDiscussionTargetId] = useState('');
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get(
      'discussion',
    );
    setDiscussionTargetId(
      target && /^[a-f0-9-]{36}$/i.test(target) ? target : '',
    );
  }, [project.id]);
  const [report, setReport] = useState<Artifact | null>(null);
  const routeSearch = useWorkspaceSearch();
  const route = researchRoute(routeSearch, project.id);
  const selected = route.task,
    taskView = route.mode;
  const [loadingMission, setLoadingMission] = useState(false);
  const requestSequence = useRef(0);
  const currentRoute = useRef({
    projectId: project.id,
    mission: route.mission,
  });
  currentRoute.current = { projectId: project.id, mission: route.mission };
  const mounted = useRef(true);
  const invalidateRequests = useCallback(() => {
    requestSequence.current++;
  }, []);
  const deactivate = useCallback(() => {
    mounted.current = false;
    invalidateRequests();
  }, [invalidateRequests]);
  useEffect(() => {
    mounted.current = true;
    return deactivate;
  }, [deactivate]);
  const taskListRef = useRef<HTMLDivElement>(null);
  const [moveExplanation, setMoveExplanation] = useState({ id: '', text: '' });
  function selectTask(id: string, explanation = '') {
    setMoveExplanation({ id, text: explanation });
    navigateWorkspace(
      missionPath(project.id, view?.mission.id || route.mission, id, taskView),
    );
    if (!id)
      requestAnimationFrame(() =>
        taskListRef.current?.scrollIntoView({ block: 'start' }),
      );
  }
  function selectTaskView(mode: TaskViewMode) {
    navigateWorkspace(missionPath(project.id, route.mission, '', mode), true);
  }
  function sourceLabel(versionId: string) {
    const version = versions.find((v) => v.id === versionId);
    return (
      sources.find((s) => s.id === version?.source_id)?.title ||
      L('原始资料', 'Original source')
    );
  }
  function openVersion(versionId: string, page: number) {
    const version = versions.find((v) => v.id === versionId);
    if (version) onOpenSource(version.source_id, versionId, page);
    else
      setMessage(
        L(
          '此资料不在当前项目中，请联系共享成果的研究者查看原件。',
          'This source is outside the current project. Ask the researcher who shared the finding for the original.',
        ),
      );
  }
  function downloadReport(artifact: Artifact) {
    const text = reportMarkdown(
      artifact.title,
      artifact.body,
      sourceLabel,
      locale,
      artifact.license,
      (version, page) =>
        new URL(sourcePath(project.id, version, page), window.location.origin)
          .href,
    );
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/markdown;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/[^\p{L}\p{N}_-]/gu, '_')}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const refresh = useCallback(
    async (missionId?: string) => {
      const sequence = ++requestSequence.current;
      const [data, detail] = await Promise.all([
        api<Overview>(`/api/platform?project_id=${project.id}`),
        missionId
          ? api<MissionView>(
              `/api/platform?project_id=${project.id}&mission_id=${missionId}`,
            )
          : Promise.resolve(null),
      ]);
      if (
        !mounted.current ||
        sequence !== requestSequence.current ||
        currentRoute.current.projectId !== project.id ||
        currentRoute.current.mission !== (missionId || '')
      )
        return;
      setOverview(data);
      setView(detail);
    },
    [project.id],
  );
  useEffect(() => {
    let live = true;
    setView(null);
    setMessage('');
    setLoadingMission(!!route.mission);
    void refresh(route.mission || undefined)
      .catch((error) => {
        if (live) setMessage(error.message);
      })
      .finally(() => {
        if (live) setLoadingMission(false);
      });
    return () => {
      live = false;
      invalidateRequests();
    };
  }, [refresh, route.mission, invalidateRequests]);
  const liveMissionId = view?.mission.id,
    liveMissionStatus = view?.mission.status;
  useEffect(() => {
    if (
      !liveMissionId ||
      !['active', 'paused'].includes(liveMissionStatus || '')
    )
      return;
    const id = liveMissionId;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible')
        void refresh(id).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [liveMissionId, liveMissionStatus, refresh]);
  async function action(work: () => Promise<unknown>, propagate = false) {
    setBusy(true);
    setMessage('');
    try {
      await work();
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : L('操作失败', 'Operation failed'),
      );
      if (propagate) throw error;
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function mutate(actionName: string, value?: unknown, id?: string) {
    const response = await api<{ result: unknown }>('/api/platform', {
      action: actionName,
      project_id: project.id,
      id,
      value,
    });
    try {
      await refresh(currentRoute.current.mission || undefined);
    } catch {
      setMessage(
        L(
          '操作已保存，但最新状态未能载入。请刷新查看，无需重复提交。',
          'Saved, but the latest state could not be loaded. Refresh to view it; do not submit again.',
        ),
      );
    }
    return response.result;
  }
  async function openMission(id: string) {
    navigateWorkspace(missionPath(project.id, id, '', taskView));
  }
  const canWrite = overview?.project.role !== 'viewer',
    canReview = ['owner', 'reviewer'].includes(overview?.project.role || '');
  const task = view?.tasks.find((item) => item.id === selected);
  const nextReview = view?.tasks.find(
    (item) =>
      item.status === 'review' ||
      (item.executor === 'human' &&
        item.status === 'ready' &&
        view.mission.status === 'active' &&
        !['planned', 'waiting'].includes(item.board_stage || '')),
  );
  return (
    <div className="research-platform">
      {message && <output className="platform-notice">{message}</output>}
      {!overview || loadingMission || (route.mission && !view) ? (
        <div className="platform-empty">
          <Activity />
          {message
            ? L(
                '研究页面暂时未能载入。',
                'This research page could not be loaded.',
              )
            : L('正在读取研究平台…', 'Loading research platform…')}
          {message && (
            <Button
              variant="outline"
              onClick={() =>
                void action(() => refresh(route.mission || undefined))
              }
            >
              {L('重新载入', 'Try again')}
            </Button>
          )}
        </div>
      ) : (
        <>
          {section === 'missions' &&
            (!view ? (
              <>
                <div className="platform-heading">
                  <div>
                    <p className="eyebrow">
                      {L('从问题开始', 'BEGIN WITH A QUESTION')}
                    </p>
                    <h2>
                      {L(
                        '让助手推进材料工作，由你把握研究判断',
                        'Let assistance advance the source work',
                      )}
                    </h2>
                    <p>
                      {L(
                        '写下一个问题，选择要比较的材料。助手整理线索，你核查原文并作出判断。',
                        'Write a question and choose sources to compare. Assistance gathers leads; you check the originals and make the judgment.',
                      )}
                    </p>
                  </div>
                  <div className="flow-actions">
                    <Button
                      variant="outline"
                      disabled={!canWrite || busy}
                      onClick={() =>
                        void action(async () => {
                          const result = await importSampleBatches(
                            async (value) =>
                              (await mutate(
                                'import_dataset',
                                value,
                              )) as SampleBatch,
                            (completed, total) =>
                              setMessage(
                                L(
                                  `正在准备公开史料：${completed} / ${total}。中断后可重新点击，已保存的条目会跳过。`,
                                  `Preparing public sources: ${completed} / ${total}. If interrupted, start again; saved records are skipped.`,
                                ),
                              ),
                          );
                          await onRefresh();
                          setMessage(
                            L(
                              'LED 公开铭文已导入：',
                              'LED inscriptions imported: ',
                            ) +
                              result.imported +
                              L('，跳过重复：', ', duplicates skipped: ') +
                              result.skipped,
                          );
                        })
                      }
                    >
                      <Download size={16} />
                      {L('试读公开史料', 'Explore public sources')}
                    </Button>
                    <Button
                      disabled={!canWrite || busy}
                      onClick={() => setCreate(true)}
                    >
                      <Plus size={16} />
                      {L('新建研究计划', 'New research plan')}
                    </Button>
                  </div>
                </div>
                {!sources.length && (
                  <div className="next-review">
                    <FolderOpen size={22} />
                    <div>
                      <h3>{L('先选一批材料', 'Begin with your sources')}</h3>
                      <p>
                        {L(
                          '导入你的资料，或者试读上方的公开史料，再围绕一个问题展开比较。',
                          'Import your sources or explore the public sample above, then compare them around a question.',
                        )}
                      </p>
                    </div>
                    <Button onClick={onImport}>
                      {L('导入资料', 'Import sources')}
                    </Button>
                  </div>
                )}
                <div className="platform-metrics">
                  <Metric
                    title={L('研究计划', 'Missions')}
                    value={overview.missions.length}
                  />
                  <Metric
                    title={L('可检索页数', 'Searchable pages')}
                    value={overview.index.pages}
                  />
                  <Metric
                    title={L('研究成果', 'Findings')}
                    value={overview.artifacts.length}
                  />
                  <Metric
                    title={L('项目成员', 'Members')}
                    value={overview.members.length}
                  />
                </div>
                <div className="mission-grid">
                  {overview.missions.map((mission) => (
                    <button
                      key={mission.id}
                      className="mission-card"
                      onClick={() => void openMission(mission.id)}
                    >
                      <div>
                        <GitBranch size={20} />
                        <Status status={mission.status} />
                      </div>
                      <h3>{mission.title}</h3>
                      <p>
                        {mission.done_count} / {mission.task_count}{' '}
                        {L('任务已执行或采纳', 'tasks executed or accepted')}
                      </p>
                      <progress
                        value={mission.done_count}
                        max={mission.task_count || 1}
                      />
                      <span>
                        {L('查看流程与分工', 'Open workflow')}
                        <ArrowRight size={16} />
                      </span>
                    </button>
                  ))}
                </div>
                {!overview.missions.length && (
                  <div className="platform-empty">
                    <GitBranch size={32} />
                    <h3>
                      {L(
                        '从一项有明确材料范围的研究开始',
                        'Start with a bounded research question',
                      )}
                    </h3>
                    <p>
                      {L(
                        '内置流程包含检索、文本比较、可复算分析、引文检查和人工复核。执行状态会在这里持续更新。',
                        'The built-in workflow connects search, textual comparison, reproducible analysis, citation checks and human review. Execution states update here.',
                      )}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="platform-heading mission-detail-heading">
                  <div>
                    <button
                      className="back-link"
                      onClick={() => navigateWorkspace(missionPath(project.id))}
                    >
                      <ArrowLeft size={16} />
                      {L('所有研究计划', 'All missions')}
                    </button>
                    <h2 title={view.mission.title}>
                      {Array.from(view.mission.title).length > 88
                        ? Array.from(view.mission.title).slice(0, 88).join('') +
                          '…'
                        : view.mission.title}
                    </h2>
                    {Array.from(view.mission.question).length > 180 ? (
                      <details className="mission-question">
                        <summary>
                          {L(
                            '查看完整研究问题',
                            'Read the full research question',
                          )}
                        </summary>
                        <p>{view.mission.question}</p>
                      </details>
                    ) : (
                      <p>{view.mission.question}</p>
                    )}
                  </div>
                  <div className="flow-actions">
                    <Status status={view.mission.status} />
                    {canWrite &&
                      ['draft', 'paused'].includes(view.mission.status) && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void action(() =>
                              mutate(
                                'control_mission',
                                view.mission.status === 'draft'
                                  ? 'start'
                                  : 'resume',
                                view.mission.id,
                              ),
                            )
                          }
                        >
                          <Play size={15} />
                          {L('开始 / 继续', 'Start / resume')}
                        </Button>
                      )}
                    {canWrite &&
                      view.tasks.some((t) => t.status === 'stale') && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              const id = (await mutate(
                                'update_mission',
                                undefined,
                                view.mission.id,
                              )) as string;
                              await openMission(id);
                            })
                          }
                        >
                          <RefreshCw size={15} />
                          {L(
                            '用更新材料继续研究',
                            'Continue with updated sources',
                          )}
                        </Button>
                      )}
                    {canWrite && view.mission.status === 'active' && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          void action(() =>
                            mutate('control_mission', 'pause', view.mission.id),
                          )
                        }
                      >
                        <Pause size={15} />
                        {L('暂停调度', 'Pause scheduling')}
                      </Button>
                    )}
                    {canWrite &&
                      ['draft', 'active', 'paused'].includes(
                        view.mission.status,
                      ) && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            void action(() =>
                              mutate(
                                'control_mission',
                                'cancel',
                                view.mission.id,
                              ),
                            )
                          }
                        >
                          <Square size={14} />
                          {L('取消', 'Cancel')}
                        </Button>
                      )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={L('刷新', 'Refresh')}
                      onClick={() =>
                        void action(() => refresh(view.mission.id))
                      }
                    >
                      <RefreshCw size={16} />
                    </Button>
                  </div>
                </div>
                <details className="mission-brief">
                  <summary>
                    {L('研究范围与要求', 'Research scope & requirements')}
                  </summary>
                  <div className="mission-contract">
                    <div>
                      <strong>{L('材料范围', 'Scope')}</strong>
                      <p>{view.mission.scope}</p>
                    </div>
                    <div>
                      <strong>
                        {L(
                          '希望达到的要求',
                          'What a good result should include',
                        )}
                      </strong>
                      <p>{view.mission.acceptance}</p>
                    </div>
                  </div>
                </details>
                {nextReview && (
                  <div className="next-review">
                    <ShieldCheck size={23} />
                    <div>
                      <h3>{L('轮到你来判断了', 'Your judgment is needed')}</h3>
                      <p>
                        {nextReview.title} ·{' '}
                        {L(
                          '请对照引文，记录不同解释和仍然不确定之处。',
                          'Check the passages and note competing interpretations and remaining uncertainty.',
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => selectTask(nextReview.id)}
                    >
                      {L('开始核查', 'Review this step')}
                      <ArrowRight size={15} />
                    </Button>
                  </div>
                )}
                <details className="research-review-context">
                  <summary>
                    {L(
                      '审读概况与研究记录',
                      'Review overview & research records',
                    )}
                  </summary>
                  <ReviewDashboard
                    view={view}
                    sources={sources}
                    versions={versions}
                    onSelect={selectTask}
                  />
                  <SeminarTranscript
                    tasks={view.tasks}
                    edges={view.edges}
                    onSelect={selectTask}
                  />
                  <StudyRecords tasks={view.tasks} onSelect={selectTask} />
                  <MethodReportPanel
                    view={view}
                    sources={sources}
                    versions={versions}
                    models={models}
                    canWrite={!!canWrite}
                    onSelect={selectTask}
                    onCreate={async (draft) => {
                      const id = (await mutate(
                        'create_mission',
                        draft,
                      )) as string;
                      await openMission(id);
                      await onRefresh();
                    }}
                  />
                </details>
                <fieldset
                  className="task-view-switcher"
                  aria-label={L('任务显示方式', 'Task view')}
                >
                  {(['list', 'board', 'flow'] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={taskView === mode ? 'secondary' : 'ghost'}
                      aria-pressed={taskView === mode}
                      onClick={() => selectTaskView(mode)}
                    >
                      {
                        {
                          list: L('列表', 'List'),
                          board: L('看板', 'Board'),
                          flow: L('流程图', 'Workflow'),
                        }[mode]
                      }
                    </Button>
                  ))}
                </fieldset>
                <div
                  ref={taskListRef}
                  className={`workflow-layout ${task ? 'with-detail' : ''} ${task?.input.parameters.extraction ? 'with-reading' : ''}`}
                >
                  <div className="task-master">
                    {taskView === 'flow' ? (
                      <>
                        <WorkflowGraph
                          view={view}
                          members={overview.members}
                          selected={selected}
                          onSelect={selectTask}
                        />
                        <AgentLanes
                          tasks={view.tasks}
                          members={overview.members}
                          onSelect={selectTask}
                        />
                      </>
                    ) : (
                      <TaskViews
                        view={view}
                        mode={taskView}
                        members={overview.members}
                        selected={selected}
                        onSelect={selectTask}
                        canWrite={!!canWrite}
                        onMove={async (value) => {
                          const missionId = view.mission.id;
                          const next = (await mutate(
                            'move_board_task',
                            value,
                            missionId,
                          )) as MissionView;
                          if (currentRoute.current.mission === missionId)
                            setView((current) =>
                              current?.mission.id === missionId &&
                              current.mission.revision <=
                                next.mission.revision &&
                              current.tasks.every(
                                (task) =>
                                  (next.tasks.find((t) => t.id === task.id)
                                    ?.revision ?? -1) >= task.revision,
                              ) &&
                              (current.board?.revision || 0) <=
                                (next.board?.revision || 0)
                                ? next
                                : current,
                            );
                        }}
                      />
                    )}
                  </div>
                  {task && (
                    <TaskDetail
                      key={task.id}
                      moveExplanation={
                        moveExplanation.id === task.id
                          ? moveExplanation.text
                          : ''
                      }
                      userId={userId}
                      models={models}
                      task={task}
                      members={overview.members}
                      view={view}
                      sources={sources}
                      versions={versions}
                      busy={busy}
                      canWrite={!!canWrite}
                      canReview={canReview}
                      onSelectTask={selectTask}
                      onClose={() => selectTask('')}
                      onAction={(actionName, value) =>
                        action(async () => {
                          return mutate(actionName, value, task.id);
                        }, actionName === 'repair_prose')
                      }
                      onOpenSource={onOpenSource}
                    />
                  )}
                </div>
                <details className="event-log">
                  <summary>
                    <Activity size={16} />
                    {L('执行与复核日志', 'Execution & review history')}{' '}
                    <span>{view.events.length}</span>
                  </summary>
                  {view.events.map((event) => (
                    <div key={event.id}>
                      <time>
                        {new Date(event.created_at).toLocaleString(locale)}
                      </time>
                      <strong>
                        {stateText[event.kind]?.[locale === 'en' ? 1 : 0] ||
                          {
                            created: L('计划已保存', 'Plan saved'),
                            start: L('开始研究', 'Research started'),
                            claimed: L('开始处理', 'Work started'),
                            retry: L('重新尝试', 'Retried'),
                            board_moved: L(
                              '调整看板安排',
                              'Board arrangement updated',
                            ),
                          }[event.kind] ||
                          L('进度更新', 'Progress update')}
                      </strong>
                      <span>
                        {event.kind === 'board_moved'
                          ? (() => {
                              try {
                                const change = JSON.parse(event.detail);
                                return `${change.title} · ${change.from === change.to ? L('调整顺序', 'Reordered') : L('调整人工工作安排', 'Human work arrangement changed')}`;
                              } catch {
                                return event.detail;
                              }
                            })()
                          : event.detail}
                      </span>
                      <small>
                        {overview.members.find(
                          (member) => member.user_id === event.actor,
                        )?.name || L('研究助手', 'Research assistant')}
                      </small>
                    </div>
                  ))}
                </details>
              </>
            ))}
          {section === 'connections' && (
            <CloudConnections projectId={project.id} onImported={onRefresh} />
          )}
          {section === 'search' && (
            <>
              <div className="platform-heading">
                <div>
                  <h2>
                    {L(
                      '让每次检索回到原文',
                      'Search with a path back to the source',
                    )}
                  </h2>
                  <p>
                    {L(
                      '检索关键词、别名和相近写法，精确结果优先。用 | 分隔多个候选词；每条结果都能回到原文。',
                      'Search terms, aliases and similar spellings, with exact results first. Separate alternatives with |; every result links to its source.',
                    )}
                  </p>
                </div>
                <Button
                  disabled={busy || !canWrite}
                  variant="outline"
                  onClick={() =>
                    void action(async () => {
                      let next: string | null = '';
                      do {
                        const result = (await mutate('reindex', next)) as {
                          next: string | null;
                        };
                        next = result.next;
                      } while (next);
                      setMessage(L('索引已更新。', 'Index updated.'));
                    })
                  }
                >
                  <RefreshCw size={15} />
                  {L('更新可检索资料', 'Refresh searchable sources')}
                </Button>
              </div>
              <form
                className="corpus-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void action(async () => {
                    setSearched(false);
                    setHits(
                      (
                        await api<{ hits: SearchHit[] }>(
                          `/api/platform?project_id=${project.id}&q=${encodeURIComponent(query)}&approximate=${approximate ? '1' : '0'}`,
                        )
                      ).hits,
                    );
                    setSearched(true);
                  });
                }}
              >
                <Search size={20} />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={L(
                    '人物、地点、短语或铭文公式…',
                    'Person, place, phrase or inscription formula…',
                  )}
                  required
                />
                <Button type="submit" disabled={busy}>
                  {L('检索', 'Search')}
                </Button>
              </form>
              <label className="flex items-center gap-2 text-sm my-3">
                <input
                  type="checkbox"
                  checked={approximate}
                  onChange={(event) => {
                    setApproximate(event.target.checked);
                    setHits([]);
                    setSearched(false);
                  }}
                />
                {L(
                  '包含相近写法（如 adam → Adams）；不代表同一人物',
                  'Include similar spellings (adam → Adams); this does not establish identity',
                )}
              </label>
              {searched && (
                <output className="muted">
                  {hits.length
                    ? L(
                        `找到 ${hits.length} 页材料`,
                        `${hits.length} source pages found`,
                      )
                    : L(
                        '本次没有命中。可尝试相近写法、别名或更短的关键词。',
                        'No matches in this search. Try similar spellings, aliases or a shorter term.',
                      )}
                </output>
              )}
              <p className="muted">
                {overview.index.indexed_versions}/{overview.index.versions}{' '}
                {L(
                  '版本已索引；日期或语言未知的材料需要补充元数据。',
                  'versions indexed; unknown dates and languages need metadata.',
                )}
              </p>
              <SemanticSearch
                projectId={project.id}
                query={query}
                onResults={setHits}
              />
              <p className="muted">
                {L(
                  '检索包含已确认的别名；命中也可能来自转录中的编者说明，并不代表人物身份或作者关系已获证实。',
                  'Search includes reviewed aliases. Matches may come from editorial notes in a transcription; they do not establish identity or authorship.',
                )}
              </p>
              <div className="search-results">
                {hits.map((hit) => (
                  <button
                    key={hit.id}
                    onClick={() =>
                      onOpenSource(hit.source_id, hit.version_id, hit.page)
                    }
                  >
                    <div>
                      <strong>{hit.title}</strong>
                      <span>
                        v{hit.revision} · {L('页', 'p.')} {hit.page}
                      </span>
                    </div>
                    {hit.match_kind === 'similar' && (
                      <span className="status-tag">
                        {L('相近写法', 'Similar spelling')}
                      </span>
                    )}
                    <p>{hit.snippet}</p>
                    <small>
                      {L('打开固定版本原文', 'Open pinned source version')}{' '}
                      <ChevronRight size={14} />
                    </small>
                  </button>
                ))}
              </div>
              <details className="platform-form">
                <summary>
                  {L(
                    '添加异体字、别名或跨语言对应',
                    'Add a spelling variant, alias or translation',
                  )}
                </summary>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void action(() =>
                      mutate('alias', {
                        term: formText(data, 'term'),
                        variants: formText(data, 'variants')
                          .split('|')
                          .map((value) => value.trim())
                          .filter(Boolean),
                        basis: formText(data, 'basis'),
                      }),
                    );
                  }}
                >
                  <label>
                    {L('检索词', 'Term')}
                    <Input name="term" required />
                  </label>
                  <label>
                    {L('候选对应（用 | 分隔）', 'Variants (separate with |)')}
                    <Input name="variants" required />
                  </label>
                  <label>
                    {L('对应依据', 'Basis')}
                    <Input name="basis" />
                  </label>
                  <Button type="submit" disabled={busy || !canWrite}>
                    {L('保存对应', 'Save aliases')}
                  </Button>
                </form>
                {overview.aliases.map((alias) => (
                  <p key={alias.id}>
                    <strong>{alias.term}</strong> →{' '}
                    {(JSON.parse(alias.variants) as string[]).join(' · ')}{' '}
                    <small>{alias.basis}</small>
                  </p>
                ))}
              </details>
            </>
          )}
          {section === 'library' && (
            <ResearchLibrary
              artifacts={overview.artifacts}
              busy={busy}
              onPlan={(id) => void openMission(id)}
              onRead={(id) =>
                void action(async () => {
                  const data = await api<{ artifact: Artifact }>(
                    `/api/artifacts?project_id=${project.id}&id=${id}`,
                  );
                  setReport(data.artifact);
                })
              }
            />
          )}
          {section === 'team' && (
            <>
              <div className="platform-heading">
                <div>
                  <h2>
                    {L(
                      '共同推进，分别留下依据',
                      'Collaborate with an accountable record',
                    )}
                  </h2>
                  <p>
                    {L(
                      '查看者可阅读；编辑者可执行；复核者可采纳；项目所有者管理成员。',
                      'Viewers read; editors contribute; reviewers accept results; owners manage membership.',
                    )}
                  </p>
                </div>
              </div>
              {discussionTargetId && (
                <EvidenceDiscussion
                  key={discussionTargetId}
                  projectId={project.id}
                  targetId={discussionTargetId}
                  initiallyOpen
                />
              )}
              <div className="team-columns">
                <section className="platform-form">
                  <ProjectMembers projectId={project.id} />
                </section>
                <section className="platform-form">
                  <h3>
                    <MessageSquare size={18} />
                    {L('讨论与复核意见', 'Discussion & review notes')}
                  </h3>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void action(() =>
                        mutate('comment', {
                          target_id: view?.mission.id || project.id,
                          body: formText(data, 'body'),
                          mentions: formText(data, 'mention')
                            ? [formText(data, 'mention')]
                            : [],
                        }),
                      );
                    }}
                  >
                    <Textarea
                      name="body"
                      placeholder={L(
                        '记录判断、问题或下一步建议…',
                        'Record a judgment, question or next step…',
                      )}
                      required
                    />
                    <label>
                      {L(
                        '请谁关注这条讨论（可选）',
                        'Ask a colleague to review (optional)',
                      )}
                      <select name="mention">
                        <option value="">
                          {L('不指定', 'No one in particular')}
                        </option>
                        {overview.members.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button type="submit" disabled={busy || !canWrite}>
                      <Send size={15} />
                      {L('发布到项目', 'Post to project')}
                    </Button>
                  </form>
                  {overview.comments.map((comment) => (
                    <article className="comment" key={comment.id}>
                      <strong>{comment.author_name}</strong>
                      <time>
                        {new Date(comment.created_at).toLocaleString(locale)}
                      </time>
                      <p>{comment.body}</p>
                      {comment.resolved ? (
                        <small>{L('已解决', 'Resolved')}</small>
                      ) : (
                        canReview && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void action(() =>
                                mutate(
                                  'resolve_comment',
                                  undefined,
                                  comment.id,
                                ),
                              )
                            }
                          >
                            {L('标记已解决', 'Resolve')}
                          </Button>
                        )
                      )}
                    </article>
                  ))}
                </section>
              </div>
            </>
          )}
          {section === 'agents' && (
            <>
              <div className="platform-heading">
                <div>
                  <h2>
                    {L(
                      '让你自己的 Agent 接力研究',
                      'Bring your own research agents',
                    )}
                  </h2>
                  <p>
                    {L(
                      '凭据限定当前项目，30 天到期；任务租约防止重复执行和过期结果覆盖。',
                      'Credentials are scoped to this project and expire after 30 days. Task leases fence concurrent and late submissions.',
                    )}
                  </p>
                </div>
              </div>
              <section className="platform-form">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void action(async () => {
                      const result = (await mutate(
                        'create_credential',
                        formText(data, 'label'),
                      )) as { token: string };
                      setSecret(result.token);
                    });
                  }}
                >
                  <label>
                    {L('Agent 名称', 'Agent name')}
                    <Input
                      name="label"
                      required
                      placeholder="Research assistant"
                    />
                  </label>
                  <Button type="submit" disabled={busy || !canWrite}>
                    <KeyRound size={15} />
                    {L('创建项目凭据', 'Create credential')}
                  </Button>
                </form>
                {secret && (
                  <div className="credential-secret">
                    <p>
                      {L(
                        '此凭据仅在这里显示一次。请保存在你的 agent 的安全配置中。',
                        'This credential is shown once. Store it in your agent’s secure configuration.',
                      )}
                    </p>
                    <code>{secret}</code>
                    <Button
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(secret);
                      }}
                    >
                      {L('复制', 'Copy')}
                    </Button>
                    <Button variant="ghost" onClick={() => setSecret('')}>
                      {L('隐藏', 'Hide')}
                    </Button>
                  </div>
                )}
                {overview.credentials.map((key) => (
                  <div className="member-row" key={key.id}>
                    <div>
                      <strong>{key.label}</strong>
                      <small>
                        {L('到期', 'Expires')}{' '}
                        {new Date(key.expires_at).toLocaleDateString(locale)}
                      </small>
                    </div>
                    <span>
                      {key.revoked_at
                        ? L('已撤销', 'Revoked')
                        : L('有效', 'Active')}
                    </span>
                    {!key.revoked_at && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          void action(() =>
                            mutate('revoke_credential', undefined, key.id),
                          )
                        }
                      >
                        {L('撤销', 'Revoke')}
                      </Button>
                    )}
                  </div>
                ))}
                <p>
                  <a href="/agent-guide.md" target="_blank" rel="noreferrer">
                    {L(
                      '打开 Agent 接入说明与 SDK 示例',
                      'Open agent API and SDK guide',
                    )}{' '}
                    <Link2 size={14} />
                  </a>
                </p>
              </section>
            </>
          )}
        </>
      )}
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent className="mission-dialog">
          <DialogHeader>
            <DialogTitle>
              {L('创建研究计划', 'Create a research mission')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '写下你的研究问题，选择材料，并决定哪些结果需要自己核查。',
                'Start with your question, choose sources and decide what you want to review.',
              )}
            </DialogDescription>
          </DialogHeader>
          {message && <output className="platform-notice">{message}</output>}
          <MissionForm
            projectId={project.id}
            models={models}
            budget={budget}
            canBudget={overview?.project.role === 'owner'}
            sources={sources}
            versions={versions}
            busy={busy}
            onSubmit={(draft, limit) =>
              action(async () => {
                if (limit !== undefined)
                  await api('/api/workbench', {
                    action: 'budget',
                    project_id: project.id,
                    limit_units: Math.round(limit * 1_000_000),
                  });
                const id = (await mutate('create_mission', draft)) as string;
                setCreate(false);
                await openMission(id);
                await onRefresh();
              })
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!report}
        onOpenChange={(open) => {
          if (!open) setReport(null);
        }}
      >
        <DialogContent className="report-dialog">
          <DialogHeader>
            <DialogTitle>{report?.title}</DialogTitle>
            <DialogDescription>
              {L(
                '已采纳的研究成果，保留原文与出处。',
                'An accepted finding with original passages and their sources.',
              )}
            </DialogDescription>
          </DialogHeader>
          {report && (
            <>
              <ResearchResult
                result={report.body}
                sourceLabel={sourceLabel}
                onSource={(id, page) => {
                  setReport(null);
                  openVersion(id, page);
                }}
              />
              <Button
                variant="outline"
                disabled={
                  !['owner', 'editor', 'reviewer'].includes(
                    overview?.project.role || '',
                  )
                }
                onClick={() => {
                  onNote(
                    report.title,
                    reportMarkdown(
                      report.title,
                      report.body,
                      sourceLabel,
                      locale,
                      report.license,
                      (version, page) => sourcePath(project.id, version, page),
                    ),
                  );
                  setReport(null);
                }}
              >
                {L('整理成笔记', 'Develop into a note')}
              </Button>
              <Button onClick={() => downloadReport(report)}>
                <Download size={16} />
                {L('下载研究报告', 'Download report')}
              </Button>
              <details className="platform-technical">
                <summary>
                  {L('技术协作与校验信息', 'Technical export and integrity')}
                </summary>
                <code>SHA-256 {report.sha256}</code>
                <Button
                  variant="ghost"
                  onClick={() =>
                    downloadJson(report, `canwoo-${report.id}.json`)
                  }
                >
                  JSON
                </Button>
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{title}</span>
    </div>
  );
}
function MissionForm({
  projectId,
  models,
  budget,
  canBudget,
  sources,
  versions,
  busy,
  onSubmit,
}: {
  models: Model[];
  budget: WorkbenchData['budget'];
  canBudget: boolean;
  sources: Source[];
  versions: SourceVersion[];
  busy: boolean;
  projectId: string;
  onSubmit: (draft: MissionDraft, limit?: number) => Promise<unknown>;
}) {
  const { L, locale } = useWords();
  const [selected, setSelected] = useState<string[]>(
    sources.slice(0, 10).map((source) => source.id),
  );
  const [modelId, setModelId] = useState(
    models.find((model) => model.model_id === DEFAULT_RESEARCH_MODEL)?.id ||
      models[0]?.id ||
      '',
  );
  const [mode, setMode] = useState(models.length ? 'model' : 'builtin');
  const [inputRate, setInputRate] = useState(String(GLM_PRICE_CEILING.input));
  const [outputRate, setOutputRate] = useState(
    String(GLM_PRICE_CEILING.output),
  );
  const currentModel = models.find((model) => model.id === modelId);
  const [advanced, setAdvanced] = useState('');
  const [formError, setFormError] = useState('');
  const [outputLocale, setOutputLocale] = useState<'zh-CN' | 'en'>(locale);
  const [recipe, setRecipe] = useState<RecipeKind | ''>('extract');
  const [fields, setFields] = useState(
    locale === 'en' ? 'Person, Date, Place, Event' : '人物，日期，地点，事件',
  );
  const [methods, setMethods] = useState<
    { id: string; title: string; body: ResearchMethod }[]
  >([]);
  const [saved, setSaved] = useState('');
  const [external, setExternal] = useState(false);
  const [methodText, setMethodText] = useState('');
  const selectedVersions = selected.flatMap((id) => {
    const version = versions
      .filter((v) => v.source_id === id)
      .sort((a, b) => b.revision - a.revision)[0];
    return version ? [version] : [];
  });
  const pages = interleavePages(
    selectedVersions.map((v) => ({
      version_id: v.id,
      pages: v.pages.filter((p) => p.text.trim()).map((p) => p.page),
    })),
  );
  const [pageLimit, setPageLimit] = useState(1000);
  const [pageOffset, setPageOffset] = useState(0);
  useEffect(() => {
    let active = true;
    void api<{ methods: typeof methods }>(
      `/api/platform?project_id=${projectId}&methods=1`,
    )
      .then((r) => {
        if (active) setMethods(r.methods);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId]);
  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        setFormError('');
        const data = new FormData(event.currentTarget);
        if (
          mode === 'model' &&
          (!modelId || selected.length > 10 || (!budget && !canBudget))
        ) {
          setFormError(
            L(
              '请选择一个模型、最多 10 份资料，并请项目负责人设置研究预算。',
              'Choose a model and up to 10 sources. The owner must set a research budget.',
            ),
          );
          return;
        }
        let draft = researchTemplate({
          model_id: mode === 'model' ? modelId : undefined,
          input_rate: Number(inputRate),
          output_rate: Number(outputRate),
          title: formText(data, 'title'),
          question: formText(data, 'question'),
          scope: formText(data, 'scope'),
          acceptance: formText(data, 'acceptance'),
          query: formText(data, 'query')
            .split(/[|,，、\n]+/)
            .map((term) => term.trim())
            .filter(Boolean)
            .join('|'),
          version_ids: selected
            .map(
              (id) =>
                versions
                  .filter((version) => version.source_id === id)
                  .sort((a, b) => b.revision - a.revision)[0]?.id,
            )
            .filter(Boolean),
          locale: outputLocale,
        });
        if (mode === 'model' && recipe) {
          try {
            draft = agentRecipe({
              method: {
                title: formText(data, 'title'),
                kind: recipe,
                instructions:
                  formText(data, 'question') +
                  '\n' +
                  formText(data, 'scope') +
                  '\n' +
                  formText(data, 'acceptance'),
                fields: fields
                  .split(/[,，、\n]+/)
                  .map((v) => v.trim())
                  .filter(Boolean),
              },
              pages: pages.slice(
                pageOffset,
                pageOffset +
                  Math.min(pageLimit, recipe === 'extract' ? 1000 : 24),
              ),
              model_id: modelId,
              input_rate: Number(inputRate),
              output_rate: Number(outputRate),
              locale: outputLocale,
              external,
              comparisonText: formText(data, 'comparison'),
            });
          } catch (error) {
            setFormError(
              error instanceof Error
                ? error.message
                : L('请检查研究要求。', 'Check your research instructions.'),
            );
            return;
          }
        }
        if (advanced.trim()) {
          try {
            draft.tasks = JSON.parse(advanced);
          } catch {
            setFormError(
              L(
                '任务 JSON 格式无效，请检查。',
                'Invalid task JSON. Please check the syntax.',
              ),
            );
            return;
          }
        }
        void onSubmit(
          draft,
          mode === 'model' && !budget && canBudget
            ? Number(formText(data, 'budget'))
            : undefined,
        );
      }}
    >
      <fieldset className="research-method">
        <legend>{L('这次希望怎样研究', 'How would you like to work?')}</legend>
        <label aria-label={L('AI 辅助对读', 'Read and compare with AI')}>
          <input
            type="radio"
            name="method"
            checked={mode === 'model'}
            disabled={!models.length}
            onChange={() => setMode('model')}
          />
          <span>
            <strong>
              {L('由助手分步推进', 'Work step by step with an assistant')}
            </strong>
            <small>
              {L(
                '选任务 → 试读材料 → 你来纠正 → 继续处理',
                'Choose a task → read a sample → correct → continue',
              )}
            </small>
          </span>
        </label>
        <label aria-label={L('词句检索与统计', 'Search and count words')}>
          <input
            type="radio"
            name="method"
            checked={mode === 'builtin'}
            onChange={() => setMode('builtin')}
          />
          <span>
            <strong>{L('词句检索与统计', 'Search and count words')}</strong>
            <small>
              {L(
                '不调用模型，适合明确词句的检索和复算',
                'No model calls; for exact terms and reproducible counts',
              )}
            </small>
          </span>
        </label>
      </fieldset>
      {mode === 'model' && (
        <section className="recipe-picker">
          <label>
            {L('这次需要助手完成什么', 'What should the assistant help with?')}
            <select
              value={recipe}
              onChange={(e) => setRecipe(e.target.value as RecipeKind | '')}
            >
              <option value="">
                {L('综合对读', 'General source comparison')}
              </option>
              {recipeKinds.map((k) => (
                <option value={k} key={k}>
                  {L(...recipeLabels[k])}
                </option>
              ))}
            </select>
          </label>
          {recipe && (
            <>
              <label>
                {L('复用已保存的方法', 'Reuse a saved method')}
                <select
                  value={saved}
                  onChange={(e) => {
                    setSaved(e.target.value);
                    const m = methods.find(
                      (m) => m.id === e.target.value,
                    )?.body;
                    if (m) {
                      setRecipe(m.kind);
                      setFields(m.fields.join(', '));
                      setMethodText(m.instructions);
                    }
                  }}
                >
                  <option value="">
                    {L('从新的问题开始', 'Start a new question')}
                  </option>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
              {recipe === 'extract' && (
                <label>
                  {L(
                    '希望逐项摘录什么（用逗号分隔）',
                    'Fields to extract (comma separated)',
                  )}
                  <Input
                    value={fields}
                    onChange={(e) => setFields(e.target.value)}
                    required
                  />
                  <small>
                    {L(
                      '没有记载就留空；每个非空值须有原文出处。',
                      'Unrecorded values stay empty; every nonempty value needs a quotation.',
                    )}
                  </small>
                </label>
              )}
              {['audit', 'update', 'seminar'].includes(recipe) && (
                <label>
                  {L(
                    '要审读的论述或已有解释',
                    'Argument or previous interpretation',
                  )}
                  <Textarea
                    name="comparison"
                    required
                    rows={4}
                    maxLength={6000}
                  />
                </label>
              )}
              {recipe === 'discover' && (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={external}
                    onChange={(e) => setExternal(e.target.checked)}
                  />
                  <span>
                    {L(
                      '同时检索 Crossref 与美国国会图书馆目录',
                      'Also search Crossref and the Library of Congress',
                    )}
                    <small>
                      {L(
                        '只向这两个目录发送检索词；最多两轮，每轮 3 个词。不会自动导入全文。',
                        'Only search terms are sent to these catalogs. At most two rounds of three queries; full text is not automatically imported.',
                      )}
                    </small>
                  </span>
                </label>
              )}
              <div className="recipe-preview">
                {recipe === 'extract'
                  ? L(
                      '试读样本 → 纠正标准 → 独立样本核查 → 后续摘录 → 审读与导出',
                      'Sample → correct rules → held-out review → remaining pages → review and export',
                    )
                  : L(
                      '助手执行 → 核查出处 → 你来审读 → 保存研究意见',
                      'Assistant work → source checks → your review → save findings',
                    )}
              </div>
            </>
          )}
        </section>
      )}
      {mode === 'model' && (
        <div className="research-model-settings">
          <label>
            {L('成果语言', 'Output language')}
            <select
              value={outputLocale}
              onChange={(event) =>
                setOutputLocale(event.target.value === 'en' ? 'en' : 'zh-CN')
              }
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
            <small>
              {L(
                '独立于页面语言；引文保留原文。',
                'Independent of interface language; quotations retain their original wording.',
              )}
            </small>
          </label>
          <label>
            {L('研究助手', 'Research assistant')}
            <select
              value={modelId}
              onChange={(event) => {
                setModelId(event.target.value);
                const model = models.find(
                  (item) => item.id === event.target.value,
                );
                setInputRate(
                  model?.model_id === DEFAULT_RESEARCH_MODEL
                    ? String(GLM_PRICE_CEILING.input)
                    : '',
                );
                setOutputRate(
                  model?.model_id === DEFAULT_RESEARCH_MODEL
                    ? String(GLM_PRICE_CEILING.output)
                    : '',
                );
              }}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <p>
            {L(
              '所选材料会发送给你的模型账户。助手比较材料并保留出处，完成后由你审读。',
              'Selected sources go to your model account. The assistant compares them and preserves citations for your review.',
            )}
          </p>
          {currentModel?.model_id === DEFAULT_RESEARCH_MODEL ? (
            <small>
              {L(
                '使用保守费率估算：输入 $0.15 / 输出 $0.50 每百万 token。',
                'Conservative rates: $0.15 input / $0.50 output per million tokens.',
              )}
            </small>
          ) : (
            <div className="form-pair">
              <label>
                {L(
                  '输入费率（USD / 百万 tokens）',
                  'Input rate (USD / million tokens)',
                )}
                <Input
                  required
                  type="number"
                  min="0.0001"
                  step="any"
                  value={inputRate}
                  onChange={(event) => setInputRate(event.target.value)}
                />
              </label>
              <label>
                {L(
                  '输出费率（USD / 百万 tokens）',
                  'Output rate (USD / million tokens)',
                )}
                <Input
                  required
                  type="number"
                  min="0.0001"
                  step="any"
                  value={outputRate}
                  onChange={(event) => setOutputRate(event.target.value)}
                />
              </label>
            </div>
          )}
          {!budget && canBudget && (
            <label>
              {L(
                '项目后台研究额度（美元）',
                'Project background research allowance (USD)',
              )}
              <Input
                name="budget"
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                defaultValue="0.10"
                required
              />
              <small>
                {L(
                  '新建项目额度，后续研究共用；保存计划时设置。调用前预留，实际账单以模型厂商为准。',
                  'Sets a shared allowance for this project when you save the plan. Costs are reserved before calls; provider billing is authoritative.',
                )}
              </small>
            </label>
          )}
          {budget && (
            <small>
              {L(
                `项目剩余可预留额度：$${Math.max(0, (budget.limit_units - budget.committed_units) / 1_000_000).toFixed(4)}`,
                `Available project allowance: $${Math.max(0, (budget.limit_units - budget.committed_units) / 1_000_000).toFixed(4)}`,
              )}
            </small>
          )}
        </div>
      )}
      <label>
        {L('计划名称', 'Mission title')}
        <Input
          name="title"
          required
          defaultValue={L('资料摘录与核查', 'Source extraction and review')}
        />
      </label>
      <label>
        {L('研究问题', 'Research question')}
        <Textarea
          name="question"
          value={methodText}
          onChange={(e) => setMethodText(e.target.value)}
          required
          placeholder={L(
            '我们希望从这批材料中弄清什么？',
            'What do we want to understand from these sources?',
          )}
        />
      </label>
      <div className="form-pair">
        <label>
          {L('范围与覆盖限制', 'Scope and coverage limits')}
          <Textarea
            name="scope"
            required
            defaultValue={L(
              '仅限本次所选材料；保留未知日期与缺失记录。',
              'Selected sources only; preserve unknown dates and missing records.',
            )}
          />
        </label>
        <label>
          {L('希望达到的要求', 'What a good result should include')}
          <Textarea
            name="acceptance"
            required
            defaultValue={L(
              '引文准确，记录竞争解释与材料缺口，由研究者复核。',
              'Exact citations, documented alternative explanations and coverage gaps, reviewed by a researcher.',
            )}
          />
        </label>
      </div>
      {mode === 'builtin' && (
        <label>
          {L(
            '想寻找的词语（用逗号分隔）',
            'Words to look for (separate with commas)',
          )}
          <Input
            name="query"
            required={mode === 'builtin'}
            placeholder={L(
              '例如：港口，关税，航运',
              'For example: port, customs, shipping',
            )}
          />
        </label>
      )}
      <fieldset>
        <legend>{L('这次使用哪些资料', 'Sources for this question')}</legend>
        <div className="source-checkboxes">
          {sources.map((source) => (
            <label key={source.id}>
              <input
                type="checkbox"
                checked={selected.includes(source.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, source.id]
                      : current.filter((id) => id !== source.id),
                  )
                }
              />
              {source.title}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === 'model' && recipe && (
        <div className="recipe-scope">
          <label>
            {L('跳过前面已读过的页数', 'Skip pages already read')}
            <Input
              type="number"
              min={0}
              max={Math.max(0, pages.length - 1)}
              value={pageOffset}
              onChange={(e) => setPageOffset(Number(e.target.value))}
            />
          </label>
          <label>
            {L(
              '处理页数（摘录最多 1,000 页，其他任务 24 页）',
              'Pages to process (1,000 for extraction; 24 for other tasks)',
            )}
            <Input
              type="number"
              min={recipe === 'extract' ? 3 : 1}
              max={recipe === 'extract' ? 1000 : 24}
              value={Math.min(pageLimit, recipe === 'extract' ? 1000 : 24)}
              onChange={(e) => setPageLimit(Number(e.target.value))}
            />
          </label>
          <p>
            {L(
              `所选资料有 ${pages.length} 页可读文字，本轮跳过 ${pageOffset} 页后，按资料交错选取 ${Math.min(pageLimit, recipe === 'extract' ? 1000 : 24, Math.max(0, pages.length - pageOffset))} 页。页码固定保留在流程中。`,
              `Selected sources contain ${pages.length} readable pages. After skipping ${pageOffset}, this round uses ${Math.min(pageLimit, recipe === 'extract' ? 1000 : 24, Math.max(0, pages.length - pageOffset))} pages, interleaved across sources; the workflow preserves each page selection.`,
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={async (e) => {
              const form = e.currentTarget.closest('form');
              if (!form) return;
              const data = new FormData(form);
              try {
                const method = {
                  title: formText(data, 'title'),
                  kind: recipe,
                  instructions: formText(data, 'question'),
                  fields: fields
                    .split(/[,，、\n]+/)
                    .map((v) => v.trim())
                    .filter(Boolean),
                };
                await api('/api/platform', {
                  action: 'save_method',
                  project_id: projectId,
                  value: method,
                });
                const result = await api<{ methods: typeof methods }>(
                  `/api/platform?project_id=${projectId}&methods=1`,
                );
                setMethods(result.methods);
                setFormError(
                  L(
                    '方法已保存，可在下次研究中复用。',
                    'Method saved for your next study.',
                  ),
                );
              } catch (error) {
                setFormError(
                  error instanceof Error ? error.message : 'Save failed',
                );
              }
            }}
          >
            {L('保存这套研究方法', 'Save this research method')}
          </Button>
        </div>
      )}
      <details>
        <summary>
          {L(
            '技术协作者：自定义研究步骤',
            'Technical collaborators: custom research steps',
          )}
        </summary>
        <p>
          {L(
            '可替换模板任务；每项含 id、kind、executor、assignee、dependencies 和 input。支持 builtin、model、external、human。',
            'Override template tasks with id, kind, executor, assignee, dependencies and input. Executors: builtin, model, external, human.',
          )}
        </p>
        <Textarea
          value={advanced}
          onChange={(event) => setAdvanced(event.target.value)}
          rows={8}
          aria-label={L('自定义任务 JSON', 'Custom task JSON')}
        />
      </details>
      <p className="muted">
        {L(
          '保存后先查看流程，点击“开始”才会执行。人工复核之前，成果不会自动被采纳。',
          'Inspect the saved plan, then choose Start to run it. Findings remain pending until you review them.',
        )}
      </p>
      {formError && <output className="platform-notice">{formError}</output>}
      <Button type="submit" disabled={busy || !selected.length}>
        <GitBranch size={16} />
        {L('保存计划草案', 'Save mission draft')}
      </Button>
    </form>
  );
}
function WorkflowGraph({
  view,
  members,
  selected,
  onSelect,
}: {
  view: MissionView;
  members: Overview['members'];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { L, S } = useWords();
  const [zoom, setZoom] = useState(1),
    [list, setList] = useState(view.tasks.length > 40);
  const levels = useMemo(
    () => graphLevels(view.tasks, view.edges),
    [view.tasks, view.edges],
  );
  const positions = new Map<string, { x: number; y: number }>(),
    counts = new Map<number, number>();
  for (const task of view.tasks) {
    const column = levels.get(task.id) || 0,
      row = counts.get(column) || 0;
    counts.set(column, row + 1);
    positions.set(task.id, { x: 24 + column * 266, y: 30 + row * 142 });
  }
  const width = Math.max(700, (Math.max(0, ...levels.values()) + 1) * 266 + 24),
    height = Math.max(240, Math.max(1, ...counts.values()) * 142 + 45);
  return (
    <section className="workflow-graph">
      <header>
        <h3>
          <GitBranch size={18} />
          {L('研究流程', 'Research flow')}
        </h3>
        <span>
          {L(
            '点击步骤查看所用材料、研究发现和核查进度',
            'Select a step to see its sources, findings and review progress',
          )}
        </span>
        <div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={L('缩小', 'Zoom out')}
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
          >
            <ZoomOut size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={L('放大', 'Zoom in')}
            onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
          >
            <ZoomIn size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              list ? L('流程图', 'Graph') : L('列表视图', 'List view')
            }
            onClick={() => setList(!list)}
          >
            {list ? <LayoutGrid size={16} /> : <List size={16} />}
          </Button>
        </div>
      </header>
      {list ? (
        <div className="flow-list">
          {view.tasks.map((task) => (
            <button key={task.id} onClick={() => onSelect(task.id)}>
              <span>{task.title}</span>
              <small>{assigneeLabel(task, members, L)}</small>
              <Status status={task.status} />
            </button>
          ))}
        </div>
      ) : (
        <div
          className="graph-scroll"
          aria-label={L(
            '可滚动的任务依赖图',
            'Scrollable task dependency graph',
          )}
        >
          <div style={{ width: width * zoom, height: height * zoom }}>
            <div
              className="graph-canvas"
              style={{
                width,
                height,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <svg width={width} height={height} aria-hidden="true">
                <defs>
                  <marker
                    id={`arrow-${view.mission.id}`}
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                  >
                    <path d="M0,0 L7,3.5 L0,7" fill="currentColor" />
                  </marker>
                </defs>
                {view.edges.map((edge) => {
                  const from = positions.get(edge.depends_on),
                    to = positions.get(edge.task_id);
                  if (!from || !to) return null;
                  return (
                    <path
                      key={`${edge.task_id}:${edge.depends_on}`}
                      d={`M ${from.x + 230} ${from.y + 54} C ${from.x + 248} ${from.y + 54}, ${to.x - 18} ${to.y + 54}, ${to.x} ${to.y + 54}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      markerEnd={`url(#arrow-${view.mission.id})`}
                    />
                  );
                })}
              </svg>
              {view.tasks.map((task) => {
                const pos = positions.get(task.id)!;
                return (
                  <button
                    key={task.id}
                    className={`flow-node ${selected === task.id ? 'selected' : ''} node-${task.status}`}
                    style={{ left: pos.x, top: pos.y }}
                    onClick={() => onSelect(task.id)}
                    aria-label={`${task.title}: ${S(task.status)}`}
                    aria-pressed={selected === task.id}
                  >
                    <span className="node-role">
                      {task.executor === 'human' ? (
                        <Users size={14} />
                      ) : task.executor === 'builtin' ? (
                        <ShieldCheck size={14} />
                      ) : (
                        <Bot size={14} />
                      )}{' '}
                      {assigneeLabel(task, members, L)}
                    </span>
                    <strong>{task.title}</strong>
                    <Status status={task.status} />
                    <small>#{task.attempt}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <footer>
        {[...new Set(view.tasks.map((task) => task.status))].map((state) => (
          <Status key={state} status={state} />
        ))}
      </footer>
    </section>
  );
}
function AgentLanes({
  tasks,
  members,
  onSelect,
}: {
  tasks: MissionTask[];
  members: Overview['members'];
  onSelect: (id: string) => void;
}) {
  const { L } = useWords();
  const groups = Map.groupBy(tasks, (task) => task.assignee || task.executor);
  return (
    <section className="agent-lanes">
      <h3>
        <Bot size={18} />
        {L('分工与执行状态', 'Assignments & execution')}
      </h3>
      {[...groups].map(([name, items]) => (
        <div key={name}>
          <strong>{assigneeLabel(items[0], members, L)}</strong>
          <span>{roleLabel(items[0].executor, L)}</span>
          <div>
            {items.map((task) => (
              <button
                key={task.id}
                onClick={() => onSelect(task.id)}
                title={task.title}
              >
                <Status status={task.status} />
                {task.title}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
function TaskDetail({
  moveExplanation,
  userId,
  members,
  models,
  task,
  view,
  sources,
  versions,
  busy,
  canWrite,
  canReview,
  onClose,
  onSelectTask,
  onAction,
  onOpenSource,
}: {
  moveExplanation: string;
  userId: string;
  task: MissionTask;
  members: Overview['members'];
  models: Model[];
  view: MissionView;
  sources: Source[];
  versions: SourceVersion[];
  busy: boolean;
  canWrite: boolean;
  canReview: boolean;
  onClose: () => void;
  onSelectTask: (id: string) => void;
  onAction: (action: string, value?: unknown) => Promise<unknown>;
  onOpenSource: (source: string, version: string, page: number) => void;
}) {
  const { L } = useWords();
  const reviewDraft = useReviewDraft(
    `canwoo:review-draft:${userId}:${task.project_id}:${task.id}`,
    task.revision,
  );
  const { reason, humanText } = reviewDraft.value;
  const setReason = (reason: string) => reviewDraft.update({ reason });
  const setHumanText = (humanText: string) => reviewDraft.update({ humanText });
  const hasDraft = !!(reason || humanText);
  const outdatedDraft =
    hasDraft && reviewDraft.value.revision !== task.revision;
  const savedSubmission = (
    task.result?.data as
      | { human_submission?: { expected?: unknown } }
      | undefined
  )?.human_submission;
  const submittedDraftWasSaved =
    !!humanText &&
    task.claimed_by === userId &&
    task.result?.summary === humanText &&
    savedSubmission?.expected === reviewDraft.value.revision;
  useEffect(() => {
    if (submittedDraftWasSaved) reviewDraft.clearIf(reviewDraft.value);
  }, [submittedDraftWasSaved, reviewDraft]);
  const detailRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    detailRef.current?.scrollIntoView({ block: 'start' });
    detailRef.current?.focus({ preventScroll: true });
  }, [task.id]);
  async function saveReview(actionName: string, value: unknown) {
    const submitted = reviewDraft.value;
    if ((await onAction(actionName, value)) === true)
      reviewDraft.clearIf(submitted);
  }
  return (
    <aside
      className="task-detail"
      aria-label={L('研究任务详情', 'Research task details')}
    >
      <header>
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft size={16} />
          {L('返回任务', 'Back to tasks')}
        </Button>
        <Status status={task.status} />
      </header>
      {task.board_stage &&
        task.status === 'ready' &&
        view.mission.status === 'active' && (
          <p className="muted">
            {L(...taskProgressLabels(task, view.mission))}
          </p>
        )}
      <h3 ref={detailRef} tabIndex={-1}>
        {task.title}
      </h3>
      {moveExplanation && (
        <output className="platform-notice">{moveExplanation}</output>
      )}
      <p>
        {assigneeLabel(task, members, L)} · {L('尝试', 'Attempt')}{' '}
        {task.attempt}
      </p>
      {task.executor === 'human' && canWrite && (
        <label>
          {L('安排核查成员', 'Assign a reviewer')}
          <NativeSelect
            value={
              members.some((m) => m.user_id === task.assignee)
                ? task.assignee
                : ''
            }
            disabled={busy}
            onChange={(e) =>
              void onAction('assign_task', {
                user_id: e.target.value,
                expected: task.revision,
              })
            }
          >
            <option value="" disabled>
              {L('选择成员', 'Choose a member')}
            </option>
            {members
              .filter((m) => m.role !== 'viewer')
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
          </NativeSelect>
        </label>
      )}
      <EvidenceDiscussion
        key={`discussion:${task.id}`}
        projectId={task.project_id}
        targetId={task.id}
      />
      <dl>
        <dt>{L('由谁完成', 'Who does this')}</dt>
        <dd>{roleLabel(task.executor, L)}</dd>
        <dt>{L('输出语言', 'Output language')}</dt>
        <dd>{task.input.locale === 'en' ? 'English' : '中文'}</dd>
        <dt>{L('本步骤已记录费用', 'Recorded cost for this step')}</dt>
        <dd>${(task.cost_units / 1_000_000).toFixed(4)}</dd>
        <dt>{L('所用材料', 'Sources used')}</dt>
        <dd>{task.input.version_ids.length}</dd>
        <dt>{L('需要先完成', 'Needs these steps first')}</dt>
        <dd className="task-dependencies">
          {view.edges
            .filter((edge) => edge.task_id === task.id)
            .map((edge) =>
              view.tasks.find((parent) => parent.id === edge.depends_on),
            )
            .filter((parent): parent is MissionTask => !!parent)
            .map((parent) => (
              <button
                type="button"
                key={parent.id}
                title={parent.title}
                onClick={() => onSelectTask(parent.id)}
              >
                <span>{parent.title}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ))}
          {!view.edges.some((edge) => edge.task_id === task.id) && '—'}
        </dd>
      </dl>
      {task.input.query && (
        <p>
          <strong>{L('查询', 'Query')}</strong> {task.input.query}
        </p>
      )}
      {task.input.prompt && (
        <details className="platform-technical">
          <summary>
            {L('查看本步骤的完整要求', 'View full instructions for this step')}
          </summary>
          <p className="preserve-text">{task.input.prompt}</p>
        </details>
      )}
      {task.error && <div className="platform-notice">{task.error}</div>}
      {hasDraft && (
        <output className="review-draft-status">
          <FileCheck2 size={14} />
          {reviewDraft.storageError
            ? L(
                '草稿暂时无法保存在此设备，请先复制你的意见。',
                'This device could not save the draft. Copy your review before leaving.',
              )
            : L('本机审读草稿已保留', 'Review draft saved on this device')}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={reviewDraft.clear}
          >
            {L('舍弃草稿', 'Discard draft')}
          </Button>
        </output>
      )}
      {outdatedDraft && (
        <output className="platform-notice">
          <span>
            {L(
              '任务在写作期间发生了变化。草稿仍在，请核对最新材料与结果，再继续提交。',
              'This task changed while you were writing. Your draft is preserved. Check the latest sources and result before submitting.',
            )}
          </span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => reviewDraft.update({ revision: task.revision })}
          >
            {L(
              '已核对最新内容，继续编辑',
              'I checked the latest content; continue editing',
            )}
          </Button>
        </output>
      )}
      {task.result && task.input.parameters.extraction !== true && (
        <>
          {(view.corrections || []).some((c) => c.task_id === task.id) && (
            <details className="settings-feedback">
              <summary>
                {L(
                  '此稿已由研究者修订 · 查看修改记录',
                  'Revised by a researcher · View correction history',
                )}
              </summary>
              {(view.corrections || [])
                .filter((c) => c.task_id === task.id)
                .map((c) => (
                  <article key={c.id}>
                    <p>{c.reason}</p>
                    <small>
                      {members.find((m) => m.user_id === c.actor)?.name ||
                        L('研究者', 'Researcher')}{' '}
                      · {new Date(c.created_at).toLocaleString()}
                    </small>
                    <details>
                      <summary>{L('修订前', 'Before correction')}</summary>
                      <p className="whitespace-pre-wrap">
                        {c.body.before?.summary ||
                          L('未保存完整回答', 'No complete answer was saved')}
                      </p>
                    </details>
                    <details>
                      <summary>{L('修订后', 'After correction')}</summary>
                      <p className="whitespace-pre-wrap">
                        {c.body.after.summary}
                      </p>
                    </details>
                  </article>
                ))}
            </details>
          )}
          <ResearchResult
            result={task.result}
            sourceLabel={(id) => {
              const version = versions.find((v) => v.id === id);
              return (
                sources.find((s) => s.id === version?.source_id)?.title ||
                L('原始资料', 'Original source')
              );
            }}
            onSource={(id, page) => {
              const version = versions.find((v) => v.id === id);
              if (version) onOpenSource(version.source_id, id, page);
            }}
          />
        </>
      )}
      {task.result &&
        task.input.parameters.output_schema === 'claim_review_v1' && (
          <ClaimAssessments taskId={task.id} />
        )}
      {task.result && task.input.parameters.extraction === true && (
        <ResearchRecords
          key={task.id}
          draftKey={`canwoo:record-draft:${userId}:${task.project_id}:${task.id}`}
          revision={task.revision}
          result={task.result}
          fields={
            Array.isArray(task.input.parameters.fields)
              ? (task.input.parameters.fields as string[])
              : []
          }
          pages={versions
            .filter((v) => task.input.version_ids.includes(v.id))
            .flatMap((v) =>
              v.pages
                .filter(
                  (p) =>
                    !task.input.page_refs ||
                    task.input.page_refs.some(
                      (r) => r.version_id === v.id && r.page === p.page,
                    ),
                )
                .map((p) => ({
                  ...p,
                  version_id: v.id,
                  source_id: v.source_id,
                  title: sources.find((s) => s.id === v.source_id)?.title,
                  media_type: sources.find((s) => s.id === v.source_id)
                    ?.media_type,
                })),
            )}
          busy={busy}
          onSource={(id, page) => {
            const v = versions.find((v) => v.id === id);
            if (v) onOpenSource(v.source_id, id, page);
          }}
          onCorrect={
            canReview &&
            ['succeeded', 'review', 'accepted'].includes(task.status)
              ? (data, reason, citations, expected) =>
                  onAction('correct_task', {
                    data,
                    citations,
                    reason,
                    expected: expected ?? task.revision,
                  })
              : undefined
          }
        />
      )}
      {task.result && task.input.parameters.extraction === true && (
        <MethodEvaluation
          key={`${task.id}:${task.revision}`}
          task={task}
          view={view}
          busy={busy}
          canReview={
            canReview &&
            ['review', 'succeeded', 'accepted'].includes(task.status)
          }
          onSave={(value) => onAction('evaluate_task', value)}
        />
      )}
      {task.result && <ResearchCandidates result={task.result} />}
      {task.executor === 'human' && task.status === 'ready' && (
        <section className="review-inputs">
          <h4>{L('这一步需要核查的结果', 'Results to review in this step')}</h4>
          {view.tasks
            .filter(
              (p) =>
                p.result &&
                view.edges.some(
                  (e) => e.task_id === task.id && e.depends_on === p.id,
                ),
            )
            .map((p) => (
              <details key={p.id}>
                <summary>{p.title}</summary>
                <Button variant="ghost" onClick={() => onSelectTask(p.id)}>
                  {L(
                    '打开此步骤并核查或纠正',
                    'Open this step to inspect or correct',
                  )}
                </Button>
                <ResearchResult
                  result={p.result!}
                  sourceLabel={(id) =>
                    sources.find(
                      (s) =>
                        s.id === versions.find((v) => v.id === id)?.source_id,
                    )?.title || L('原始资料', 'Original source')
                  }
                  onSource={(id, page) => {
                    const v = versions.find((v) => v.id === id);
                    if (v) onOpenSource(v.source_id, id, page);
                  }}
                />
                {p.input.parameters.extraction === true && (
                  <ResearchRecords
                    result={p.result!}
                    fields={p.input.parameters.fields as string[]}
                    busy={busy}
                    onSource={(id, page) => {
                      const v = versions.find((v) => v.id === id);
                      if (v) onOpenSource(v.source_id, id, page);
                    }}
                  />
                )}
              </details>
            ))}
        </section>
      )}
      {canWrite &&
        task.executor === 'human' &&
        task.status === 'accepted' &&
        !!task.input.parameters.method && (
          <Button
            variant="outline"
            onClick={() =>
              void onAction('save_method', {
                ...(task.input.parameters.method as ResearchMethod),
                instructions: (
                  (task.input.parameters.method as ResearchMethod)
                    .instructions +
                  '\nResearcher corrections and limitations:\n' +
                  (task.result?.summary || '')
                ).slice(0, 6000),
              })
            }
          >
            {L(
              '将纠正后的标准保存为方法',
              'Save the corrected research method',
            )}
          </Button>
        )}
      {canWrite && task.executor === 'human' && task.status === 'ready' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveReview('submit_human_task', {
              summary: humanText,
              expected: reviewDraft.value.revision,
            });
          }}
        >
          {view.tasks.some(
            (parent) =>
              parent.executor === 'model' &&
              parent.result &&
              view.edges.some(
                (edge) =>
                  edge.task_id === task.id && edge.depends_on === parent.id,
              ),
          ) && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !!humanText.trim()}
              onClick={() =>
                setHumanText(
                  view.tasks.find(
                    (parent) =>
                      parent.executor === 'model' &&
                      view.edges.some(
                        (edge) =>
                          edge.task_id === task.id &&
                          edge.depends_on === parent.id,
                      ),
                  )?.result?.summary || '',
                )
              }
            >
              {L('从助手草稿开始修改', 'Edit the assistant draft')}
            </Button>
          )}
          <p>
            {L(
              task.input.parameters.gate === 'discussion'
                ? '写下你的追问、纠正或希望继续检查的解释。保存后，由有审读权限的成员确认采纳；下一位助手随后读取这些意见并回应。'
                : '核对出处后，写下你愿意保留的研究稿与限制。若本计划包含 AI 对读，成果将采用这里的稿件，助手原稿保留在执行记录中。',
              task.input.parameters.gate === 'discussion'
                ? 'Write your question, correction or alternative to examine. After saving, a member with review permission accepts the feedback; the next assistant then reads and responds to it.'
                : 'After checking the sources, write the account and limitations you want to retain. AI reading plans use this reviewed text for the finding; the assistant draft remains in the execution record.',
            )}
          </p>
          <label>
            {L(
              '复核意见、竞争解释与材料缺口',
              'Review, alternatives and coverage gaps',
            )}
            <Textarea
              value={humanText}
              disabled={busy}
              onChange={(event) => setHumanText(event.target.value)}
              required
              rows={6}
              maxLength={30000}
            />
          </label>
          <Button
            type="submit"
            disabled={busy || outdatedDraft || !humanText.trim()}
          >
            <Send size={15} />
            {L('保存我的核查意见', 'Save my review')}
          </Button>
        </form>
      )}
      {canReview && canRepairProse(task) && (
        <ResearchRepair
          task={task}
          versions={versions.filter((v) =>
            task.input.version_ids.includes(v.id),
          )}
          sourceLabel={(id) => {
            const v = versions.find((v) => v.id === id);
            return sources.find((s) => s.id === v?.source_id)?.title || id;
          }}
          busy={busy}
          onSave={(value) => onAction('repair_prose', value)}
        />
      )}
      {canReview && ['review', 'succeeded'].includes(task.status) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveReview('review_task', {
              decision: 'accepted',
              reason,
              expected: reviewDraft.value.revision,
            });
          }}
        >
          <label>
            {L('采纳或退回的依据', 'Reason for acceptance or revision')}
            <Textarea
              value={reason}
              aria-describedby={`review-reason-hint-${task.id}`}
              placeholder={L(
                '例如：已对照原文核实日期；职衔的解释仍需补充材料。',
                'For example: the date matches the original; the title still needs supporting sources.',
              )}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={10000}
            />
          </label>
          <p
            id={`review-reason-hint-${task.id}`}
            className="review-reason-hint"
          >
            {L(
              '填写核查依据后，即可采纳或退回修改。你的判断会保留在研究记录中。',
              'Add your review reason to accept or request changes. Your judgment stays in the research record.',
            )}
          </p>
          <div className="flow-actions">
            <Button
              type="submit"
              disabled={busy || outdatedDraft || !reason.trim()}
            >
              <Check size={15} />
              {L('采纳', 'Accept')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || outdatedDraft || !reason.trim()}
              onClick={() =>
                void saveReview('review_task', {
                  decision: 'rejected',
                  reason,
                  expected: reviewDraft.value.revision,
                })
              }
            >
              {L('退回修改', 'Request changes')}
            </Button>
          </div>
        </form>
      )}
      {task.status === 'uncertain' && task.executor === 'model' && (
        <p className="settings-feedback">
          {L(
            task.result
              ? '已有候选答案时，可以先修订稿件与引文，无需再次付费。修订不会释放尚未核实的费用预留。'
              : '这次未保存完整回答。建议在下方追问中缩小问题、选用快速梳理；新追问会另计费用。请先核对模型厂商记录，超时预留不是已确认账单。',
            task.result
              ? 'You can repair this candidate without another model call. Repair does not release unverified cost reservations.'
              : 'No complete answer was saved. Try a narrower follow-up with Quick reading below; it is a new paid request. Check provider records first: a timeout reservation is not a confirmed charge.',
          )}
        </p>
      )}
      {canWrite &&
        ['failed', 'uncertain', 'rejected', 'stale'].includes(task.status) && (
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => void onAction('retry_task', task.revision)}
          >
            <RefreshCw size={15} />
            {L('创建新的执行尝试', 'Start a new attempt')}
          </Button>
        )}
      <TaskConversation
        key={`assistant:${task.id}`}
        taskId={task.id}
        models={models}
        sources={sources}
        versions={versions}
        onOpenSource={onOpenSource}
      />
    </aside>
  );
}
