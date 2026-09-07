'use client';
import { formText } from '@/lib/form-values';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api, projectRows } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import { sourcePath } from '@/lib/navigation';
import type { HistoricalEntity } from '@/lib/historical-entities';
import type { Evidence } from '@/lib/types';
export default function HistoricalEntities({
  projectId,
}: {
  projectId: string;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<{
      entities: HistoricalEntity[];
      writable: boolean;
      reviewable: boolean;
    } | null>(null),
    [evidence, setEvidence] = useState<Evidence[]>([]),
    [query, setQuery] = useState(''),
    [edit, setEdit] = useState<HistoricalEntity | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const labels = {
    person: L('人物', 'Person'),
    place: L('地点', 'Place'),
    organization: L('机构', 'Organization'),
    event: L('事件', 'Event'),
  };
  const refresh = useCallback(async () => {
    const [rows, snapshot] = await Promise.all([
      api<NonNullable<typeof data>>(`/api/entities?project_id=${projectId}`),
      projectRows<Evidence>(projectId, 'evidence'),
    ]);
    setData(rows);
    setEvidence(snapshot);
  }, [projectId]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  return (
    <section className="entity-library">
      <div className="section-toolbar">
        <div>
          <h3>{L('人物、地点与事件', 'People, places & events')}</h3>
          <p>
            {L(
              '保留不同称谓与约年。只有经你确认的同一对象才合并，原出处始终保留。',
              'Keep historical names and approximate dates. Merge identities only after review; preserve their original evidence.',
            )}
          </p>
        </div>
        {data?.writable && (
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
          >
            {L('整理条目', 'Add an entry')}
          </Button>
        )}
      </div>
      <Input
        aria-label={L('查找人物或地点', 'Find a person or place')}
        placeholder={L('搜索名称与别名', 'Search names and aliases')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <div className="entity-cards">
        {data?.entities
          .filter((e) =>
            `${e.name} ${e.aliases.join(' ')}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((e) => (
            <article key={e.id} className="research-insight">
              <div className="flow-actions">
                <strong>{e.name}</strong>
                <span>
                  {labels[e.kind]} ·{' '}
                  {e.status === 'confirmed'
                    ? L('已审读', 'Reviewed')
                    : e.status === 'rejected'
                      ? L('已排除', 'Rejected')
                      : L('待核查', 'Candidate')}
                </span>
              </div>
              {!!e.aliases.length && (
                <p>
                  {L('别名：', 'Also known as: ')}
                  {e.aliases.join(' · ')}
                </p>
              )}
              {(e.date_start !== null || e.date_end !== null) && (
                <p>
                  {L(
                    '年代范围（公元年；负数为公元前）：',
                    'Date range (CE years; negative values are BCE): ',
                  )}
                  {e.date_start ?? '?'} — {e.date_end ?? '?'}
                </p>
              )}
              {e.canonical_id && (
                <p>
                  {L('合并到：', 'Grouped under: ')}
                  {data.entities.find((v) => v.id === e.canonical_id)?.name ||
                    L('既有条目', 'Existing entry')}
                </p>
              )}
              {e.evidence.map((c, i) => (
                <a
                  key={i}
                  className="record-citation"
                  href={sourcePath(projectId, c.version_id, c.page)}
                >
                  {c.quote} · {L('第', 'p. ')}
                  {c.page}
                  {L('页', '')}
                </a>
              ))}
              {data.writable && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setEdit(e);
                    setOpen(true);
                  }}
                >
                  {L('查看与编辑', 'Review / edit')}
                </Button>
              )}
            </article>
          ))}
      </div>
      {data && !data.entities.length && (
        <p className="settings-feedback">
          {L(
            '先在阅读时保存一条证据，再把其中的人物或地点整理到这里。',
            'Save an evidence excerpt while reading, then organize its people or places here.',
          )}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {L('整理研究条目', 'Organize a research entry')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '日期仅填写材料支持的范围；未知留空，不自动换算原始纪年。',
                'Use only the date range supported by evidence. Leave unknowns empty; historical calendars are not converted automatically.',
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="entity-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              setBusy(true);
              setError('');
              try {
                const target = formText(f, 'target');
                if (target || edit?.canonical_id) {
                  await api('/api/entities', {
                    action: 'merge',
                    id: edit?.id,
                    expected: edit?.revision,
                    target: target === 'unmerge' ? null : target,
                    reason: f.get('reason'),
                  });
                } else {
                  const selected = evidence.find(
                    (e) => e.id === f.get('evidence'),
                  );
                  await api('/api/entities', {
                    action: 'save',
                    value: {
                      id: edit?.id,
                      expected: edit?.revision,
                      project_id: projectId,
                      kind: f.get('kind'),
                      name: f.get('name'),
                      aliases: formText(f, 'aliases')
                        .split(/[,，\n]/)
                        .map((v) => v.trim())
                        .filter(Boolean),
                      date_start: f.get('start')
                        ? Number(f.get('start'))
                        : null,
                      date_end: f.get('end') ? Number(f.get('end')) : null,
                      status: f.get('status'),
                      evidence: selected
                        ? [
                            ...(edit?.evidence || []),
                            {
                              version_id: selected.version_id,
                              page: selected.page,
                              quote: selected.quote,
                            },
                          ]
                        : edit?.evidence || [],
                      reason: f.get('reason'),
                    },
                  });
                }
                await refresh();
                setOpen(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Save failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={!!edit?.canonical_id}>
              <label>
                {L('名称', 'Name')}
                <Input
                  name="name"
                  defaultValue={edit?.name}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                {L('类别', 'Kind')}
                <select name="kind" defaultValue={edit?.kind || 'person'}>
                  {Object.entries(labels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {L('别名（逗号分隔）', 'Aliases (comma separated)')}
                <Input name="aliases" defaultValue={edit?.aliases.join(', ')} />
              </label>
              <div className="flow-actions">
                <label>
                  {L('最早年份', 'Earliest year')}
                  <Input
                    name="start"
                    type="number"
                    min={-10000}
                    max={3000}
                    defaultValue={edit?.date_start ?? ''}
                  />
                </label>
                <label>
                  {L('最晚年份', 'Latest year')}
                  <Input
                    name="end"
                    type="number"
                    min={-10000}
                    max={3000}
                    defaultValue={edit?.date_end ?? ''}
                  />
                </label>
              </div>
              <label>
                {L('补充出处', 'Add supporting evidence')}
                <select name="evidence">
                  <option value="">
                    {L('保留既有出处', 'Keep existing evidence')}
                  </option>
                  {evidence.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.quote.slice(0, 80)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {L('审读状态', 'Review status')}
                <select
                  name="status"
                  defaultValue={edit?.status || 'candidate'}
                >
                  <option value="candidate">{L('待核查', 'Candidate')}</option>
                  <option value="confirmed" disabled={!data?.reviewable}>
                    {L('已审读确认', 'Reviewed')}
                  </option>
                  <option value="rejected">{L('已排除', 'Rejected')}</option>
                </select>
              </label>
            </fieldset>
            {edit?.canonical_id && (
              <p>
                {L(
                  '先取消合并，再单独修改这个条目。',
                  'Undo the grouping before editing this entry.',
                )}
              </p>
            )}
            {edit && data?.reviewable && (
              <label>
                {L('同一对象的归并', 'Identity grouping')}
                <select
                  name="target"
                  defaultValue={edit.canonical_id ? 'unmerge' : ''}
                >
                  {!edit.canonical_id && (
                    <option value="">{L('不合并', 'Keep separate')}</option>
                  )}
                  {edit.canonical_id ? (
                    <option value="unmerge">
                      {L('取消此前合并', 'Undo grouping')}
                    </option>
                  ) : (
                    data.entities
                      .filter(
                        (e) =>
                          e.id !== edit.id &&
                          e.kind === edit.kind &&
                          e.status === 'confirmed' &&
                          !e.canonical_id,
                      )
                      .map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.name}
                        </option>
                      ))
                  )}
                </select>
              </label>
            )}
            <label>
              {L('依据或修改理由', 'Reason for this change')}
              <Input name="reason" required maxLength={2000} />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="form-actions">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setOpen(false)}
              >
                {L('取消', 'Cancel')}
              </Button>
              <Button type="submit" disabled={busy || !data?.writable}>
                {edit?.canonical_id
                  ? L('取消合并', 'Undo grouping')
                  : L('保存', 'Save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
