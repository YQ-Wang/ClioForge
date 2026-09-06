import test from 'node:test';
import assert from 'node:assert/strict';
import { importSampleBatches } from '../lib/sample-import';

void test('sample import exposes bounded progress and stops after a failed request without retrying', async () => {
  const offsets: number[] = [],
    progress: number[] = [];
  await assert.rejects(
    importSampleBatches(
      async ({ offset, limit }) => {
        offsets.push(offset);
        assert.equal(limit, 4);
        if (offset === 8) throw new Error('Connection lost');
        return { next: offset + limit, total: 40, imported: 4, skipped: 0 };
      },
      (completed) => progress.push(completed),
    ),
    /Connection lost/,
  );
  assert.deepEqual(offsets, [0, 4, 8]);
  assert.deepEqual(progress, [0, 4, 8]);
});

void test('sample restart counts already saved records without exceeding the corpus', async () => {
  const progress: number[] = [];
  const result = await importSampleBatches(
    async ({ offset, limit }) => ({
      next: offset + limit,
      total: 40,
      imported: offset < 8 ? 0 : 4,
      skipped: offset < 8 ? 4 : 0,
    }),
    (completed) => progress.push(completed),
  );
  assert.deepEqual(result, { imported: 32, skipped: 8 });
  assert.equal(progress.at(-1), 40);
  await assert.rejects(
    importSampleBatches(
      async () => ({ next: 0, total: 40, imported: 0, skipped: 0 }),
      () => {},
    ),
    /Invalid sample import progress/,
  );
});
