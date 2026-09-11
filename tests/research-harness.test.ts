import test from 'node:test';
import assert from 'node:assert/strict';
import { researchHandoff } from '../lib/harness/context';
import { researchToolJsonSchema } from '../lib/harness/tool-output';
import {
  researchAction,
  validateResearchAction,
  validateResearchReport,
} from '../lib/harness/research-tools';
import { agentRecipe } from '../lib/platform/research-recipes';
import {
  resultSchema,
  taskInputSchema,
  type MissionTask,
} from '../lib/platform/types';

const version = crypto.randomUUID();
void test('source discovery can begin with a project question before sources are imported', () => {
  const draft = agentRecipe({
    method: {
      title: 'Find sources for a new project',
      kind: 'discover',
      instructions: 'Find scholarship about a bounded historical question.',
      fields: ['Source'],
    },
    pages: [],
    model_id: crypto.randomUUID(),
    input_rate: 1,
    output_rate: 2,
    locale: 'en',
    external: true,
  });
  assert.ok(draft.tasks.every((task) => task.input.page_refs === undefined));
  const searches = draft.tasks.filter(
    (task) => task.input.parameters.discovery === true,
  );
  assert.equal(searches.length, 2);
  assert.ok(searches.every((task) => task.executor === 'builtin'));
  assert.ok(searches.every((task) => task.input.parameters.external === true));
});
void test('research handoff retains late caveats and relevant citations within a bounded context', () => {
  const task = {
    id: crypto.randomUUID(),
    title: 'A disputed date',
    status: 'succeeded',
    revision: 3,
    input: taskInputSchema.parse({ query: 'Who wrote this?' }),
    result: resultSchema.parse({
      summary:
        'Background. '.repeat(400) + '\n\nAdams attribution remains uncertain.',
      citations: [
        { version_id: version, page: 1, quote: 'Background '.repeat(100) },
        {
          version_id: version,
          page: 2,
          quote: 'Adams may refer to another author.',
        },
      ],
      data: {
        limitations: ['The author is not established.'],
        next_steps: ['Check the manuscript signature.'],
      },
    }),
  } as MissionTask;
  const before = JSON.stringify(task);
  const handoff = researchHandoff(task, 'Adams');
  assert.match(handoff.summary!, /attribution remains uncertain/);
  assert.deepEqual(handoff.limitations, ['The author is not established.']);
  assert.deepEqual(handoff.next_steps, ['Check the manuscript signature.']);
  assert.equal(handoff.citations[0].page, 2);
  assert.equal(handoff.summary_shortened, true);
  assert.ok(JSON.stringify(handoff).length < 4000);
  assert.equal(
    JSON.stringify(task),
    before,
    'full stored evidence must not be rewritten',
  );
  const scoped = researchHandoff(task, 'Adams', true);
  assert.deepEqual(scoped.citations, []);
  assert.deepEqual(scoped.limitations, []);
  assert.equal(scoped.summary, null);
});
void test('tool contracts reject invented tools, fabricated decision citations and unread report excerpts', () => {
  // Strict provider schemas require every declared object property to be required.
  // Saved v1 decisions may still omit start; the decoder retains that compatibility.
  for (const action of researchToolJsonSchema.properties.data.anyOf)
    assert.deepEqual(
      [...action.required].sort(),
      Object.keys(action.properties).sort(),
    );
  assert.equal(
    researchAction.safeParse({ tool: 'fetch_url', url: 'https://example.com' })
      .success,
    false,
  );
  assert.equal(
    researchAction.safeParse({ tool: 'search', query: ' ' }).success,
    false,
  );
  assert.throws(
    () =>
      validateResearchAction(
        resultSchema.parse({
          summary: 'Read',
          citations: [{ version_id: version, page: 1, quote: 'Made up' }],
          data: { tool: 'finish', reason: 'Done' },
        }),
      ),
    /manufacture/,
  );
  const memory = {
    version: 1 as const,
    stopped: true,
    stop_reason: 'Done',
    steps: [
      {
        action: { tool: 'read_page' as const, version_id: version, page: 1 },
        outcome: 'Read',
        citations: [
          { version_id: version, page: 1, quote: 'An observed statement.' },
        ],
      },
    ],
  };
  assert.throws(
    () =>
      validateResearchReport(
        resultSchema.parse({
          summary: 'Conclusion',
          citations: [
            { version_id: version, page: 1, quote: 'Another statement.' },
          ],
        }),
        memory,
      ),
    /not returned/,
  );
  assert.throws(
    () =>
      validateResearchReport(
        resultSchema.parse({ summary: 'Conclusion', citations: [] }),
        memory,
      ),
    /must cite/,
  );
  validateResearchReport(
    resultSchema.parse({
      summary: 'Observation [1]',
      citations: [
        { version_id: version, page: 1, quote: 'observed statement' },
      ],
    }),
    memory,
  );
});
void test('phase routing changes only synthesis and preserves method editions, scope and low-effort exploration', () => {
  const explorer = crypto.randomUUID(),
    synthesizer = crypto.randomUUID();
  const draft = agentRecipe({
    method: {
      kind: 'investigate',
      title: 'Verify attribution',
      instructions: 'Read before inferring.',
      fields: ['Author'],
      version: 4,
    },
    pages: [{ version_id: version, page: 1 }],
    model_id: explorer,
    input_rate: 1,
    output_rate: 2,
    locale: 'en',
    synthesis: { model_id: synthesizer, input_rate: 3, output_rate: 7 },
  });
  assert.equal(
    draft.tasks.filter((t) => t.input.parameters.agent_stage === 'decision')
      .length,
    4,
  );
  for (const task of draft.tasks.filter(
    (t) => t.input.parameters.agent_stage === 'decision',
  )) {
    assert.equal(task.input.model_id, explorer);
    assert.equal(task.input.effort, 'low');
    assert.equal(
      (task.input.parameters.method as { version: number }).version,
      4,
    );
  }
  const report = draft.tasks.find(
    (t) => t.input.parameters.agent_stage === 'report',
  )!;
  assert.equal(report.input.model_id, synthesizer);
  assert.equal(report.input.output_rate, 7);
  assert.equal(report.input.effort, 'high');
  const human = draft.tasks.find((t) => t.executor === 'human')!;
  assert.ok(
    draft.tasks
      .find((t) => t.kind === 'publish')!
      .dependencies.includes(human.id),
  );
});

