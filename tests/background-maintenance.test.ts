import test from 'node:test';
import assert from 'node:assert/strict';
import { runMaintenanceSteps } from '../lib/background-maintenance';
import { missionProgress } from '../lib/mission-progress';

void test('maintenance continues after failures, awaits each operation and reports only safe names', async () => {
  const ran: string[] = [];
  await assert.rejects(
    runMaintenanceSteps([
      {
        name: 'cleanup',
        run: async () => {
          ran.push('cleanup');
          throw new Error('private contents');
        },
      },
      {
        name: 'research',
        run: async () => {
          await Promise.resolve();
          ran.push('research');
        },
      },
      {
        name: 'watches',
        run: async () => {
          ran.push('watches');
          throw new Error('private contents');
        },
      },
    ]),
    (error) =>
      error instanceof Error &&
      error.message === 'Background maintenance failed: cleanup, watches',
  );
  assert.deepEqual(ran, ['cleanup', 'research', 'watches']);
});

void test('progress distinguishes working branches, review gates, uncertain attempts and external agents', () => {
  const tasks = [
    {
      id: 'a',
      title: 'Read',
      executor: 'model' as const,
      status: 'running' as const,
    },
    {
      id: 'b',
      title: 'Check',
      executor: 'human' as const,
      status: 'ready' as const,
    },
    {
      id: 'c',
      title: 'Inspect',
      executor: 'model' as const,
      status: 'uncertain' as const,
    },
  ];
  const progress = missionProgress({ status: 'active' }, tasks);
  assert.equal(progress.state, 'working');
  assert.equal(progress.review.length, 1);
  assert.equal(progress.attention.length, 1);
  assert.equal(progress.done, 0);
  assert.equal(missionProgress({ status: 'paused' }, tasks).state, 'paused');
  assert.equal(
    missionProgress({ status: 'active' }, tasks.slice(1)).state,
    'attention',
  );
  assert.equal(
    missionProgress({ status: 'active' }, [tasks[1]]).state,
    'review',
  );
  assert.equal(
    missionProgress({ status: 'active' }, [
      { ...tasks[1], executor: 'external' },
    ]).state,
    'external',
  );
});
