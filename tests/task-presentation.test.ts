import test from 'node:test';
import assert from 'node:assert/strict';
import { taskColumn } from '../lib/task-presentation';
void test('boards separate execution, pending human review and failed or stale work', () => {
  const mission = { status: 'active' as const };
  assert.equal(
    taskColumn({ status: 'ready', executor: 'human' }, mission),
    'review',
  );
  assert.equal(
    taskColumn({ status: 'ready', executor: 'model' }, mission),
    'planned',
  );
  assert.equal(
    taskColumn({ status: 'running', executor: 'model' }, mission),
    'active',
  );
  assert.equal(
    taskColumn({ status: 'review', executor: 'human' }, mission),
    'review',
  );
  assert.equal(
    taskColumn({ status: 'accepted', executor: 'human' }, mission),
    'done',
  );
  for (const status of [
    'uncertain',
    'failed',
    'stale',
    'rejected',
    'cancelled',
  ] as const)
    assert.equal(taskColumn({ status, executor: 'model' }, mission), 'waiting');
  assert.equal(
    taskColumn({ status: 'blocked', executor: 'model' }, { status: 'draft' }),
    'planned',
  );
  assert.equal(
    taskColumn({ status: 'blocked', executor: 'model' }, mission),
    'waiting',
  );
});

import {
  orderedTasks,
  unfinishedDependencyCounts,
} from '../lib/task-presentation';
const createdAt = '2026-09-06T12:00:00.000Z';
function step(id: string, title: string) {
  return { id, title, created_at: createdAt };
}
void test('research steps stay in dependency order when database rows have tied creation times', () => {
  const tasks = [
      step('review', '1. Review interpretation'),
      step('read', '3. Read source'),
      step('draft', '2. Draft interpretation'),
    ],
    edges = [
      { task_id: 'review', depends_on: 'draft' },
      { task_id: 'draft', depends_on: 'read' },
    ];
  assert.deepEqual(
    orderedTasks(tasks, edges).map((task) => task.id),
    ['read', 'draft', 'review'],
  );
  assert.deepEqual(
    tasks.map((task) => task.id),
    ['review', 'read', 'draft'],
  );
});
void test('parallel steps have stable natural ordering independent of incoming row order', () => {
  const tasks = [
    step('later', 'Step 10'),
    step('earlier', 'Step 2'),
    step('same-b', 'Step 2'),
  ];
  const expected = ['earlier', 'same-b', 'later'];
  assert.deepEqual(
    orderedTasks(tasks, []).map((task) => task.id),
    expected,
  );
  assert.deepEqual(
    orderedTasks([...tasks].reverse(), []).map((task) => task.id),
    expected,
  );
});
void test('an incomplete or malformed graph does not hide tasks from the researcher', () => {
  const tasks = [
      step('first', 'First'),
      step('second', 'Second'),
      step('free', 'Independent'),
    ],
    edges = [
      { task_id: 'first', depends_on: 'second' },
      { task_id: 'second', depends_on: 'first' },
      { task_id: 'free', depends_on: 'missing' },
    ];
  const ordered = orderedTasks(tasks, edges);
  assert.equal(ordered[0].id, 'free');
  assert.deepEqual(
    new Set(ordered.map((task) => task.id)),
    new Set(tasks.map((task) => task.id)),
  );
});
void test('dependency counts exclude completed work but include pending review, stale and missing prerequisites only once', () => {
  const tasks = [
      { id: 'waiting', status: 'blocked' as const },
      { id: 'accepted', status: 'accepted' as const },
      { id: 'produced', status: 'succeeded' as const },
      { id: 'review', status: 'review' as const },
      { id: 'stale', status: 'stale' as const },
      { id: 'transitive', status: 'running' as const },
    ],
    edges = [
      { task_id: 'waiting', depends_on: 'accepted' },
      { task_id: 'waiting', depends_on: 'produced' },
      { task_id: 'waiting', depends_on: 'review' },
      { task_id: 'waiting', depends_on: 'review' },
      { task_id: 'waiting', depends_on: 'stale' },
      { task_id: 'waiting', depends_on: 'missing' },
      { task_id: 'review', depends_on: 'transitive' },
    ];
  const counts = unfinishedDependencyCounts(tasks, edges);
  assert.equal(counts.get('waiting'), 3);
  assert.equal(counts.get('review'), 1);
  assert.equal(counts.get('accepted'), 0);
  assert.equal(
    unfinishedDependencyCounts(
      tasks.map((task) =>
        task.id === 'review' ? { ...task, status: 'accepted' as const } : task,
      ),
      edges,
    ).get('waiting'),
    2,
  );
});
