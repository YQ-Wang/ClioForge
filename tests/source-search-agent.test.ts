import test from 'node:test';
import assert from 'node:assert/strict';
import { providerRequest } from '../lib/providers';
import {
  sourceSearchAction,
  sourceSearchContext,
  validateSourceSearchAction,
  type SourceSearchMemory,
} from '../lib/harness/source-search-tools';
import {
  evaluateCandidates,
  sourceSearchCases,
} from '../lib/search/evaluation';
import { runConnectorSearch } from '../lib/search/connectors';
import { safePublicUrl } from '../lib/search/safe-fetch';

void test('Fireworks Kimi source-search decisions use max reasoning and a strict source tool schema', () => {
  const request = providerRequest({
    provider: 'fireworks',
    model: 'accounts/fireworks/models/kimi-k3',
    key: 'synthetic-key',
    system: 'synthetic system',
    prompt: 'synthetic prompt',
    outputFormat: 'json',
    outputSchema: 'source_search_tool_v1',
    effort: 'max',
    taskKind: 'search',
  });
  assert.equal(
    request.url,
    'https://api.fireworks.ai/inference/v1/chat/completions',
  );
  const body = request.body as {
    reasoning_effort: string;
    response_format: { json_schema: { name: string; strict: boolean } };
  };
  assert.equal(body.reasoning_effort, 'max');
  assert.equal(body.response_format.json_schema.name, 'source_search_tool_v1');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.ok(!JSON.stringify(body).includes('synthetic-key'));
});

void test('source agent must inspect, resolve, and use known IDs before import or lead creation', () => {
  const candidate = {
    id: 'crossref:10.1000/test',
    provider: 'crossref' as const,
    external_id: '10.1000/test',
    title: 'Bounded historical study',
    creators: [],
    issued_date: '',
    material_type: 'article',
    languages: [],
    institution: '',
    collection: '',
    doi: '10.1000/test',
    handle: '',
    ark: '',
    oclc: '',
    landing_url: 'https://doi.org/10.1000/test',
    manifest_url: '',
    download_url: '',
    rights: '',
    license: '',
    access_status: 'metadata' as const,
    snippet: '',
    verification_level: 'metadata' as const,
  };
  const memory: SourceSearchMemory = {
    version: 1,
    stopped: false,
    stop_reason: '',
    steps: [
      {
        action: {
          tool: 'search',
          query: 'bounded query',
          providers: ['crossref'],
        },
        outcome: 'one result',
        candidates: [candidate],
        status: 'completed',
      },
    ],
  };
  assert.throws(() =>
    validateSourceSearchAction(
      {
        summary: '',
        citations: [],
        checks: [],
        data: { tool: 'import_source', result_id: candidate.id },
      },
      memory,
    ),
  );
  assert.doesNotThrow(() =>
    validateSourceSearchAction(
      {
        summary: '',
        citations: [],
        checks: [],
        data: { tool: 'inspect_result', result_id: candidate.id },
      },
      memory,
    ),
  );
  assert.equal(sourceSearchContext(memory).candidates[0].id, candidate.id);
  assert.equal(
    sourceSearchAction.safeParse({
      tool: 'inspect_result',
      result_id: 'invented',
      url: 'https://attacker.invalid',
    }).success,
    false,
  );
});

void test('fixed connectors normalize synthetic scholarly records without exposing request credentials', async () => {
  const request = (async (input: string | URL | Request) => {
    const href =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input;
    assert.equal(new URL(href).hostname, 'api.crossref.org');
    return Response.json({
      message: {
        items: [
          {
            DOI: '10.1000/fixed',
            title: ['Exact historical topic'],
            author: [{ family: 'Researcher' }],
            URL: 'https://doi.org/10.1000/fixed',
          },
        ],
      },
    });
  }) as typeof fetch;
  const result = await runConnectorSearch(
    {
      tool: 'search',
      query: 'exact historical topic',
      providers: ['crossref'],
    },
    {},
    request,
  );
  assert.equal(result.searches[0].status, 'completed');
  assert.equal(result.candidates[0].id, 'crossref:10.1000/fixed');
  assert.equal(
    result.candidates[0].landing_url,
    'https://doi.org/10.1000/fixed',
  );
});

