'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { useI18n } from '@/lib/i18n/provider';
import { studyComparison } from '@/lib/platform/study-comparison';
import type { MissionTask } from '@/lib/platform/types';
export default function StudyComparison({
  tasks,
  onSelect,
}: {
  tasks: MissionTask[];
  onSelect: (id: string) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const fields = [
    ...new Set(
      tasks.flatMap((t) =>
        t.input.parameters.extraction === true &&
        Array.isArray(t.input.parameters.fields)
          ? t.input.parameters.fields.filter(
              (f): f is string => typeof f === 'string',
            )
          : [],
      ),
    ),
  ];
  const [field, setField] = useState(''),
    [accepted, setAccepted] = useState(true),
    [inferred, setInferred] = useState(false),
    [dedup, setDedup] = useState(true);
  const [sourceGroups, setSourceGroups] = useState<Record<string, string>>({}),
    [onePerGroup, setOnePerGroup] = useState(false),
    [dateField, setDateField] = useState(''),
    [yearFrom, setYearFrom] = useState(''),
    [yearTo, setYearTo] = useState(''),
    [undated, setUndated] = useState(false);
  const invalidRange =
    !!(yearFrom && (!/^\d{1,4}$/.test(yearFrom) || Number(yearFrom) < 1)) ||
    !!(yearTo && (!/^\d{1,4}$/.test(yearTo) || Number(yearTo) < 1)) ||
    (!!yearFrom && !!yearTo && Number(yearFrom) > Number(yearTo));
  const versions = [
    ...new Set(
      tasks.flatMap((t) => t.result?.citations.map((c) => c.version_id) || []),
    ),
  ];
  if (!fields.length) return null;
  const report = studyComparison(tasks, {
    field: fields.includes(field) ? field : fields[0],
    accepted_only: accepted,
    include_inferred: inferred,
    deduplicate: dedup,
    source_groups: sourceGroups,
    one_per_group: onePerGroup,
    date_field: invalidRange ? '' : dateField,
    year_from: yearFrom && !invalidRange ? Number(yearFrom) : null,
    year_to: yearTo && !invalidRange ? Number(yearTo) : null,
    include_undated: undated,
  });
  const sensitivity = studyComparison(tasks, {
    ...report.options,
    include_inferred: !inferred,
  });
  return (
    <details className="method-evaluation research-scale-panel">
      <summary>
        {L(
          '比较摘录与检验统计口径',
          'Compare records and check counting choices',
        )}
      </summary>
      <p>
        {L(
          '统计的是有出处的摘录次数，不代表独立人物或事件。别名与相似名字保留区别；相同引文只去除重复摘录，不能识别转抄或共用底本。日期不自动补齐，模糊年份保留原值。',
          'Counts describe source-linked observations, not distinct people or events. Aliases stay separate. Deduplication only removes repeated quotations; it cannot detect copied or dependent sources. Uncertain dates retain their original values.',
        )}
      </p>
      <label>
        {L('比较栏目', 'Compare field')}
        <NativeSelect
          value={report.options.field}
          onChange={(e) => setField(e.target.value)}
        >
          {fields.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </NativeSelect>
      </label>
      <div className="flow-actions">
        <label>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          {L('只含已采纳结果', 'Accepted results only')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={inferred}
            onChange={(e) => setInferred(e.target.checked)}
          />
          {L('计入推测值', 'Include inferred values')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={dedup}
            onChange={(e) => setDedup(e.target.checked)}
          />
          {L('相同引文去重', 'Deduplicate identical quotations')}
        </label>
      </div>
      <p>
        {L(
          `纳入 ${report.included}/${report.records} 条；${report.incomplete} 页未确认完整。切换推测值口径后为 ${sensitivity.included} 条。`,
          `Included ${report.included}/${report.records} records; ${report.incomplete} outputs lack confirmed completeness. Toggling inferred values gives ${sensitivity.included} records.`,
        )}
      </p>
      <p>
        {L(
          `排除：未采纳 ${report.excluded.unreviewed}，已过期 ${report.excluded.stale}，缺失 ${report.excluded.missing}，推测 ${report.excluded.inferred}，重复 ${report.excluded.duplicate}。`,
          `Excluded: unaccepted ${report.excluded.unreviewed}, stale ${report.excluded.stale}, missing ${report.excluded.missing}, inferred ${report.excluded.inferred}, duplicates ${report.excluded.duplicate}.`,
        )}
      </p>
      <details>
        <summary>
          {L(
            '日期范围与材料依赖（可选）',
            'Date range and source dependence (optional)',
          )}
        </summary>
        <p>
          {L(
            '年份仅识别 YYYY、YYYY-MM-DD 或 YYYY/YYYY 范围；不转换历法、不补月日。区间只要与筛选范围交集即纳入。无法识别的日期单独统计。',
            'Recognizes year notation YYYY, YYYY-MM-DD or YYYY/YYYY ranges. Calendars are not converted and missing months or days are never filled. Ranges are included when they overlap; unrecognized dates are counted separately.',
          )}
        </p>
        <div className="form-pair">
          <label>
            {L('日期栏目', 'Date field')}
            <NativeSelect
              value={dateField}
              onChange={(e) => setDateField(e.target.value)}
            >
              <option value="">{L('不筛选日期', 'No date filter')}</option>
              {fields.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {L('起始年', 'From year')}
            <Input
              type="number"
              min={1}
              max={9999}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
            />
          </label>
          <label>
            {L('截止年', 'Through year')}
            <Input
              type="number"
              min={1}
              max={9999}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={undated}
            onChange={(e) => setUndated(e.target.checked)}
          />
          {L('计入未知日期', 'Include undated records')}
        </label>
        {invalidRange && (
          <p role="alert">
            {L(
              '起始年不能晚于截止年；日期筛选尚未应用。',
              'Start year cannot follow end year; the date filter has not been applied.',
            )}
          </p>
        )}
        <p>
          {L(
            '若资料转抄或共用底本，可以给它们填相同的组名，再比较每组每个值只计一次的结果。这是你的材料依赖假设，系统不会自动断言来源独立。',
            'If sources copy one another or share an exemplar, assign the same group name and compare counting each value once per group. This records your dependence hypothesis; the system does not infer source independence.',
          )}
        </p>
        {versions.map((id, i) => (
          <label key={id}>
            {L('材料版本', 'Source version')} {i + 1} · {id.slice(0, 8)}
            <Input
              value={sourceGroups[id] || ''}
              maxLength={100}
              placeholder={L(
                '组名，留空则不合并',
                'Group name; blank keeps separate',
              )}
              onChange={(e) =>
                setSourceGroups({ ...sourceGroups, [id]: e.target.value })
              }
            />
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={onePerGroup}
            onChange={(e) => setOnePerGroup(e.target.checked)}
          />
          {L('每组的相同值只计一次', 'Count each value once per source group')}
        </label>
      </details>
      <p>
        {L(
          `同组排除 ${report.excluded.dependent}；日期未知排除 ${report.excluded.undated}；范围外排除 ${report.excluded.outside_dates}。`,
          `Excluded: same group ${report.excluded.dependent}; undated ${report.excluded.undated}; outside date range ${report.excluded.outside_dates}.`,
        )}
      </p>
      <Button
        variant="outline"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(report, null, 2)], {
              type: 'application/json',
            }),
          );
          const a = document.createElement('a');
          a.href = url;
          a.download = 'clioforge-comparison.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        {L('下载可复算的比较记录', 'Download reproducible comparison')}
      </Button>
      <div className="study-record-list">
        {report.groups.map((g) => (
          <details key={g.value}>
            <summary>
              {g.value} · {g.count}
            </summary>
            {g.references.map((r, i) => (
              <button
                key={`${r.task_id}:${i}`}
                onClick={() => onSelect(r.task_id)}
              >
                <span>{r.quote}</span>
                <small>
                  {L('页', 'p.')} {r.page} ·{' '}
                  {r.status === 'inferred'
                    ? L('推测', 'Inferred')
                    : L('明示', 'Explicit')}{' '}
                  → {L('核对出处', 'Inspect source')}
                </small>
              </button>
            ))}
          </details>
        ))}
      </div>
    </details>
  );
}
