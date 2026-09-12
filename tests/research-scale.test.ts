import test from 'node:test';
import assert from 'node:assert/strict';
import { agentRecipe, checkExtraction } from '../lib/platform/research-recipes';
import { evaluationMetrics } from '../lib/platform/evaluation-metrics';
import {
  studyComparison,
  replayComparison,
} from '../lib/platform/study-comparison';
import { exportMethodPackage, readMethodPackage } from '../lib/method-package';
import {
  taskInputSchema,
  resultSchema,
  type MissionTask,
} from '../lib/platform/types';
const version = '11111111-1111-4111-8111-111111111111';
const method = {
  title: 'Letters',
  kind: 'extract' as const,
  instructions: 'Record only explicitly named authors.',
  fields: ['Author'],
  protocol: {
    scope: 'Letters',
    limitations: 'Does not establish identity',
    evaluation_scope: 'Synthetic fixture only',
    examples: [
      {
        text: 'A. Adams',
        interpretation: 'Preserve the initial; do not expand it.',
      },
    ],
  },
};
function task(
  value: string,
  status: MissionTask['status'] = 'accepted',
  inferred = false,
): MissionTask {
  return {
    id: crypto.randomUUID(),
    mission_id: 'mission',
    project_id: 'project',
    title: 'Extract',
    kind: 'extract',
    executor: 'model',
    assignee: '',
    status,
    input: taskInputSchema.parse({
      version_ids: [version],
      page_refs: [{ version_id: version, page: 1 }],
      parameters: { extraction: true, fields: ['Author'] },
    }),
    result: resultSchema.parse({
      summary: 'Synthetic test',
      citations: [{ version_id: version, page: 1, quote: value }],
      data: {
        records: [
          {
            label: value,
            cells: [
              {
                field: 'Author',
                value,
                status: inferred ? 'inferred' : 'explicit',
                citation: 1,
              },
            ],
          },
        ],
        coverage: 'Entire synthetic page',
        completeness: {
          status: 'complete',
          remaining_records: 0,
          reason: 'One record',
        },
      },
    }),
    error: null,
    attempt: 1,
    lease_until: null,
    claimed_by: null,
    cost_units: 0,
    revision: 1,
    created_at: '2026-09-12',
    updated_at: '2026-09-12',
  };
}
void test('extraction completeness rejects missing contracts and contradictory complete claims without discarding a declared partial result', () => {
  const result = task('Adams').result!;
  assert.doesNotThrow(() => checkExtraction(result, ['Author'], true));
  const data = result.data as {
    completeness?: {
      status: string;
      remaining_records: number | null;
      reason: string;
    };
  };
  data.completeness = {
    status: 'partial',
    remaining_records: 15,
    reason: 'Output capacity reached',
  };
  assert.doesNotThrow(() => checkExtraction(result, ['Author'], true));
  data.completeness.status = 'complete';
  assert.throws(() => checkExtraction(result, ['Author'], true));
  delete data.completeness;
  assert.throws(() => checkExtraction(result, ['Author'], true));
  assert.doesNotThrow(
    () => checkExtraction(result, ['Author']),
    'old saved results remain readable',
  );
});
void test('explicit calibration and held-out selection stay disjoint and retain every fixed page', () => {
  const options = {
    method,
    pages: [1, 2, 3, 4, 5].map((page) => ({ version_id: version, page })),
    model_id: crypto.randomUUID(),
    input_rate: 1,
    output_rate: 1,
    locale: 'en' as const,
    calibration_page: 3,
    validation_page: 1,
  };
  const plan = agentRecipe(options),
    extracts = plan.tasks.filter((t) => t.input.parameters.extraction);
  assert.equal(
    extracts.find((t) => t.input.parameters.phase === 'sample')!.input
      .page_refs![0].page,
    4,
  );
  assert.equal(
    extracts.find((t) => t.input.parameters.phase === 'validation')!.input
      .page_refs![0].page,
    2,
  );
  assert.deepEqual(
    extracts.map((t) => t.input.page_refs![0].page).sort((a, b) => a - b),
    [1, 2, 3, 4, 5],
  );
  assert.ok(
    extracts.every((t) => t.input.parameters.completeness_contract === 1),
  );
  assert.throws(() => agentRecipe({ ...options, validation_page: 3 }));
  assert.throws(() => agentRecipe({ ...options, calibration_page: 9 }));
});
void test('comparison preserves aliases, excludes stale work, identifies repeated evidence and exposes uncertainty sensitivity', () => {
  const a = task('Adam'),
    b = task('Adams'),
    duplicate = task('Adam'),
    c = task('A. Adams', 'accepted', true),
    d = task('Invented', 'stale'),
    e = task('Unreviewed', 'review');
  const tasks = [a, b, duplicate, c, d, e];
  const before = JSON.stringify(tasks);
  const report = studyComparison(tasks, { field: 'Author' });
  assert.equal(report.included, 2);
  assert.deepEqual(
    report.groups.map((g) => g.value),
    ['Adam', 'Adams'],
  );
  assert.deepEqual(report.excluded, {
    unreviewed: 1,
    stale: 1,
    missing: 0,
    inferred: 1,
    duplicate: 1,
    dependent: 0,
    undated: 0,
    outside_dates: 0,
  });
  assert.equal(
    studyComparison(tasks, { field: 'Author', include_inferred: true })
      .included,
    3,
  );
  assert.equal(
    studyComparison(tasks, { field: 'Author', deduplicate: false }).included,
    3,
  );
  assert.equal(JSON.stringify(tasks), before);
  assert.ok(report.groups.every((g) => g.references[0].version_id === version));
  assert.deepEqual(
    replayComparison(JSON.parse(JSON.stringify(report))).groups,
    report.groups,
  );
  assert.throws(() => replayComparison({ ...report, version: 2 }));
});
void test('full timing never turns missing measurements or zero minutes into an invented speedup', () => {
  const value = {
    records: 10,
    false_inclusions: 2,
    missed: 2,
    review_minutes: 10,
    manual_minutes: 60,
    scope_checked: 'whole' as const,
  };
  assert.equal(evaluationMetrics(value).human_minutes, null);
  assert.equal(evaluationMetrics(value).precision, 0.8);
  assert.equal(evaluationMetrics(value).recall, 0.8);
  const timing = {
    preparation_minutes: 5,
    configuration_minutes: 5,
    analysis_minutes: 5,
    writing_minutes: 5,
    waiting_minutes: 40,
  };
  const measured = evaluationMetrics({ ...value, timing, chatgpt_minutes: 45 });
  assert.equal(measured.human_minutes, 30);
  assert.equal(measured.manual_speedup, 2);
  assert.equal(measured.chatgpt_speedup, 1.5);
  assert.equal(measured.waiting_minutes, 40);
  assert.equal(
    evaluationMetrics({ ...value, scope_checked: 'partial' }).recall,
    null,
  );
  assert.equal(
    evaluationMetrics({
      ...value,
      timing: { ...timing, preparation_minutes: null },
    }).manual_speedup,
    null,
  );
  assert.equal(
    evaluationMetrics({ ...value, records: 0, false_inclusions: 0, missed: 0 })
      .recall,
    null,
  );
});
void test('portable methods retain approved examples and limits, strip runtime fields, reject unknown package formats and preserve the input', () => {
  const original = {
    ...method,
    parent_id: crypto.randomUUID(),
    version: 3,
    key: 'must-not-export',
    model_id: 'private-connection',
  };
  const packet = exportMethodPackage(original);
  const imported = readMethodPackage(JSON.stringify(packet));
  assert.deepEqual(imported.protocol, method.protocol);
  assert.equal(imported.version, 3);
  assert.ok(!JSON.stringify(packet).includes('must-not-export'));
  assert.ok(!JSON.stringify(packet).includes('private-connection'));
  assert.equal(imported.parent_id, undefined);
  assert.ok(original.parent_id);
  assert.throws(() =>
    readMethodPackage(JSON.stringify({ ...packet, version: 2 })),
  );
  assert.throws(() =>
    readMethodPackage(
      JSON.stringify({ ...packet, execute: 'run immediately' }),
    ),
  );
});
void test('date ranges and researcher-declared source families make sensitivity choices explicit and replayable', () => {
  const a = task('Adams'),
    b = task('Adams');
  const second = '22222222-2222-4222-8222-222222222222';
  b.result!.citations[0].version_id = second;
  const sources = { [version]: 'Shared exemplar', [second]: 'Shared exemplar' };
  const family = studyComparison([a, b], {
    field: 'Author',
    source_groups: sources,
    one_per_group: true,
  });
  assert.equal(family.included, 1);
  assert.equal(family.excluded.dependent, 1);
  assert.deepEqual(replayComparison(family).groups, family.groups);
  const data = a.result!.data as { records: { cells: unknown[] }[] };
  data.records[0].cells.push({
    field: 'Date',
    value: '1757/1759',
    status: 'explicit',
    citation: 1,
  });
  const overlap = studyComparison([a], {
    field: 'Author',
    date_field: 'Date',
    year_from: 1758,
    year_to: 1758,
  });
  assert.equal(overlap.included, 1);
  assert.equal(
    studyComparison([a], {
      field: 'Author',
      date_field: 'Date',
      year_from: 1760,
    }).excluded.outside_dates,
    1,
  );
  const missing = studyComparison([b], {
    field: 'Author',
    date_field: 'Date',
    year_from: 1758,
  });
  assert.equal(missing.excluded.undated, 1);
  assert.equal(
    studyComparison([b], {
      field: 'Author',
      date_field: 'Date',
      year_from: 1758,
      include_undated: true,
    }).included,
    1,
  );
  assert.throws(() =>
    studyComparison([a], { field: 'Author', year_from: 1800, year_to: 1700 }),
  );
});
