import assert from 'node:assert/strict';
import test from 'node:test';
import offline from '../workers/offline';

void test('retired hosting refuses every application entry point and HTTP method', async () => {
  for (const path of [
    '/',
    '/?view=projects',
    '/api/auth/sign-up/email',
    '/api/workspace',
    '/guide',
    '/sitemap.xml',
    '/assets/app.js',
    '/examples/adams/letter-91.txt',
  ]) {
    for (const method of ['GET', 'POST', 'HEAD', 'OPTIONS']) {
      const response = offline.fetch(
        new Request(`https://retired.example${path}`, { method }),
      );
      assert.equal(response.status, 410);
      assert.match(response.headers.get('X-Robots-Tag')!, /noindex/);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('Set-Cookie'), null);
      if (method === 'HEAD') assert.equal(await response.text(), '');
    }
  }
});

void test('crawlers can see the removal responses without a sitemap advertisement', async () => {
  const response = offline.fetch(
    new Request('https://retired.example/robots.txt'),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'User-agent: *\nAllow: /\n');
});
