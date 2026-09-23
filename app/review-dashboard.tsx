'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import {
  correctionChanges,
  reviewCoverage,
} from '@/lib/platform/review-quality';
import type { MissionView } from '@/lib/platform/types';
import type { Source, SourceVersion } from '@/lib/types';
export default function ReviewDashboard({
  view,
  sources,
  versions,
  onSelect,
}: {
  view: MissionView;
  sources: Source[];
  versions: SourceVersion[];
  onSelect: (id: string) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [filter, setFilter] = useState('all'),
    [limit, setLimit] = useState(30);
  const pages = reviewCoverage(view.tasks);
  if (!pages.length) return null;
  const changes = (view.corrections || []).map(correctionChanges).reduce(
    (a, b) => ({
      added: a.added + b.added,
      removed: a.removed + b.removed,
      values: a.values + b.values,
      classifications: a.classifications + b.classifications,
      citations: a.citations + b.citations,
    }),
    { added: 0, removed: 0, values: 0, classifications: 0, citations: 0 },
  );
  const evaluated = [
    ...new Map(
      (view.evaluations || [])
        .filter((e) => e.current === 1)
        .map((e) => [e.config.task_id, e] as const)
        .reverse(),
    ).values(),
  ];
  const heldout = evaluated.filter((e) => e.config.phase === 'validation');
  const done = pages.filter((p) =>
    ['accepted', 'succeeded', 'review'].includes(p.task.status),
  ).length;
  const shown = pages.filter(
    (p) =>
      filter === 'all' ||
      (filter === 'attention'
        ? p.needsAttention
        : filter === 'sample'
          ? p.sample
          : p.task.input.parameters.phase === 'validation'),
  );
  return (
    <section className="review-dashboard">
      <header>
        <div>
          <h3>{L('核对工作台', 'Review desk')}</h3>
          <p>
            {L(
              '逐页看覆盖，按问题核查，也抽查普通结果。',
              'Inspect page coverage, resolve questions and sample ordinary results.',
            )}
          </p>
        </div>
        <strong>
          {done} / {pages.length}{' '}
          {L('页步骤已有输出', 'page steps have outputs')}
        </strong>
      </header>
      <progress
        value={done}
        max={pages.length}
        aria-label={L('处理进度', 'Processing progress')}
      />
      <p>
        {L(
          `已有 ${evaluated.length} 页人工评估，其中 ${heldout.length} 页为独立试读。`,
          `${evaluated.length} pages have current manual evaluations, including ${heldout.length} held-out pages.`,
        )}
      </p>
      <div className="quality-stats">
        <span>
          {L('补入记录', 'Added records')} <b>{changes.added}</b>
        </span>
        <span>
          {L('移除记录', 'Removed records')} <b>{changes.removed}</b>
        </span>
        <span>
          {L('值的修改', 'Value edits')} <b>{changes.values}</b>
        </span>
        <span>
          {L('依据分类修改', 'Basis edits')} <b>{changes.classifications}</b>
        </span>
      </div>
      <p className="muted">
        {L(
          '这些数字累计人工保存的修改，不是准确率；改名会计为移除及补入。未核对页不能视为正确。独立试读结果也需要人工评估遗漏。',
          'These are cumulative saved edits, not accuracy. Renames count as removal/addition. Unreviewed pages are not presumed correct. Check held-out pages for omissions too.',
        )}
      </p>
      <fieldset
        className="flow-actions"
        aria-label={L('筛选核查页', 'Filter review pages')}
      >
        {[
          ['all', '全部页', 'All pages'],
          ['attention', '疑难与失败', 'Questions & failures'],
          ['sample', '普通抽查', 'Sample'],
          ['validation', '独立试读', 'Held-out'],
        ].map(([id, zh, en]) => (
          <Button
            key={id}
            variant={filter === id ? 'secondary' : 'ghost'}
            aria-pressed={filter === id}
            onClick={() => {
              setFilter(id);
              setLimit(30);
            }}
          >
            {L(zh, en)}
          </Button>
        ))}
      </fieldset>
      <div className="review-page-list">
        {shown.slice(0, limit).map((p) => {
          const ref = p.task.input.page_refs?.[0],
            v = versions.find((v) => v.id === ref?.version_id),
            source = sources.find((s) => s.id === v?.source_id);
          return (
            <button key={p.task.id} onClick={() => onSelect(p.task.id)}>
              <span>
                <strong>{source?.title || p.task.title}</strong>
                <small>
                  {L('页', 'p.')} {ref?.page} · {p.task.title}
                </small>
              </span>
              <span className="review-row-status">
                {p.records} {L('条记录', 'records')} ·{' '}
                {p.needsAttention
                  ? L('需要留意', 'Needs attention')
                  : p.task.status === 'accepted'
                    ? L('已采纳', 'Accepted')
                    : p.task.result
                      ? L('可核对', 'Ready to inspect')
                      : L('尚未完成', 'Not completed')}
              </span>
              <span className="review-open-action">
                {L('打开核对', 'Inspect')}
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
      {!shown.length && (
        <p>{L('此筛选下没有页。', 'No pages in this filter.')}</p>
      )}
      {shown.length > limit && (
        <Button variant="ghost" onClick={() => setLimit((n) => n + 30)}>
          {L('再显示 30 页', 'Show 30 more pages')}
        </Button>
      )}
      {!!view.corrections?.length && (
        <details>
          <summary>
            {L('校正与方法调整记录', 'Corrections and method adjustments')}
          </summary>
          {view.corrections.map((c) => (
            <article key={c.id}>
              <button onClick={() => onSelect(c.task_id)}>
                {view.tasks.find((t) => t.id === c.task_id)?.title}
              </button>
              <p>{c.reason}</p>
              <small>
                {new Date(c.created_at).toLocaleString(locale)} · {c.actor}
              </small>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
