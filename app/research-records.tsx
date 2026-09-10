'use client';
import { readRenamedDraft } from '@/lib/legacy-storage';
import { useState, useEffect, useRef } from 'react';
import ReviewSource, { type ReviewPage } from './review-source';
import { Download, Pencil, Plus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { useI18n } from '@/lib/i18n/provider';
import {
  extractionSchema,
  extractionCsv,
  type Extraction,
} from '@/lib/platform/research-recipes';
import type { TaskResult } from '@/lib/platform/types';
import {
  clearRecordCorrectionDraftIfUnchanged,
  readRecordCorrectionDraft,
  type RecordCorrectionDraft,
} from '@/lib/record-correction-draft';
export default function ResearchRecords({
  result,
  revision = 0,
  fields,
  onCorrect,
  onSource,
  busy,
  pages = [],
  draftKey,
}: {
  result: TaskResult;
  revision?: number;
  draftKey?: string;
  fields: string[];
  onCorrect?: (
    data: Extraction,
    reason: string,
    citations: TaskResult['citations'],
    expected?: number,
  ) => Promise<unknown>;
  pages?: ReviewPage[];
  onSource: (version: string, page: number) => void;
  busy: boolean;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const parsed = extractionSchema.safeParse(result.data);
  const [correction, setCorrection] = useState<RecordCorrectionDraft | null>(
      null,
    ),
    [storageIssue, setStorageIssue] = useState<
      'save' | 'restore' | 'clear' | null
    >(null),
    [saveError, setSaveError] = useState(''),
    [saving, setSaving] = useState(false),
    [quoteError, setQuoteError] = useState('');
  const correctionRef = useRef(correction),
    mounted = useRef(false),
    activeDraftKey = useRef(draftKey);
  activeDraftKey.current = draftKey;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [focus, setFocusState] = useState<
    TaskResult['citations'][number] | undefined
  >(result.citations[0]);
  const editing = correction !== null,
    draft = correction?.data || null,
    reason = correction?.reason || '',
    editRevision = correction?.revision ?? revision,
    quotes = correction?.quotes || result.citations,
    quote = correction?.quote || '',
    pageIndex = Math.max(
      0,
      pages.findIndex(
        (page) =>
          page.version_id === correction?.page?.version_id &&
          page.page === correction.page.page,
      ),
    );
  const canCorrect = !!onCorrect;
  useEffect(() => {
    if (!draftKey || !canCorrect) return;
    try {
      const raw = readRenamedDraft(localStorage, draftKey);
      if (!raw) return;
      const restored = readRecordCorrectionDraft(raw);
      if (!restored) {
        setStorageIssue('restore');
        return;
      }
      correctionRef.current = restored;
      setCorrection(restored);
      setFocusState(restored.focus || undefined);
    } catch {
      setStorageIssue('restore');
    }
  }, [draftKey, canCorrect]);
  const saveCorrection = (next: RecordCorrectionDraft) => {
    correctionRef.current = next;
    setCorrection(next);
    setSaveError('');
    if (!draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
      setStorageIssue(null);
    } catch {
      setStorageIssue('save');
    }
  };
  const updateCorrection = (patch: Partial<RecordCorrectionDraft>) => {
    if (correctionRef.current)
      saveCorrection({ ...correctionRef.current, ...patch });
  };
  const clearCorrection = (
    expected = correctionRef.current,
    key = draftKey,
  ) => {
    const currentScope = mounted.current && activeDraftKey.current === key;
    try {
      if (key && expected)
        clearRecordCorrectionDraftIfUnchanged(localStorage, key, expected);
      if (currentScope) setStorageIssue(null);
    } catch {
      if (currentScope) setStorageIssue('clear');
    }
    if (!currentScope || correctionRef.current !== expected) return;
    correctionRef.current = null;
    setCorrection(null);
    setQuoteError('');
    setSaveError('');
  };
  const setDraft = (data: Extraction) => updateCorrection({ data });
  const setReason = (value: string) => updateCorrection({ reason: value });
  const setQuotes = (value: TaskResult['citations']) =>
    updateCorrection({ quotes: value });
  const setQuote = (value: string) => updateCorrection({ quote: value });
  const setPageIndex = (value: number) => {
    const page = pages[value];
    updateCorrection({
      page: page ? { version_id: page.version_id, page: page.page } : null,
    });
  };
  const setFocus = (value: TaskResult['citations'][number]) => {
    setFocusState(value);
    updateCorrection({ focus: value });
  };
  useEffect(() => {
    if (!editing || (draftKey && !storageIssue)) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing, draftKey, storageIssue]);
  const citations = editing ? quotes : result.citations;
  const sourcePage =
    pages.find(
      (p) => p.version_id === focus?.version_id && p.page === focus?.page,
    ) || pages[0];
  if (!parsed.success) return null;
  const data = editing && draft ? draft : parsed.data;
  const patch = (
    r: number,
    c: number,
    value: Partial<Extraction['records'][number]['cells'][number]>,
  ) =>
    setDraft({
      ...data,
      records: data.records.map((row, ri) =>
        ri !== r
          ? row
          : {
              ...row,
              cells: row.cells.map((cell, ci) =>
                ci !== c ? cell : { ...cell, ...value },
              ),
            },
      ),
    });
  return (
    <section
      className={`research-records ${sourcePage ? 'records-with-source' : ''}`}
    >
      {sourcePage && (
        <ReviewSource
          page={sourcePage}
          citation={focus}
          onOpen={() => onSource(sourcePage.version_id, sourcePage.page)}
        />
      )}
      <div className="review-record-editor">
        <fieldset
          className="m-0 min-w-0 border-0 p-0"
          disabled={busy || saving}
        >
          <div className="flow-actions">
            <strong>
              {L('摘录记录', 'Extracted records')} · {data.records.length}
            </strong>
            <Button
              variant="ghost"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([extractionCsv(result, fields)], {
                    type: 'text/csv;charset=utf-8',
                  }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'clioforge-records.csv';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={16} />
              {L('导出表格', 'Export CSV')}
            </Button>
            {onCorrect && !editing && (
              <Button
                variant="outline"
                onClick={() => {
                  saveCorrection({
                    revision,
                    data: structuredClone(parsed.data),
                    reason: '',
                    quotes: structuredClone(result.citations),
                    quote: '',
                    page: pages[0]
                      ? { version_id: pages[0].version_id, page: pages[0].page }
                      : null,
                    focus: focus || null,
                  });
                }}
              >
                <Pencil size={16} />
                {L('纠正摘录', 'Correct records')}
              </Button>
            )}
          </div>
          {storageIssue && (
            <p className="platform-notice" role="alert">
              {storageIssue === 'restore'
                ? L(
                    '无法恢复本地纠正草稿，原内容仍保留在浏览器中。',
                    'Could not restore the local correction draft. The stored copy is retained.',
                  )
                : storageIssue === 'clear'
                  ? L(
                      '浏览器未能清除旧草稿。重新打开时，请先核对结果版本。',
                      'The browser could not remove the old draft. Check the result revision when reopening.',
                    )
                  : L(
                      '浏览器无法保存纠正草稿，请暂时留在本页，避免丢失修改。',
                      'The browser could not retain your correction draft. Stay on this page to keep your changes.',
                    )}
            </p>
          )}
          {editing && draftKey && !storageIssue && (
            <p className="settings-hint">
              {L(
                '纠正草稿已保存在此浏览器，查看材料后可继续编辑。',
                'Correction draft saved in this browser. You can return after checking the source.',
              )}
            </p>
          )}
          {editing && editRevision !== revision && (
            <p className="platform-notice" role="alert">
              {L(
                '原结果已有新版本，草稿仍保留原版本。请核对新结果；放弃草稿后可重新纠正。',
                'The result has a newer revision. Your draft keeps its original revision. Check the new result; discard this draft to begin a new correction.',
              )}
            </p>
          )}
          {saveError && (
            <p className="platform-notice" role="alert">
              {saveError}
            </p>
          )}
          {editing ? (
            <label>
              {L(
                '本页覆盖情况与局限',
                'Coverage and limitations for this page',
              )}
              <Textarea
                value={data.coverage}
                onChange={(e) =>
                  setDraft({ ...data, coverage: e.target.value })
                }
                maxLength={2000}
              />
            </label>
          ) : (
            <p>{data.coverage}</p>
          )}
          {!data.records.length && (
            <p>
              {L(
                '这页没有符合要求的记录。请核查是否遗漏。',
                'No matching records on this page. Check for omissions.',
              )}
            </p>
          )}
          {data.records.map((row, r) => (
            <article key={r} className="extraction-record">
              {editing ? (
                <div className="flow-actions">
                  <Input
                    aria-label={L('记录名称', 'Record label')}
                    value={row.label}
                    maxLength={200}
                    onChange={(e) =>
                      setDraft({
                        ...data,
                        records: data.records.map((item, i) =>
                          i === r ? { ...item, label: e.target.value } : item,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    aria-label={L('移除此记录', 'Remove this record')}
                    onClick={() =>
                      setDraft({
                        ...data,
                        records: data.records.filter((_, i) => i !== r),
                      })
                    }
                  >
                    <X size={16} />
                  </Button>
                </div>
              ) : (
                <h4>{row.label}</h4>
              )}
              <div className="records-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{L('栏目', 'Field')}</th>
                      <th>{L('摘录', 'Value')}</th>
                      <th>{L('依据', 'Basis')}</th>
                      <th>{L('出处', 'Source')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.cells.map((cell, c) => {
                      const citation = cell.citation
                        ? citations[cell.citation - 1]
                        : null;
                      return (
                        <tr key={cell.field}>
                          <th>{cell.field}</th>
                          <td>
                            {editing ? (
                              <Textarea
                                aria-label={`${row.label} · ${cell.field}`}
                                value={cell.value || ''}
                                disabled={cell.status === 'missing'}
                                rows={2}
                                maxLength={2000}
                                onChange={(e) =>
                                  patch(r, c, { value: e.target.value })
                                }
                              />
                            ) : (
                              cell.value || L('未记载', 'Not recorded')
                            )}
                          </td>
                          <td>
                            {editing ? (
                              <NativeSelect
                                className="w-full"
                                size="sm"
                                aria-label={`${cell.field} ${L('依据', 'basis')}`}
                                value={cell.status}
                                onChange={(e) =>
                                  patch(
                                    r,
                                    c,
                                    e.target.value === 'missing'
                                      ? {
                                          status: 'missing',
                                          value: null,
                                          citation: null,
                                        }
                                      : {
                                          status: e.target.value as
                                            | 'explicit'
                                            | 'inferred',
                                        },
                                  )
                                }
                              >
                                <option value="explicit">
                                  {L('原文明示', 'Explicit')}
                                </option>
                                <option value="inferred">
                                  {L('推测', 'Inferred')}
                                </option>
                                <option value="missing">
                                  {L('缺失', 'Missing')}
                                </option>
                              </NativeSelect>
                            ) : (
                              L(
                                ...(
                                  {
                                    explicit: ['原文明示', 'Explicit'],
                                    inferred: [
                                      '推测，需核查',
                                      'Inferred; review',
                                    ],
                                    missing: ['缺失', 'Missing'],
                                  } as Record<string, [string, string]>
                                )[cell.status],
                              )
                            )}
                          </td>
                          <td>
                            {editing && cell.status !== 'missing' && (
                              <NativeSelect
                                className="w-full"
                                size="sm"
                                aria-label={`${cell.field} ${L('引文', 'citation')}`}
                                value={cell.citation || ''}
                                onChange={(e) =>
                                  patch(r, c, {
                                    citation: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                              >
                                <option value="">
                                  {L('选择原文', 'Choose quotation')}
                                </option>
                                {citations.map((ct, i) => (
                                  <option key={i} value={i + 1}>
                                    [{i + 1}] {ct.quote.slice(0, 60)}
                                  </option>
                                ))}
                              </NativeSelect>
                            )}
                            {citation && (
                              <button
                                type="button"
                                className="record-citation"
                                onClick={() =>
                                  sourcePage
                                    ? setFocus(citation)
                                    : onSource(
                                        citation.version_id,
                                        citation.page,
                                      )
                                }
                              >
                                [{cell.citation}] {citation.quote.slice(0, 160)}{' '}
                                · {L('页', 'p.')} {citation.page}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          {editing && (
            <div className="record-correction">
              <Button
                variant="outline"
                disabled={data.records.length >= 20}
                onClick={() =>
                  setDraft({
                    ...data,
                    records: [
                      ...data.records,
                      {
                        label: L(
                          `补充记录 ${data.records.length + 1}`,
                          `Additional record ${data.records.length + 1}`,
                        ),
                        cells: fields.map((field) => ({
                          field,
                          value: null,
                          status: 'missing',
                          citation: null,
                        })),
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                {L('补充遗漏的记录', 'Add an omitted record')}
              </Button>
              {pages.length > 0 && (
                <details>
                  <summary>
                    {L('补充一条原文引文', 'Add an exact source quotation')}
                  </summary>
                  <label>
                    {L('原文页码', 'Source page')}
                    <NativeSelect
                      className="w-full"
                      size="sm"
                      value={pageIndex}
                      onChange={(e) => setPageIndex(Number(e.target.value))}
                    >
                      {pages.map((p, i) => (
                        <option key={i} value={i}>
                          {p.title || L('材料', 'Source')} · {L('页', 'p.')}{' '}
                          {p.page}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <details>
                    <summary>{L('对照本页原文', 'Read this page')}</summary>
                    <p className="preserve-text">{pages[pageIndex]?.text}</p>
                  </details>
                  <Textarea
                    aria-label={L(
                      '复制原文作为引文',
                      'Copy an exact quotation',
                    )}
                    value={quote}
                    maxLength={10000}
                    onChange={(e) => setQuote(e.target.value)}
                    rows={3}
                  />
                  <Button
                    variant="outline"
                    disabled={!quote.trim() || quotes.length >= 100}
                    onClick={() => {
                      const p = pages[pageIndex],
                        start = p?.text.indexOf(quote) ?? -1;
                      if (
                        !p ||
                        start < 0 ||
                        start !== p.text.lastIndexOf(quote)
                      ) {
                        setQuoteError(
                          L(
                            '请复制一段能在本页唯一定位的原文。',
                            'Copy a passage that occurs exactly once on this page.',
                          ),
                        );
                        return;
                      }
                      setQuotes([
                        ...quotes,
                        {
                          version_id: p.version_id,
                          page: p.page,
                          quote,
                          start,
                        },
                      ]);
                      setQuote('');
                      setQuoteError(
                        L(
                          '引文已添加，现在可以在栏目中选择它。',
                          'Quotation added; select it for the corresponding field.',
                        ),
                      );
                    }}
                  >
                    {L('添加引文', 'Add quotation')}
                  </Button>
                  {quoteError && <p>{quoteError}</p>}
                </details>
              )}
            </div>
          )}
          {editing && (
            <div className="record-correction">
              <label>
                {L(
                  '纠正依据（原始输出会保留）',
                  'Reason (the original output is retained)',
                )}
                <Input
                  value={reason}
                  maxLength={2000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="flow-actions">
                <Button
                  disabled={
                    busy ||
                    saving ||
                    !onCorrect ||
                    editRevision !== revision ||
                    !reason.trim() ||
                    !data.coverage.trim() ||
                    data.records.some((r) => !r.label.trim()) ||
                    data.records.some((r) =>
                      r.cells.some(
                        (c) =>
                          c.status !== 'missing' &&
                          (!c.value?.trim() || !c.citation),
                      ),
                    )
                  }
                  onClick={async () => {
                    if (!onCorrect || saving) return;
                    const submitted = correctionRef.current;
                    const submittedKey = draftKey;
                    if (!submitted) return;
                    setSaving(true);
                    setSaveError('');
                    try {
                      if (
                        (await onCorrect(
                          submitted.data,
                          submitted.reason,
                          submitted.quotes,
                          submitted.revision,
                        )) !== false
                      )
                        clearCorrection(submitted, submittedKey);
                    } catch (cause) {
                      if (
                        mounted.current &&
                        activeDraftKey.current === submittedKey
                      )
                        setSaveError(
                          cause instanceof Error
                            ? cause.message
                            : L(
                                '未能保存纠正，草稿已保留。',
                                'Could not save the correction. Your draft is retained.',
                              ),
                        );
                    } finally {
                      if (
                        mounted.current &&
                        activeDraftKey.current === submittedKey
                      )
                        setSaving(false);
                    }
                  }}
                >
                  <Save size={16} />
                  {saving
                    ? L('正在保存…', 'Saving…')
                    : L('保存为待复核版本', 'Save for review')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || saving}
                  onClick={() => clearCorrection()}
                >
                  <X size={16} />
                  {L('放弃纠正草稿', 'Discard correction draft')}
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      </div>
    </section>
  );
}
