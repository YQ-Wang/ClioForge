'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import {
  extractionSchema,
  extractionCsv,
} from '@/lib/platform/research-recipes';
import type { MissionTask } from '@/lib/platform/types';
export default function StudyRecords({
  tasks,
  onSelect,
}: {
  tasks: MissionTask[];
  onSelect: (id: string) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [query, setQuery] = useState('');
  const items = tasks.filter(
    (t) =>
      t.input.parameters.extraction === true &&
      t.result &&
      extractionSchema.safeParse(t.result.data).success,
  );
  if (!items.length) return null;
  const count = items.reduce(
    (n, t) => n + extractionSchema.parse(t.result!.data).records.length,
    0,
  );
  return (
    <details className="study-records">
      <summary>
        {L('本次研究的摘录记录', 'Records in this study')} · {count}
      </summary>
      <div className="flow-actions">
        <Input
          aria-label={L('查找摘录', 'Find a record')}
          placeholder={L(
            '按人物、地点或摘录内容查找',
            'Search names, places or values',
          )}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => {
            const parts = items.map((t) =>
              extractionCsv(t.result!, t.input.parameters.fields as string[]),
            );
            const csv = parts
              .map((p, i) => (i ? p.slice(p.indexOf('\r\n') + 2) : p))
              .join('\r\n');
            const url = URL.createObjectURL(
                new Blob([csv], { type: 'text/csv;charset=utf-8' }),
              ),
              a = document.createElement('a');
            a.href = url;
            a.download = 'clioforge-study-records.csv';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={16} />
          {L('导出本次摘录', 'Export study records')}
        </Button>
      </div>
      <p>
        {L(
          '包含助手输出及你保存的纠正。引文匹配不代表栏目归类或历史解释正确；请逐项核查。',
          'Includes assistant output and saved corrections. Matching quotations do not establish correct classification or interpretation; review each record.',
        )}
      </p>
      <div className="study-record-list">
        {items.flatMap((t) =>
          extractionSchema
            .parse(t.result!.data)
            .records.filter((r) =>
              JSON.stringify(r)
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
            )
            .map((r, i) => (
              <button key={`${t.id}:${i}`} onClick={() => onSelect(t.id)}>
                <strong>{r.label}</strong>
                <span>
                  {r.cells
                    .filter((c) => c.value)
                    .map((c) => `${c.field}: ${c.value}`)
                    .join(' · ')}
                </span>
                <small>
                  {t.title} ·{' '}
                  {t.status === 'stale'
                    ? L('材料或前序结果有变', 'Inputs changed')
                    : t.status === 'accepted'
                      ? L('已采纳', 'Accepted')
                      : L('可核查', 'Ready to inspect')}
                </small>
              </button>
            )),
        )}
      </div>
    </details>
  );
}
