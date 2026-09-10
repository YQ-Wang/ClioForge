import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedGitHubIds,
  privateAccessGate,
  type PrivateAccessEnv,
} from '../lib/private-access';

const env: PrivateAccessEnv = {
  PRIVATE_GITHUB_ACCESS: '1',
  PRIVATE_GITHUB_USER_IDS: '123,456',
  PRIVATE_GITHUB_CLIENT_ID: 'test-client',
  PRIVATE_GITHUB_CLIENT_SECRET: 'test-oauth-secret',
  PRIVATE_GITHUB_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  BETTER_AUTH_URL: 'https://research.example.org',
};
const origin = env.BETTER_AUTH_URL!;
function request(path: string, cookie = '', method = 'GET') {
  return new Request(origin + path, {
    method,
    headers: { Cookie: cookie, Origin: origin },
  });
}
function cookieHeader(response: { headers: { getSetCookie(): string[] } }) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

void test('private gate fails closed on missing configuration, malformed allowlists, alternate hosts and all application routes', async () => {
  assert.equal(allowedGitHubIds('123, 456').size, 2);
  const page = await privateAccessGate(request('/private-access'), env);
  assert.match(
    page!.headers.get('Content-Security-Policy')!,
    /form-action 'self' https:\/\/github\.com;/,
  );
  for (const value of ['', '123,', 'alice', '0', '123,alice'])
    assert.equal(allowedGitHubIds(value).size, 0);
  for (const path of [
    '/',
    '/api/workspace',
    '/api/auth/sign-up/email',
    '/files/a.pdf',
    '/assets/app.js',
    '/sitemap.xml',
    '/guide',
  ]) {
    const response = await privateAccessGate(request(path), env);
    assert.equal(response?.status, 401);
    assert.match(response!.headers.get('X-Robots-Tag')!, /noindex/);
    assert.match(response!.headers.get('Cache-Control')!, /no-store/);
    assert.equal(
      (await privateAccessGate(request(path, '', 'POST'), env))?.status,
      401,
    );
    assert.equal(
      (await privateAccessGate(new Request('https://clioforge.com' + path), {}))
        ?.status,
      503,
    );
  }
  assert.equal(
    (
      await privateAccessGate(
        new Request('https://worker.workers.dev/api/workspace'),
        env,
      )
    )?.status,
    403,
  );
  assert.equal(
    await privateAccessGate(new Request('http://127.0.0.1:3000/'), {}),
    null,
  );
  assert.equal(
    (await privateAccessGate(request('/private-access/login'), env))?.status,
    405,
  );
  assert.equal(
    (
      await privateAccessGate(
        new Request(origin + '/private-access/login', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
        }),
        env,
      )
    )?.status,
    403,
  );
  for (const path of [
    '/api/private-auth/sign-up/email',
    '/api/private-auth/update-user',
    '/api/private-auth/sign-in/social',
    '/api/private-auth/callback/google',
  ])
    assert.equal(
      (await privateAccessGate(request(path, '', 'POST'), env))?.status,
      404,
    );
});

void test('real GitHub OAuth flow verifies state and immutable IDs, rejects outsiders, forged cookies, expiry and allowlist removal', async (t) => {
  let id = 123;
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push(url);
    if (url === 'https://github.com/login/oauth/access_token')
      return Response.json({
        access_token: 'test-only-token',
        token_type: 'bearer',
        scope: 'read:user,user:email',
      });
    if (url === 'https://api.github.com/user')
      return Response.json({
        id,
        login: 'renamed-user',
        name: 'Researcher',
        email: 'researcher@example.org',
      });
    if (url === 'https://api.github.com/user/emails')
      return Response.json([
        { email: 'researcher@example.org', primary: true, verified: true },
      ]);
    throw new Error('Unexpected external request: ' + url);
  });
  async function signIn() {
    const start = (await privateAccessGate(
      request('/private-access/login', '', 'POST'),
      env,
    ))!;
    assert.equal(start.status, 303, await start.clone().text());
    const authorization = new URL(start.headers.get('Location')!);
    assert.equal(authorization.origin, 'https://github.com');
    assert.equal(
      authorization.searchParams.get('redirect_uri'),
      origin + '/api/private-auth/callback/github',
    );
    assert.ok(authorization.searchParams.get('code_challenge'));
    assert.equal(
      authorization.searchParams.get('code_challenge_method'),
      'S256',
    );
    const callback =
      '/api/private-auth/callback/github?code=test-code&state=' +
      authorization.searchParams.get('state');
    return { start, callback };
  }
  const flow = await signIn();
  const invalid = await privateAccessGate(request(flow.callback), env);
  assert.notEqual(invalid, null);
  assert.equal(
    calls.length,
    0,
    'missing state cookie must not exchange a code',
  );
  const callback = (await privateAccessGate(
    request(flow.callback, cookieHeader(flow.start)),
    env,
  ))!;
  assert.equal(callback.status, 302, await callback.clone().text());
  const cookie = cookieHeader(callback);
  assert.match(
    cookie,
    /clioforge-private.session_data/,
    JSON.stringify({ location: callback.headers.get('Location'), calls }),
  );
  assert.doesNotMatch(cookie, /account_data|test-only-token/);
  for (const value of callback.headers.getSetCookie()) {
    assert.match(value, /HttpOnly/i);
    assert.match(value, /Secure/i);
    assert.match(value, /SameSite=Lax/i);
  }
  for (const path of [
    '/',
    '/api/workspace',
    '/assets/main.js',
    '/files/original.pdf',
  ])
    assert.equal(await privateAccessGate(request(path, cookie), env), null);
  assert.equal(
    (
      await privateAccessGate(request('/', cookie), {
        ...env,
        PRIVATE_GITHUB_USER_IDS: '456',
      })
    )?.status,
    401,
  );
  assert.equal(
    (
      await privateAccessGate(request('/', cookie), {
        ...env,
        PRIVATE_GITHUB_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      })
    )?.status,
    401,
  );
  const forged = cookie.replace(/(session_data=)./, '$1X');
  assert.equal(
    (await privateAccessGate(request('/', forged), env))?.status,
    401,
  );
  const now = Date.now();
  const clock = t.mock.method(Date, 'now', () => now + 9 * 60 * 60 * 1000);
  assert.equal(
    (await privateAccessGate(request('/', cookie), env))?.status,
    401,
  );
  clock.mock.restore();
  id = 999;
  const outsider = await signIn();
  const denied = (await privateAccessGate(
    request(outsider.callback, cookieHeader(outsider.start)),
    env,
  ))!;
  assert.doesNotMatch(cookieHeader(denied), /session_data=[^;]/);
  assert.notEqual(
    await privateAccessGate(request('/', cookieHeader(denied)), env),
    null,
  );
  id = 456;
  const second = await signIn();
  const accepted = (await privateAccessGate(
    request(second.callback, cookieHeader(second.start)),
    env,
  ))!;
  assert.equal(
    await privateAccessGate(request('/', cookieHeader(accepted)), env),
    null,
  );
});

