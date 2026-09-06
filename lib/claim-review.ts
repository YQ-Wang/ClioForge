import { z } from 'zod';
import { HttpError } from './errors';
import { readingOutputJsonSchema } from './reading-output';
import type { TaskResult } from './platform/types';
export const CLAIM_REVIEW_SCHEMA = 'claim_review_v1';
export const claimReviewData = z
  .object({
    findings: z
      .array(
        z
          .object({
            claim: z.string().min(1).max(2000),
            support: z.enum([
              'direct',
              'inference',
              'insufficient',
              'contradicted',
            ]),
            assessment: z.string().min(1).max(2000),
            alternative: z.string().max(1500),
            next_step: z.string().max(1500),
            citations: z.array(z.number().int().positive()).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    coverage: z.string().min(1).max(2000),
  })
  .strict();
export const claimReviewJsonSchema = {
  ...readingOutputJsonSchema,
  properties: {
    summary: {
      type: 'string',
      description:
        'Concise overview of the draft review; these are model suggestions awaiting researcher assessment.',
    },
    citations: {
      ...readingOutputJsonSchema.properties.citations,
      minItems: 0,
      maxItems: 30,
    },
    data: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              claim: {
                type: 'string',
                description:
                  'An exact unchanged span of the supplied draft, never a newly invented assertion.',
              },
              support: {
                type: 'string',
                enum: ['direct', 'inference', 'insufficient', 'contradicted'],
              },
              assessment: { type: 'string' },
              alternative: { type: 'string' },
              next_step: {
                type: 'string',
                description:
                  'Specify the kind of additional evidence that would discriminate competing interpretations.',
              },
              citations: { type: 'array', items: { type: 'integer' } },
            },
            required: [
              'claim',
              'support',
              'assessment',
              'alternative',
              'next_step',
              'citations',
            ],
            additionalProperties: false,
          },
        },
        coverage: {
          type: 'string',
          description:
            'What was reviewed and omitted; whether the 20-claim limit was reached. Search failure does not establish historical absence.',
        },
      },
      required: ['findings', 'coverage'],
      additionalProperties: false,
    },
  },
} as const;
export function checkClaimReview(result: TaskResult, draft: string) {
  const parsed = claimReviewData.safeParse(result.data);
  if (!parsed.success)
    throw new HttpError(
      400,
      '逐条核查结果格式无效，请检查返回后再决定是否重试。',
    );
  const seen = new Set<string>();
  for (const row of parsed.data.findings) {
    if (!draft.includes(row.claim) || seen.has(row.claim))
      throw new HttpError(400, '核查内容必须对应文稿中的不同原句。');
    seen.add(row.claim);
    if (
      row.citations.some((n) => !result.citations[n - 1]) ||
      (row.support !== 'insufficient' && !row.citations.length)
    )
      throw new HttpError(400, '有关支持、推断或反证的意见必须指向实际引文。');
  }
  return parsed.data;
}
