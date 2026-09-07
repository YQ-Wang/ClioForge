'use client';
import Link from 'next/link';
import { z } from 'zod';
import { projectPath } from '@/lib/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { researchTables } from '@/lib/research-report';
import type { TaskResult } from '@/lib/platform/types';
import ResearchInsights from './research-insights';
import ResearchText from './research-text';
import { groupedCitations } from '@/lib/review-citations';
export default function ResearchResult({
  result,
  sourceLabel,
  onSource,
}: {
  result: TaskResult;
  sourceLabel: (id: string) => string;
  onSource: (id: string, page: number) => void;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const manuscript = z
    .object({
      format: z.literal('canwoo-manuscript-draft-v1'),
      project_id: z.uuid(),
      note_id: z.uuid(),
    })
    .safeParse(result.data);
  const parsed = researchTables.safeParse(result.data);
  const data = parsed.success ? parsed.data : {};
  return (
    <div className="research-report">
      <ResearchText text={result.summary} />
      {manuscript.success && (
        <Link
          className="manuscript-result-link"
          href={projectPath(manuscript.data.project_id, 'notes')}
        >
          {L('到笔记与写作打开初稿 →', 'Open the draft in Notes & writing →')}
        </Link>
      )}
      <ResearchInsights result={result} onSource={onSource} />
      {data.rows && (
        <>
          <h3>{L('词语出现次数', 'Keyword occurrences')}</h3>
          <p>
            {L(
              '这些次数只描述本次所选材料，不代表整个时代或人群。',
              'These counts describe your selected sources, not an entire period or population.',
            )}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{L('资料', 'Source')}</th>
                  <th>{L('页码', 'Page')}</th>
                  <th>{L('词语与次数', 'Terms and counts')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    <td>
                      <button
                        className="report-source"
                        onClick={() => onSource(row.version_id, row.page)}
                      >
                        {sourceLabel(row.version_id)}
                      </button>
                    </td>
                    <td>{row.page}</td>
                    <td>
                      {Object.entries(row.counts)
                        .map(([term, count]) => `${term} · ${count}`)
                        .join(' / ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length > 100 && (
            <p>
              {L(
                '这里显示前 100 页，下载报告可查看全部。',
                'Showing the first 100 pages; download the report for all pages.',
              )}
            </p>
          )}
        </>
      )}
      {data.pairs && (
        <>
          <h3>{L('值得对读的材料', 'Sources to read together')}</h3>
          <p>
            {L(
              '相似度反映措辞重合，不代表同源关系，也不是结论的可信度。',
              'Similarity reflects shared wording. It does not establish common origin or confidence in a conclusion.',
            )}
          </p>
          {data.pairs.length === 0 && (
            <p>
              {L(
                '在当前比较范围和条件下，尚未找到达到筛选标准的相似材料。',
                'No sources meet the current similarity criteria within this comparison.',
              )}
            </p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{L('材料一', 'First source')}</th>
                  <th>{L('材料二', 'Second source')}</th>
                  <th>{L('措辞重合', 'Wording overlap')}</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.slice(0, 50).map((pair, i) => (
                  <tr key={i}>
                    <td>
                      <button
                        className="report-source"
                        onClick={() => onSource(pair.left, 1)}
                      >
                        {sourceLabel(pair.left)}
                      </button>
                    </td>
                    <td>
                      <button
                        className="report-source"
                        onClick={() => onSource(pair.right, 1)}
                      >
                        {sourceLabel(pair.right)}
                      </button>
                    </td>
                    <td>{(pair.jaccard * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pairs.length > 50 && (
            <p>
              {L(
                '这里显示前 50 组，下载报告可查看全部。',
                'Showing the first 50 pairs; download the report for all pairs.',
              )}
            </p>
          )}
        </>
      )}
      {result.citations.length > 0 && (
        <>
          <h3>{L('回到原文核查', 'Check against the source')}</h3>
          {groupedCitations(result.citations).map(({ citation, numbers }) => (
            <blockquote key={numbers[0]}>
              <strong className="report-citation-number">
                {numbers.map((n) => `[${n}]`).join(' · ')}
              </strong>
              <p className="preserve-text">{citation.quote}</p>
              <button
                className="report-source"
                onClick={() => onSource(citation.version_id, citation.page)}
              >
                {sourceLabel(citation.version_id)} · {L('第', 'p.')}{' '}
                {citation.page} {locale === 'en' ? '' : '页'} →
              </button>
            </blockquote>
          ))}
        </>
      )}
      {result.checks.length > 0 && (
        <div className="report-checks">
          <h3>{L('核查情况', 'Checks')}</h3>
          {result.checks.map((check, i) => (
            <p key={i}>
              {check.passed ? '✓' : '!'}{' '}
              {check.name.startsWith('citation') ||
              check.name.startsWith('quote')
                ? L('引文文字与出处', 'Quotation text and source')
                : check.name === 'scope'
                  ? L('材料范围', 'Source scope')
                  : check.name}{' '}
              ·{' '}
              {check.passed
                ? L('已通过自动检查', 'Automatic check passed')
                : L('需要你复核', 'Needs your review')}
            </p>
          ))}
          <small>
            {L(
              '自动检查能核对文字与出处，不能替代历史解释。',
              'Automatic checks can match text and sources; historical interpretation remains yours.',
            )}
          </small>
        </div>
      )}
      <details className="platform-technical">
        <summary>
          {L(
            '技术记录（供协作者使用）',
            'Technical record (for collaborators)',
          )}
        </summary>
        <pre>{JSON.stringify(result.data, null, 2)}</pre>
      </details>
    </div>
  );
}
