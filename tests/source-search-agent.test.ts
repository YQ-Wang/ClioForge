import test from 'node:test';
import assert from 'node:assert/strict';
import { providerRequest } from '../lib/providers';
import {
  sourceCandidate,
  sourceSearchAction,
  sourceSearchContext,
  validateSourceSearchAction,
  type SourceSearchMemory,
} from '../lib/harness/source-search-tools';
import {
  evaluateCandidates,
  evaluateSourceSearchRun,
  sourceSearchCases,
} from '../lib/search/evaluation';
import { runConnectorSearch } from '../lib/search/connectors';
import { safePublicUrl } from '../lib/search/safe-fetch';
import { sourceSearchSystem } from '../lib/harness/source-search-prompt';
import { resolveSourceCandidate } from '../lib/harness/source-search-executor';
import {
  canRepairOutput,
  outputRetryFeedback,
} from '../lib/platform/output-retry';
import type { MissionStore } from '../lib/platform/missions';
import type { MissionTask } from '../lib/platform/types';

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
  assert.match(
    sourceSearchSystem,
    /resolve_full_text before .*save_source_lead/,
  );
  assert.match(
    sourceSearchContext(memory).policy,
    /resolve before importing or saving a source lead/,
  );
});

void test('source-search sequence validation gets exactly one bounded correction attempt', () => {
  const task = {
    attempt: 1,
    input: {
      parameters: {
        recipe: 'source_search',
        source_agent_stage: 'decision',
        output_repair_attempts: 1,
      },
    },
  } as unknown as MissionTask;
  assert.equal(canRepairOutput(task, true), true);
  assert.equal(canRepairOutput({ ...task, attempt: 2 }, true), false);
  assert.equal(canRepairOutput(task, false), false);
  assert.equal(
    canRepairOutput(
      {
        ...task,
        input: {
          ...task.input,
          parameters: {
            ...task.input.parameters,
            source_agent_stage: 'tool',
          },
        },
      },
      true,
    ),
    false,
  );
});

void test('source-search correction prompt includes the rejected sequence and required next order', async () => {
  const task = {
    attempt: 2,
    error: '必须先尝试解析全文，再保存待补资料。',
    input: {
      parameters: {
        recipe: 'source_search',
        source_agent_stage: 'decision',
        output_repair_attempts: 1,
      },
    },
    id: 'decision-task',
    project_id: 'project',
  } as unknown as MissionTask;
  const store = {
    owner: 'test-owner',
    db: {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            response: JSON.stringify({
              data: {
                tool: 'save_source_lead',
                result_id: 'candidate',
                reason: 'No file listed.',
              },
            }),
            candidate: null,
          }),
        }),
      }),
    },
  } as unknown as MissionStore;
  const feedback = await outputRetryFeedback(store, task);
  assert.match(feedback, /previous source-search operation was rejected/i);
  assert.match(feedback, /resolve_full_text before .*save_source_lead/);
  assert.match(feedback, /triage_results shortlist/);
  assert.match(feedback, /必须先尝试解析全文/);
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

void test('resolver does not call an HTTP Handle landing page verified full text', async () => {
  const candidate = sourceCandidate.parse({
    id: 'openalex:W-handle',
    provider: 'openalex',
    external_id: 'W-handle',
    title: 'Repository record',
    landing_url: 'http://hdl.handle.net/10397/64017',
    download_url: 'http://hdl.handle.net/10397/64017',
    access_status: 'open',
  });
  const request = (async () =>
    new Response('<html><title>Repository record</title></html>', {
      headers: { 'Content-Type': 'text/html' },
    })) as typeof fetch;
  const resolved = await resolveSourceCandidate(candidate, request);
  assert.equal(resolved.download_status, 'unavailable');
  assert.equal(resolved.download_url, '');
  assert.match(resolved.resolution_note || '', /landing page/i);
});

