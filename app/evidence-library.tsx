'use client';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Search,
  X,
  Download,
  NotebookPen,
  List,
  Table2,
  Quote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useI18n } from '@/lib/i18n/provider';
import type { Evidence, Source, SourceVersion } from '@/lib/types';
import {
  evidenceCsv,
  evidenceDraft,
  evidenceMatrix,
  filterEvidence,
  type EvidenceFilter,
} from '@/lib/evidence-library';
import { downloadText } from './bibliography-panel';
import './evidence-library.css';

const emptyFilter: EvidenceFilter = {
  query: '',
  source: '',
  relation: '',
  question: '',
  review: false,
};
export default function EvidenceLibrary({
  items,
  sources,
  versions,
  needsReview,
  canWrite,
  renderCard,
  onCompose,
  onRead,
}: {
  items: Evidence[];
  sources: Source[];
  versions: SourceVersion[];
  needsReview: Set<string>;
  canWrite: boolean;
  renderCard: (item: Evidence) => ReactNode;
  onCompose: (title: string, body: string) => void;
  onRead: () => void;
}) {
  const { locale } = useI18n(),
    english = locale === 'en',
    L = (zh: string, en: string) => (english ? en : zh);
  const [filter, setFilter] = useState(emptyFilter),
    [mode, setMode] = useState<'list' | 'matrix'>('list'),
    [selected, setSelected] = useState(new Set<string>()),
    [limit, setLimit] = useState(40),
    [columnLimit, setColumnLimit] = useState(12),
    [error, setError] = useState('');
  const filtered = useMemo(
    () => filterEvidence(items, sources, filter, needsReview),
    [items, sources, filter, needsReview],
  );
  const chosen = filtered.filter((e) => selected.has(e.id));
  const matrix = evidenceMatrix(filtered),
    allColumns = sources.filter((s) =>
      filtered.some((e) => e.source_id === s.id),
    ),
    columns = allColumns.slice(0, columnLimit);
  const hasFilters = Object.values(filter).some(Boolean);
  function change(next: Partial<EvidenceFilter>) {
    setFilter({ ...filter, ...next });
    setSelected(new Set());
    setLimit(40);
    setColumnLimit(12);
    setError('');
  }
  function compose() {
    const text = evidenceDraft(chosen, sources, versions, needsReview, english);
    if (text.length > 95000) {
      setError(
        L(
          '选定摘录过长，请减少选择后再整理成笔记。',
          'Selected excerpts are too long. Select fewer before creating a note.',
        ),
      );
      return;
    }
    onCompose(
      (filter.question || L('证据对照笔记', 'Evidence comparison notes')).slice(
        0,
        200,
      ),
      text,
    );
  }
  const relations = {
    supports: L('支持', 'Supports'),
    challenges: L('质疑', 'Challenges'),
    context: L('背景', 'Context'),
  };
  if (!items.length)
    return (
      <div className="evidence-library-empty">
        <Quote size={30} />
        <h2>
          {L('把原文变成可核查的依据', 'Keep evidence you can return to')}
        </h2>
        <p>
          {L(
            '在阅读器中选取原文，关联研究问题。之后可以在这里比较、筛选并整理成文稿。',
            'Select a passage in the reader and connect it to a research question. Compare, filter and write from those excerpts here.',
          )}
        </p>
        <Button onClick={onRead}>{L('打开资料阅读', 'Open sources')}</Button>
      </div>
    );
  return (
    <section
      className="evidence-library"
      aria-label={L('证据整理工作台', 'Evidence workspace')}
    >
      <header className="evidence-library-heading">
        <div>
          <h2>{L('从原文到论证', 'From passages to arguments')}</h2>
          <p>
            {L(
              '围绕同一问题，比较支持、质疑与背景材料。',
              'Compare supporting, challenging and contextual passages for a question.',
            )}
          </p>
        </div>
        <fieldset
          className="evidence-view-toggle"
          aria-label={L('证据显示方式', 'Evidence view')}
        >
          <Button
            size="sm"
            variant={mode === 'list' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'list'}
            onClick={() => setMode('list')}
          >
            <List size={16} />
            {L('摘录', 'Excerpts')}
          </Button>
          <Button
            size="sm"
            variant={mode === 'matrix' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'matrix'}
            onClick={() => setMode('matrix')}
          >
            <Table2 size={16} />
            {L('问题与来源', 'Questions & sources')}
          </Button>
        </fieldset>
      </header>
      <div className="evidence-filters">
        <div className="evidence-search">
          <Search size={16} />
          <Input
            type="search"
            aria-label={L('搜索证据', 'Search evidence')}
            placeholder={L(
              '查找原文、问题、解释或材料名',
              'Search passages, questions, interpretations or sources',
            )}
            value={filter.query}
            onChange={(e) => change({ query: e.target.value })}
          />
        </div>
        <NativeSelect
          aria-label={L('按来源筛选证据', 'Filter evidence by source')}
          value={filter.source}
          onChange={(e) => change({ source: e.target.value })}
        >
          <NativeSelectOption value="">
            {L('全部来源', 'All sources')}
          </NativeSelectOption>
          {sources
            .filter((s) => items.some((e) => e.source_id === s.id))
            .map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.title}
              </NativeSelectOption>
            ))}
        </NativeSelect>
        <NativeSelect
          aria-label={L('按关系筛选证据', 'Filter evidence by relation')}
          value={filter.relation}
          onChange={(e) => change({ relation: e.target.value })}
        >
          <NativeSelectOption value="">
            {L('全部关系', 'All relationships')}
          </NativeSelectOption>
          {Object.entries(relations).map(([id, name]) => (
            <NativeSelectOption key={id} value={id}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="evidence-filter-details">
        <label>
          <Checkbox
            checked={filter.review}
            onCheckedChange={(value) => change({ review: !!value })}
          />
          {L('只看原文变化后待复核', 'Only excerpts needing source recheck')}
        </label>
        {filter.question && (
          <span>
            {L('当前问题：', 'Question: ')}
            {filter.question}
          </span>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => change(emptyFilter)}>
            <X size={14} />
            {L('清除筛选', 'Clear filters')}
          </Button>
        )}
        <output>
          {L(
            `${filtered.length} / ${items.length} 条摘录`,
            `${filtered.length} of ${items.length} excerpts`,
          )}
        </output>
      </div>
      <p className="evidence-library-caveat">
        {L(
          '条数只统计已保存的摘录，不代表可信度或独立来源数；没有摘录也不代表不存在相关史料。',
          'Counts describe saved excerpts, not reliability or independent sources. An empty cell does not establish the absence of historical evidence.',
        )}
      </p>
      {mode === 'matrix' ? (
        <section
          className="evidence-matrix-scroll"
          aria-label={L(
            '问题与来源对照表，可横向滚动',
            'Questions and sources table, horizontally scrollable',
          )}
        >
          <table className="evidence-matrix">
            <caption>
              {L(
                '点击有摘录的单元格，查看对应原文。',
                'Select a populated cell to inspect its passages.',
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col">{L('研究问题', 'Research question')}</th>
                {columns.map((s) => (
                  <th key={s.id} scope="col">
                    {s.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...matrix].slice(0, limit).map(([question, row]) => (
                <tr key={question}>
                  <th scope="row">
                    {question || L('待明确的问题', 'Question to clarify')}
                  </th>
                  {columns.map((s) => {
                    const counts = row.get(s.id);
                    return (
                      <td key={s.id}>
                        {counts ? (
                          <button
                            className="evidence-matrix-cell"
                            onClick={() => {
                              change({ question, source: s.id });
                              setMode('list');
                            }}
                            aria-label={`${question} · ${s.title} · ${Object.entries(
                              counts,
                            )
                              .map(
                                ([r, n]) =>
                                  `${relations[r as Evidence['relation']]} ${n}`,
                              )
                              .join('，')} · ${L('查看摘录', 'View excerpts')}`}
                          >
                            {Object.entries(counts)
                              .filter(([, n]) => n > 0)
                              .map(([r, n]) => (
                                <span key={r} data-relation={r}>
                                  {relations[r as Evidence['relation']]}{' '}
                                  <strong>{n}</strong>
                                </span>
                              ))}
                            <small>{L('查看摘录 →', 'View excerpts →')}</small>
                          </button>
                        ) : (
                          <span
                            className="evidence-matrix-empty"
                            aria-label={L(
                              '尚无保存的摘录',
                              'No saved excerpts',
                            )}
                          >
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {allColumns.length > columnLimit && (
            <Button
              variant="outline"
              className="evidence-more-sources"
              onClick={() => setColumnLimit((n) => n + 12)}
            >
              {L(
                `显示更多来源（当前 ${columns.length} / ${allColumns.length}）`,
                `Show more sources (${columns.length} of ${allColumns.length})`,
              )}
            </Button>
          )}
        </section>
      ) : (
        <>
          <div className="evidence-selection-bar">
            <label>
              <Checkbox
                checked={!!filtered.length && chosen.length === filtered.length}
                disabled={!filtered.length || filtered.length > 50}
                onCheckedChange={(value) =>
                  setSelected(
                    value ? new Set(filtered.map((e) => e.id)) : new Set(),
                  )
                }
              />
              {L('全选筛选结果', 'Select filtered results')}
            </label>
            <span>
              {L(`已选 ${chosen.length}`, `${chosen.length} selected`)}
            </span>
            {chosen.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                {L('取消选择', 'Clear selection')}
              </Button>
            )}
            <div>
              <Button
                variant="outline"
                disabled={!chosen.length}
                onClick={() =>
                  downloadText(
                    evidenceCsv(
                      chosen,
                      sources,
                      versions,
                      needsReview,
                      english,
                      window.location.origin,
                    ),
                    'canwoo-evidence.csv',
                    'text/csv;charset=utf-8',
                  )
                }
              >
                <Download size={16} />
                {L('导出所选摘录', 'Export selected')}
              </Button>
              <Button disabled={!canWrite || !chosen.length} onClick={compose}>
                <NotebookPen size={16} />
                {L('整理成写作草稿', 'Create writing draft')}
              </Button>
            </div>
          </div>
          {filtered.length > 50 && (
            <p className="evidence-library-caveat">
              {L(
                '每次最多选择 50 条。可先缩小问题或来源范围。',
                'Select up to 50 at a time. Narrow the question or source first.',
              )}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="evidence-library-items">
            {filtered.slice(0, limit).map((e) => (
              <div
                className={`evidence-library-item ${selected.has(e.id) ? 'is-selected' : ''}`}
                key={e.id}
              >
                <label className="evidence-item-select">
                  <Checkbox
                    aria-label={L(
                      `选择摘录：${e.question} · ${sources.find((s) => s.id === e.source_id)?.title} · 第 ${e.page} 页`,
                      `Select excerpt: ${e.question} · ${sources.find((s) => s.id === e.source_id)?.title} · page ${e.page}`,
                    )}
                    checked={selected.has(e.id)}
                    disabled={!selected.has(e.id) && chosen.length >= 50}
                    onCheckedChange={(value) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (value) next.add(e.id);
                        else next.delete(e.id);
                        return next;
                      })
                    }
                  />
                  <span>{L('选择', 'Select')}</span>
                </label>
                {renderCard(e)}
              </div>
            ))}
          </div>
        </>
      )}
      {!filtered.length && (
        <div className="evidence-library-empty">
          <Search size={24} />
          <h3>{L('没有符合筛选的摘录', 'No matching excerpts')}</h3>
          <Button variant="outline" onClick={() => change(emptyFilter)}>
            {L('查看全部摘录', 'Show all excerpts')}
          </Button>
        </div>
      )}
      {(mode === 'matrix' ? matrix.size : filtered.length) > limit && (
        <Button variant="outline" onClick={() => setLimit((n) => n + 40)}>
          {L('显示更多', 'Show more')}
        </Button>
      )}
    </section>
  );
}
