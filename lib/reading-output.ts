import { z } from 'zod';
import { HttpError } from './errors';
import { citationSchema, type TaskResult } from './platform/types';

export const READING_OUTPUT_SCHEMA = 'reading_answer_v1';
export const COMPARISON_OUTPUT_SCHEMA = 'comparison_answer_v1';
export const DISCUSSION_OUTPUT_SCHEMA = 'research_discussion_v1';
// Reading answers and bounded discussions request constrained decoding.
// Other research methods retain their domain-specific data shapes.
export const readingOutputJsonSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'At most three concise points answering only the selected annotation. Attach [1], [2] citation numbers to supported observations. Put exact source quotations only in citations, not inside this prose.',
    },
    citations: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          version_id: {
            type: 'string',
            description: 'The supplied fixed source version ID.',
          },
          page: {
            type: 'integer',
            description: 'The supplied source page number.',
          },
          quote: {
            type: 'string',
            description:
              'A short verbatim span from that source page, preserving case, punctuation and spaces.',
          },
        },
        required: ['version_id', 'page', 'quote'],
        additionalProperties: false,
      },
    },
    data: {
      type: 'object',
      properties: {
        limitations: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string' },
          description:
            'What the supplied page cannot establish; do not introduce new historical claims.',
        },
      },
      required: ['limitations'],
      additionalProperties: false,
    },
  },
  required: ['summary', 'citations', 'data'],
  additionalProperties: false,
} as const;

export const discussionOutputJsonSchema = {
  ...readingOutputJsonSchema,
  properties: {
    ...readingOutputJsonSchema.properties,
    summary: {
      type: 'string',
      description:
        'A concise response to the researcher and earlier speakers. Preserve disagreements and uncertainty. Attach [1], [2] matching the citations array to historical observations; another assistant is not a source.',
    },
  },
} as const;

export const comparisonOutputJsonSchema = {
  ...discussionOutputJsonSchema,
  properties: {
    ...discussionOutputJsonSchema.properties,
    summary: {
      type: 'string',
      description:
        'A concise source comparison with numbered citations. Distinguish text, interpretation, alternative explanations and next research checks. Include at least one citation from each source used.',
    },
    citations: {
      ...readingOutputJsonSchema.properties.citations,
      maxItems: 12,
    },
  },
} as const;

const answer = z.object({
  summary: z.string().trim().min(1).max(4000),
  citations: z.array(citationSchema).min(1).max(6),
  data: z
    .object({ limitations: z.array(z.string().trim().min(1).max(1000)).max(3) })
    .strict(),
});

export function checkReadingOutput(result: TaskResult, comparison = false) {
  const schema = comparison
    ? answer.extend({
        summary: z.string().trim().min(1).max(6000),
        citations: z.array(citationSchema).min(1).max(12),
      })
    : answer;
  if (!schema.safeParse(result).success)
    throw new HttpError(
      400,
      '阅读回答未符合约定格式，请检查原始返回后再决定是否重试。',
    );
  const indices = [...result.summary.matchAll(/\[(\d+)\]/g)].map((match) =>
    Number(match[1]),
  );
  if (
    !indices.length ||
    indices.some((index) => !result.citations[index - 1]) ||
    result.citations.some((_, index) => !indices.includes(index + 1))
  )
    throw new HttpError(
      400,
      '阅读回答的引文编号缺失或与原文列表不一致，请先核查。',
    );
}
