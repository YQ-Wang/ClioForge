import test from 'node:test';
import assert from 'node:assert/strict';
import { replayTrace, type AgentTrace } from '../lib/harness/trace';
import { researchMemory } from '../lib/harness/research-tools';
import { taskInputSchema, resultSchema } from '../lib/platform/types';
import { sha256 } from '../lib/platform/search';

function recording(): AgentTrace['data'] {
  const version = crypto.randomUUID(),
    pageText = 'Account. '.repeat(1000) + 'A late qualification.';
  const tasks: AgentTrace['data']['tasks'] = [],
    edges: AgentTrace['data']['edges'] = [];
  let previous: string | undefined;
  const steps: ReturnType<typeof researchMemory.parse>['steps'] = [];
  for (const start of [0, 8000]) {
    const action = {
      tool: 'read_page' as const,
      version_id: version,
      page: 1,
      start,
    };
    const decision = crypto.randomUUID(),
      tool = crypto.randomUUID();
    const input = taskInputSchema.parse({
      version_ids: [version],
      page_refs: [{ version_id: version, page: 1 }],
    });
    const base = {
      title: 'Read testimony',
      attempt: 1,
      cost_units: 0,
      status: 'succeeded',
      created_at: '2026-09-07T00:00:00Z',
    };
    tasks.push({
      ...base,
      id: decision,
      executor: 'model',
      input: { ...input, parameters: { agent_stage: 'decision' } },
      result: resultSchema.parse({ summary: 'Read', data: action }),
    });
    const end = Math.min(start + 8000, pageText.length);
    steps.push({
      action,
      citations: [
        {
          version_id: version,
          page: 1,
          quote: pageText.slice(start, end),
          start,
        },
      ],
      outcome: 'Read',
      reading: {
        start,
        end,
        total: pageText.length,
        next_start: end < pageText.length ? end : null,
      },
    });
    tasks.push({
      ...base,
      id: tool,
      executor: 'builtin',
      input: {
        ...input,
        parameters: { agent_stage: 'tool', agent_last: start === 8000 },
      },
      result: resultSchema.parse({
        summary: 'Read',
        citations: steps.flatMap((s) => s.citations),
        data: structuredClone({
          version: 1,
          stopped: start === 8000,
          stop_reason: start === 8000 ? 'Allowance reached' : '',
          steps,
        }),
      }),
    });
    edges.push({ task_id: tool, depends_on: decision });
    if (previous)
      edges.push(
        { task_id: decision, depends_on: previous },
        { task_id: tool, depends_on: previous },
      );
    previous = tool;
  }
  return {
    format: 'canwoo-agent-trace',
    version: 1,
    mission: {
      id: crypto.randomUUID(),
      project_id: crypto.randomUUID(),
      title: 'Late evidence',
      question: 'What qualifies the account?',
      status: 'active',
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      executor: t.executor,
      status: t.status,
      attempt: t.attempt,
      created_at: t.created_at,
      cost_units: t.cost_units,
      input: t.input,
      result: t.result,
    })),
    edges,
    jobs: [],
    pages: [{ version_id: version, page: 1, text: pageText }],
  };
}
async function check(data: AgentTrace['data']) {
  return replayTrace({ data, sha256: await sha256(JSON.stringify(data)) });
}
void test('replay accepts contiguous long-page reading and legacy reads without coverage metadata', async () => {
  const data = recording();
  assert.deepEqual((await check(data)).failures, []);
  const tool = data.tasks[1];
  const memory = researchMemory.parse(tool.result!.data);
  delete memory.steps[0].reading;
  tool.result!.data = memory;
  const next = researchMemory.parse(data.tasks[3].result!.data);
  delete next.steps[0].reading;
  data.tasks[3].result!.data = next;
  assert.deepEqual((await check(data)).failures, []);
});
void test('replay detects a tool result that does not follow its saved decision even with a fresh checksum', async () => {
  const data = recording();
  data.tasks[2].result!.data = { tool: 'finish', reason: 'Stop here' };
  assert.ok((await check(data)).failures.some((f) => f.includes('contract')));
  const disconnected = recording();
  disconnected.edges = disconnected.edges.filter(
    (e) => e.task_id !== disconnected.tasks[2].id,
  );
  assert.ok(
    (await check(disconnected)).failures.some((f) => f.includes('contract')),
  );
});
void test('replay rejects rewritten earlier tool records and false reading coverage', async () => {
  const data = recording();
  const memory = researchMemory.parse(data.tasks[3].result!.data);
  memory.steps[0].outcome = 'This earlier action never happened';
  data.tasks[3].result!.data = memory;
  assert.ok((await check(data)).failures.length > 0);
  const coverage = recording();
  const changed = researchMemory.parse(coverage.tasks[3].result!.data);
  changed.steps[1].reading!.start = 0;
  coverage.tasks[3].result!.data = changed;
  assert.ok((await check(coverage)).failures.length > 0);
});
void test('replay rejects hidden ledger quotations absent from the task citation list', async () => {
  const data = recording();
  const memory = researchMemory.parse(data.tasks[3].result!.data);
  memory.steps[1].citations[0].quote = 'Invented evidence';
  data.tasks[3].result!.data = memory;
  assert.ok((await check(data)).failures.length > 0);
});
void test('replay rejects graph cycles, duplicate edges and ambiguous page identities', async () => {
  const cycle = recording();
  cycle.edges.push({
    task_id: cycle.tasks[0].id,
    depends_on: cycle.tasks[3].id,
  });
  assert.ok((await check(cycle)).failures.some((f) => f.includes('cycle')));
  const duplicate = recording();
  duplicate.edges.push(duplicate.edges[0]);
  assert.ok(
    (await check(duplicate)).failures.some((f) => f.includes('duplicate')),
  );
  const pages = recording();
  pages.pages.push({ ...pages.pages[0], text: 'Conflicting transcription' });
  assert.ok(
    (await check(pages)).failures.some((f) => f.includes('duplicate source')),
  );
});
