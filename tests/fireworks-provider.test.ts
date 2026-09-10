import test from 'node:test';
import assert from 'node:assert/strict';
import { modelInput } from '../lib/inputs';
import { invoke, providerRequest } from '../lib/providers';

const base = {
  provider: 'fireworks' as const,
  model: 'accounts/fireworks/models/kimi-k3',
  key: 'synthetic-fireworks-key',
  system: 'Research',
  prompt: 'Read the selected sources',
};

void test('Fireworks is a valid encrypted model connection provider', () => {
  assert.equal(
    modelInput.parse({
      label: 'Kimi K3',
      provider: 'fireworks',
      model_id: base.model,
      key: base.key,
      vision: true,
    }).provider,
    'fireworks',
  );
});

void test('Fireworks requests use the fixed endpoint and Kimi reasoning effort', () => {
  const request = providerRequest({
    ...base,
    image: 'data:image/png;base64,YQ==',
    taskKind: 'compare',
    effort: 'max',
  });
  assert.equal(
    request.url,
    'https://api.fireworks.ai/inference/v1/chat/completions',
  );
  assert.deepEqual(request.headers, {
    Authorization: `Bearer ${base.key}`,
    'Content-Type': 'application/json',
  });
  assert.deepEqual(request.body, {
    model: base.model,
    reasoning_effort: 'max',
    messages: [
      { role: 'system', content: base.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: base.prompt },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,YQ==' },
          },
        ],
      },
    ],
    max_tokens: 4096,
  });
});

void test('Kimi K3 maps task defaults and honors a selected effort', () => {
  for (const [taskKind, expected] of [
    ['extract', 'low'],
    ['compare', 'high'],
    ['synthesis', 'max'],
  ] as const) {
    const body = providerRequest({ ...base, taskKind }).body as {
      reasoning_effort: string;
    };
    assert.equal(body.reasoning_effort, expected);
  }
  const selected = providerRequest({
    ...base,
    taskKind: 'extract',
    effort: 'max',
  }).body as { reasoning_effort: string };
  assert.equal(selected.reasoning_effort, 'max');
});

void test('Fireworks preserves structured output and usage semantics', async () => {
  const request = providerRequest({
    ...base,
    effort: 'high',
    outputFormat: 'json',
    outputSchema: 'manuscript_section_v1',
  });
  const body = request.body as {
    response_format: {
      type: string;
      json_schema: { name: string; strict: boolean };
    };
  };
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.name, 'manuscript_section_v1');
  assert.equal(body.response_format.json_schema.strict, true);
  const result = await invoke(base, async () =>
    Response.json({
      choices: [
        { message: { content: 'Partial result' }, finish_reason: 'length' },
      ],
      usage: { prompt_tokens: 7, completion_tokens: 2 },
    }),
  );
  assert.deepEqual(result, {
    text: 'Partial result',
    inputTokens: 7,
    outputTokens: 2,
    truncated: true,
  });
});