void test('numbered research passages retain source offsets and exclude unread text', async () => {
  const { researchPassages } = await import('../lib/harness/research-tools');
  const { resolveDossierCitations } = await import('../lib/dossier-output');
  const passages = researchPassages({
    version: 1,
    stopped: true,
    stop_reason: 'Complete',
    steps: [
      {
        action: { tool: 'search', query: 'petition' },
        outcome: 'One excerpt',
        citations: [
          {
            version_id: version,
            page: 3,
            start: 950,
            quote:
              'I think I will get you to join me in a petition to Congress.',
          },
        ],
      },
    ],
  });
  const result = resolveDossierCitations(
    resultSchema.parse({
      summary: 'The passage proposes an action [P1].',
      citations: [],
      data: {
        limitations: ['Only an excerpt.'],
        alternatives: ['An action may have happened elsewhere.'],
        next_steps: ['Read subsequent correspondence.'],
      },
    }),
    passages,
    'en',
    24,
  );
  assert.equal(result.citations[0].start, 950);
  assert.equal(result.citations[0].page, 3);
  assert.throws(
    () =>
      resolveDossierCitations(
        resultSchema.parse({
          summary: 'Another passage [P2].',
          citations: [],
          data: {
            limitations: [],
            alternatives: ['Other evidence'],
            next_steps: ['Read more'],
          },
        }),
        passages,
      ),
    /不存在/,
  );
});
