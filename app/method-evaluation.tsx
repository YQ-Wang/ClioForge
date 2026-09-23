'use client';
import { evaluationMetrics } from '@/lib/platform/evaluation-metrics';
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
  const investigation = task.input.parameters.agent_stage === 'report';
  const evaluations = (view.evaluations || []).filter(
    (e) => e.config.task_id === task.id,
  );
  return (
    <details className="method-evaluation">
      <summary>
        {investigation
          ? L('评估这次查证是否有用', 'Evaluate this investigation')
          : L('记录本页人工评估', 'Record a manual page evaluation')}
      </summary>
      <p>
        {investigation
          ? L(
              '请对照全部选定材料核查结论、遗漏与相反证据。记录的是本次报告质量，不代表该模型在其他研究中同样可靠。',
              'Review conclusions, omissions and counterevidence against all selected material. This evaluates this report, not the model’s reliability on other research.',
            )
          : L(
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
                scope_checked:
                  f.get('scope_checked') === 'on' ? 'whole' : 'partial',
                chatgpt_minutes: f.get('chatgpt_minutes')
                  ? Number(f.get('chatgpt_minutes'))
                  : null,
                timing: Object.fromEntries(
                  [
                    'preparation_minutes',
                    'configuration_minutes',
                    'analysis_minutes',
                    'writing_minutes',
                    'waiting_minutes',
                  ].map((k) => [k, f.get(k) ? Number(f.get(k)) : null]),
                ),
              })) !== false
            )
              setSaved(true);
          }}
        >
          <div className="form-pair">
            {(
              [
                [
                  'missed',
                  investigation ? '遗漏的重要证据数' : '遗漏记录数',
                  investigation
                    ? 'Missed important evidence'
                    : 'Missed records',
                ],
                [
                  'false_inclusions',
                  investigation ? '无材料支持的判断数' : '不应收录的记录数',
                  investigation ? 'Unsupported claims' : 'False inclusions',
                ],
                [
                  'wrong_values',
                  investigation ? '事实错误数' : '值有误的栏目数',
                  investigation ? 'Factual errors' : 'Fields with wrong values',
                ],
                [
                  'wrong_categories',
                  investigation
                    ? '混淆作者、时间或语境的判断数'
                    : '分类有误的栏目数',
                  investigation
                    ? 'Attribution or context errors'
                    : 'Fields with wrong categories',
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
          <details>
            <summary>
              {L(
                '完整耗时与 ChatGPT 对照（可选）',
                'Full timing and ChatGPT baseline (optional)',
              )}
            </summary>
            <p>
              {L(
                '填写本页应分摊的时间，避免每页重复计入全项目准备时间。未测量的项留空，确认为零则填 0。对照须完成同范围、同质量要求的任务。',
                'Allocate shared preparation time across pages instead of repeating project totals. Leave unmeasured entries blank; enter 0 only when measured as zero. Baselines must use the same scope and quality requirement.',
              )}
            </p>
            <div className="form-pair">
              {[
                [
                  'preparation_minutes',
                  '查找、导入与整理资料分钟',
                  'Finding and preparing sources',
                ],
                [
                  'configuration_minutes',
                  '配置与纠正规则分钟',
                  'Configuration and rule refinement',
                ],
                [
                  'analysis_minutes',
                  '分析与比较分钟',
                  'Analysis and comparison',
                ],
                ['writing_minutes', '写作与导出分钟', 'Writing and export'],
                [
                  'waiting_minutes',
                  '模型等待分钟（单独记录）',
                  'Model wait (separate from human effort)',
                ],
                [
                  'chatgpt_minutes',
                  '只用 ChatGPT 完成同任务的分钟',
                  'ChatGPT-only baseline minutes',
                ],
              ].map(([key, zh, en]) => (
                <label key={key}>
                  {L(zh, en)}
                  <Input
                    name={key}
                    type="number"
                    min={0}
                    max={100000}
                    step="0.1"
                  />
                </label>
              ))}
            </div>
          </details>
          <label>
            <input type="checkbox" name="scope_checked" />
            {L(
              '已检查全部指定材料和遗漏；同范围评估',
              'I checked all designated material, including omissions',
            )}
          </label>
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
          {e.config.kind !== 'investigation' && (
            <p>
              {(() => {
                const m = evaluationMetrics(e.metrics);
                const percent = (v: number | null) =>
                  v === null
                    ? L('未测量', 'Not measured')
                    : `${(v * 100).toFixed(1)}%`;
                return L(
                  `记录收录精确率 ${percent(m.precision)} · 召回率 ${percent(m.recall)}；不等于解释正确率。`,
                  `Record inclusion precision ${percent(m.precision)} · recall ${percent(m.recall)}; these do not measure interpretation quality.`,
                );
              })()}
            </p>
          )}
          <p>
            {(() => {
              const m = evaluationMetrics(e.metrics);
              return m.human_minutes === null
                ? L(
                    '完整人工耗时未测量，不计算端到端提速。',
                    'Full human effort is unmeasured; no end-to-end speedup is calculated.',
                  )
                : L(
                    `总人工 ${m.human_minutes.toFixed(1)} 分钟；等待 ${(m.waiting_minutes || 0).toFixed(1)} 分钟（另计）。${m.manual_speedup ? `人工对照比 ${m.manual_speedup.toFixed(2)}×。` : ''}${m.chatgpt_speedup ? `ChatGPT 对照比 ${m.chatgpt_speedup.toFixed(2)}×。` : ''}`,
                    `Human effort ${m.human_minutes.toFixed(1)} min; wait ${(m.waiting_minutes || 0).toFixed(1)} min (separate). ${m.manual_speedup ? `Manual comparison ${m.manual_speedup.toFixed(2)}×.` : ''} ${m.chatgpt_speedup ? `ChatGPT comparison ${m.chatgpt_speedup.toFixed(2)}×.` : ''}`,
                  );
            })()}
          </p>
          {e.metrics.missing_fields !== undefined && (
            <p>
              {L(
                `缺失栏目 ${e.metrics.missing_fields}/${e.metrics.fields}；推测栏目 ${e.metrics.inferred_fields || 0}/${e.metrics.fields}。缺失可能来自原文或模型遗漏，需对照判断。`,
                `Missing fields ${e.metrics.missing_fields}/${e.metrics.fields}; inferred fields ${e.metrics.inferred_fields || 0}/${e.metrics.fields}. Missing data may reflect the source or model omissions; inspect the original.`,
              )}
            </p>
          )}
          <p>{e.metrics.notes}</p>
          <small>{new Date(e.created_at).toLocaleString(locale)}</small>
        </article>
      ))}
    </details>
  );
}
