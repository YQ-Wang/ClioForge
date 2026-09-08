export const RESEARCH_TOOL_SCHEMA = 'research_tool_v1';
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
