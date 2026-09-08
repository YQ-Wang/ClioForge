'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Send,
  Pause,
  Play,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import { nextStepQuestion } from '@/lib/research-next-steps';
import { citationSpan } from '@/lib/citation-location';
import type { TaskResult } from '@/lib/platform/types';
import ResearchText from './research-text';
import { sourcePath } from '@/lib/navigation';
import { DEFAULT_RESEARCH_MODEL } from '@/lib/model-routing';
import { selectedPages } from '@/lib/page-selection';
import { taskStatusLabels } from '@/lib/task-presentation';
import {
  conversationRequestBody,
  emptyConversationDraft,
  prepareConversationRequest,
  readConversationDraft,
  reconcileConversationDraft,
  writeConversationDraftIfUnchanged,
  type ConversationDraft,
} from '@/lib/task-conversation-draft';
import type { taskConversation } from '@/lib/task-conversation';
import type { Model, Source, SourceVersion } from '@/lib/types';
import './task-conversation.css';

type Conversation = Awaited<ReturnType<typeof taskConversation>>;
const completedAnswer = (turn: Conversation['turns'][number]) =>
  turn.result && ['succeeded', 'accepted', 'review'].includes(turn.status);
const taskHref = (task: {
  project_id: string;
  mission_id: string;
  id: string;
}) =>
  `/?project=${task.project_id}&tab=platform&mission=${task.mission_id}&task=${task.id}`;

