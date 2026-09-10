import assert from 'node:assert/strict';

const origin = new URL(process.argv[2] || 'https://clioforge.com');
assert.equal(origin.protocol, 'https:');
for (const path of [
  '/',
  '/api/projects',
  '/_next/static/access-check.js',
  '/brand/clioforge-mark.svg',
]) {
  const response = await fetch(new URL(path, origin), {
    redirect: 'manual',
    headers: { Accept: path === '/' ? 'text/html' : '*/*' },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 401, `Private access must protect ${path}`);
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  const body = await response.text();
  assert.match(body, /GitHub/, `GitHub access gate: ${path}`);
  console.log(`PASS private access: ${path}`);
}
