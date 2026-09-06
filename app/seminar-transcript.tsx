'use client';
import type { MissionTask } from '@/lib/platform/types';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import ResearchText from './research-text';
export default function SeminarTranscript({
  tasks,
  edges,
  onSelect,
}: {
  tasks: MissionTask[];
  edges: { task_id: string; depends_on: string }[];
  onSelect: (id: string) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  if (!tasks.some((t) => t.input.parameters.seminar)) return null;
  // Dependency order is stable even when tasks were inserted in the same millisecond.
  const pending = [...tasks],
    ordered: MissionTask[] = [];
  while (pending.length) {
    const index = pending.findIndex(
      (t) =>
        !edges.some(
          (e) =>
            e.task_id === t.id && pending.some((p) => p.id === e.depends_on),
        ),
    );
    if (index < 0) break;
    ordered.push(pending.splice(index, 1)[0]);
  }
  return (
    <section className="seminar-transcript">
      <h3>{L('研究研讨', 'Research discussion')}</h3>
      <p>
        {L(
          '同一模型承担不同角色；不是独立学者的共识。此处展示任务产生的回应；在“轮到你”步骤提交并确认采纳的意见会进入下一次模型阅读。普通评论不会自动触发付费调用。',
          'Different roles use the same model; this is not independent scholarly consensus. Feedback submitted and accepted at Your turn is read by the next assistant. Ordinary comments do not trigger paid model calls.',
        )}
      </p>
      {ordered
        .filter((t) => t.input.parameters.seminar)
        .map((t) => (
          <article
            key={t.id}
            className={t.executor === 'human' ? 'researcher-turn' : ''}
          >
            <header>
              <strong>{t.title}</strong>
              <span>
                {t.status === 'accepted'
                  ? L('已采纳', 'Accepted')
                  : t.status === 'failed'
                    ? L('执行失败', 'Failed')
                    : t.status === 'uncertain'
                      ? L('结果待确认', 'Uncertain')
                      : t.status === 'cancelled'
                        ? L('已取消', 'Cancelled')
                        : t.status === 'stale'
                          ? L('依据已更新', 'Sources updated')
                          : t.status === 'rejected'
                            ? L('已退回', 'Returned for revision')
                            : t.result
                              ? L(
                                  '已回应 · 待核查',
                                  'Responded · check findings',
                                )
                              : t.status === 'ready'
                                ? L('等待回应', 'Ready for a response')
                                : t.status === 'running' ||
                                    t.status === 'queued'
                                  ? L('进行中', 'In progress')
                                  : L('尚未执行', 'Not yet run')}
              </span>
            </header>
            {t.result ? (
              <ResearchText text={t.result.summary} />
            ) : (
              <p>
                {t.executor === 'human'
                  ? L(
                      '打开此步骤，提交你的追问或修正，后续助手才能继续。',
                      'Open this step and submit your question or correction to continue.',
                    )
                  : L(
                      '前面的步骤完成后才会读取材料并回应。',
                      'Reads the sources and responds when earlier steps are complete.',
                    )}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onSelect(t.id)}
            >
              {t.executor === 'human'
                ? L('打开我的回应', 'Open my response')
                : L('查看出处与步骤', 'Inspect sources and step')}
            </Button>
          </article>
        ))}
    </section>
  );
}
