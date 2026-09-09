import { z } from 'zod';
import { HttpError } from './errors';
import { readingOutputJsonSchema } from './reading-output';
import type { TaskResult } from './platform/types';

export const DOSSIER_OUTPUT_SCHEMA = 'dossier_answer_v1';
export const dossierOutputJsonSchema = {
  ...readingOutputJsonSchema,
  properties: {
    ...readingOutputJsonSchema.properties,
    summary: {
      type: 'string',
      description:
        'At most 200 Chinese characters or 150 English words. Do not repeat the question. Cite the numbered source passages exactly as [P1], [P17]. Use only supplied passage numbers. Paraphrase rather than copying quotations. Separate observations, interpretation and gaps.',
    },
    data: {
      ...readingOutputJsonSchema.properties.data,
      properties: {
        ...readingOutputJsonSchema.properties.data.properties,
        alternatives: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string' },
          description:
            'One or two specific competing interpretations or overstatements, at most 100 Chinese characters or 70 English words each. For each, identify the supporting passage [Pnumber], why the inference is uncertain and what would distinguish the alternatives. Do not merely repeat the summary.',
        },
        next_steps: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string' },
          description:
            'One or two prioritized next sources, at most 80 Chinese characters or 60 English words each, explaining the precise question each could resolve. Proposed research, never claim these searches were performed. Do not invent catalog identifiers or URLs.',
        },
      },
      required: ['limitations', 'alternatives', 'next_steps'],
    },
    citations: {
      ...readingOutputJsonSchema.properties.citations,
      minItems: 0,
      maxItems: 0,
      description:
        'Return an empty array. ClioForge fills exact quotations from the [Pnumber] references in summary.',
    },
  },
} as const;

// Versioned segmentation: never change v1 boundaries after jobs have been saved.
// Numbers follow the fixed version/page order; every span preserves original text.
export function dossierPassages(
  versions: { id: string; pages: { page: number; text: string }[] }[],
  refs?: { version_id: string; page: number }[],
) {
  const passages: TaskResult['citations'] = [];
  for (const version of versions)
    for (const page of version.pages) {
      if (
        refs &&
        !refs.some((r) => r.version_id === version.id && r.page === page.page)
      )
        continue;
      for (const line of page.text.matchAll(/[^\r\n]+/g)) {
        if (!line[0].trim()) continue;
        let offset = 0;
        while (offset < line[0].length) {
          let end = Math.min(offset + 480, line[0].length);
          if (end < line[0].length) {
            const space = line[0].lastIndexOf(' ', end);
            if (space > offset + 240) end = space;
            if (/[\uD800-\uDBFF]/.test(line[0][end - 1])) end--;
          }
          const quote = line[0].slice(offset, end);
          if (quote.trim())
            passages.push({
              version_id: version.id,
              page: page.page,
              start: line.index + offset,
              quote,
            });
          offset = end;
        }
      }
    }
  return passages;
}

const dossierData = z
  .object({
    limitations: z.array(z.string().trim().min(1).max(1000)).max(3),
    alternatives: z.array(z.string().trim().min(1).max(1000)).min(1).max(3),
    next_steps: z.array(z.string().trim().min(1).max(1000)).min(1).max(3),
  })
  .strict();

export function resolveDossierCitations(
  result: TaskResult,
  passages: TaskResult['citations'],
  locale: 'zh-CN' | 'en' = 'en',
  maxCitations = 12,
) {
  const data = dossierData.parse(result.data);
  if (!/\[P/.test(result.summary))
    throw new HttpError(400, '后台报告正文需要引用所选原文片段。');
  const prose =
    result.summary +
    '\n\n**' +
    (locale === 'en'
      ? 'Competing interpretations and challenges'
      : '竞争解释与需要质疑的地方') +
    '**\n\n' +
    data.alternatives.map((item) => '- ' + item).join('\n') +
    '\n\n**' +
    (locale === 'en' ? 'Next evidence to seek' : '下一步优先查证的材料') +
    '**\n\n' +
    data.next_steps.map((item, i) => `${i + 1}. ${item}`).join('\n') +
    (data.limitations.length
      ? '\n\n**' +
        (locale === 'en' ? 'Limits of this reading' : '本次阅读的局限') +
        '**\n\n' +
        data.limitations.map((item) => '- ' + item).join('\n')
      : '');
  if (result.citations.length || /\[\d+\]/.test(prose))
    throw new HttpError(
      400,
      '后台报告请用 [P编号] 选择原文片段，不要自行抄写引文。',
    );
  // Accept the common grouped form [P8, P9] without changing any reference.
  // Ranges, unknown prefixes and inferred numbers are deliberately not expanded.
  const normalize = (text: string) =>
    text.replace(/\[P([^\]]*)\]/g, (_marker, body: string) => {
      if (!/^\d+(?:\s*[,，;；]\s*P\d+)*$/.test(body))
        throw new HttpError(400, '后台报告使用了无效的原文片段编号。');
      return ('P' + body)
        .split(/\s*[,，;；]\s*/)
        .map((n) => `[${n}]`)
        .join(' ');
    });
  const bracketed = normalize(prose);
  const selected = new Set(
    [...bracketed.matchAll(/\[P(\d+)\]/g)].map((match) => match[1]),
  );
  // A model sometimes repeats an already selected passage as bare P12.
  // Resolve only an explicit existing selection; never infer a new source.
  const normalizeRepeated = (text: string) =>
    text.replace(
      /\[P\d+\]|(?<![\p{L}\p{N}_/])P(\d+)(?![\p{L}\p{N}_/])/gu,
      (
        marker,
        number: string | undefined,
        offset: number,
        original: string,
      ) => {
        if (number === undefined) return marker;
        if (
          !selected.has(number) ||
          /[[\-–]/.test(original[offset - 1] || '') ||
          /^[\]\-–]/.test(original.slice(offset + marker.length))
        )
          throw new HttpError(400, '后台报告请用完整的 [P编号] 标明原文片段。');
        return `[P${number}]`;
      },
    );
  const normalized = normalizeRepeated(bracketed);
  const numbers = [
    ...new Set(
      [...normalized.matchAll(/\[P(\d+)\]/g)].map((m) => Number(m[1])),
    ),
  ];
  if (
    !numbers.length ||
    numbers.length > maxCitations ||
    numbers.some((n) => !passages[n - 1])
  )
    throw new HttpError(
      400,
      `后台报告引用了不存在的原文片段，或超过 ${maxCitations} 个片段。`,
    );
  const render = (text: string) =>
    text.replace(
      /\[P(\d+)\]/g,
      (_, n: string) => `[${numbers.indexOf(Number(n)) + 1}]`,
    );
  result.summary = render(normalized);
  result.citations = numbers.map((n) => ({ ...passages[n - 1] }));
  result.data = {
    limitations: data.limitations.map((item) =>
      render(normalizeRepeated(normalize(item))),
    ),
  };
  return result;
}
