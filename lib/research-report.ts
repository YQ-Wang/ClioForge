import { z } from 'zod';
import type { TaskResult } from './platform/types';
export const researchTables = z
  .object({
    pairs: z
      .array(
        z.object({ left: z.string(), right: z.string(), jaccard: z.number() }),
      )
      .optional(),
    rows: z
      .array(
        z.object({
          version_id: z.string(),
          page: z.number(),
          counts: z.record(z.string(), z.number()),
        }),
      )
      .optional(),
    hits: z
      .array(
        z.object({
          version_id: z.string(),
          page: z.number(),
          title: z.string(),
          snippet: z.string(),
        }),
      )
      .optional(),
  })
  .loose();
export function reportMarkdown(
  title: string,
  result: TaskResult,
  sourceLabel: (id: string) => string,
  locale: string,
  license: string,
  sourceHref?: (version: string, page: number) => string,
) {
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const lines = [
    `# ${title}`,
    '',
    sourceHref
      ? result.summary.replace(/\[(\d+)\]/g, (marker, number) => {
          const citation = result.citations[Number(number) - 1];
          return citation
            ? `[${number}](${sourceHref(citation.version_id, citation.page)})`
            : marker;
        })
      : result.summary,
    '',
    `## ${L('原文依据', 'Source evidence')}`,
    '',
  ];
  result.citations.forEach((citation, i) =>
    lines.push(
      `### ${i + 1}. ${sourceLabel(citation.version_id)} · ${L('页', 'p.')} ${citation.page}`,
      '',
      ...citation.quote.split('\n').map((line) => `> ${line}`),
      '',
      sourceHref
        ? `[${L('回到原文', 'Open source passage')}](${sourceHref(citation.version_id, citation.page)})`
        : `${L('固定版本', 'Source version')}: ${citation.version_id}`,
      '',
    ),
  );
  const data = researchTables.safeParse(result.data);
  if (data.success && data.data.rows) {
    lines.push(`## ${L('词语出现次数', 'Keyword occurrences')}`, '');
    for (const row of data.data.rows)
      lines.push(
        `- ${sourceLabel(row.version_id)} · ${L('页', 'p.')} ${row.page}: ${Object.entries(
          row.counts,
        )
          .map(([term, count]) => `${term} (${count})`)
          .join('; ')}`,
      );
    lines.push(
      '',
      L(
        '次数仅描述所选材料，不能据此推断历史总体。',
        'Counts describe the selected corpus; they do not establish population-level conclusions.',
      ),
      '',
    );
  }
  if (data.success && data.data.pairs) {
    lines.push(
      `## ${L('待核查的相似材料', 'Textual parallels to examine')}`,
      '',
    );
    for (const pair of data.data.pairs)
      lines.push(
        `- ${sourceLabel(pair.left)} / ${sourceLabel(pair.right)}: ${(pair.jaccard * 100).toFixed(1)}%`,
      );
    lines.push(
      '',
      L(
        '该数值衡量措辞重合，不代表同源关系或结论可信度。',
        'The score measures wording overlap, not common origin or confidence in a conclusion.',
      ),
      '',
    );
  }
  lines.push(
    `## ${L('使用说明', 'Use and attribution')}`,
    '',
    license === 'private; source rights retained'
      ? L(
          '项目内保存；请保留原始材料的出处与权利说明。',
          'Saved within the project; retain source attribution and rights statements.',
        )
      : license,
    '',
    L(
      '研究辅助成果。历史解释须由研究者复核；请保留原始材料的出处和使用许可。',
      'Research assistance output. Historical interpretation requires researcher review; retain source attribution and licensing.',
    ),
    '',
  );
  return lines.join('\n');
}
