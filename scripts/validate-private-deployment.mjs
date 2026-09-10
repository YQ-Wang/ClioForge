import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const paths = [
  '/',
  '/api/projects',
  '/_next/static/access-check.js',
  '/brand/clioforge-mark.svg',
];

export async function validatePrivateDeployment(origin, request = fetch) {
  origin = new URL(origin);
  assert.equal(origin.protocol, 'https:');
  for (const path of paths) {
    const response = await request(new URL(path, origin), {
      redirect: 'manual',
      headers: { Accept: path === '/' ? 'text/html' : '*/*' },
      signal: AbortSignal.timeout(30_000),
    });
    // A challenge proves only that Cloudflare blocked the probe, not that the
    // deployed application still enforces its GitHub allowlist.
    if (response.headers.get('cf-mitigated') === 'challenge') {
      const ray = response.headers.get('cf-ray') || 'unavailable';
      await response.body?.cancel();
      throw new Error(
        `Cloudflare challenged the deployment probe for ${path} (HTTP ${response.status}, Ray ID ${ray}). ` +
          'The application access gate was not reached. Check Cloudflare Security Events for Bot Fight Mode or WAF challenges. ' +
          'See docs/continuous-deployment.md#cloudflare-challenges.',
      );
    }
    assert.equal(response.status, 401, `Private access must protect ${path}`);
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    const body = await response.text();
    assert.match(body, /GitHub/, `GitHub access gate: ${path}`);
    console.log(`PASS private access: ${path}`);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await validatePrivateDeployment(process.argv[2] || 'https://clioforge.com');
}