void test('resolver follows a bounded repository page link and verifies the PDF bytes', async () => {
  const candidate = sourceCandidate.parse({
    id: 'openalex:W-repository',
    provider: 'openalex',
    external_id: 'W-repository',
    title: 'Repository article',
    landing_url: 'https://repository.example.test/handle/1/2',
    download_url: 'https://repository.example.test/handle/1/2',
    access_status: 'open',
  });
  const request = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/bitstream/'))
      return new Response(new TextEncoder().encode('%PDF-synthetic'), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    return new Response('<a href="/bitstream/1/2/1/article.pdf">Download</a>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }) as typeof fetch;
  const resolved = await resolveSourceCandidate(candidate, request);
  assert.equal(resolved.download_status, 'verified');
  assert.equal(resolved.resolved_media_type, 'application/pdf');
  assert.equal(
    resolved.download_url,
    'https://repository.example.test/bitstream/1/2/1/article.pdf',
  );
});

void test('missing web search credentials remain visible as unavailable telemetry', async () => {
  const result = await runConnectorSearch(
    { tool: 'search', query: 'exact historical phrase', providers: ['web'] },
    {},
    (async () => {
      throw new Error('network must not run without configured credentials');
    }) as typeof fetch,
  );
  assert.equal(result.candidates.length, 0);
  assert.deepEqual(
    result.searches.map((item) => item.status),
    ['unavailable'],
  );
  assert.match(result.searches[0].error || '', /not configured/i);
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
  assert.ok(metrics.topic_term_coverage >= 0.8);
  assert.deepEqual(metrics.explicit_noise_hits, ['noise']);
  assert.equal(metrics.explicit_noise_hit_rate, 0.5);
});

void test('run evaluation reports dispositions and never treats unreviewed candidates as precision', () => {
  const ming = sourceSearchCases.find(
    (testCase) => testCase.id === 'ming-succession-donglin',
  )!;
  const base = {
    provider: 'crossref' as const,
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
    manifest_url: '',
    download_url: '',
    rights: '',
    license: '',
    access_status: 'metadata' as const,
    snippet: '',
    verification_level: 'metadata' as const,
  };
  const good = {
    ...base,
    id: 'good',
    external_id: 'good',
    title: 'A Decade of Considerable Significance',
    landing_url: 'https://example.org/good',
  };
  const noise = {
    ...base,
    id: 'noise',
    external_id: 'noise',
    title: 'War of the Putin succession',
    landing_url: 'https://example.org/noise',
  };
  const undecided = {
    ...base,
    id: 'undecided',
    external_id: 'undecided',
    title: 'Ambiguous record',
    landing_url: 'https://example.org/undecided',
  };
  const memory: SourceSearchMemory = {
    version: 1,
    stopped: true,
    stop_reason: 'limit',
    steps: [
      {
        action: {
          tool: 'search',
          query: 'Ming search',
          providers: ['crossref'],
        },
        outcome: 'found',
        candidates: [good, noise, undecided],
        status: 'completed',
      },
      {
        action: {
          tool: 'triage_results',
          decisions: [
            {
              result_id: good.id,
              decision: 'shortlist',
              reason: 'Exact title.',
              evidence: 'A Decade of Considerable Significance',
            },
            {
              result_id: noise.id,
              decision: 'reject',
              reason: 'Wrong place.',
              evidence: 'War of the Putin succession',
            },
          ],
        },
        outcome: '1 shortlisted and 1 rejected',
        candidates: [good, noise],
        status: 'completed',
      },
      {
        action: { tool: 'resolve_full_text', result_id: good.id },
        outcome: 'No safe file',
        candidates: [good],
        status: 'completed',
      },
      {
        action: {
          tool: 'save_source_lead',
          result_id: good.id,
          reason: 'Relevant but unavailable.',
        },
        outcome: 'Saved lead',
        candidates: [good],
        status: 'completed',
      },
    ],
  };
  const metrics = evaluateSourceSearchRun(ming, memory);
  assert.equal(metrics.candidate_count, 3);
  assert.equal(metrics.inspected_count, 2);
  assert.equal(metrics.retained_count, 1);
  assert.equal(metrics.rejected_count, 1);
  assert.equal(metrics.undecided_count, 1);
  assert.equal(metrics.unreviewed_count, 1);
  assert.equal(metrics.disposition_coverage, 2 / 3);
  assert.equal(metrics.finished, false);
  assert.equal(metrics.budget_exhausted, true);
  assert.equal('clean_precision_proxy' in metrics, false);
});

void test('batch triage accepts known unique candidates and rejects duplicate or invented IDs', () => {
  const candidate = {
    id: 'crossref:known',
    provider: 'crossref' as const,
    external_id: 'known',
    title: 'Known candidate',
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
    landing_url: 'https://example.org/known',
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
          query: 'known candidate',
          providers: ['crossref'],
        },
        outcome: 'found',
        candidates: [candidate],
        status: 'completed',
      },
    ],
  };
  const result = (
    decisions: Array<{
      result_id: string;
      decision: 'shortlist' | 'reject';
      reason: string;
      evidence: string;
    }>,
  ) => ({
    summary: '',
    citations: [],
    checks: [],
    data: { tool: 'triage_results', decisions },
  });
  assert.doesNotThrow(() =>
    validateSourceSearchAction(
      result([
        {
          result_id: candidate.id,
          decision: 'shortlist',
          reason: 'Plausible.',
          evidence: 'Known candidate',
        },
      ]),
      memory,
    ),
  );
  assert.throws(() =>
    validateSourceSearchAction(
      result([
        {
          result_id: candidate.id,
          decision: 'shortlist',
          reason: 'Plausible.',
          evidence: 'Known candidate',
        },
        {
          result_id: candidate.id,
          decision: 'reject',
          reason: 'Duplicate.',
          evidence: 'Known candidate',
        },
      ]),
      memory,
    ),
  );
  assert.throws(() =>
    validateSourceSearchAction(
      result([
        {
          result_id: 'invented',
          decision: 'reject',
          reason: 'Invented.',
          evidence: 'Invented',
        },
      ]),
      memory,
    ),
  );
  assert.throws(() =>
    validateSourceSearchAction(
      result([
        {
          result_id: candidate.id,
          decision: 'shortlist',
          reason: 'Unsupported.',
          evidence: 'A fact absent from the record',
        },
      ]),
      memory,
    ),
  );
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
