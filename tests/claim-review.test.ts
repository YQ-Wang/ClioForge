import test from 'node:test';
import assert from 'node:assert/strict';
import { checkClaimReview } from '../lib/claim-review';
import { agentRecipe } from '../lib/platform/research-recipes';
void test('claim reviews anchor exact draft spans and distinguish missing support from cited interpretations', () => {
  const draft = 'This policy was implemented everywhere.',
    result = {
      summary: 'Scope exceeds the evidence.',
      citations: [],
      checks: [],
      data: {
        findings: [
          {
            claim: draft,
            support: 'insufficient',
            assessment: 'Only a declaration is available.',
            alternative: 'Implementation varied.',
            next_step: 'Find local implementation records.',
            citations: [],
          },
        ],
        coverage: 'One sentence.',
      },
    };
  assert.equal(
    checkClaimReview(result, draft).findings[0].support,
    'insufficient',
  );
  assert.throws(() => checkClaimReview(result, 'A different argument.'));
  result.data.findings[0].support = 'direct';
  assert.throws(() => checkClaimReview(result, draft));
  const recipe = agentRecipe({
    method: {
      title: 'Review',
      kind: 'audit',
      instructions: 'Check each assertion',
      fields: ['claim'],
    },
    pages: [{ version_id: crypto.randomUUID(), page: 1 }],
    model_id: crypto.randomUUID(),
    input_rate: 1,
    output_rate: 1,
    locale: 'en',
    comparisonText: draft,
  });
  assert.equal(
    recipe.tasks[0].input.parameters.output_schema,
    'claim_review_v1',
  );
  assert.equal(recipe.tasks[0].input.parameters.draft_text, draft);
  assert.ok(recipe.tasks.some((t) => t.executor === 'human'));
  assert.equal(recipe.tasks.at(-1)?.kind, 'publish');
});

import { invoke, ProviderError } from '../lib/providers';
void test('interrupted model response bodies report timeout without leaking vendor payload or repeating a request', async () => {
  let calls = 0;
  await assert.rejects(
    invoke(
      {
        provider: 'openrouter',
        model: 'z-ai/glm-5.3-flash',
        key: 'fixture',
        system: 'Research',
        prompt: 'Public source',
      },
      async () => {
        calls++;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(
                new DOMException('private vendor payload', 'AbortError'),
              );
            },
          }),
        );
      },
    ),
    (error) =>
      error instanceof ProviderError &&
      error.code === 'response_timeout' &&
      !error.message.includes('private vendor'),
  );
  assert.equal(calls, 1);
});
