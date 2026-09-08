'use client';
import { Search, BookOpen, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { researchMemory } from '@/lib/harness/research-tools';
export function ResearchLedger({
  data,
  onSource,
  sourceLabel,
}: {
  data: unknown;
  onSource: (version: string, page: number) => void;
  sourceLabel: (version: string) => string;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const parsed = researchMemory.safeParse(data);
  if (!parsed.success) return null;
  return (
    <section
      className="space-y-3"
      aria-label={L('本轮查证记录', 'Investigation activity')}
    >
      <h4>{L('助手实际做了什么', 'What the assistant actually did')}</h4>
      <ol className="space-y-3">
        {parsed.data.steps.map((step, index) => {
          const action = step.action,
            Icon =
              action.tool === 'search'
                ? Search
                : action.tool === 'read_page'
                  ? BookOpen
                  : CheckCircle2;
          return (
            <li
              key={index}
              className="rounded-xl border border-border p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Icon size={16} aria-hidden="true" />
                <strong>
                  {index + 1}.{' '}
                  {action.tool === 'search'
                    ? L('检索片段', 'Search excerpts')
                    : action.tool === 'read_page'
                      ? L('阅读原文', 'Read source text')
                      : L('结束探索', 'Finish exploration')}
                </strong>
              </div>
              {action.tool === 'search' && <p>{action.query}</p>}
              {action.tool === 'read_page' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSource(action.version_id, action.page)}
                >
                  {sourceLabel(action.version_id)} · {L('第', 'Page')}{' '}
                  {action.page} {L('页', '')}
                </Button>
              )}
              <p className="text-sm text-muted-foreground">{step.outcome}</p>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-muted-foreground">
        {L(
          '检索片段与阅读整页分别记录。未覆盖的材料仍然未知；解释等待你的审读。',
          'Search excerpts and page reading are recorded separately. Uncovered material remains unknown; interpretations await your review.',
        )}
      </p>
    </section>
  );
}
