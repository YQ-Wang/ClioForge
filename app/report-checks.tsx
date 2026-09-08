'use client';
import { CircleCheck, CircleAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { TaskResult } from '@/lib/platform/types';

export default function ReportChecks({
  checks,
  sourceLabel,
}: {
  checks: TaskResult['checks'];
  sourceLabel: (id: string) => string;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  if (!checks.length) return null;
  const failed = checks.filter((check) => !check.passed);
  const passed = checks.filter((check) => check.passed);
  const grouped = new Map<
    string,
    { check: TaskResult['checks'][number]; count: number }
  >();
  for (const check of passed) {
    const key = JSON.stringify([check.name, check.detail]);
    const previous = grouped.get(key);
    grouped.set(key, { check, count: (previous?.count || 0) + 1 });
  }
  function label(name: string) {
    const citation = /^citation:([^:]+):(\d+)$/.exec(name);
    if (citation)
      return `${sourceLabel(citation[1])} · ${L('第', 'p.')} ${citation[2]} ${locale === 'en' ? '' : '页'}`;
    if (/^(citation|quote)/.test(name))
      return L('引文文字与出处', 'Quotation text and source');
    const labels: Record<string, [string, string]> = {
      scope: ['材料范围', 'Source scope'],
      source_validation: [
        '原始资料需要重新核对',
        'Source validation needs attention',
      ],
      section_citations: ['章节引文', 'Section citations'],
    };
    return labels[name] ? L(...labels[name]) : name;
  }
  return (
    <section
      className="report-checks"
      aria-label={L('自动核查情况', 'Automatic checks')}
    >
      <div className="report-checks-summary" data-failed={!!failed.length}>
        {failed.length ? (
          <CircleAlert size={17} aria-hidden="true" />
        ) : (
          <CircleCheck size={17} aria-hidden="true" />
        )}
        <strong>
          {failed.length
            ? L(
                `${failed.length} 项需要复核 · ${passed.length} 项自动检查通过`,
                `${failed.length} ${failed.length === 1 ? 'check needs' : 'checks need'} review · ${passed.length} automatic ${passed.length === 1 ? 'check' : 'checks'} passed`,
              )
            : L(
                `${passed.length} 项自动检查通过`,
                `${passed.length} automatic ${passed.length === 1 ? 'check' : 'checks'} passed`,
              )}
        </strong>
      </div>
      {failed.map((check, index) => (
        <div key={index} className="report-check-failure">
          <strong>{label(check.name)}</strong>
          <p>
            {check.detail ||
              L(
                '请对照原文检查这项结果。',
                'Check this result against its original source.',
              )}
          </p>
        </div>
      ))}
      <p className="report-checks-boundary">
        {L(
          '自动检查能核对文字与出处，不能替代历史解释。',
          'Automatic checks can match text and sources; historical interpretation remains yours.',
        )}
      </p>
      {!!passed.length && (
        <details>
          <summary>{L('查看已通过的检查', 'Show passed checks')}</summary>
          <ul>
            {[...grouped.values()].map(({ check, count }, index) => (
              <li key={index}>
                <span>
                  {label(check.name)}
                  {check.detail &&
                    check.detail !== 'Exact text and version verified' && (
                      <small>{check.detail}</small>
                    )}
                </span>
                <span>{L(`${count} 项通过`, `${count} passed`)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
