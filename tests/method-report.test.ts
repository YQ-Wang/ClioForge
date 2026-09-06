import test from 'node:test';
import assert from 'node:assert/strict';
import {
  methodReport,
  methodReportMarkdown,
  followupReviewDraft,
} from '../lib/platform/method-report';
import {
  taskInputSchema,
  type MissionTask,
  type MissionView,
} from '../lib/platform/types';
import type { Evaluation } from '../lib/platform/evaluation';
const version = '11111111-1111-4111-8111-111111111111';
function task(
  id: string,
  page: number,
  status: MissionTask['status'] = 'review',
): MissionTask {
  return {
    id,
    mission_id: 'mission',
    project_id: 'project',
    title: 'Read page',
    kind: 'extract',
    executor: 'model',
    assignee: '',
    status,
    input: taskInputSchema.parse({
      version_ids: [version],
      page_refs: [{ version_id: version, page }],
      parameters: { extraction: true },
    }),
    result: {
      summary: 'An observation',
      citations: [],
      checks: [],
      data: { records: [], coverage: 'Read the page' },
    },
    error: null,
    attempt: 1,
    lease_until: null,
    claimed_by: null,
    cost_units: 0,
    revision: 3,
    created_at: '2026-09-05',
    updated_at: '2026-09-05',
  };
}
function evaluation(
  id: string,
  taskId: string,
  overrides: Partial<Evaluation['metrics']> = {},
  current = 1,
): Evaluation {
  return {
    id,
    current,
    config: {
      task_id: taskId,
      revision: 2,
      phase: 'validation',
      result_hash: 'hash',
    },
    metrics: {
      expected: 2,
      missed: 0,
      false_inclusions: 0,
      wrong_values: 0,
      wrong_categories: 0,
      review_minutes: 2,
      manual_minutes: null,
      notes: 'Inspect against original',
      records: 0,
      fields: 0,
      ...overrides,
    },
    created_by: 'reviewer',
    created_at: id,
  };
}
function view(
  tasks: MissionTask[],
  evaluations: Evaluation[] = [],
): MissionView {
  return {
    mission: {
      id: 'mission',
      project_id: 'project',
      title: 'Source study',
      question: 'Which records?',
      scope: 'fixed pages',
      acceptance: 'human review',
      status: 'active',
      created_by: 'owner',
      revision: 1,
      created_at: '2026',
      updated_at: '2026',
    },
    tasks,
    evaluations,
    edges: [],
    events: [],
    artifacts: [],
    role: 'owner',
  };
}
void test('unreviewed and obsolete pages never become error-free evaluated pages', () => {
  const v = view(
    [task('a', 1), task('b', 2, 'stale'), task('c', 3)],
    [
      evaluation('2026-09-05', 'a', { missed: 1 }),
      evaluation('2026-09-06', 'b', { missed: 10 }),
      evaluation('2026-09-07', 'c', { missed: 20 }, 0),
    ],
  );
  const r = methodReport(v);
  assert.equal(r.planned, 3);
  assert.equal(r.pages.length, 1);
  assert.equal(r.unreviewed, 2);
  assert.equal(r.totals.missed, 1);
  assert.equal(r.comparison, null);
  assert.match(
    methodReportMarkdown(v, r, 'en', () => 'LED inscription'),
    /No paired manual-time comparison/,
  );
});
void test('only newest applicable evaluation per fixed page counts, independent of API ordering', () => {
  const v = view(
    [task('a', 1), task('b', 1)],
    [
      evaluation('2026-09-07', 'a', { missed: 3 }),
      evaluation('2026-09-05', 'a', { missed: 9 }),
      evaluation('2026-09-06', 'b', { missed: 7 }),
    ],
  );
  const r = methodReport(v);
  assert.equal(r.planned, 1);
  assert.equal(r.pages.length, 1);
  assert.equal(r.totals.missed, 3);
  assert.equal(r.pages[0].evaluation.id, '2026-09-07');
});
void test('time comparison pairs the same reviewed pages and retains slower outcomes', () => {
  const v = view(
    [task('a', 1), task('b', 2), task('c', 3)],
    [
      evaluation('2026-09-05', 'a', { review_minutes: 12, manual_minutes: 5 }),
      evaluation('2026-09-06', 'b', { review_minutes: 50 }),
      evaluation('2026-09-07', 'c', { review_minutes: 7, manual_minutes: 0 }),
    ],
  );
  const r = methodReport(v);
  assert.deepEqual(r.comparison, {
    pages: 1,
    manual_minutes: 5,
    review_minutes: 12,
  });
  assert.equal(r.totals.review_minutes, 69);
  const markdown = methodReportMarkdown(v, r, 'en', () => 'LED inscription');
  assert.match(markdown, /review 12.0 min; manual 5.0 min/);
  assert.match(markdown, new RegExp(`version=${version}&page=1`));
  assert.match(markdown, /not end-to-end acceleration/);
});
void test('follow-up review sends only selected fixed pages and keeps human gates', () => {
  const page = { version_id: version, page: 2 };
  const draft = followupReviewDraft({
    view: view(
      [task('a', 1), task('b', 2)],
      [
        evaluation('e1', 'a'),
        evaluation('e2', 'b', { notes: 'Human annotation may be wrong.' }),
      ],
    ),
    taskIds: ['b'],
    instructions: 'Check the classification',
    modelId: version,
    inputRate: 0.15,
    outputRate: 0.5,
    locale: 'en',
  });
  assert.equal(draft.question, 'Check the classification');
  assert.ok(draft.tasks.some((t) => t.executor === 'human'));
  const modelTasks = draft.tasks.filter((t) => t.executor === 'model');
  assert.ok(modelTasks.length > 0);
  for (const t of modelTasks) assert.deepEqual(t.input.page_refs, [page]);
  assert.ok(
    modelTasks.some((t) =>
      JSON.stringify(t.input).includes('Human annotation may be wrong.'),
    ),
  );
});

void test('follow-up refuses obsolete selections and oversized observations without truncating', () => {
  const options = {
    view: view([task('a', 1)], [evaluation('e1', 'a', {}, 0)]),
    taskIds: ['a'],
    instructions: 'Check',
    modelId: version,
    inputRate: 0.15,
    outputRate: 0.5,
    locale: 'en' as const,
  };
  assert.throws(() => followupReviewDraft(options), /currently applicable/);
  options.view = view(
    [task('a', 1)],
    [evaluation('e1', 'a', { notes: 'x'.repeat(6000) })],
  );
  assert.throws(() => followupReviewDraft(options), /6,000/);
});