void test('private gate runs in the Cloudflare runtime before serving application content', async () => {
  const { build } = await import('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const bundle = await build({
    stdin: {
      contents: `export {default} from './workers/app';`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    external: ['node:*'],
    plugins: [
      {
        name: 'framework-fixture',
        setup(build) {
          build.onResolve(
            { filter: /^vinext\/server\/fetch-handler$/ },
            () => ({ path: 'handler', namespace: 'fixture' }),
          );
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: `export default {fetch(){return new Response('protected content')}}`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-09-09',
      compatibilityFlags: ['nodejs_compat'],
      script: bundle.outputFiles[0].text,
      bindings: env,
      serviceBindings: {
        ASSETS: async () =>
          new Response('export const loaded = true;', {
            headers: {
              'Content-Type': 'text/javascript',
              'Cache-Control': 'public, max-age=31536000',
            },
          }),
      },
      outboundService: async (request: Request) => {
        const url = request.url;
        if (url === 'https://github.com/login/oauth/access_token')
          return Response.json({
            access_token: 'fixture',
            token_type: 'bearer',
          });
        if (url === 'https://api.github.com/user')
          return Response.json({
            id: 123,
            login: 'researcher',
            email: 'researcher@example.org',
          });
        if (url === 'https://api.github.com/user/emails')
          return Response.json([
            { email: 'researcher@example.org', primary: true, verified: true },
          ]);
        throw new Error('Unexpected fixture request');
      },
    }),
  );
  try {
    for (const path of [
      '/',
      '/api/workspace',
      '/_next/static/chunks/main.js',
      '/files/original.pdf',
    ]) {
      const response = await mf.dispatchFetch(origin + path);
      assert.equal(response.status, 401);
      assert.doesNotMatch(await response.text(), /protected content/);
      assert.match(response.headers.get('X-Robots-Tag')!, /noindex/);
    }
    const start = await mf.dispatchFetch(origin + '/private-access/login', {
      method: 'POST',
      headers: { Origin: origin },
      redirect: 'manual',
    });
    assert.equal(start.status, 303);
    assert.equal(
      new URL(start.headers.get('Location')!).origin,
      'https://github.com',
    );
    assert.match(start.headers.get('Set-Cookie')!, /HttpOnly/);
    const state = new URL(start.headers.get('Location')!).searchParams.get(
      'state',
    );
    const callback = await mf.dispatchFetch(
      origin + '/api/private-auth/callback/github?code=fixture&state=' + state,
      { headers: { Cookie: cookieHeader(start) }, redirect: 'manual' },
    );
    const cookie = cookieHeader(callback);
    assert.match(cookie, /session_data=/);
    const script = await mf.dispatchFetch(
      origin + '/_next/static/chunks/main.js',
      { headers: { Cookie: cookie } },
    );
    assert.equal(script.status, 200);
    assert.match(script.headers.get('Content-Type')!, /javascript/);
    assert.equal(await script.text(), 'export const loaded = true;');
    assert.match(script.headers.get('Cache-Control')!, /private, no-store/);
    assert.match(script.headers.get('X-Robots-Tag')!, /noindex/);
    const page = await mf.dispatchFetch(origin + '/', {
      headers: { Cookie: cookie },
    });
    assert.equal(await page.text(), 'protected content');
  } finally {
    await mf.dispose();
  }
});
