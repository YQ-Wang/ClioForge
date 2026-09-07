'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  MessageSquare,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/client-api';
import type { Evidence, Model } from '@/lib/types';
import type { ReadingAssist, ReadingComment } from '@/lib/reading-assistant';
import {
  DEFAULT_RESEARCH_MODEL,
  GLM_PRICE_CEILING,
  type ThinkingEffort,
} from '@/lib/model-routing';
import { useI18n } from '@/lib/i18n/provider';
import { useLocalDraft } from '@/hooks/use-local-draft';
import {
  draftPrefix,
  draftRecord,
  prepareReadingRequest,
  confirmReadingRequest,
} from '@/lib/drafts';

type Thread = {
  role: string;
  comments: ReadingComment[];
  comments_truncated: boolean;
  assists: ReadingAssist[];
};
function limitations(data: unknown): string[] {
  if (
    !data ||
    typeof data !== 'object' ||
    !('limitations' in data) ||
    !Array.isArray(data.limitations)
  )
    return [];
  return data.limitations
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 3);
}

export default function ReadingAnnotations({
  projectId,
  userId,
  evidence,
  models,
  preferredModel,
  active,
  readOnly,
  onClose,
  onModelSettings,
  onBudget,
}: {
  projectId: string;
  userId: string;
  evidence: Evidence;
  models: Model[];
  preferredModel: string;
  active: boolean;
  readOnly: boolean;
  onClose: () => void;
  onModelSettings: () => void;
  onBudget: () => void;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [revision, setRevision] = useState(0);
  const [reply, setReply] = useState('');
  const [modelId, setModelId] = useState(
    () =>
      models.find((m) => m.id === preferredModel)?.id ||
      models.find((m) => m.model_id === DEFAULT_RESEARCH_MODEL)?.id ||
      models[0]?.id ||
      '',
  );
  const [effort, setEffort] = useState<ThinkingEffort>('high');
  const [inputRate, setInputRate] = useState('');
  const [outputRate, setOutputRate] = useState('');
  const selectedModel = models.find((m) => m.id === modelId);
  const isDefault = selectedModel?.model_id === DEFAULT_RESEARCH_MODEL;
  const draftKey = `${draftPrefix(userId, projectId)}reading:${evidence.id}`;
  const draft = useLocalDraft(draftKey, {
    kind: 'reading',
    entityId: evidence.id,
    title: evidence.question,
    sourceId: evidence.source_id,
    versionId: evidence.version_id,
    page: evidence.page,
    text: '',
    question: '',
  });
  const comment = draft.value.text;
  const question = draft.value.question || '';
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const mounted = useRef(false);
  const discussion = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    // Follow an explicit passage selection once, never each polling refresh.
    const frame = requestAnimationFrame(() => {
      discussion.current?.focus({ preventScroll: true });
      discussion.current?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, evidence.id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const restoredRequest = useRef(false);
  useEffect(() => {
    if (!draft.loaded || restoredRequest.current) return;
    restoredRequest.current = true;
    const saved = draft.value.readingRequest;
    if (!saved) return;
    try {
      const input = JSON.parse(saved.signature) as Record<string, unknown>;
      if (input.project_id !== projectId || input.evidence_id !== evidence.id)
        return;
      // Restore the submitted model settings as well as the id: otherwise a
      // non-default model would silently become a new request after reopening.
      if (typeof input.model_id === 'string') setModelId(input.model_id);
      if (['low', 'high', 'max'].includes(String(input.effort)))
        setEffort(input.effort as ThinkingEffort);
      if (
        typeof input.input_rate === 'number' &&
        Number.isFinite(input.input_rate) &&
        input.input_rate > 0
      )
        setInputRate(String(input.input_rate));
      if (
        typeof input.output_rate === 'number' &&
        Number.isFinite(input.output_rate) &&
        input.output_rate > 0
      )
        setOutputRate(String(input.output_rate));
    } catch {
      /* The saved question is still available to edit or copy. */
    }
  }, [draft.loaded, draft.value.readingRequest, projectId, evidence.id]);
  const acknowledgeRequest = useCallback((id: string) => {
    if (!mounted.current) return;
    const current = currentDraft.current;
    const value = confirmReadingRequest(current.value, id);
    if (value === current.value) return;
    if (value.text.trim() || value.question?.trim() || value.readingRequest)
      current.update(value);
    else current.clear();
  }, []);
  useEffect(() => {
    const id = draft.value.readingRequest?.requestId;
    if (
      draft.loaded &&
      id &&
      thread?.assists.some((assist) => assist.task.id === id)
    ) {
      acknowledgeRequest(id);
      setReply(
        locale === 'en'
          ? 'Your previous question was received. Its progress and reply appear below.'
          : '先前的问题已受理，进度和回复显示在下方。',
      );
    }
  }, [
    thread,
    draft.loaded,
    draft.value.readingRequest?.requestId,
    acknowledgeRequest,
    locale,
  ]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let denied = false;
    let inFlight = false;
    const controller = new AbortController();
    const load = async () => {
      if (document.visibilityState !== 'visible' || inFlight || denied) return;
      inFlight = true;
      try {
        const response = await fetch(
          `/api/reading?project_id=${projectId}&evidence_id=${evidence.id}`,
          {
            signal: controller.signal,
            credentials: 'same-origin',
            cache: 'no-store',
          },
        );
        const data = (await response.json().catch(() => {
          throw new ApiError('Request failed', response.status);
        })) as Thread & { error?: string };
        if (!response.ok)
          throw new ApiError(data.error || 'Request failed', response.status);
        if (alive) {
          setThread(data);
          setError('');
          setBlocked(false);
        }
      } catch (e) {
        if (!alive || controller.signal.aborted) return;
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          denied = true;
          setThread(null);
          setBlocked(true);
        }
        setError(e instanceof Error ? e.message : 'Request failed');
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    const visible = () => void load();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [projectId, evidence.id, active, revision]);

  const canWrite =
    !readOnly && !blocked && !!thread && thread.role !== 'viewer';
  async function saveComment(body: unknown) {
    setBusy(true);
    setActionError('');
    setReply('');
    try {
      await api('/api/platform', body);
      if (!mounted.current) return;
      if ((body as { action: string }).action === 'comment') {
        const current = currentDraft.current;
        if (current.value.question?.trim() || current.value.readingRequest)
          current.update({ ...current.value, text: '' });
        else current.clear();
      }
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function ask(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      project_id: projectId,
      evidence_id: evidence.id,
      model_id: modelId,
      question: question.trim(),
      effort,
      locale,
      input_rate: isDefault ? GLM_PRICE_CEILING.input : Number(inputRate),
      output_rate: isDefault ? GLM_PRICE_CEILING.output : Number(outputRate),
    };
    const signature = JSON.stringify(input);
    setBusy(true);
    setActionError('');
    setReply('');
    try {
      const prepared = prepareReadingRequest(
        currentDraft.current.value,
        signature,
      );
      const request = prepared.readingRequest!;
      currentDraft.current.update(prepared);
      // update() reports storage failures in the UI. Verify the identity was
      // actually persisted before allowing a potentially paid network request.
      let stored = false;
      try {
        const saved = draftRecord.safeParse(
          JSON.parse(localStorage.getItem(draftKey) || 'null'),
        );
        stored =
          saved.success &&
          saved.data.value.readingRequest?.requestId === request.requestId &&
          saved.data.value.readingRequest.signature === signature;
      } catch {
        /* A missing durable identity must prevent the model call. */
      }
      if (!stored)
        throw new Error(
          L(
            '无法在此浏览器保存请求编号。请恢复本机存储后再提交，避免断线后重复调用。',
            'This browser could not save the request identity. Restore local storage before submitting so a lost connection cannot cause a duplicate call.',
          ),
        );
      await api('/api/reading', { ...input, request_id: request.requestId });
      if (!mounted.current) return;
      acknowledgeRequest(request.requestId);
      setReply(
        L(
          '问题已提交。实际执行状态、回复或需处理的事项会显示在下方。',
          'Question submitted. Execution status, replies or required actions appear below.',
        ),
      );
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Request failed');
      // The persisted identity survives an uncertain response, closing the
      // pane, and refresh. Repeating the same request reuses its original task.
    } finally {
      setBusy(false);
    }
  }
  const status = (value: string) =>
    ({
      blocked: L('等待前序步骤', 'Waiting'),
      ready: L('准备就绪', 'Ready'),
      queued: L('排队中', 'Queued'),
      running: L('正在阅读', 'Reading'),
      succeeded: L('回复待审读', 'Ready to review'),
      review: L('等待审读', 'Awaiting review'),
      accepted: L('已审读', 'Reviewed'),
      rejected: L('未采纳', 'Not accepted'),
      failed: L('未完成', 'Failed'),
      uncertain: L('需要核查', 'Needs checking'),
      cancelled: L('已取消', 'Cancelled'),
      stale: L('资料已变化', 'Source changed'),
    })[value] || value;
  return (
    <aside
      ref={discussion}
      tabIndex={-1}
      className="reading-discussion"
      aria-label={L(
        '此处的批注与助手',
        'Discussion and assistant for this passage',
      )}
    >
      <header className="reading-discussion-heading">
        <div>
          <MessageSquare size={17} />
          <h3>{L('围绕这一处', 'At this passage')}</h3>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={L('关闭批注', 'Close annotation')}
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </header>
      <div className="reading-anchor">
        <small>
          {L('固定原文', 'Fixed source')} · p.{evidence.page}
        </small>
        <blockquote>{evidence.quote}</blockquote>
        <strong>{evidence.question}</strong>
        {evidence.interpretation && <p>{evidence.interpretation}</p>}
      </div>
      <div className="reading-thread">
        <div className="reading-thread-heading">
          <h4>{L('研究讨论', 'Discussion')}</h4>
          <small>
            {L('阅读时每 5 秒同步', 'Syncs every 5s while reading')}
          </small>
        </div>
        {error && (
          <div className="reading-error" role="alert">
            {error}
            <Button size="sm" variant="ghost" onClick={refresh}>
              <RefreshCw size={14} />
              {L('重试', 'Retry')}
            </Button>
          </div>
        )}
        {!thread && !error && (
          <output>{L('正在读取批注…', 'Loading discussion…')}</output>
        )}
        {thread && !thread.comments.length && (
          <p className="reading-help">
            {L(
              '写下疑问、不同解释，或需要共同核查的地方。',
              'Add a question, an alternative reading, or something to check together.',
            )}
          </p>
        )}
        {thread?.comments_truncated && (
          <p className="reading-help">
            {L('显示最近 100 条讨论。', 'Showing the latest 100 comments.')}
          </p>
        )}
        {thread?.comments
          .slice()
          .reverse()
          .map((c) => (
            <article
              key={c.id}
              className="reading-comment"
              data-resolved={!!c.resolved}
            >
              <div>
                <strong>{c.author_name}</strong>
                <time dateTime={c.created_at}>
                  {new Date(c.created_at).toLocaleString(locale)}
                </time>
              </div>
              <p>{c.body}</p>
              {c.resolved ? (
                <small>
                  <Check size={12} />
                  {L('已解决', 'Resolved')}
                </small>
              ) : (
                canWrite &&
                ['owner', 'reviewer'].includes(thread.role) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void saveComment({
                        action: 'resolve_comment',
                        project_id: projectId,
                        id: c.id,
                      })
                    }
                  >
                    {L('标记已解决', 'Resolve')}
                  </Button>
                )
              )}
            </article>
          ))}
        {canWrite && (
          <form
            className="reading-comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveComment({
                action: 'comment',
                project_id: projectId,
                value: { target_id: evidence.id, body: comment.trim() },
              });
            }}
          >
            <Textarea
              aria-label={L('添加阅读批注', 'Add a reading comment')}
              value={comment}
              onChange={(e) =>
                draft.update({ ...draft.value, text: e.target.value })
              }
              maxLength={10000}
              disabled={busy || !draft.loaded}
              placeholder={L(
                '例如：这个词在同一时期还有其他用法吗？',
                'For example: did this word have other uses in the same period?',
              )}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={busy || !comment.trim()}
            >
              {L('添加批注', 'Add comment')}
            </Button>
          </form>
        )}
      </div>
      <section
        className="reading-assistant"
        aria-label={L(
          '针对原文请助手回应',
          'Ask the assistant about this passage',
        )}
      >
        <div className="reading-thread-heading">
          <h4>
            <Sparkles size={16} />
            {L('请助手回应', 'Ask the assistant')}
          </h4>
          <Button type="button" size="sm" variant="ghost" onClick={onBudget}>
            {L('用量与预算', 'Usage & budget')}
          </Button>
        </div>
        <p className="reading-help">
          {L(
            '助手会阅读这个固定版本的整页、所选文字与最近批注。只有提交问题才调用模型；回复由你审读。',
            'The assistant reads this fixed page, the passage and recent comments. It runs when you submit a question; you review its reply.',
          )}
        </p>
        {canWrite && !models.length && (
          <Button variant="outline" size="sm" onClick={onModelSettings}>
            {L('连接你的模型账户', 'Connect your model account')}
          </Button>
        )}
        {canWrite && !!models.length && (
          <form onSubmit={(e) => void ask(e)} className="reading-ask-form">
            <Textarea
              required
              maxLength={2000}
              aria-label={L('向助手提问', 'Question for the assistant')}
              placeholder={L(
                '基于这一页，这种解释有哪些依据或局限？',
                'What supports this interpretation on this page, and what are its limits?',
              )}
              value={question}
              disabled={busy || !draft.loaded}
              onChange={(e) =>
                draft.update({ ...draft.value, question: e.target.value })
              }
            />
            <div className="reading-model-controls">
              <NativeSelect
                aria-label={L('阅读助手模型', 'Reading assistant model')}
                value={modelId}
                disabled={busy}
                onChange={(e) => {
                  setModelId(e.target.value);
                  setInputRate('');
                  setOutputRate('');
                }}
              >
                {models.map((m) => (
                  <NativeSelectOption key={m.id} value={m.id}>
                    {m.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={L('思考深度', 'Thinking depth')}
                value={effort}
                disabled={busy}
                onChange={(e) => setEffort(e.target.value as ThinkingEffort)}
              >
                <NativeSelectOption value="low">
                  {L('简要', 'Brief')}
                </NativeSelectOption>
                <NativeSelectOption value="high">
                  {L('仔细审读', 'Careful')}
                </NativeSelectOption>
                <NativeSelectOption value="max">
                  {L('深入比较', 'Thorough')}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            {!isDefault && (
              <details open>
                <summary>{L('模型费用估算', 'Model cost estimate')}</summary>
                <div className="reading-model-controls">
                  <label>
                    {L(
                      '输入 / 百万 tokens（美元）',
                      'Input / million tokens (USD)',
                    )}
                    <Input
                      required
                      type="number"
                      min="0.0001"
                      max="10000"
                      step="any"
                      value={inputRate}
                      onChange={(e) => setInputRate(e.target.value)}
                    />
                  </label>
                  <label>
                    {L(
                      '输出 / 百万 tokens（美元）',
                      'Output / million tokens (USD)',
                    )}
                    <Input
                      required
                      type="number"
                      min="0.0001"
                      max="10000"
                      step="any"
                      value={outputRate}
                      onChange={(e) => setOutputRate(e.target.value)}
                    />
                  </label>
                </div>
              </details>
            )}
            <small className="reading-help">
              {L(
                '发送给你选定的模型账户。包含最近 8 条批注的限长快照，完整记录始终保留。',
                'Sent to your chosen model account with a bounded snapshot of the latest 8 comments. The complete discussion is retained.',
              )}
            </small>
            <Button
              type="submit"
              size="sm"
              disabled={
                busy ||
                !question.trim() ||
                !selectedModel ||
                (!isDefault &&
                  !(Number(inputRate) > 0 && Number(outputRate) > 0))
              }
            >
              <Sparkles size={14} />
              {busy
                ? L('正在提交…', 'Submitting…')
                : L('提交问题', 'Ask about this passage')}
            </Button>
          </form>
        )}
        {actionError && (
          <p className="reading-error" role="alert">
            {actionError}
          </p>
        )}
        {draft.error && <p role="alert">{draft.error}</p>}
        {reply && <output className="reading-help">{reply}</output>}
        {thread?.assists.map(({ task, mission_id, context_changed }) => (
          <article key={task.id} className="reading-reply">
            <div className="reading-thread-heading">
              <strong>{L('助手回复', 'Assistant reply')}</strong>
              <span className="reading-reply-state">{status(task.status)}</span>
            </div>
            <p className="reading-reply-question">
              {task.input.query || task.title}
            </p>
            <small className="reading-help">
              {new Date(task.created_at).toLocaleString(locale)}
            </small>
            {context_changed && (
              <p className="reading-context-changed">
                {L(
                  '批注已更新，这条回复未包含后来的变化。可带着新问题再次请助手审读。',
                  'Comments have changed since this request. Ask again to include the new discussion.',
                )}
              </p>
            )}
            {task.error && <p className="reading-error">{task.error}</p>}
            {task.result && (
              <>
                <p className="reading-reply-body">{task.result.summary}</p>
                {!!limitations(task.result.data).length && (
                  <div className="reading-limitations">
                    <h5>
                      {L('本页不能确定什么', 'What this page cannot establish')}
                    </h5>
                    <ul>
                      {limitations(task.result.data).map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <details>
                  <summary>
                    {L('核对原文引文', 'Check source quotations')} ·{' '}
                    {task.result.citations.length}
                  </summary>
                  {task.result.citations.map((c, i) => (
                    <blockquote key={i}>
                      <small>
                        [{i + 1}] · p.{c.page} ·{' '}
                        {L('固定版本', 'Fixed version')}
                      </small>
                      {c.quote}
                    </blockquote>
                  ))}
                </details>
                <p className="reading-help">
                  {L(
                    '文字匹配只核对出处，不代表解释已得到证实。',
                    'Text matching checks the citation, not the historical interpretation.',
                  )}
                </p>
              </>
            )}
            <a
              className="citation"
              href={`/?project=${projectId}&tab=platform&mission=${mission_id}&task=${task.id}`}
            >
              {L('查看过程与人工复核', 'Open workflow & human review')}
              <ArrowUpRight size={14} />
            </a>
          </article>
        ))}
      </section>
    </aside>
  );
}
