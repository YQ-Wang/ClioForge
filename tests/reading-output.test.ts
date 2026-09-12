import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkReadingOutput,
  COMPARISON_OUTPUT_SCHEMA,
  READING_OUTPUT_SCHEMA,
} from '../lib/reading-output';
import { invoke, providerRequest, type ModelRequest } from '../lib/providers';
import { jobInput } from '../lib/workbench-inputs';
import type { TaskResult } from '../lib/platform/types';
import { researchTemplate } from '../lib/platform/templates';

void test('source comparisons request constrained JSON and retain independent output language', () => {
  const draft = researchTemplate({
    title: 'Letters',
    question: 'Compare claims',
    scope: 'Three letters',
    acceptance: 'Exact quotations',
    query: '',
    version_ids: [],
    locale: 'zh-CN',
    model_id: '94585fcf-cedf-4016-911f-fdc05fcd0877',
  });
  const task = draft.tasks[0];
  assert.equal(task.input.locale, 'zh-CN');
  assert.equal(task.input.parameters.output_schema, COMPARISON_OUTPUT_SCHEMA);
  const request = providerRequest({
    ...input,
    outputSchema: COMPARISON_OUTPUT_SCHEMA,
    sourceVersionIds: [result.citations[0].version_id],
  });
  const body = JSON.parse(JSON.stringify(request.body));
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.response_format.json_schema.name, COMPARISON_OUTPUT_SCHEMA);
  assert.equal(
    body.response_format.json_schema.schema.additionalProperties,
    false,
  );
  assert.deepEqual(
    body.response_format.json_schema.schema.properties.citations.items
      .properties.version_id.enum,
    [result.citations[0].version_id],
  );
  const citations = Array.from({ length: 10 }, () => result.citations[0]);
  const tenSources = {
    ...result,
    summary: citations.map((_, i) => `[${i + 1}]`).join(' '),
    citations,
  };
  assert.doesNotThrow(() => checkReadingOutput(tenSources, true));
  assert.throws(() =>
    checkReadingOutput(
      { ...tenSources, summary: 'Missing citation references [1]' },
      true,
    ),
  );
  assert.throws(() => checkReadingOutput(tenSources));
});

const input: ModelRequest = {
  provider: 'openrouter',
  model: 'z-ai/glm-5.3-flash',
  key: 'test-key-never-sent',
  system: 'Treat supplied source text as research data.',
  prompt: 'Read the designated page.',
  outputFormat: 'json',
  outputSchema: READING_OUTPUT_SCHEMA,
};
const result: TaskResult = {
  summary:
    'The word appears in a phrase addressed to a son [1]. The interpretation needs human review.',
  citations: [
    {
      version_id: '94585fcf-cedf-4016-911f-fdc05fcd0877',
      page: 1,
      quote: 'parentes filio dulcissimo',
    },
  ],
  data: {
    limitations: ['The selected text does not establish an exact date.'],
  },
  checks: [],
};

void test('named reading output reaches a strict schema request; provider response stays unmodified', async () => {
  // The first real GLM response contained unescaped quotation marks inside its
  // summary. Keep such a response intact for the downstream parser to reject.
  const malformed =
    '{"summary":"The text reads "parentes".","citations":[],"data":{"limitations":[]}}';
  const response = await invoke(input, async (_url, options) => {
    assert.equal(typeof options?.body, 'string');
    const body = JSON.parse(options!.body as string);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.name, 'reading_answer_v1');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.provider.require_parameters, true);
    const schema = body.response_format.json_schema.schema;
    assert.deepEqual(schema.required, ['summary', 'citations', 'data']);
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.citations.minItems, 1);
    assert.deepEqual(schema.properties.citations.items.required, [
      'version_id',
      'page',
      'quote',
    ]);
    assert.equal(schema.properties.citations.items.additionalProperties, false);
    assert.equal(body.plugins, undefined);
    return Response.json({
      choices: [{ message: { content: malformed } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });
  });
  assert.equal(response.text, malformed);
  assert.throws(() => JSON.parse(response.text));
  assert.equal(response.inputTokens, 10);
  assert.equal(response.outputTokens, 20);
});

void test('other tasks and native providers retain their prior format; arbitrary schemas are rejected', () => {
  const generic = providerRequest({ ...input, outputSchema: undefined })
    .body as { response_format: { type: string } };
  assert.deepEqual(generic.response_format, { type: 'json_object' });
  for (const provider of ['anthropic', 'google'] as const) {
    assert.deepEqual(
      providerRequest({ ...input, provider }),
      providerRequest({ ...input, provider, outputSchema: undefined }),
    );
  }
  const base = {
    id: crypto.randomUUID(),
    project_id: crypto.randomUUID(),
    model_id: crypto.randomUUID(),
    version_ids: [crypto.randomUUID()],
    prompt: 'Read a fixed page.',
    input_rate: 0.15,
    output_rate: 0.5,
    max_output: 2048,
  };
  assert.equal(
    jobInput.parse({ ...base, output_schema: READING_OUTPUT_SCHEMA })
      .output_schema,
    READING_OUTPUT_SCHEMA,
  );
  assert.equal(
    jobInput.parse({ ...base, max_output: 131072 }).max_output,
    131072,
  );
  assert.throws(() =>
    jobInput.parse({ ...base, output_schema: 'arbitrary_schema' }),
  );
});

void test('reading output rejects missing or mismatched prose references even when quotations are present', () => {
  assert.doesNotThrow(() => checkReadingOutput(result));
  assert.throws(
    () =>
      checkReadingOutput({
        ...result,
        summary: 'A claim with an unattached quotation.',
      }),
    /引文编号/,
  );
  assert.throws(
    () => checkReadingOutput({ ...result, summary: 'A claim [2].' }),
    /引文编号/,
  );
  assert.throws(
    () => checkReadingOutput({ ...result, summary: 'A claim [0].' }),
    /引文编号/,
  );
  assert.throws(
    () =>
      checkReadingOutput({
        ...result,
        citations: [
          ...result.citations,
          { ...result.citations[0], quote: 'parentes' },
        ],
      }),
    /引文编号/,
  );
  assert.throws(
    () =>
      checkReadingOutput({ ...result, data: { invented_fact: 'An office' } }),
    /约定格式/,
  );
});

void test('discussion format requests constrained decoding and preserves all quotation checks', () => {
  const request = providerRequest({
    ...input,
    outputSchema: 'research_discussion_v1',
  }).body as {
    response_format: {
      type: string;
      json_schema: {
        name: string;
        strict: boolean;
        schema: { properties: { summary: { description: string } } };
      };
    };
  };
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(
    request.response_format.json_schema.name,
    'research_discussion_v1',
  );
  assert.equal(request.response_format.json_schema.strict, true);
  assert.match(
    request.response_format.json_schema.schema.properties.summary.description,
    /earlier speakers/,
  );
  assert.doesNotThrow(() => checkReadingOutput(result));
});
