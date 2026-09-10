import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { transform, transformSync } from '@esbuild-kit/core-utils';

void test('patched schema-tooling transformer preserves CommonJS TypeScript execution', () => {
  const transformed = transformSync(
    'const answer: number = 21 * 2; module.exports = answer;',
    '/tmp/clioforge-toolchain-check.cts',
  );
  const context = { module: { exports: undefined } };
  runInNewContext(transformed.code, context);
  assert.equal(context.module.exports, 42);
});

void test('patched schema-tooling transformer preserves ESM TypeScript exports', async () => {
  const transformed = await transform(
    'export const answer: number = 21 * 2;',
    '/tmp/clioforge-toolchain-check.mts',
    { format: 'esm' },
  );
  const result = await import(
    `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
  );
  assert.equal(result.answer, 42);
});
