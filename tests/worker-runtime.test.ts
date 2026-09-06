import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

void test('Worker embedding catalog and Zotero requests reject redirects before forwarding credentials', async () => {
  const bundle = await build({
    stdin: {
      contents: `import {embeddingRate} from './lib/platform/semantic';
        import {zoteroAttachments} from './lib/zotero';
        export default { async fetch(request) {
          try { return Response.json(new URL(request.url).pathname === '/embedding'
            ? await embeddingRate()
            : await zoteroAttachments({library:'123',library_type:'groups',key:'test-private'},0)); }
          catch(error) { return Response.json({error:error.message},{status:502}); }
        }};`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  let redirect = false,
    calls = 0;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-09-04',
      script: bundle.outputFiles[0].text,
      outboundService: async (request: Request) => {
        calls++;
        const host = new URL(request.url).hostname;
        assert.ok(['openrouter.ai', 'api.zotero.org'].includes(host));
        if (host === 'api.zotero.org')
          assert.equal(request.headers.get('Zotero-API-Key'), 'test-private');
        if (redirect)
          return new Response('', {
            status: 302,
            headers: { Location: 'https://untrusted.example/' },
          });
        return Response.json(
          host === 'openrouter.ai'
            ? {
                data: [
                  {
                    id: 'openai/text-embedding-3-small',
                    pricing: { prompt: '0.00000002' },
                  },
                ],
              }
            : [],
        );
      },
    }),
  );
  try {
    assert.equal(
      await (await mf.dispatchFetch('https://test.local/embedding')).json(),
      0.02,
    );
    assert.equal(
      (await mf.dispatchFetch('https://test.local/zotero')).status,
      200,
    );
    redirect = true;
    for (const path of ['embedding', 'zotero']) {
      const response = await mf.dispatchFetch('https://test.local/' + path);
      assert.equal(response.status, 502);
      assert.match(
        ((await response.json()) as { error: string }).error,
        /HTTP 302/,
      );
    }
    assert.equal(calls, 4);
  } finally {
    await mf.dispose();
  }
});

void test('real Worker provider request accepts runtime options and refuses credential redirects', async () => {
  const bundle = await build({
    stdin: {
      contents: `import {invoke, safeProviderFailure} from './lib/providers';
        export default { async fetch(request) {
          try { return Response.json(await invoke({provider:'openrouter',model:'test',key:'test-private',system:'',prompt:new URL(request.url).pathname,outputFormat:'json'})); }
          catch(error) { return Response.json({error:safeProviderFailure(error)}, {status:502}); }
        } };`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  let calls = 0;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-09-04',
      script: bundle.outputFiles[0].text,
      outboundService: async (request: Request) => {
        calls++;
        assert.equal(new URL(request.url).hostname, 'openrouter.ai');
        assert.equal(
          request.headers.get('Authorization'),
          'Bearer test-private',
        );
        const payload = (await request.json()) as {
          response_format: { type: string };
          messages: { content: unknown }[];
        };
        assert.equal(payload.response_format.type, 'json_object');
        if (JSON.stringify(payload).includes('/redirect'))
          return new Response('', {
            status: 302,
            headers: { Location: 'https://untrusted.example/' },
          });
        return Response.json({
          choices: [{ message: { content: 'attributed finding' } }],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        });
      },
    }),
  );
  try {
    const success = await mf.dispatchFetch('https://test.local/normal');
    assert.equal(success.status, 200);
    assert.equal(
      ((await success.json()) as { text: string }).text,
      'attributed finding',
    );
    const redirect = await mf.dispatchFetch('https://test.local/redirect');
    assert.equal(redirect.status, 502);
    assert.match(
      ((await redirect.json()) as { error: string }).error,
      /HTTP 302/,
    );
    assert.equal(calls, 2);
  } finally {
    await mf.dispose();
  }
});

void test('PDF layout alignment returns exact original spans without correcting text or ambiguous matches', async () => {
  const { alignCitation } = await import('../lib/platform/citation-alignment');
  const page =
    'Intro. Whereas, on the twenty-\nsecond day, the\n  people shall be free. End.';
  const aligned = alignCitation(
    page,
    'Whereas, on the twenty-second day, the people shall be free.',
  );
  assert.ok(aligned);
  assert.equal(
    page.slice(aligned.start, aligned.start + aligned.quote.length),
    aligned.quote,
  );
  assert.match(aligned.quote, /twenty-\nsecond/);
  assert.equal(alignCitation(page, 'Whereas, on the twenty second day'), null);
  assert.equal(alignCitation(page, 'the people shall not be free.'), null);
  assert.equal(alignCitation('free. free.', 'free.'), null);
  assert.equal(alignCitation('first page', 'first page second page'), null);
});
