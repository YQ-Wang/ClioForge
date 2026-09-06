'use client';
import { formText } from '@/lib/form-values';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/provider';
import type { MissionTask, MissionView } from '@/lib/platform/types';
export default function MethodEvaluation({
  task,
  view,
  canReview,
  busy,
  onSave,
}: {
  task: MissionTask;
  view: MissionView;
  canReview: boolean;
  busy: boolean;
  onSave: (value: unknown) => Promise<unknown>;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [saved, setSaved] = useState(false);
  const evaluations = (view.evaluations || []).filter(
    (e) => e.config.task_id === task.id,
  );
  return (
    <details className="method-evaluation">
      <summary>
        {L('记录本页人工评估', 'Record a manual page evaluation')}
      </summary>
      <p>
        {L(
          '通读整页并检查遗漏后填写。评估固定在当前输出版本；修改输出后需重新评估。耗时请包括检查和返工，纯人工对照可留空。',
          'Complete after reading the whole page, including omissions. This evaluates the current output version. Reassess after edits. Include checking and rework time; the manual baseline is optional.',
        )}
      </p>
      {canReview && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const value = Object.fromEntries(
              [
                'missed',
                'false_inclusions',
                'wrong_values',
                'wrong_categories',
                'review_minutes',
              ].map((k) => [k, Number(f.get(k))]),
            );
            if (
              (await onSave({
                ...value,
                expected: task.revision,
                manual_minutes: f.get('manual_minutes')
                  ? Number(f.get('manual_minutes'))
                  : null,
                notes: formText(f, 'notes'),
              })) !== false
            )
              setSaved(true);
          }}
        >
          <div className="form-pair">
            {(
              [
                ['missed', '遗漏记录数', 'Missed records'],
                ['false_inclusions', '不应收录的记录数', 'False inclusions'],
                ['wrong_values', '值有误的栏目数', 'Fields with wrong values'],
                [
                  'wrong_categories',
                  '分类有误的栏目数',
                  'Fields with wrong categories',
                ],
                [
                  'review_minutes',
                  '核查与返工分钟',
                  'Review and rework minutes',
                ],
                [
                  'manual_minutes',
                  '纯人工完成的分钟（可选）',
                  'Manual baseline minutes (optional)',
                ],
              ] as const
            ).map(([key, zh, en]) => (
              <label key={key}>
                {L(zh, en)}
                <Input
                  name={key}
                  type="number"
                  min={0}
                  max={100000}
                  step={key.includes('minutes') ? '0.1' : '1'}
                  required={key !== 'manual_minutes'}
                />
              </label>
            ))}
          </div>
          <label>
            {L('判断标准与局限', 'Criteria and limitations')}
            <Textarea name="notes" required maxLength={4000} />
          </label>
          <Button type="submit" disabled={busy}>
            {L('保存评估记录', 'Save evaluation')}
          </Button>
          {saved && <output>{L('评估已保存。', 'Evaluation saved.')}</output>}
        </form>
      )}
      {evaluations.map((e) => (
        <article key={e.id}>
          <strong>
            {e.current === 1
              ? L('当前版本', 'Current version')
              : L('较早输出版本', 'Earlier output version')}
          </strong>
          <p>
            {L('遗漏', 'Missed')}: {e.metrics.missed} ·{' '}
            {L('误收', 'False inclusions')}: {e.metrics.false_inclusions} ·{' '}
            {L('值错误', 'Wrong values')}: {e.metrics.wrong_values} ·{' '}
            {L('分类错误', 'Wrong categories')}: {e.metrics.wrong_categories} ·{' '}
            {e.metrics.review_minutes} min
          </p>
          <p>{e.metrics.notes}</p>
          <small>{new Date(e.created_at).toLocaleString(locale)}</small>
        </article>
      ))}
    </details>
  );
}
