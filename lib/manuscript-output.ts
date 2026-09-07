import { readingOutputJsonSchema } from './reading-output';

export const MANUSCRIPT_OUTPUT_SCHEMA = 'manuscript_section_v2';
export const legacyManuscriptOutputJsonSchema = {
  ...readingOutputJsonSchema,
  properties: {
    summary: {
      type: 'string',
      description:
        'One short status sentence. The chapter prose belongs exclusively in data.paragraphs.',
    },
    citations: {
      ...readingOutputJsonSchema.properties.citations,
      maxItems: 10,
      description:
        'Only exact quotations from dossier.evidence[].quote are eligible. Other text on supplied pages provides context but is not approved evidence for this draft.',
    },
    data: {
      type: 'object',
      properties: {
        paragraphs: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description:
                  'Chapter prose, without URLs, inline citation numbers or headings. Do not add unverified direct quotations.',
              },
              basis: {
                type: 'string',
                enum: ['evidence', 'interpretation', 'gap'],
              },
              claim_ids: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Exact selected claim UUIDs from dossier.claims; required for every non-gap paragraph.',
              },
              citations: {
                type: 'array',
                items: { type: 'integer' },
                description:
                  '1-based indices into the top-level citations array; required for every non-gap paragraph.',
              },
            },
            required: ['text', 'basis', 'claim_ids', 'citations'],
            additionalProperties: false,
          },
        },
      },
      required: ['paragraphs'],
      additionalProperties: false,
    },
  },
} as const;
export const manuscriptOutputJsonSchema = {
  ...legacyManuscriptOutputJsonSchema,
  properties: {
    ...legacyManuscriptOutputJsonSchema.properties,
    citations: {
      ...legacyManuscriptOutputJsonSchema.properties.citations,
      minItems: 0,
      maxItems: 0,
      description:
        'Return an empty array. Canwoo supplies exact citations from the approved dossier; do not write quotation objects.',
    },
    data: {
      ...legacyManuscriptOutputJsonSchema.properties.data,
      properties: {
        citation_mode: { type: 'string', enum: ['dossier'] },
        paragraphs: {
          ...legacyManuscriptOutputJsonSchema.properties.data.properties
            .paragraphs,
          items: {
            ...legacyManuscriptOutputJsonSchema.properties.data.properties
              .paragraphs.items,
            properties: {
              ...legacyManuscriptOutputJsonSchema.properties.data.properties
                .paragraphs.items.properties,
              citations: {
                type: 'array',
                items: { type: 'integer' },
                description:
                  'citation_number values from the approved dossier.evidence entries. Do not reference any other source text.',
              },
            },
          },
        },
      },
      required: ['citation_mode', 'paragraphs'],
    },
  },
} as const;
