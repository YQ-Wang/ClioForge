// Read-only HTTP checks of the rendered public site, without a login cookie.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const origin = process.argv[2] || 'http://127.0.0.1:3000';
const manifest = JSON.parse(
  readFileSync(
    new URL('../lib/adams-public-case.json', import.meta.url),
    'utf8',
  ),
);
async function get(path, headers = {}) {
  const response = await fetch(new URL(path, origin), {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': 'ClioForge-Public-Site-Validation/1.0',
      ...headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, path);
  return { response, body: await response.text() };
}
for (const [path, title] of [
  ['/', 'ClioForge: Open-source AI research IDE'],
  ['/research/adams', 'Reading the Adams letters with evidence'],
  ['/guide', 'From sources to a reviewed draft'],
]) {
  const { response, body } = await get(path);
  assert.ok(body.includes(`<title>${title}`), `SSR title: ${path}`);
  assert.match(body, /<h1[ >]/, `SSR heading: ${path}`);
  assert.ok(
    body.includes(`href="https://clioforge.com${path}"`),
    `canonical: ${path}`,
  );
  assert.match(body, /name="robots" content="index,\s*follow"/, path);
  assert.ok(!response.headers.get('x-robots-tag')?.includes('noindex'), path);
  if (path === '/research/adams') {
    for (const letter of manifest.letters) {
      assert.ok(body.includes(`id="${letter.id}"`));
      assert.ok(body.includes(`href="${letter.file}"`));
    }
  }
  console.log(`PASS public SSR + metadata ${path}`);
}
for (const path of [
  '/?view=projects',
  '/?token=not-a-real-token',
  '/?project=00000000-0000-0000-0000-000000000000',
]) {
  const { response, body } = await get(path);
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(
    response.headers.get('cache-control') || '',
    /private.*no-store/,
  );
  assert.match(body, /name="robots" content="noindex,\s*nofollow"/);
  console.log(
    `PASS private workspace entry ${path.split('?')[1].split('=')[0]}`,
  );
}
const { body: sitemap } = await get('/sitemap.xml');
assert.deepEqual(
  [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]).sort(),
  [
    'https://clioforge.com/',
    'https://clioforge.com/guide',
    'https://clioforge.com/research/adams',
  ],
);
const { body: robots } = await get('/robots.txt');
assert.ok(robots.includes('Sitemap: https://clioforge.com/sitemap.xml'));
assert.ok(robots.includes('Disallow: /api/'));
console.log('PASS sitemap allowlist + robots');
for (const letter of manifest.letters) {
  const { body } = await get(letter.file);
  assert.equal(createHash('sha256').update(body).digest('hex'), letter.sha256);
}
console.log('PASS downloadable excerpts match reviewed source manifest');
const { body: chinese } = await get('/guide', { 'Accept-Language': 'zh-CN' });
assert.ok(chinese.includes('从一个问题开始，带着证据写作。'));
console.log('PASS Chinese server-rendered guide');
