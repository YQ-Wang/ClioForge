'use client';
import { Activity, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { missionProgress } from '@/lib/mission-progress';
import type { MissionView } from '@/lib/platform/types';

export default function MissionProgress({
  view,
  onTask,
}: {
  view: MissionView;
  onTask: (id: string) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const progress = missionProgress(view.mission, view.tasks);
  const labels: Record<string, [string, string]> = {
    draft: ['尚未开始，不会产生调用', 'Draft: no calls are running'],
    paused: ['计划已暂停', 'Plan paused'],
    cancelled: ['计划已取消', 'Plan cancelled'],
    completed: ['计划步骤已完成', 'Plan steps completed'],
    working: ['后台正在推进研究', 'Research is progressing in the background'],
    attention: ['需要检查后才能继续', 'A check is needed to continue'],
    review: ['等待研究者审读', 'Waiting for researcher review'],
    external: ['等待外部助手', 'Waiting for an external agent'],
    waiting: ['等待前序步骤', 'Waiting for preceding steps'],
  };
  const items = [
    ...progress.attention,
    ...progress.review,
    ...progress.external,
  ];
  return (
    <section
      className="mission-progress"
      aria-label={L('后台研究状态', 'Background research status')}
    >
      <div className="mission-progress-heading">
        <Activity size={20} />
        <h3>{L(...(labels[progress.state] || labels.waiting))}</h3>
        <span>
          {progress.done}/{progress.total} {L('步骤已完成', 'steps completed')}
        </span>
      </div>
      <p>
        {progress.state === 'working'
          ? L(
              '关闭网页后，已开始的内置和模型步骤仍会继续。需要审读的分支会停在检查点；其它可执行步骤可以继续。',
              'Started built-in and model steps continue after this page closes. Branches needing review pause at their checkpoint; other eligible steps can continue.',
            )
          : progress.state === 'paused' || progress.state === 'cancelled'
            ? L(
                '不会开始后续步骤；已经发出的模型请求可能仍会返回。',
                'No further steps will start; model requests already sent may still return.',
              )
            : progress.state === 'completed'
              ? L(
                  '执行完成不等于历史结论成立。请在研究成果中核对依据，再用于论述。',
                  'Execution completion does not establish a historical conclusion. Check the evidence in Findings before using it in your argument.',
                )
              : L(
                  '自动步骤按前后依赖推进；审读、异常或资料更新需要你处理。你可以离开页面，稍后从研究收件箱接续。',
                  'Automatic steps follow their dependencies. Review, errors or updated sources need your attention. You can leave and return through the research inbox.',
                )}
      </p>
      <div className="mission-progress-counts">
        <span>
          {progress.automatic.length}{' '}
          {L('自动步骤就绪或执行中', 'automatic steps ready or in progress')}
        </span>
        <span>
          {progress.review.length}{' '}
          {L('等待审读或人工处理', 'need review or human work')}
        </span>
        <span>
          {progress.attention.length} {L('需要检查', 'need inspection')}
        </span>
      </div>
      {items.length > 0 && (
        <div className="mission-progress-actions">
          {items.slice(0, 3).map((item) => (
            <Button
              variant="outline"
              size="sm"
              key={item.id}
              onClick={() => onTask(item.id)}
            >
              <span>{item.title}</span>
              <ArrowRight size={14} />
            </Button>
          ))}
          {items.length > 3 && (
            <small>
              {L(
                '更多待办见下方步骤列表。',
                'More pending work is listed below.',
              )}
            </small>
          )}
        </div>
      )}
      <details>
        <summary>
          {L('自动化会在哪里停下？', 'Where does automation stop?')}
        </summary>
        <p>
          {L(
            '样本与批次审读、预算不足、引文或格式核查失败、资料版本变化时，相关步骤不会直接越过。模型请求超时或收费状态不明时，不会盲目重发；打开该步骤查看执行记录。',
            'Affected steps do not bypass sample or batch reviews, insufficient budgets, citation or format failures, or changed source versions. A timed-out model request or uncertain charge is not blindly replayed; open its execution record.',
          )}
        </p>
        <p>
          {L(
            '外部助手需要自行保持连接；这张状态卡不是供应商的实时健康监测。',
            'External agents must maintain their own connection. This card is not a live provider-health monitor.',
          )}
        </p>
      </details>
    </section>
  );
}