export default function TaskConversation({
  taskId,
  models,
  sources,
  versions,
  onOpenSource,
  nextSteps = [],
}: {
  taskId: string;
  models: Model[];
  sources: Source[];
  versions: SourceVersion[];
  nextSteps?: string[];
  onOpenSource?: (
    source: string,
    version: string,
    page: number,
    citation?: TaskResult['citations'][number],
  ) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const defaultModel =
    models.find((item) => item.model_id === DEFAULT_RESEARCH_MODEL)?.id ||
    models[0]?.id ||
    '';
  const [data, setData] = useState<Conversation | null>(null),
    [draft, setDraft] = useState(() => emptyConversationDraft(defaultModel)),
    [initialized, setInitialized] = useState(false),
    [refreshing, setRefreshing] = useState(true),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [storageFailed, setStorageFailed] = useState(false),
    [submittedId, setSubmittedId] = useState(''),
    [controlSaved, setControlSaved] = useState(false);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft),
    draftKey = useRef(''),
    dataRef = useRef(data),
    defaultModelRef = useRef(defaultModel),
    mounted = useRef(false),
    fetching = useRef(0),
    refreshSequence = useRef(0);
  defaultModelRef.current = defaultModel;

  const saveDraft = useCallback(
    (next: ConversationDraft, previous?: ConversationDraft) => {
      draftRef.current = next;
      setDraft(next);
      if (!draftKey.current) return false;
      try {
        if (
          previous &&
          !writeConversationDraftIfUnchanged(
            localStorage,
            draftKey.current,
            previous,
            next,
          )
        )
          return false;
        if (!previous)
          localStorage.setItem(draftKey.current, JSON.stringify(next));
        setStorageFailed(false);
        return true;
      } catch {
        setStorageFailed(true);
        return false;
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    fetching.current++;
    setRefreshing(true);
    try {
      const result = await api<Conversation>(
        `/api/task-conversation?task_id=${taskId}`,
      );
      if (!mounted.current || sequence !== refreshSequence.current)
        return result;
      const latest = result.turns.filter(completedAnswer).at(-1)?.id || '';
      let current = draftRef.current;
      const restoring = !draftKey.current;
      if (!draftKey.current) {
        draftKey.current = `canwoo:task-question:${result.user_id}:${result.root.id}`;
        current = emptyConversationDraft(defaultModelRef.current, latest);
        try {
          current = readConversationDraft(
            localStorage.getItem(draftKey.current),
            current,
            result.root.id,
          );
        } catch {
          setStorageFailed(true);
        }
      }
      const pendingId = current.pending?.id;
      const reconciled = reconcileConversationDraft(
        current,
        result.turns.map((turn) => turn.id),
        latest,
      );
      if (pendingId && result.turns.some((turn) => turn.id === pendingId)) {
        setSubmittedId(pendingId);
        setError('');
      }
      if (reconciled !== draftRef.current)
        saveDraft(reconciled, restoring ? undefined : current);
      dataRef.current = result;
      setData(result);
      setInitialized(true);
      setLoadError('');
      return result;
    } catch (cause) {
      if (mounted.current && sequence === refreshSequence.current)
        setLoadError(cause instanceof Error ? cause.message : 'Request failed');
      throw cause;
    } finally {
      fetching.current--;
      if (mounted.current && sequence === refreshSequence.current)
        setRefreshing(false);
    }
  }, [taskId, saveDraft]);

  useEffect(() => {
    mounted.current = true;
    void refresh().catch(() => {});
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !fetching.current)
        void refresh().catch(() => {});
    }, 5000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (
      initialized &&
      defaultModel &&
      !draftRef.current.model &&
      !draftRef.current.pending
    )
      saveDraft({ ...draftRef.current, model: defaultModel }, draftRef.current);
  }, [defaultModel, initialized, saveDraft]);

  const changeDraft = (patch: Partial<ConversationDraft>) => {
    if (draftRef.current.pending) return;
    saveDraft({ ...draftRef.current, ...patch, touched: true });
    setError('');
    setControlSaved(false);
    if (data?.turns.some((turn) => turn.id === submittedId)) setSubmittedId('');
  };
  const answers = data?.turns.filter(completedAnswer) || [];
  const active = data?.turns.find((turn) =>
    ['blocked', 'ready', 'queued', 'running'].includes(turn.status),
  );
  const awaitingUpdate =
    !!submittedId && !data?.turns.some((turn) => turn.id === submittedId);
  const atLimit = (data?.turns.length || 0) >= 20;
  const missingModel =
    !!draft.model && !models.some((item) => item.id === draft.model);
  const missingAnswer =
    !!draft.after && !answers.some((turn) => turn.id === draft.after);
  const missingSource =
    draft.scope === 'selected'
      ? draft.selected.some(
          (item) => !versions.some((version) => version.id === item.version_id),
        )
      : !!draft.extra &&
        !versions.some((version) => version.id === draft.extra);
  const inheritedVersions = [
    ...new Set(
      [
        data?.root,
        ...answers.filter((answer) => answer.id === draft.after),
      ].flatMap((task) =>
        task
          ? [
              ...task.input.version_ids,
              ...(['succeeded', 'accepted', 'review'].includes(task.status)
                ? task.result?.citations.map(
                    (citation) => citation.version_id,
                  ) || []
                : []),
            ]
          : [],
      ),
    ),
  ];
  const headVersions = sources
    .map(
      (source) =>
        versions
          .filter((version) => version.source_id === source.id)
          .sort((a, b) => b.revision - a.revision)[0],
    )
    .filter(Boolean);
  const scopeVersions = versions.filter(
    (version) =>
      headVersions.some((head) => head.id === version.id) ||
      inheritedVersions.includes(version.id) ||
      draft.selected.some((item) => item.version_id === version.id),
  );
  const selectedVersion = versions.find(
    (version) => version.id === draft.extra,
  );
  const selectableVersions =
    selectedVersion &&
    !headVersions.some((version) => version.id === selectedVersion.id)
      ? [...headVersions, selectedVersion]
      : headVersions;

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data || busy) return;
    setBusy('submit');
    setError('');
    setControlSaved(false);
    let pending = draftRef.current.pending;
    let submittedDraft: ConversationDraft | undefined;
    try {
      if (!pending) {
        const current = draftRef.current;
        const version = versions.find((item) => item.id === current.extra);
        if (current.scope === 'inherited' && current.extra && !version)
          throw new Error(
            L(
              '补充材料已不可用，请重新选择。',
              'Choose an available additional source.',
            ),
          );
        const extraPages =
          current.scope === 'inherited' && version
            ? selectedPages(
                current.pages,
                version.pages.map((page) => page.page),
              ).map((page) => ({ version_id: version.id, page }))
            : [];
        const sourcePages =
          current.scope === 'selected'
            ? current.selected.flatMap((item) => {
                const selected = versions.find(
                  (version) => version.id === item.version_id,
                );
                if (!selected)
                  throw new Error(
                    L(
                      '所选材料已不可用，请重新选择。',
                      'Choose an available source.',
                    ),
                  );
                return selectedPages(
                  item.pages,
                  selected.pages.map((page) => page.page),
                ).map((page) => ({ version_id: selected.id, page }));
              })
            : undefined;
        if (sourcePages && (!sourcePages.length || sourcePages.length > 24))
          throw new Error(
            L(
              '请为本次追问选择 1–24 页材料。',
              'Choose 1–24 pages for this follow-up.',
            ),
          );
        pending = prepareConversationRequest(
          {
            task_id: data.root.id,
            question: current.question.trim(),
            model_id: current.model,
            after_id: current.after || null,
            extra_pages: extraPages,
            ...(sourcePages ? { source_pages: sourcePages } : {}),
            locale: data.root.input.locale,
            effort: current.effort,
          },
          null,
          () => crypto.randomUUID(),
        );
      }
      // Persist the complete, immutable request before a network call can succeed.
      submittedDraft = { ...draftRef.current, pending };
      if (!saveDraft(submittedDraft)) return;
      await api('/api/task-conversation', conversationRequestBody(pending));
      if (!mounted.current) return;
      setSubmittedId(pending.id);
      if (draftRef.current.pending?.id === pending.id)
        saveDraft(
          {
            ...draftRef.current,
            question: '',
            pending: null,
            touched: false,
          },
          submittedDraft,
        );
      // An accepted request remains accepted even if refreshing its display fails.
      await refresh().catch(() => {});
    } catch (cause) {
      const pendingId = pending?.id;
      if (
        !mounted.current ||
        (pendingId &&
          dataRef.current?.turns.some((turn) => turn.id === pendingId))
      )
        return;
      if (
        cause instanceof ApiError &&
        [400, 401, 403, 404, 409, 422].includes(cause.status)
      )
        saveDraft({ ...draftRef.current, pending: null }, submittedDraft);
      setError(
        cause instanceof Error
          ? cause.message
          : L('暂时无法发送追问。', 'Could not send the follow-up.'),
      );
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <section
      className="task-conversation"
      aria-labelledby={`conversation-title-${taskId}`}
    >
      <header className="task-conversation-heading">
        <h4 id={`conversation-title-${taskId}`}>
          <MessageSquare size={17} />
          {L('继续追问', 'Follow up')}
        </h4>
        {data && (
          <span className="task-conversation-count">
            {data.turns.length} / 20
          </span>
        )}
      </header>
      <p className="task-conversation-description">
        {L(
          '基于原任务和选定回答继续研究。新回答会保留引用，并等待你的审读。',
          'Continue from the original task and a selected answer. New answers keep their citations and await your review.',
        )}
      </p>
      {data && data.root.id !== taskId && (
        <Link className="task-conversation-root" href={taskHref(data.root)}>
          {L('返回原任务', 'Back to original task')}
          <ExternalLink size={13} />
        </Link>
      )}
      {!initialized && refreshing && (
        <output className="task-conversation-feedback">
          <LoaderCircle size={15} className="animate-spin" />
          {L('正在读取追问…', 'Loading follow-ups…')}
        </output>
      )}
      {loadError && (
        <div
          className="task-conversation-feedback task-conversation-feedback-warning"
          role="alert"
        >
          <div>
            <strong>
              {initialized
                ? L('暂时无法更新进度', 'Could not update progress')
                : L('暂时无法读取追问', 'Could not load follow-ups')}
            </strong>
            <p>{loadError}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refresh().catch(() => {})}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {L('重新读取', 'Reload')}
          </Button>
        </div>
      )}
      {error && (
        <p
          className="task-conversation-feedback task-conversation-feedback-warning"
          role="alert"
        >
          {error}
        </p>
      )}
      {submittedId && !draft.question && (
        <output className="task-conversation-feedback">
          {L(
            '追问已提交。请在下方查看执行状态、回答与需处理的事项。',
            'Follow-up submitted. Its status, answer and any issues appear below.',
          )}
        </output>
      )}
      {controlSaved && (
        <output className="task-conversation-feedback">
          {L('调度状态已更新。', 'Scheduling updated.')}
        </output>
      )}
      {!!data?.turns.length && (
        <div className="task-conversation-history">
          {data.turns.map((turn, index) => (
            <article key={turn.id} className="task-message">
              <div className="task-message-heading">
                <strong>
                  {L('追问', 'Follow-up')} {index + 1}
                </strong>
                <span className={`task-state-label task-state-${turn.status}`}>
                  {taskStatusLabels[turn.status][locale === 'en' ? 1 : 0]}
                </span>
              </div>
              <p className="task-message-question">{turn.input.query}</p>
              <div className="task-message-meta">
                <span>{turn.author_name}</span>
                <time dateTime={turn.created_at}>
                  {new Date(turn.created_at).toLocaleString(locale)}
                </time>
                <span>
                  {L('已记录费用', 'Recorded cost')} $
                  {(turn.cost_units / 1e6).toFixed(4)}
                </span>
              </div>
              {turn.result &&
                (turn.id === taskId ? (
                  <p className="task-message-current">
                    {L(
                      '当前任务的回答已显示在上方。',
                      'This task’s answer is shown above.',
                    )}
                  </p>
                ) : (
                  <details className="task-message-answer">
                    <summary>
                      {L('查看回答与引用', 'View answer & citations')}
                    </summary>
                    <ResearchText
                      text={turn.result.summary}
                      citationLink={(number) => {
                        const citation = turn.result?.citations[number - 1];
                        const version = versions.find(
                          (item) => item.id === citation?.version_id,
                        );
                        if (!citation || !version || !onOpenSource)
                          return undefined;
                        const title =
                          sources.find(
                            (source) => source.id === version.source_id,
                          )?.title || L('原始资料', 'Original source');
                        return {
                          label: L(
                            `查看引文 ${number} 原文：${title}，第 ${citation.page} 页`,
                            `Read citation ${number}: ${title}, page ${citation.page}`,
                          ),
                          onOpen: () =>
                            onOpenSource(
                              version.source_id,
                              version.id,
                              citation.page,
                              citation,
                            ),
                        };
                      }}
                    />
                    {!!turn.result.citations.length && (
                      <ol>
                        {turn.result.citations.map(
                          (citation, citationIndex) => (
                            <li key={citationIndex}>
                              <Link
                                href={sourcePath(
                                  turn.project_id,
                                  citation.version_id,
                                  citation.page,
                                  citationSpan(
                                    versions
                                      .find(
                                        (version) =>
                                          version.id === citation.version_id,
                                      )
                                      ?.pages.find(
                                        (page) => page.page === citation.page,
                                      )?.text || '',
                                    citation,
                                  ),
                                )}
                                onClick={(event) => {
                                  // Keep modified clicks as ordinary links, while
                                  // normal reading preserves the task return path.
                                  const version = versions.find(
                                    (item) => item.id === citation.version_id,
                                  );
                                  if (
                                    !onOpenSource ||
                                    !version ||
                                    event.button !== 0 ||
                                    event.metaKey ||
                                    event.ctrlKey ||
                                    event.shiftKey ||
                                    event.altKey
                                  )
                                    return;
                                  event.preventDefault();
                                  onOpenSource(
                                    version.source_id,
                                    version.id,
                                    citation.page,
                                    citation,
                                  );
                                }}
                              >
                                {citation.quote} · {L('页', 'p.')}{' '}
                                {citation.page}
                              </Link>
                            </li>
                          ),
                        )}
                      </ol>
                    )}
                  </details>
                ))}
              {turn.error && (
                <p
                  className="task-conversation-feedback task-conversation-feedback-warning"
                  role="alert"
                >
                  {turn.error}
                </p>
              )}
              <div className="task-message-actions">
                {turn.id !== taskId && (
                  <Link href={taskHref(turn)}>
                    <ExternalLink size={14} />
                    {L('查看任务与审读', 'Open task & review')}
                  </Link>
                )}
                {data.can_write &&
                  ['active', 'paused'].includes(turn.mission_status) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={async () => {
                        setBusy(turn.id);
                        setError('');
                        setControlSaved(false);
                        try {
                          await api('/api/platform', {
                            action: 'control_mission',
                            project_id: turn.project_id,
                            id: turn.mission_id,
                            value:
                              turn.mission_status === 'paused'
                                ? 'resume'
                                : 'pause',
                          });
                          if (!mounted.current) return;
                          setControlSaved(true);
                          await refresh().catch(() => {});
                        } catch (cause) {
                          if (mounted.current)
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : L(
                                    '无法更新调度。',
                                    'Could not update scheduling.',
                                  ),
                            );
                        } finally {
                          if (mounted.current) setBusy(null);
                        }
                      }}
                    >
                      {busy === turn.id ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : turn.mission_status === 'paused' ? (
                        <Play size={14} />
                      ) : (
                        <Pause size={14} />
                      )}
                      {turn.mission_status === 'paused'
                        ? L('继续调度', 'Resume')
                        : L('暂停调度', 'Pause scheduling')}
                    </Button>
                  )}
              </div>
            </article>
          ))}
        </div>
      )}
      {initialized && data?.can_write && (
        <form className="task-conversation-form" onSubmit={submit}>
          <fieldset disabled={!!busy || !!draft.pending}>
            {!!nextSteps.length &&
              (data.root.id === taskId ||
                answers.some((answer) => answer.id === taskId)) && (
                <section
                  className="task-next-checks"
                  aria-label={L(
                    '把建议接到下一轮核查',
                    'Continue from a proposed check',
                  )}
                >
                  <h5>
                    {L(
                      '把建议接到下一轮核查',
                      'Continue from a proposed check',
                    )}
                  </h5>
                  <p>
                    {L(
                      '先准备问题，再补充材料、确认阅读范围并发送。准备问题不会调用模型；建议并不表示已经找到了这些资料。',
                      'Prepare a question, then add sources, check the reading scope and send. Preparing a question makes no model call; these suggestions do not mean the sources have been found.',
                    )}
                  </p>
                  <ol>
                    {nextSteps.map((step, index) => (
                      <li key={step}>
                        <ResearchText text={step.replace(/\[\d+\]/g, '')} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!!draft.question.trim()}
                          onClick={() => {
                            changeDraft({
                              question: nextStepQuestion(step, locale),
                              after: data.root.id === taskId ? '' : taskId,
                            });
                            questionInput.current?.focus();
                          }}
                          aria-label={L(
                            `准备第 ${index + 1} 项核查问题`,
                            `Prepare question for check ${index + 1}`,
                          )}
                        >
                          {L('准备追问', 'Prepare question')}
                        </Button>
                      </li>
                    ))}
                  </ol>
                  {!!draft.question.trim() && (
                    <small>
                      {L(
                        '已有追问草稿。清空问题后可选用另一项建议。',
                        'A question draft is already present. Clear it to choose another suggestion.',
                      )}
                    </small>
                  )}
                </section>
              )}
            <label>
              {L('依据哪条回答', 'Continue from')}
              <NativeSelect
                value={draft.after}
                onChange={(event) => changeDraft({ after: event.target.value })}
              >
                <option value="">{L('仅原任务', 'Original task only')}</option>
                {missingAnswer && (
                  <option value={draft.after}>
                    {L('所选回答已不可用', 'Selected answer unavailable')}
                  </option>
                )}
                {answers.map((turn) => (
                  <option key={turn.id} value={turn.id}>
                    {turn.input.query.slice(0, 90)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <section
              className="task-conversation-scope"
              aria-label={L('本次阅读范围', 'Sources for this follow-up')}
            >
              <label>
                {L('本次阅读范围', 'Sources for this follow-up')}
                <NativeSelect
                  value={draft.scope}
                  onChange={(event) =>
                    changeDraft({
                      scope: event.target.value as ConversationDraft['scope'],
                    })
                  }
                >
                  <option value="inherited">
                    {L(
                      `沿用已有 ${inheritedVersions.length} 份材料`,
                      `Keep ${inheritedVersions.length} existing sources`,
                    )}
                  </option>
                  <option value="selected">
                    {L('只读我选择的材料页', 'Read only the pages I choose')}
                  </option>
                </NativeSelect>
              </label>
              {draft.scope === 'selected' ? (
                <>
                  <p className="task-conversation-field-hint">
                    {L(
                      '只发送勾选的页和本次问题。此前问题作为背景，旧回答和旧引文不带入，避免混入未选材料。最多 10 份、24 页。',
                      'Send only the selected pages and this question. Earlier questions provide background; previous answers and quotations are omitted. Up to 10 sources and 24 pages.',
                    )}
                  </p>
                  <div className="task-conversation-scope-list">
                    {scopeVersions.map((version) => {
                      const item = draft.selected.find(
                        (item) => item.version_id === version.id,
                      );
                      const title =
                        sources.find(
                          (source) => source.id === version.source_id,
                        )?.title || L('材料', 'Source');
                      return (
                        <div
                          key={version.id}
                          className="task-conversation-scope-row"
                        >
                          <label className="task-conversation-scope-check">
                            <input
                              type="checkbox"
                              checked={!!item}
                              onChange={(event) =>
                                changeDraft({
                                  selected: event.target.checked
                                    ? [
                                        ...draft.selected,
                                        {
                                          version_id: version.id,
                                          pages: String(
                                            version.pages[0]?.page || 1,
                                          ),
                                        },
                                      ]
                                    : draft.selected.filter(
                                        (item) =>
                                          item.version_id !== version.id,
                                      ),
                                })
                              }
                            />
                            <span>
                              {title} · v{version.revision}
                            </span>
                          </label>
                          {item && (
                            <label>
                              {L('页码', 'Pages')}
                              <Input
                                aria-label={L(
                                  `${title} 的阅读页码`,
                                  `Pages to read in ${title}`,
                                )}
                                value={item.pages}
                                placeholder="1-3, 5"
                                required
                                onChange={(event) =>
                                  changeDraft({
                                    selected: draft.selected.map((selected) =>
                                      selected.version_id === version.id
                                        ? {
                                            ...selected,
                                            pages: event.target.value,
                                          }
                                        : selected,
                                    ),
                                  })
                                }
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="task-conversation-field-hint">
                    {L(
                      `已选择 ${draft.selected.length} 份材料`,
                      `${draft.selected.length} sources selected`,
                    )}
                  </p>
                </>
              ) : (
                <p className="task-conversation-field-hint">
                  {L(
                    '会发送原任务与所选回答使用的材料。需要缩小范围时，请选择“只读我选择的材料页”。',
                    'Includes the sources used by the original task and selected answer. Choose specific pages above to narrow the scope.',
                  )}
                </p>
              )}
            </section>
            <label className="task-conversation-question-label">
              {L('你的追问', 'Your question')}
              <Textarea
                ref={questionInput}
                value={draft.question}
                onChange={(event) =>
                  changeDraft({ question: event.target.value })
                }
                maxLength={2000}
                required
                rows={4}
                placeholder={L(
                  '例如：哪些证据可能反驳这项解释？',
                  'For example: what evidence might challenge this interpretation?',
                )}
              />
            </label>
            <div className="task-conversation-draft-status">
              <span>
                {draft.touched && !storageFailed && !draft.pending
                  ? L('草稿已保存在此浏览器', 'Draft saved in this browser')
                  : ''}
              </span>
              <span>{draft.question.length} / 2000</span>
            </div>
            <details className="task-conversation-options">
              <summary>
                {L('模型与补充材料', 'Model & additional sources')}
              </summary>
              <div className="task-conversation-options-grid">
                <label>
                  {L('模型连接', 'Model connection')}
                  <NativeSelect
                    value={draft.model}
                    onChange={(event) =>
                      changeDraft({ model: event.target.value })
                    }
                  >
                    {!draft.model && (
                      <option value="">
                        {L('选择模型连接', 'Choose a model connection')}
                      </option>
                    )}
                    {missingModel && (
                      <option value={draft.model}>
                        {L(
                          '所选模型连接已不可用',
                          'Selected model connection unavailable',
                        )}
                      </option>
                    )}
                    {models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · {item.model_id}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label>
                  {L('分析深度', 'Analysis depth')}
                  <NativeSelect
                    value={draft.effort}
                    onChange={(event) =>
                      changeDraft({
                        effort: event.target
                          .value as ConversationDraft['effort'],
                      })
                    }
                  >
                    <option value="low">
                      {L('快速梳理', 'Quick reading')}
                    </option>
                    <option value="high">
                      {L('仔细分析', 'Careful analysis')}
                    </option>
                    <option value="max">
                      {L('深入核查', 'Thorough review')}
                    </option>
                  </NativeSelect>
                </label>
                {draft.scope === 'inherited' && (
                  <label className="task-conversation-source">
                    {L('补充一份材料', 'Add a source')}
                    <NativeSelect
                      value={draft.extra}
                      onChange={(event) => {
                        const version = versions.find(
                          (item) => item.id === event.target.value,
                        );
                        changeDraft({
                          extra: event.target.value,
                          pages: String(version?.pages[0]?.page || 1),
                        });
                      }}
                    >
                      <option value="">
                        {L('沿用现有材料', 'Keep current sources')}
                      </option>
                      {missingSource && (
                        <option value={draft.extra}>
                          {L('所选材料已不可用', 'Selected source unavailable')}
                        </option>
                      )}
                      {selectableVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {sources.find(
                            (source) => source.id === version.source_id,
                          )?.title || L('材料', 'Source')}{' '}
                          · v{version.revision}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                )}
                {draft.scope === 'inherited' && draft.extra && (
                  <label className="task-conversation-source">
                    {L('补充材料页码', 'Additional source pages')}
                    <Input
                      value={draft.pages}
                      onChange={(event) =>
                        changeDraft({ pages: event.target.value })
                      }
                      placeholder="1-3, 5"
                      required
                    />
                    <span className="task-conversation-field-hint">
                      {L(
                        '例如 1-3, 5，最多 10 页。',
                        'For example 1-3, 5. Up to 10 pages.',
                      )}
                    </span>
                  </label>
                )}
              </div>
            </details>
          </fieldset>
          {storageFailed && (
            <p
              className="task-conversation-feedback task-conversation-feedback-warning"
              role="alert"
            >
              {L(
                '浏览器暂时无法保存草稿。请允许本地存储后再发送，避免丢失或重复提交。',
                'Allow browser storage before sending so the draft and retry request can be retained.',
              )}
            </p>
          )}
          {!models.length && (
            <Link className="task-conversation-root" href="/?settings=models">
              {L('先连接你的模型', 'Connect your model first')}
              <ExternalLink size={13} />
            </Link>
          )}
          {(missingModel || missingAnswer || missingSource) &&
            !draft.pending && (
              <p
                className="task-conversation-feedback task-conversation-feedback-warning"
                role="alert"
              >
                {L(
                  '有一项已保存的选择不再可用，请检查回答、模型与补充材料。',
                  'A saved selection is unavailable. Check the answer, model and additional source.',
                )}
              </p>
            )}
          {draft.pending && !busy && (
            <output className="task-conversation-feedback">
              {L(
                '发送结果尚未确认。重试会沿用同一请求，避免重复提交。',
                'Submission is not yet confirmed. Retry uses the same request to avoid duplicates.',
              )}
            </output>
          )}
          {active && !draft.pending && (
            <p className="task-conversation-field-hint">
              {active.mission_status === 'paused'
                ? L(
                    '当前追问已暂停，继续调度后才能完成。',
                    'The current follow-up is paused. Resume it to continue.',
                  )
                : active.status === 'blocked'
                  ? L(
                      '当前追问正在等待前置步骤，请打开任务查看需处理的事项。你可以先写好下一条。',
                      'This follow-up is waiting for an earlier step. Open the task to see what needs attention; you can draft the next question now.',
                    )
                  : L(
                      '当前追问仍在处理。你可以先写好下一条。',
                      'A follow-up is in progress. You can draft the next question now.',
                    )}
              {active.id !== taskId && (
                <Link
                  className="task-conversation-active-link"
                  href={taskHref(active)}
                >
                  {L('查看当前追问', 'Open current follow-up')}
                  <ExternalLink size={13} />
                </Link>
              )}
            </p>
          )}
          {atLimit && (
            <p className="task-conversation-field-hint">
              {L(
                '已达到 20 次追问。请将新问题另建研究计划。',
                'This conversation has reached 20 follow-ups. Start a new research plan for further questions.',
              )}
            </p>
          )}
          <div className="task-conversation-submit">
            <Button
              type="submit"
              disabled={
                !!busy ||
                (!draft.pending &&
                  (!draft.model ||
                    !draft.question.trim() ||
                    !!active ||
                    atLimit ||
                    awaitingUpdate ||
                    missingModel ||
                    missingAnswer ||
                    missingSource ||
                    (draft.scope === 'selected' &&
                      (!draft.selected.length || draft.selected.length > 10))))
              }
            >
              {busy === 'submit' ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : draft.pending ? (
                <RefreshCw size={14} />
              ) : (
                <Send size={14} />
              )}
              {busy === 'submit'
                ? L('正在发送…', 'Sending…')
                : draft.pending
                  ? L('重试发送', 'Retry submission')
                  : active
                    ? L('等待当前回答', 'Waiting for current answer')
                    : awaitingUpdate
                      ? L('正在读取新追问…', 'Loading submitted follow-up…')
                      : L('发送追问', 'Send follow-up')}
            </Button>
            <p>
              {L(
                '使用你的模型连接和项目预算。',
                'Uses your model connection and project budget.',
              )}
            </p>
          </div>
        </form>
      )}
      {initialized && data && !data.can_write && (
        <p className="task-conversation-field-hint">
          {L(
            '你可以查看追问。项目编辑者可继续提问。',
            'You can read follow-ups. Project editors can add questions.',
          )}
        </p>
      )}
    </section>
  );
}
