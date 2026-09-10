import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrivateDeployment } from '../scripts/validate-private-deployment.mjs';

function gate(status = 401) {
  return new Response('GitHub sign-in required.', {
    status,
    headers: { 'x-robots-tag': 'noindex', 'cache-control': 'no-store' },
  });
}

void test('deployment probe checks the page, API and assets without following redirects', async () => {
  const paths: string[] = [];
  await validatePrivateDeployment(
    'https://research.example.org',
    async (url, init) => {
      assert.ok(url instanceof URL);
      paths.push(url.pathname);
      assert.equal(init?.redirect, 'manual');
      assert.equal(new Headers(init?.headers).has('cookie'), false);
      return gate();
    },
  );
  assert.deepEqual(paths, [
    '/',
    '/api/projects',
    '/_next/static/access-check.js',
    '/brand/clioforge-mark.svg',
  ]);
});

void test('Cloudflare challenges fail with actionable diagnostics without logging the response body', async () => {
  await assert.rejects(
    validatePrivateDeployment(
      'https://research.example.org',
      async () =>
        new Response('private response body', {
          status: 403,
          headers: { 'cf-mitigated': 'challenge', 'cf-ray': 'test-ray' },
        }),
    ),
    (error: Error) => {
      assert.match(error.message, /Cloudflare challenged/);
      assert.match(error.message, /Ray ID test-ray/);
      assert.match(error.message, /access gate was not reached/);
      assert.doesNotMatch(error.message, /private response body/);
      return true;
    },
  );
});

void test('unexpected status and incomplete access protections still fail closed', async () => {
  for (const status of [200, 302, 403, 500]) {
    await assert.rejects(
      validatePrivateDeployment('https://research.example.org', async () =>
        gate(status),
      ),
      /Private access must protect/,
    );
  }
  for (const missing of ['x-robots-tag', 'cache-control', 'body']) {
    await assert.rejects(
      validatePrivateDeployment('https://research.example.org', async () => {
        const response = gate();
        if (missing === 'body')
          return new Response('unrelated denial', {
            status: 401,
            headers: response.headers,
          });
        response.headers.delete(missing);
        return response;
      }),
    );
  }
});
