'use client';
import { formText } from '@/lib/form-values';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
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
import type { Evidence, Source, SourceVersion } from '@/lib/types';
export default function HistoricalEntities({
  projectId,
  sources,
  versions,
}: {
  projectId: string;
  sources: Source[];
  versions: SourceVersion[];
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<{
      entities: HistoricalEntity[];
      history: {
        id: string;
        from_id: string;
        to_id: string;
        kind: string;
        basis: string;
        actor: string | null;
        created_at: string;
      }[];
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
  const visible =
    data?.entities.filter((entry) =>
      `${entry.name} ${entry.aliases.join(' ')}`
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .includes(
          query.trim().normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase(),
        ),
    ) || [];
  const reason = (basis: string) => {
    try {
      const parsed = JSON.parse(basis);
      return typeof parsed.reason === 'string' ? parsed.reason : '';
    } catch {
      return basis;
    }
  };
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
        {visible.map((e) => (
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
                {L('材料支持的年代范围：', 'Source-supported date range: ')}
                {e.date_start ?? '?'} — {e.date_end ?? '?'}
              </p>
            )}
            {e.canonical_id && (
              <p>
                {L('合并到：', 'Grouped under: ')}
                {data?.entities.find((v) => v.id === e.canonical_id)?.name ||
                  L('既有条目', 'Existing entry')}
              </p>
            )}
            {e.evidence.map((c, i) => (
              <a
                key={i}
                className="record-citation"
                href={sourcePath(projectId, c.version_id, c.page)}
              >
                <span>
                  {sources.find(
                    (source) =>
                      source.id ===
                      versions.find((version) => version.id === c.version_id)
                        ?.source_id,
                  )?.title || L('原文出处', 'Source')}{' '}
                  · {L('打开原文', 'Open source')}
                </span>
                <br />
                {c.quote} · {L('第', 'p. ')}
                {c.page}
                {L('页', '')}
              </a>
            ))}
            {!!data?.history.some(
              (item) => item.from_id === e.id || item.to_id === e.id,
            ) && (
              <details className="entity-history">
                <summary>
                  {L('判断依据与修改记录', 'Reasons and revision history')}
                </summary>
                {data.history
                  .filter(
                    (item) => item.from_id === e.id || item.to_id === e.id,
                  )
                  .map((item) => (
                    <div key={item.id} className="my-3 text-sm">
                      <strong>
                        {item.kind === 'create'
                          ? L('建立条目', 'Entry created')
                          : item.kind === 'merge'
                            ? L('归并条目', 'Identity grouped')
                            : item.kind === 'unmerge'
                              ? L('取消归并', 'Grouping undone')
                              : L('修订条目', 'Entry revised')}
                      </strong>
                      <p>{reason(item.basis)}</p>
                      <small>
                        {item.actor || L('研究成员', 'Research member')} ·{' '}
                        {new Date(item.created_at).toLocaleString(locale)}
                      </small>
                    </div>
                  ))}
              </details>
            )}
            {data?.writable && (
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
      {data && data.entities.length > 0 && !visible.length && (
        <output className="settings-feedback">
          {L(
            '没有匹配的条目。试试姓名的一部分或别名。',
            'No matching entries. Try part of a name or an alias.',
          )}
        </output>
      )}
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
                '年代仅填写材料支持的范围，并在依据中说明是活动年份还是生卒年；未知留空。确认身份前请核对引文及整页语境。',
                'Use source-supported years and explain whether they describe activity or lifespan; leave unknowns empty. Check the quotation and its page context before confirming an identity.',
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
                <NativeSelect name="kind" defaultValue={edit?.kind || 'person'}>
                  {Object.entries(labels).map(([key, label]) => (
                    <NativeSelectOption key={key} value={key}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
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
                <NativeSelect name="evidence">
                  <NativeSelectOption value="">
                    {edit
                      ? L('保留既有出处', 'Keep existing evidence')
                      : L('选择一条证据摘录', 'Choose an evidence excerpt')}
                  </NativeSelectOption>
                  {evidence.map((e) => (
                    <NativeSelectOption value={e.id} key={e.id}>
                      {e.quote.slice(0, 80)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label>
                {L('审读状态', 'Review status')}
                <NativeSelect
                  name="status"
                  defaultValue={edit?.status || 'candidate'}
                >
                  <NativeSelectOption value="candidate">
                    {L('待核查', 'Candidate')}
                  </NativeSelectOption>
                  <NativeSelectOption
                    value="confirmed"
                    disabled={!data?.reviewable}
                  >
                    {L('已审读确认', 'Reviewed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="rejected">
                    {L('已排除', 'Rejected')}
                  </NativeSelectOption>
                </NativeSelect>
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
            {edit &&
              data?.reviewable &&
              (edit.status === 'confirmed' || edit.canonical_id) && (
                <label>
                  {L('同一对象的归并', 'Identity grouping')}
                  <NativeSelect
                    name="target"
                    defaultValue={edit.canonical_id ? 'unmerge' : ''}
                  >
                    {!edit.canonical_id && (
                      <NativeSelectOption value="">
                        {L('不合并', 'Keep separate')}
                      </NativeSelectOption>
                    )}
                    {edit.canonical_id ? (
                      <NativeSelectOption value="unmerge">
                        {L('取消此前合并', 'Undo grouping')}
                      </NativeSelectOption>
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
                          <NativeSelectOption value={e.id} key={e.id}>
                            {e.name}
                          </NativeSelectOption>
                        ))
                    )}
                  </NativeSelect>
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
