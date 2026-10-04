export const RESEARCH_TOOL_SCHEMA = 'research_tool_v1';
export const SOURCE_SEARCH_TOOL_SCHEMA = 'source_search_tool_v1';

const sourceResultTool = (tool: string) => ({
  type: 'object',
  properties: {
    tool: { type: 'string', enum: [tool] },
    result_id: { type: 'string', minLength: 1, maxLength: 1000 },
  },
  required: ['tool', 'result_id'],
  additionalProperties: false,
});

export const sourceSearchToolJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', maxLength: 2000 },
    citations: { type: 'array', maxItems: 0, items: { type: 'string' } },
    data: {
      anyOf: [
        {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: ['search'] },
            query: { type: 'string', minLength: 2, maxLength: 500 },
            providers: {
              type: 'array',
              minItems: 1,
              maxItems: 5,
              items: {
                type: 'string',
                enum: [
                  'web',
                  'crossref',
                  'openalex',
                  'unpaywall',
                  'dpla',
                  'loc',
                  'harvard',
                  'oai',
                  'iiif',
                  'contentdm',
                  'dspace',
                ],
              },
            },
          },
          required: ['tool', 'query', 'providers'],
          additionalProperties: false,
        },
        sourceResultTool('inspect_result'),
        {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: ['triage_results'] },
            decisions: {
              type: 'array',
              minItems: 1,
              maxItems: 10,
              items: {
                type: 'object',
                properties: {
                  result_id: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 1000,
                  },
                  decision: {
                    type: 'string',
                    enum: ['shortlist', 'reject'],
                  },
                  reason: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 1000,
                  },
                  evidence: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 500,
                    description:
                      'Exact short text copied from the displayed candidate title, creator, date, institution, collection, or snippet.',
                  },
                },
                required: ['result_id', 'decision', 'reason', 'evidence'],
                additionalProperties: false,
              },
            },
          },
          required: ['tool', 'decisions'],
          additionalProperties: false,
        },
        sourceResultTool('resolve_full_text'),
        sourceResultTool('import_source'),
        {
          ...sourceResultTool('save_source_lead'),
          properties: {
            ...sourceResultTool('save_source_lead').properties,
            reason: { type: 'string', minLength: 1, maxLength: 2000 },
          },
          required: ['tool', 'result_id', 'reason'],
        },
        {
          ...sourceResultTool('reject_result'),
          properties: {
            ...sourceResultTool('reject_result').properties,
            reason: { type: 'string', minLength: 1, maxLength: 2000 },
          },
          required: ['tool', 'result_id', 'reason'],
        },
        {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: ['finish'] },
            reason: { type: 'string', minLength: 1, maxLength: 2000 },
          },
          required: ['tool', 'reason'],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ['summary', 'citations', 'data'],
  additionalProperties: false,
} as const;
export const researchToolJsonSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'One brief reason for the next operation. No historical conclusion, quotations or citation markers.',
    },
    citations: {
      type: 'array',
      maxItems: 0,
      items: { type: 'string' },
      description:
        'Always empty. This step selects an operation; it does not produce evidence.',
    },
    data: {
      anyOf: [
        {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: ['search'] },
            query: { type: 'string' },
          },
          required: ['tool', 'query'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: ['read_page'] },
            version_id: { type: 'string' },
            page: { type: 'integer' },
            start: {
              type: 'integer',
              minimum: 0,
              maximum: 100000,
              description:
                'Zero-based character offset. Use 0 for the beginning; use the previous reading.next_start to continue a long page.',
            },
          },
          required: ['tool', 'version_id', 'page', 'start'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: ['finish'] },
            reason: { type: 'string' },
          },
          required: ['tool', 'reason'],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ['summary', 'citations', 'data'],
  additionalProperties: false,
} as const;

export const RESEARCH_REPORT_SCHEMA = 'research_report_v1';