void test('download URL policy blocks credentials, local networks, unsafe ports, and connector escapes', () => {
  for (const url of [
    'http://example.com/file.pdf',
    'https://user:secret@example.com/file.pdf',
    'https://localhost/file.pdf',
    'https://127.0.0.1/file.pdf',
    'https://10.0.0.1/file.pdf',
    'https://169.254.169.254/latest/meta-data',
    'https://example.com:8443/file.pdf',
  ])
    assert.throws(() => safePublicUrl(url));
  assert.throws(() =>
    safePublicUrl(
      'https://attacker.invalid/result',
      new Set(['api.crossref.org']),
    ),
  );
  assert.equal(
    safePublicUrl('https://api.crossref.org/works').hostname,
    'api.crossref.org',
  );
});

void test('evaluation matrix spans Chinese and European ancient-to-modern research with explicit noise traps', () => {
  assert.ok(sourceSearchCases.length >= 6);
  assert.ok(sourceSearchCases.some((testCase) => testCase.locale === 'zh-CN'));
  assert.ok(sourceSearchCases.some((testCase) => testCase.locale === 'en'));
  assert.ok(
    sourceSearchCases.some((testCase) => /西汉/.test(testCase.request)),
  );
  assert.ok(
    sourceSearchCases.some((testCase) =>
      /medieval|Investiture/i.test(testCase.request),
    ),
  );
  assert.ok(
    sourceSearchCases.some((testCase) => /1750–1914/.test(testCase.request)),
  );
  const ming = sourceSearchCases.find(
    (testCase) => testCase.id === 'ming-succession-donglin',
  )!;
  const metrics = evaluateCandidates(ming, [
    {
      id: 'good',
      provider: 'crossref',
      external_id: 'good',
      title: 'Wanli succession and Donglin movement after the 1593 evaluation',
      creators: [],
      issued_date: '',
      material_type: '',
      languages: [],
      institution: '',
      collection: '',
      doi: '',
      handle: '',
      ark: '',
      oclc: '',
      landing_url: 'https://example.org/good',
      manifest_url: '',
      download_url: '',
      rights: '',
      license: '',
      access_status: 'metadata',
      snippet: '国本之争与癸巳京察研究',
      verification_level: 'abstract',
    },
    {
      id: 'noise',
      provider: 'loc',
      external_id: 'noise',
      title: 'Roman inscription from Roma',
      creators: [],
      issued_date: '',
      material_type: '',
      languages: [],
      institution: '',
      collection: '',
      doi: '',
      handle: '',
      ark: '',
      oclc: '',
      landing_url: 'https://example.org/noise',
      manifest_url: '',
      download_url: '',
      rights: '',
      license: '',
      access_status: 'metadata',
      snippet: '',
      verification_level: 'metadata',
    },
  ]);
  assert.ok(metrics.anchor_coverage >= 0.8);
  assert.deepEqual(metrics.exclusion_hits, ['noise']);
  assert.equal(metrics.clean_precision_proxy, 0.5);
});

void test('agent context keeps a bounded recent candidate window and bounded snippets', () => {
  const candidate = {
    id: 'crossref:base',
    provider: 'crossref' as const,
    external_id: 'base',
    title: 'Bounded record',
    creators: [],
    issued_date: '',
    material_type: '',
    languages: [],
    institution: '',
    collection: '',
    doi: '',
    handle: '',
    ark: '',
    oclc: '',
    landing_url: 'https://example.org/base',
    manifest_url: '',
    download_url: '',
    rights: '',
    license: '',
    access_status: 'metadata' as const,
    snippet: 'x'.repeat(8000),
    verification_level: 'metadata' as const,
  };
  const memory: SourceSearchMemory = {
    version: 1,
    stopped: false,
    stop_reason: '',
    steps: Array.from({ length: 3 }, (_, step) => ({
      action: {
        tool: 'search' as const,
        query: `bounded query ${step}`,
        providers: ['crossref' as const],
      },
      outcome: 'found',
      candidates: Array.from({ length: 30 }, (_, index) => ({
        ...candidate,
        id: `crossref:${step}-${index}`,
        external_id: `${step}-${index}`,
        landing_url: `https://example.org/${step}-${index}`,
      })),
      status: 'completed' as const,
    })),
  };
  const context = sourceSearchContext(memory);
  assert.equal(context.candidates.length, 60);
  assert.ok(context.candidates.every((value) => value.snippet.length === 1200));
  assert.ok(JSON.stringify(context).length < 100_000);
});
