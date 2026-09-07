import test from 'node:test';
import assert from 'node:assert/strict';
import { indexText } from '../lib/platform/search';

void test('Chinese search indexing preserves code points and punctuation boundaries', () => {
  assert.equal(
    indexText('𠮷明朝，港口 Été'),
    '𠮷明朝,港口 ete 𠮷明 明朝 朝 港口 口',
  );
});

void test('maximum-length Chinese source pages preserve all adjacent search terms', () => {
  const source = '明朝史料'.repeat(25000);
  const started = process.cpuUsage();
  const indexed = indexText(source).split(' ');
  const used = process.cpuUsage(started);
  // A generous CPU ceiling catches quadratic allocation without depending on
  // wall-clock pauses or imposing a millisecond microbenchmark on CI.
  assert.ok(
    used.user + used.system < 5_000_000,
    'A valid page must index within five CPU seconds',
  );
  assert.equal(indexed[0], source);
  assert.equal(indexed.length, source.length + 1);
  assert.deepEqual(indexed.slice(1, 6), [
    '明朝',
    '朝史',
    '史料',
    '料明',
    '明朝',
  ]);
  assert.equal(indexed.at(-1), '料');
});
