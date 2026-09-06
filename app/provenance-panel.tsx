'use client';
import HistoricalEntities from './historical-entities';
import { useI18n } from '@/lib/i18n/provider';
import { useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Field, Notice } from './workspace';
import { api } from '@/lib/client-api';
import { formText } from '@/lib/form-values';
import type { Source } from '@/lib/types';
import type { WorkbenchData } from '@/lib/workbench-types';
const kinds = {
  quotes: '转引自',
  reprint: '转载自',
  translation: '翻译自',
  shared_origin: '可能共享来源',
};
const outcomes = {
  found: '找到材料',
  no_hits: '本次范围未命中',
  unavailable: '无法访问',
  partial: '仅覆盖部分范围',
};
export default function ProvenancePanel({
  projectId,
  data,
  sources,
  onSaved,
}: {
  projectId: string;
  data: WorkbenchData;
  sources: Source[];
  onSaved: () => Promise<unknown>;
}) {
  const { t, locale } = useI18n();
  const [dialog, setDialog] = useState<'relation' | 'search' | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [outcome, setOutcome] = useState('found');
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const fields =
        dialog === 'relation'
          ? {
              action: 'source_relation',
              from_source: form.get('from'),
              to_source: form.get('to'),
              kind: form.get('kind'),
              certainty: form.get('certainty'),
              basis: form.get('basis'),
            }
          : {
              action: 'search_log',
              query: form.get('query'),
              scope: form.get('scope'),
              searched_at: form.get('date')
                ? new Date(formText(form, 'date')).toISOString()
                : new Date().toISOString(),
              outcome,
              result_count:
                outcome === 'no_hits'
                  ? 0
                  : form.get('count')
                    ? Number(form.get('count'))
                    : null,
              notes: form.get('notes'),
            };
      await api('/api/workbench', { project_id: projectId, ...fields });
      setDialog(null);
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <HistoricalEntities projectId={projectId} />
      <div className="section-toolbar">
        <div>
          <h2 className="tool-heading">{t('材料脉络与检索盲区')}</h2>
          <p>{t('转载不等于独立证据；没有检索命中不等于事件未发生。')}</p>
        </div>
      </div>
      {message && <Notice text={message} />}
      <section className="tool-section">
        <div className="section-toolbar">
          <h2>{t('转引关系')}</h2>
          <Button variant="secondary" onClick={() => setDialog('relation')}>
            <Plus size={15} />
            {t('记录材料关系')}
          </Button>
        </div>
        {!data.source_relations.length && (
          <p className="text-muted-foreground text-sm">
            {t('记录哪份材料转引、翻译或转载了另一份材料，并注明判断依据。')}
          </p>
        )}
        {data.source_relations.map((relation) => (
          <article className="source-relation" key={relation.id}>
            <div>
              <strong>
                {sources.find((s) => s.id === relation.from_source)?.title}
              </strong>
              <span>
                {t(kinds[relation.kind])}
                <ArrowRight size={16} />
              </span>
              <strong>
                {sources.find((s) => s.id === relation.to_source)?.title}
              </strong>
              <span
                className="status-tag"
                data-state={
                  relation.certainty === 'confirmed' ? 'saved' : 'dirty'
                }
              >
                {relation.certainty === 'confirmed' ? t('已核实') : t('待核实')}
              </span>
            </div>
            <p>{relation.basis}</p>
          </article>
        ))}
      </section>
      <section className="tool-section">
        <div className="section-toolbar">
          <h2>{t('检索记录')}</h2>
          <Button
            variant="secondary"
            onClick={() => {
              setOutcome('found');
              setDialog('search');
            }}
          >
            <Plus size={15} />
            {t('记录一次检索')}
          </Button>
        </div>
        {!data.search_logs.length && (
          <p className="text-muted-foreground text-sm">
            {t(
              '保存检索词、馆藏或数据库、覆盖时期、失败与未命中的范围，供下一次研究接续。',
            )}
          </p>
        )}
        {data.search_logs.map((log) => (
          <article className="search-log" key={log.id}>
            <div className="flex gap-3 items-center flex-wrap">
              <span className="status-tag">{t(outcomes[log.outcome])}</span>
              <h3>{log.query}</h3>
              <time>{new Date(log.searched_at).toLocaleString(locale)}</time>
            </div>
            <p>
              <strong>{t('覆盖范围：')}</strong>
              {log.scope}
            </p>
            <p>
              <strong>{t('结果数：')}</strong>
              {log.result_count ?? t('未统计')}
            </p>
            <p>{log.notes}</p>
          </article>
        ))}
      </section>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'relation' ? t('记录转引关系') : t('记录一次检索')}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'relation'
                ? t(
                    '箭头方向：本材料 → 它所依赖的来源。再次记录同一关系可修订依据。',
                  )
                : t(
                    '请准确描述这次检索实际覆盖的范围，保留失败和无法访问的情况。',
                  )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {dialog === 'relation' ? (
              <>
                <Field label={t('本材料')}>
                  <NativeSelect className="w-full" name="from">
                    {sources.map((source) => (
                      <NativeSelectOption value={source.id} key={source.id}>
                        {source.title}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t('所依赖的来源材料')}>
                  <NativeSelect className="w-full" name="to">
                    {sources.map((source) => (
                      <NativeSelectOption value={source.id} key={source.id}>
                        {source.title}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="form-grid">
                  <Field label={t('关系')}>
                    <NativeSelect name="kind">
                      {Object.entries(kinds).map(([value, label]) => (
                        <NativeSelectOption value={value} key={value}>
                          {t(label)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={t('核查状态')}>
                    <NativeSelect name="certainty">
                      <NativeSelectOption value="suspected">
                        {t('待核实')}
                      </NativeSelectOption>
                      <NativeSelectOption value="confirmed">
                        {t('已核实')}
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                </div>
                <Field label={t('判断依据')}>
                  <Textarea name="basis" required maxLength={2000} />
                </Field>
              </>
            ) : (
              <>
                <Field label={t('检索词 / 查询方式')}>
                  <Input name="query" required maxLength={2000} />
                </Field>
                <Field label={t('实际覆盖范围')}>
                  <Textarea
                    name="scope"
                    required
                    maxLength={2000}
                    placeholder={t('数据库、馆藏、目录、年代范围、筛选条件…')}
                  />
                </Field>
                <Field label={t('检索时间（留空为现在）')}>
                  <Input name="date" type="datetime-local" />
                </Field>
                <Field label={t('结果状态')}>
                  <NativeSelect
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                  >
                    {Object.entries(outcomes).map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {t(label)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t('结果数（未知可留空）')}>
                  <Input
                    name="count"
                    type="number"
                    min={0}
                    max={10000000}
                    disabled={outcome === 'no_hits'}
                    placeholder={outcome === 'no_hits' ? '0' : t('未统计')}
                  />
                </Field>
                <Field label={t('说明、失败原因与下一步')}>
                  <Textarea name="notes" maxLength={10000} />
                </Field>
              </>
            )}
            <Button
              type="submit"
              disabled={busy || (dialog === 'relation' && sources.length < 2)}
            >
              {t('保存记录')}
            </Button>
            {message && <Notice text={message} />}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
