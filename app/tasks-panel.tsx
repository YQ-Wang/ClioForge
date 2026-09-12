'use client';
import { useI18n } from '@/lib/i18n/provider';
import { useEffect, useState } from 'react';
import { Inbox, Pause, Play, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Field, Notice } from './workspace';
import { api } from '@/lib/client-api';
import type { Model, Source, SourceVersion, Run } from '@/lib/types';
import type { WorkbenchData, Job } from '@/lib/workbench-types';
import type { ThinkingEffort } from '@/lib/model-routing';
import { readableResponse } from '@/lib/readable-response';
import { sourcePath } from '@/lib/navigation';
import ResearchResult from './research-result';
import ResearchText from './research-text';
const statusName = {
  queued: '排队中',
  running: '运行中',
  paused: '已暂停',
  succeeded: '已完成 · 待核查',
  failed: '准备失败',
  cancelled: '已取消',
  uncertain: '结果未确认',
};
const money = (units: number) =>
  (units / 1_000_000).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
export default function TasksPanel({
  projectId,
  data,
  models,
  sources,
  versions,
  runs,
  onSaved,
}: {
  projectId: string;
  data: WorkbenchData;
  models: Model[];
  sources: Source[];
  versions: SourceVersion[];
  runs: Run[];
  onSaved: () => Promise<unknown>;
}) {
  const { t, locale } = useI18n();
  function resultView(text: string) {
    const result = readableResponse(text);
    if (!result && /^\s*(?:```json|\{)/.test(text))
      return (
        <>
          <p>
            {locale === 'en'
              ? 'This result could not be displayed as a complete report. Check the original response before using it.'
              : '这份返回内容尚不能完整展示为报告。请核查原始返回内容后再使用。'}
          </p>
          <details>
            <summary>
              {locale === 'en' ? 'Original response' : '原始返回内容'}
            </summary>
            <pre className="research-output">{text}</pre>
          </details>
        </>
      );
    return result ? (
      <ResearchResult
        result={result}
        sourceLabel={(id) => {
          const version = versions.find((v) => v.id === id);
          return (
            sources.find((s) => s.id === version?.source_id)?.title ||
            (locale === 'en' ? 'Source unavailable' : '资料不可用')
          );
        }}
        onSource={(id, page) => {
          if (
            versions.some(
              (v) => v.id === id && v.pages.some((p) => p.page === page),
            )
          )
            window.location.assign(sourcePath(projectId, id, page));
          else
            setMessage(
              locale === 'en'
                ? 'This citation points to an unavailable source or page.'
                : '这条引文指向的资料或页码不可用，请核查引用。',
            );
        }}
      />
    ) : (
      <ResearchText text={text} />
    );
  }
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [question, setQuestion] = useState(''),
    [modelId, setModelId] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [inputRate, setInputRate] = useState(''),
    [outputRate, setOutputRate] = useState(''),
    [maxOutput, setMaxOutput] = useState('16384'),
    [effort, setEffort] = useState<ThinkingEffort>('high'),
    [limit, setLimit] = useState(''),
    [inboxFilter, setInboxFilter] = useState('pending');
  const active = data.jobs.some(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const budgetUnits = data.budget?.limit_units;
  useEffect(() => {
    setLimit(budgetUnits === undefined ? '' : String(budgetUnits / 1_000_000));
  }, [budgetUnits]);
  useEffect(() => {
    const timer = setInterval(
      () => {
        void onSaved();
      },
      active ? 5000 : 30000,
    );
    return () => clearInterval(timer);
  }, [onSaved, active]);
  const latest = (id: string) =>
    versions
      .filter((v) => v.source_id === id)
      .sort((a, b) => b.revision - a.revision)[0];
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(false);
    }
  }
  async function jobAction(
    job: Job,
    action: 'pause' | 'resume' | 'cancel' | 'retry',
  ) {
    await work(async () => {
      await api('/api/jobs', {
        action,
        id: job.id,
        ...(action === 'retry' ? { new_id: crypto.randomUUID() } : {}),
      });
      setMessage(
        action === 'retry'
          ? '已创建新的重试任务，并重新预留预算。'
          : '任务状态已更新。',
      );
    });
  }
  return (
    <>
      <div className="section-toolbar">
        <div>
          <h2 className="tool-heading">{t('后台研究与待审收件箱')}</h2>
          <p>{t('任务与固定资料版本一起保存；关闭浏览器后由队列继续执行。')}</p>
        </div>
        <Button variant="ghost" onClick={() => void onSaved()}>
          <RefreshCw size={15} />
          {t('刷新')}
        </Button>
      </div>
      {message && <Notice text={message} />}
      <section className="tool-section">
        <h2>{t('研究助手预算')}</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t(
            'OCR、即时分析与后台任务共用此额度。调用前按模型费率预留，成功后按返回用量核算；结果未确认时保留预留，不自动重试。这是费用估算控制，不是厂商账单硬限额。',
          )}
        </p>
        <div className="budget-summary">
          <span>
            {t('总额度')}
            <strong>{money(data.budget?.limit_units || 0)}</strong>
          </span>
          <span>
            {t('已用 / 已预留')}{' '}
            <strong>{money(data.budget?.committed_units || 0)}</strong>
          </span>
          <span>
            {t('剩余额度')}{' '}
            <strong>
              {money(
                Math.max(
                  0,
                  (data.budget?.limit_units || 0) -
                    (data.budget?.committed_units || 0),
                ),
              )}
            </strong>
          </span>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void work(async () => {
              await api('/api/workbench', {
                action: 'budget',
                project_id: projectId,
                limit_units: Math.round(Number(limit) * 1_000_000),
              });
              setMessage('研究助手预算已更新。');
            });
          }}
        >
          <Field label={t('项目总额度（USD）')}>
            <Input
              type="number"
              min="0"
              max="1000"
              step="0.01"
              required
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </Field>
          <Button variant="outline" disabled={busy} type="submit">
            {t('保存预算')}
          </Button>
        </form>
      </section>
      <form
        className="task-form"
        onSubmit={(event) => {
          event.preventDefault();
          void work(async () => {
            const ids = selected
              .map((id) => latest(id)?.id)
              .filter((id): id is string => !!id);
            const response = await api<{ job: Job; notice?: string }>(
              '/api/jobs',
              {
                id: crypto.randomUUID(),
                project_id: projectId,
                model_id: modelId,
                version_ids: ids,
                prompt: question,
                input_rate: Number(inputRate),
                output_rate: Number(outputRate),
                max_output: Number(maxOutput),
                effort,
              },
            );
            setMessage(
              response.notice || '任务已持久保存到队列，可在下方查看状态。',
            );
          });
        }}
      >
        <h2>{t('向材料提出一个问题')}</h2>
        <Field label={t('研究问题')}>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            maxLength={4000}
            placeholder={t('比较叙述、寻找矛盾，列出需要进一步核查的出处…')}
          />
        </Field>
        <fieldset className="task-sources">
          <legend>{t('材料范围（当前版本，最多 10 份）')}</legend>
          {sources.map((source) => (
            <label key={source.id}>
              <input
                type="checkbox"
                checked={selected.includes(source.id)}
                onChange={(event) =>
                  setSelected((ids) =>
                    event.target.checked
                      ? [...ids, source.id]
                      : ids.filter((id) => id !== source.id),
                  )
                }
              />
              <span>
                {source.title} · v{latest(source.id)?.revision}
              </span>
            </label>
          ))}
          {!sources.length && <p>{t('请先导入资料。')}</p>}
        </fieldset>
        <Field label={t('模型连接')}>
          <NativeSelect
            required
            className="w-full"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            <NativeSelectOption value="">
              {t('选择模型连接')}
            </NativeSelectOption>
            {models.map((model) => (
              <NativeSelectOption key={model.id} value={model.id}>
                {model.label} · {model.model_id}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <div className="form-grid mt-4">
          <Field label={t('输入费率（USD / 百万 tokens）')}>
            <Input
              type="number"
              min="0.000001"
              max="10000"
              step="any"
              required
              value={inputRate}
              onChange={(e) => setInputRate(e.target.value)}
            />
          </Field>
          <Field label={t('输出费率（USD / 百万 tokens）')}>
            <Input
              type="number"
              min="0.000001"
              max="10000"
              step="any"
              required
              value={outputRate}
              onChange={(e) => setOutputRate(e.target.value)}
            />
          </Field>
          <Field label={t('输出上限（tokens）')}>
            <Input
              type="number"
              min={128}
              required
              value={maxOutput}
              onChange={(e) => setMaxOutput(e.target.value)}
            />
          </Field>
          <Field label={locale === 'en' ? 'Reasoning effort' : '推理强度'}>
            <NativeSelect
              value={effort}
              onChange={(event) =>
                setEffort(event.target.value as ThinkingEffort)
              }
            >
              <NativeSelectOption value="low">
                {locale === 'en' ? 'Low' : '低'}
              </NativeSelectOption>
              <NativeSelectOption value="high">
                {locale === 'en' ? 'High' : '高'}
              </NativeSelectOption>
              <NativeSelectOption value="max">
                {locale === 'en' ? 'Maximum' : '最高'}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground mt-4 leading-6">
          {locale === 'en'
            ? 'The selected sources are sent to this model. The 4,096-token application cap has been removed; the provider and model may still enforce their own output or context limit. A larger output value reserves more project budget. Tasks never switch providers or retry model calls automatically.'
            : '运行会把所选材料发送给这个模型。应用原有的 4,096-token 上限已移除；厂商和模型仍可能执行各自的输出或上下文限制。更大的输出值会预留更多项目预算。任务不会自动切换厂商或重试模型调用。'}
        </p>
        <Button
          className="mt-5"
          type="submit"
          disabled={
            busy ||
            !selected.length ||
            selected.length > 10 ||
            !modelId ||
            !data.budget
          }
        >
          <Sparkles size={15} />
          {t('加入研究队列')}
        </Button>
      </form>
      <section className="tool-section" id="research-queue">
        <h2>
          {t('研究队列')}
          <span className="tab-count">{data.jobs.length}</span>
        </h2>
        {!data.jobs.length && (
          <p className="text-sm text-muted-foreground mt-3">
            {t('还没有后台任务。')}
          </p>
        )}
        {data.jobs.map((job) => (
          <article className="job-card" key={job.id}>
            <div className="flex gap-3 flex-wrap items-center">
              <span className="status-tag" data-state={job.status}>
                {t(statusName[job.status])}
              </span>
              <span className="text-xs text-muted-foreground">
                {job.model_snapshot.provider} · {job.model_snapshot.model_id}
              </span>
              <time>{new Date(job.created_at).toLocaleString(locale)}</time>
            </div>
            <h3>
              {job.prompt
                .split('\n')
                .find((line) => line.trim() && !line.startsWith('Task:'))
                ?.slice(0, 180) ||
                (locale === 'en' ? 'Research plan analysis' : '研究计划分析')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                '{0} 份固定版本 · 执行尝试 {1} 次 · {2} 输入 / {3} 输出 tokens · 已用或预留 {4}',
                {
                  0: job.version_ids.length,
                  1: job.attempt,
                  2: job.input_tokens,
                  3: job.output_tokens,
                  4: money(job.reserved_units),
                },
              )}
            </p>
            {job.error && <Notice text={job.error} />}{' '}
            {job.result && (
              <details>
                <summary>{t('查看待核查结果')}</summary>
                {resultView(job.result)}
              </details>
            )}
            <div className="flex gap-2 flex-wrap mt-3">
              {job.status === 'queued' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void jobAction(job, 'pause')}
                >
                  <Pause size={14} />
                  {t('暂停')}
                </Button>
              )}
              {job.status === 'paused' && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void jobAction(job, 'resume')}
                >
                  <Play size={14} />
                  {t('继续')}
                </Button>
              )}
              {['queued', 'paused'].includes(job.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void jobAction(job, 'cancel')}
                >
                  <X size={14} />
                  {t('取消并释放预留')}
                </Button>
              )}
              {['failed', 'uncertain'].includes(job.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void jobAction(job, 'retry')}
                >
                  {t('已核查费用，新建重试')}
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>
      <section className="tool-section">
        <h2>{t('持续关注')}</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t(
            '当前来源为 Crossref DOI 元数据。每次检查按收录更新排序的前 20 条；并非全网或档案馆检索。结果去重后进入收件箱，不自动发邮件。',
          )}
        </p>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const element = event.currentTarget;
            void work(async () => {
              await api('/api/workbench', {
                action: 'watch',
                project_id: projectId,
                query: form.get('query'),
                interval_days: Number(form.get('interval')),
              });
              element.reset();
              setMessage('关注已保存，调度器会在下次检查时处理。');
            });
          }}
        >
          <Field label={t('主题关键词')}>
            <Input name="query" required maxLength={300} />
          </Field>
          <Field label={t('检查频率')}>
            <NativeSelect name="interval">
              <NativeSelectOption value="1">{t('每天')}</NativeSelectOption>
              <NativeSelectOption value="7">{t('每周')}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Button variant="secondary" disabled={busy} type="submit">
            <Plus size={15} />
            {t('添加关注')}
          </Button>
        </form>
        {data.watches.map((watch) => (
          <article className="watch-row" key={watch.id}>
            <div>
              <strong>{watch.query}</strong>
              <p>
                {watch.enabled ? t('已启用') : t('已暂停')}
                {' · '}
                {watch.interval_days === 1 ? t('每天') : t('每周')}
                {' · '}
                {watch.checked_at
                  ? t('上次检查 {0}', {
                      0: new Date(watch.checked_at).toLocaleString(locale),
                    })
                  : t('等待首次检查')}
              </p>
              {watch.error && <Notice text={watch.error} />}
            </div>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await api('/api/workbench', {
                    action: 'toggle_watch',
                    project_id: projectId,
                    id: watch.id,
                    enabled: !watch.enabled,
                  });
                })
              }
            >
              {watch.enabled ? t('暂停') : t('启用')}
            </Button>
          </article>
        ))}
      </section>
      <section className="tool-section">
        <div className="section-toolbar">
          <h2 className="flex items-center gap-2">
            <Inbox size={18} />
            {t('待审收件箱')}
          </h2>
          <NativeSelect
            aria-label={t('收件箱筛选')}
            value={inboxFilter}
            onChange={(e) => setInboxFilter(e.target.value)}
          >
            <NativeSelectOption value="pending">
              {t('待处理')}
            </NativeSelectOption>
            <NativeSelectOption value="accepted">
              {t('已采纳线索')}
            </NativeSelectOption>
            <NativeSelectOption value="dismissed">
              {t('已忽略')}
            </NativeSelectOption>
          </NativeSelect>
        </div>
        {!data.inbox.some((item) => item.status === inboxFilter) && (
          <p className="text-sm text-muted-foreground">
            {t('此分类暂无内容。')}
          </p>
        )}
        {data.inbox
          .filter((item) => item.status === inboxFilter)
          .map((item) => (
            <article className="job-card" key={item.id}>
              <h3>{item.kind === 'task' ? t(item.title) : item.title}</h3>
              {item.kind === 'task' && /^\s*(?:```|\{)/.test(item.body) ? (
                <>
                  <p>
                    {locale === 'en'
                      ? 'A research result is ready for review. Open the queue above to read the full result and check its sources.'
                      : '研究结果已返回。请到上方研究队列阅读完整结果，并逐条核查出处。'}
                  </p>
                  <a className="citation" href="#research-queue">
                    {locale === 'en' ? 'Open research queue' : '查看研究队列'} ↑
                  </a>
                </>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {item.body}
                </p>
              )}
              {item.url && (
                <a
                  className="citation"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('打开来源')}
                </a>
              )}
              <div className="flex gap-2 mt-3">
                {(['accepted', 'dismissed', 'pending'] as const)
                  .filter((status) => status !== item.status)
                  .map((status) => (
                    <Button
                      key={status}
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void work(async () => {
                          await api('/api/workbench', {
                            action: 'inbox',
                            project_id: projectId,
                            id: item.id,
                            status,
                          });
                        })
                      }
                    >
                      {status === 'accepted'
                        ? t('采纳为线索')
                        : status === 'dismissed'
                          ? t('忽略')
                          : t('移回待处理')}
                    </Button>
                  ))}
              </div>
            </article>
          ))}
      </section>
      {!!runs.length && (
        <section className="tool-section">
          <h2>{t('此前的 OCR 与即时任务')}</h2>
          {runs.map((run) => (
            <details className="job-card" key={run.id}>
              <summary>
                {run.kind === 'ocr' ? 'OCR' : t('分析')} · {run.prompt} ·{' '}
                {run.status === 'succeeded'
                  ? t('待核查')
                  : run.status === 'running'
                    ? t('运行中')
                    : t('失败')}
              </summary>
              {resultView(run.result || run.error || t('任务尚未结束。'))}
              <p className="text-xs text-muted-foreground">
                {run.model_snapshot.provider} · {run.model_snapshot.model_id} ·{' '}
                {run.input_tokens} / {run.output_tokens} tokens
              </p>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
