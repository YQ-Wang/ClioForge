import type { Evidence, Source, SourceVersion } from './types';
import { sourcePath } from './navigation';

export type EvidenceFilter = {
  query: string;
  source: string;
  relation: string;
  question: string;
  review: boolean;
};
export function filterEvidence(
  items: Evidence[],
  sources: Source[],
  filter: EvidenceFilter,
  needsReview: Set<string>,
) {
  const names = new Map(sources.map((s) => [s.id, s.title]));
  const query = filter.query.trim().normalize('NFC').toLocaleLowerCase();
  return items
    .filter(
      (e) =>
        (!filter.source || e.source_id === filter.source) &&
        (!filter.relation || e.relation === filter.relation) &&
        (!filter.question || e.question === filter.question) &&
        (!filter.review || needsReview.has(e.id)) &&
        (!query ||
          [e.quote, e.question, e.interpretation, names.get(e.source_id) || '']
            .join('\n')
            .normalize('NFC')
            .toLocaleLowerCase()
            .includes(query)),
    )
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
    );
}
export function evidenceMatrix(items: Evidence[]) {
  const rows = new Map<
    string,
    Map<string, Record<Evidence['relation'], number>>
  >();
  for (const e of items) {
    if (!rows.has(e.question)) rows.set(e.question, new Map());
    const row = rows.get(e.question)!;
    if (!row.has(e.source_id))
      row.set(e.source_id, { supports: 0, challenges: 0, context: 0 });
    row.get(e.source_id)![e.relation]++;
  }
  return rows;
}
export function evidenceHref(e: Evidence) {
  return `${sourcePath(e.project_id, e.version_id, e.page)}&evidence=${encodeURIComponent(e.id)}`;
}
const label = (relation: Evidence['relation'], english: boolean) =>
  ({
    supports: english ? 'Supports' : '支持',
    challenges: english ? 'Challenges' : '质疑',
    context: english ? 'Context' : '背景',
  })[relation];
export function evidenceCsv(
  items: Evidence[],
  sources: Source[],
  versions: SourceVersion[],
  needsReview: Set<string>,
  english: boolean,
  origin = 'https://canwoo.com',
) {
  const rows: (string | number)[][] = [
    [
      'evidence_id',
      'question',
      'relation',
      'source',
      'version',
      'page',
      'quote',
      'interpretation',
      'needs_review',
      'source_url',
    ],
  ];
  for (const e of items)
    rows.push([
      e.id,
      e.question,
      label(e.relation, english),
      sources.find((s) => s.id === e.source_id)?.title || '',
      versions.find((v) => v.id === e.version_id)?.revision || '',
      e.page,
      e.quote,
      e.interpretation,
      needsReview.has(e.id) ? 'yes' : 'no',
      new URL(evidenceHref(e), origin).href,
    ]);
  const cell = (value: string | number) => {
    const text = String(value);
    return (
      '"' +
      (/^[\s\uFEFF]*[=+@-]|^[\t\r]/.test(text) ? "'" + text : text).replaceAll(
        '"',
        '""',
      ) +
      '"'
    );
  };
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
const escape = (text: string) => text.replace(/[\\`*_[\]<>]/g, '\\$&');
export function evidenceDraft(
  items: Evidence[],
  sources: Source[],
  versions: SourceVersion[],
  needsReview: Set<string>,
  english: boolean,
) {
  const lines = [
    english ? '# Evidence for comparison' : '# 证据对照',
    '',
    english
      ? 'Research notes assembled from selected saved excerpts. Counts do not establish reliability or independent corroboration.'
      : '根据选定摘录整理的研究草稿。条数不代表可信度，也不代表来源彼此独立。',
    '',
  ];
  const groups = Map.groupBy(items, (e) => e.question);
  for (const [question, group] of groups) {
    lines.push(
      `## ${escape(question || (english ? 'Question to clarify' : '待明确的问题'))}`,
      '',
    );
    for (const e of group) {
      const source =
        sources.find((s) => s.id === e.source_id)?.title ||
        (english ? 'Source' : '原文');
      const version = versions.find((v) => v.id === e.version_id)?.revision;
      lines.push(
        `### ${label(e.relation, english)} · ${escape(source)}`,
        '',
        ...e.quote.split('\n').map((line) => '> ' + escape(line)),
        '',
        `[${escape(source.replace(/\s+/g, ' '))} · v${version || '?'} · p.${e.page}](${evidenceHref(e)})`,
        '',
        escape(e.interpretation),
        '',
      );
      if (needsReview.has(e.id))
        lines.push(
          english
            ? '**Source changed: review required.** The citation stays on its original version.'
            : '**原文已变化，待复核。** 引文仍指向原来的固定版本。',
          '',
        );
    }
    lines.push(
      english
        ? '### My interpretation and competing explanations'
        : '### 我的判断与竞争解释',
      '',
      english
        ? 'To develop after checking the passages and their relationships.'
        : '请在核对原文与来源关系后补充。',
      '',
    );
  }
  return lines.join('\n');
}
