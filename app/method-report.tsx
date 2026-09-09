'use client';
import { useMemo, useState } from 'react';
import { Download, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/provider';
import {
  methodReport,
  methodReportMarkdown,
  followupReviewDraft,
} from '@/lib/platform/method-report';
import { DEFAULT_RESEARCH_MODEL, GLM_PRICE_CEILING } from '@/lib/model-routing';
import type { MissionView, MissionDraft } from '@/lib/platform/types';
import type { Model, Source, SourceVersion } from '@/lib/types';
export default function MethodReportPanel({
  view,
  sources,
  versions,
  models,
  canWrite,
  onSelect,
  onCreate,
}: {
  view: MissionView;
  sources: Source[];
  versions: SourceVersion[];
  models: Model[];
  canWrite: boolean;
  onSelect: (id: string) => void;
  onCreate: (draft: MissionDraft) => Promise<unknown>;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const report = useMemo(() => methodReport(view), [view]);
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [context, setContext] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [modelId, setModelId] = useState(
    models.find((m) => m.model_id === DEFAULT_RESEARCH_MODEL)?.id ||
      models[0]?.id ||
      '',
  );
  const [inputRate, setInputRate] = useState(String(GLM_PRICE_CEILING.input)),
    [outputRate, setOutputRate] = useState(String(GLM_PRICE_CEILING.output));
  const label = (id: string) =>
    sources.find((s) => s.id === versions.find((v) => v.id === id)?.source_id)
      ?.title || L('固定资料版本', 'Fixed source version');
  if (!report.planned) return null;
  const exportReport = () => {
    const blob = new Blob([methodReportMarkdown(view, report, locale, label)], {
        type: 'text/markdown;charset=utf-8',
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'clioforge-method-review.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  function prepare() {
    setSelected([]);
    setContext(
      L(
        '重新核查已记录的问题，保留不能判定之处。人工评估也是待检验的观察，并非标准答案。',
        'Recheck recorded issues and preserve uncertainty. Manual evaluations are observations to examine, not an answer key.',
      ),
    );
    setError('');
    setOpen(true);
  }
  const selectedPages = report.pages.filter((p) =>
    selected.includes(p.task.id),
  );
  const prior = selectedPages.map((p) => ({
    evaluation_id: p.evaluation.id,
    evaluated_at: p.evaluation.created_at,
    result_hash: p.evaluation.config.result_hash,
    ...p.ref,
    observations: p.evaluation.metrics.notes,
    counts: {
      missed: p.evaluation.metrics.missed,
      wrong_values: p.evaluation.metrics.wrong_values,
      wrong_categories: p.evaluation.metrics.wrong_categories,
      false_inclusions: p.evaluation.metrics.false_inclusions,
    },
  }));
  const comparison = JSON.stringify(prior);
  return (
    <section className="method-report-panel">
      <header>
        <div>
          <h3>{L('方法验证报告', 'Method validation report')}</h3>
          <p>
            {L(
              '在扩大处理之前，先看人工核查的成本与问题。',
              'Inspect review effort and errors before expanding a run.',
            )}
          </p>
        </div>
        <Button variant="outline" onClick={exportReport}>
          <Download size={15} />
          {L('下载报告', 'Download report')}
        </Button>
      </header>
      <div className="quality-stats">
        <span>
          {L('当前已核查', 'Currently reviewed')}{' '}
          <b>
            {report.pages.length}/{report.planned}
          </b>
        </span>
        <span>
          {L('尚待核查', 'Unreviewed')} <b>{report.unreviewed}</b>
        </span>
        <span>
          {L('独立试读', 'Held-out')} <b>{report.heldout}</b>
        </span>
      </div>
      <p>
        {L(
          `遗漏 ${report.totals.missed} · 误收 ${report.totals.false_inclusions} · 值错误 ${report.totals.wrong_values} · 分类错误 ${report.totals.wrong_categories}`,
          `Omissions ${report.totals.missed} · False inclusions ${report.totals.false_inclusions} · Value errors ${report.totals.wrong_values} · Category errors ${report.totals.wrong_categories}`,
        )}
      </p>
      <p>
        {report.comparison
          ? L(
              `同页对照 ${report.comparison.pages} 页：核查 ${report.comparison.review_minutes.toFixed(1)} 分钟；纯人工 ${report.comparison.manual_minutes.toFixed(1)} 分钟。`,
              `Paired comparison on ${report.comparison.pages} pages: review ${report.comparison.review_minutes.toFixed(1)} min; manual ${report.comparison.manual_minutes.toFixed(1)} min.`,
            )
          : L(
              '暂无同页人工时间对照；不能据此判断是否提速。',
              'No paired manual-time comparison; acceleration cannot yet be assessed.',
            )}
      </p>
      <p className="muted">
        {L(
          '仅汇总仍适用的人工评估，旧评估已排除；错误类别可能重叠，未核查页不视为正确。时间不含模型等待和资料准备。',
          'Only applicable manual evaluations are included. Error categories can overlap; unreviewed pages are not presumed correct. Timing excludes model waits and preparation.',
        )}
      </p>
      {!!report.pages.length && (
        <details>
          <summary>
            {L('查看纳入报告的页', 'Pages included in this report')}
          </summary>
          {report.pages.map((p) => (
            <button
              className="report-page"
              key={p.task.id}
              onClick={() => onSelect(p.task.id)}
            >
              {label(p.ref.version_id)} · {L('页', 'p.')} {p.ref.page}
              <ArrowRight size={14} />
            </button>
          ))}
        </details>
      )}
      {canWrite && (
        <Button
          variant="secondary"
          onClick={prepare}
          disabled={!report.pages.length}
        >
          {L('让助手复查这些问题', 'Ask the assistant to recheck')}
          <ArrowRight size={15} />
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="mission-dialog">
          <DialogHeader>
            <DialogTitle>
              {L('准备下一轮审读', 'Prepare a follow-up review')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '选择需要重新审读的固定原文页。这里只保存草案，开始执行后才调用模型并使用项目预算。',
                'Choose fixed source pages to re-examine. This saves a draft; model calls and project budget use begin only when you start it.',
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="followup-review-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                if (
                  !selectedPages.length ||
                  selectedPages.length > 24 ||
                  comparison.length > 6000
                )
                  throw new Error(
                    L(
                      '请选择 1–24 页，且评估摘要不超过 6,000 字符。请减少所选页。',
                      'Choose 1–24 pages with evaluation summaries within 6,000 characters. Select fewer pages.',
                    ),
                  );
                const draft = followupReviewDraft({
                  view,
                  taskIds: selected,
                  instructions: context,
                  modelId,
                  inputRate: Number(inputRate),
                  outputRate: Number(outputRate),
                  locale,
                });
                await onCreate(draft);
                setOpen(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset>
              <legend>
                {L(
                  '选择固定原文页（最多 24 页）',
                  'Choose fixed source pages (up to 24)',
                )}
              </legend>
              <div className="followup-pages">
                {report.pages.map((p) => (
                  <label key={p.task.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p.task.id)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked
                            ? [...old, p.task.id]
                            : old.filter((id) => id !== p.task.id),
                        )
                      }
                    />
                    <span>
                      {label(p.ref.version_id)} · {L('页', 'p.')} {p.ref.page}
                      <small>{p.evaluation.metrics.notes}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p>
              {selected.length} / 24 {L('页已选择', 'pages selected')} ·{' '}
              {comparison.length} / 6000{' '}
              {L('字符评估摘要', 'evaluation characters')}
            </p>
            <label>
              {L('审读要求', 'Review instructions')}
              <Textarea
                required
                maxLength={4500}
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </label>
            <label>
              {L('研究助手', 'Research assistant')}
              <select
                required
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              >
                <option value="">
                  {L('选择模型连接', 'Choose model connection')}
                </option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {m.model_id}
                  </option>
                ))}
              </select>
            </label>
            {!models.length && (
              <p>
                {L(
                  '请先在账号设置 → 模型连接中添加连接，再回来准备草案。',
                  'Add a connection under Account settings → Model connections, then return to prepare the draft.',
                )}
              </p>
            )}
            <div className="form-pair">
              <label>
                {L('输入费率（$/百万 token）', 'Input rate ($/million tokens)')}
                <input
                  type="number"
                  min="0.0001"
                  step="any"
                  required
                  value={inputRate}
                  onChange={(e) => setInputRate(e.target.value)}
                />
              </label>
              <label>
                {L(
                  '输出费率（$/百万 token）',
                  'Output rate ($/million tokens)',
                )}
                <input
                  type="number"
                  min="0.0001"
                  step="any"
                  required
                  value={outputRate}
                  onChange={(e) => setOutputRate(e.target.value)}
                />
              </label>
            </div>
            <small>
              {L(
                '费率用于预留预算；请核对所选模型的价格。原计划及人工判断保留。',
                'Rates reserve budget; check the selected model’s price. The original plan and human judgments are preserved.',
              )}
            </small>
            {error && <p role="alert">{error}</p>}
            <Button
              type="submit"
              disabled={
                busy ||
                !selected.length ||
                !modelId ||
                selected.length > 24 ||
                comparison.length > 6000
              }
            >
              {busy
                ? L('正在保存…', 'Saving…')
                : L('保存审读草案', 'Save review draft')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
