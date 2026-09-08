import { z } from 'zod';
import { thinkingEffort } from './model-routing';
const id = z.uuid(),
  short = z.string().trim().min(1).max(2000),
  text = z.string().max(10000),
  optional = z.string().max(2000).optional();
export const regionInput = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((r) => r.x + r.width <= 1.001 && r.y + r.height <= 1.001);
export const cslInput = z.looseObject({
  id: z.union([z.string().max(300), z.number()]).optional(),
  type: z
    .enum([
      'book',
      'chapter',
      'article-journal',
      'article-newspaper',
      'manuscript',
      'letter',
      'webpage',
      'report',
      'document',
      'thesis',
      // Standard CSL types used by Zotero and other bibliography exporters.
      // Keep legacy `letter` readable; exports normalize it to CSL below.
      'personal_communication',
      'article',
      'article-magazine',
      'bill',
      'broadcast',
      'classic',
      'collection',
      'dataset',
      'entry',
      'entry-dictionary',
      'entry-encyclopedia',
      'event',
      'figure',
      'graphic',
      'hearing',
      'interview',
      'legal_case',
      'legislation',
      'map',
      'motion_picture',
      'musical_score',
      'pamphlet',
      'paper-conference',
      'patent',
      'performance',
      'periodical',
      'post',
      'post-weblog',
      'regulation',
      'review',
      'review-book',
      'software',
      'song',
      'speech',
      'standard',
      'treaty',
    ])
    .default('manuscript'),
  title: z.string().trim().min(1).max(1000),
  author: z
    .array(
      z.looseObject({ literal: optional, family: optional, given: optional }),
    )
    .max(100)
    .optional(),
  issued: z
    .object({
      raw: optional,
      literal: optional,
      circa: z.union([z.number(), z.boolean()]).optional(),
      'date-parts': z
        .array(z.array(z.number().int()).min(1).max(3))
        .max(2)
        .optional(),
    })
    .optional(),
  archive: optional,
  archive_location: optional,
  'archive-place': optional,
  publisher: optional,
  'publisher-place': optional,
  'container-title': optional,
  edition: optional,
  volume: optional,
  issue: optional,
  page: optional,
  URL: z
    .union([z.literal(''), z.url().refine((v) => /^https?:\/\//.test(v))])
    .optional(),
  DOI: optional,
  language: optional,
  rights: optional,
  abstract: text.optional(),
});
export const workbenchInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('bibliography'),
    project_id: id,
    id: id.optional(),
    source_id: id.nullable().default(null),
    expected: z.number().int().positive().optional(),
    csl: cslInput,
  }),
  z.object({
    action: z.literal('import_bibliography'),
    project_id: id,
    entries: z.array(cslInput).min(1).max(100),
  }),
  z.object({
    action: z.literal('question'),
    project_id: id,
    id: id.optional(),
    expected: z.number().int().positive().optional(),
    title: short,
    detail: text,
  }),
  z.object({
    action: z.literal('claim'),
    project_id: id,
    id: id.optional(),
    expected: z.number().int().positive().optional(),
    question_id: id,
    body: short,
    kind: z.enum(['claim', 'alternative', 'next_step']),
    status: z.enum(['draft', 'reviewed']),
  }),
  z.object({
    action: z.literal('link_evidence'),
    project_id: id,
    claim_id: id,
    evidence_id: id,
    relation: z.enum(['supports', 'challenges', 'context']),
  }),
  z.object({
    action: z.literal('unlink_evidence'),
    project_id: id,
    claim_id: id,
    evidence_id: id,
    expected: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('source_relation'),
    project_id: id,
    from_source: id,
    to_source: id,
    kind: z.enum(['quotes', 'reprint', 'translation', 'shared_origin']),
    certainty: z.enum(['suspected', 'confirmed']),
    basis: short,
  }),
  z.object({
    action: z.literal('search_log'),
    project_id: id,
    query: short,
    scope: short,
    searched_at: z.iso.datetime(),
    outcome: z.enum(['found', 'no_hits', 'unavailable', 'partial']),
    result_count: z.number().int().min(0).max(10000000).nullable(),
    notes: text,
  }),
  z.object({
    action: z.literal('review_evidence'),
    project_id: id,
    evidence_id: id,
    version_id: id,
  }),
  z.object({
    action: z.literal('budget'),
    project_id: id,
    limit_units: z.number().int().min(0).max(1_000_000_000),
  }),
  z.object({
    action: z.literal('inbox'),
    project_id: id,
    id,
    status: z.enum(['pending', 'accepted', 'dismissed']),
  }),
  z.object({
    action: z.literal('watch'),
    project_id: id,
    query: z.string().trim().min(1).max(300),
    interval_days: z.union([z.literal(1), z.literal(7)]),
  }),
  z.object({
    action: z.literal('toggle_watch'),
    project_id: id,
    id,
    enabled: z.boolean(),
  }),
]);
export const jobInput = z.object({
  context_mode: z.literal('catalog').optional(),
  page_refs: z
    .array(
      z.object({ version_id: z.uuid(), page: z.number().int().positive() }),
    )
    .min(1)
    .max(100)
    .optional(),
  output_format: z.literal('json').optional(),
  output_schema: z
    .enum([
      'research_report_v1',
      'research_tool_v1',
      'dossier_answer_v1',
      'comparison_answer_v1',
      'reading_answer_v1',
      'research_discussion_v1',
      'claim_review_v1',
      'manuscript_section_v1',
      'manuscript_section_v2',
    ])
    .optional(),
  effort: thinkingEffort.optional(),
  task_kind: z.string().max(30).optional(),
  locale: z.enum(['zh-CN', 'en']).optional(),
  id,
  project_id: id,
  model_id: id,
  version_ids: z.array(id).min(1).max(10),
  prompt: z.string().trim().min(1).max(4000),
  input_rate: z.number().positive().max(10000),
  output_rate: z.number().positive().max(10000),
  max_output: z.number().int().min(128).max(4096),
});
export type WorkbenchInput = z.infer<typeof workbenchInput>;
