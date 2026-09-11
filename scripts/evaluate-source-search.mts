import fs from 'node:fs/promises';
import path from 'node:path';
import { invoke } from '../lib/providers';
import { sourceSearchSystem } from '../lib/harness/source-search-prompt';
import {
  sourceCandidate,
  sourceCandidates,
  sourceSearchAction,
  sourceSearchContext,
  validateSourceSearchAction,
  type SourceSearchMemory,
  type SourceCandidate,
} from '../lib/harness/source-search-tools';
import { runConnectorSearch } from '../lib/search/connectors';
import {
  evaluateCandidates,
  sourceSearchCases,
} from '../lib/search/evaluation';
import { resultSchema } from '../lib/platform/types';
import { defaultSourceSelectionCriteria } from '../lib/platform/source-search-recipe';

const apiKey = process.env.FIREWORKS_API_KEY;
if (!apiKey)
  throw new Error(
    'Set FIREWORKS_API_KEY in this shell before running the live evaluation.',
  );
const selected = process.argv
  .find((value) => value.startsWith('--case='))
  ?.slice(7);
const cases = selected
  ? sourceSearchCases.filter((testCase) => testCase.id === selected)
  : sourceSearchCases;
if (!cases.length) throw new Error(`Unknown source-search case: ${selected}`);

const webProvider = process.env.BRAVE_SEARCH_API_KEY
  ? ('brave' as const)
  : process.env.TAVILY_API_KEY
    ? ('tavily' as const)
    : undefined;
const webKey = process.env.BRAVE_SEARCH_API_KEY || process.env.TAVILY_API_KEY;
const model =
  process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/kimi-k3';
const maxSteps = Math.min(
  12,
  Math.max(2, Number(process.env.SOURCE_SEARCH_STEPS || 8)),
);
const reports = [];

for (const testCase of cases) {
  const selectionCriteria =
    process.env.SOURCE_SELECTION_CRITERIA ||
    defaultSourceSelectionCriteria(testCase.locale);
  const memory: SourceSearchMemory = {
    version: 1,
    stopped: false,
    stop_reason: '',
    steps: [],
  };
  let inputTokens = 0;
  let outputTokens = 0;
  const started = performance.now();
  for (let step = 0; step < maxSteps && !memory.stopped; step++) {
    const response = await invoke({
      provider: 'fireworks',
      model,
      key: apiKey,
      system: sourceSearchSystem,
      prompt: `Research request:\n${testCase.request}\n\nResearcher-controlled source selection criteria (mandatory):\n${selectionCriteria}\n\nCurrent source-search ledger:\n${JSON.stringify(sourceSearchContext(memory))}\n\nThis is a read-only evaluation. Do not choose import_source. Choose exactly one next operation and return JSON only.`,
      outputFormat: 'json',
      outputSchema: 'source_search_tool_v1',
      maxOutput: 16384,
      effort: 'max',
      taskKind: 'search',
    });
    inputTokens += response.inputTokens;
    outputTokens += response.outputTokens;
    const decision = resultSchema.parse(JSON.parse(response.text));
    const action = validateSourceSearchAction(decision, memory);
    let candidates: SourceCandidate[] = [];
    let outcome = '';
    let status: 'completed' | 'unavailable' | 'blocked' = 'completed';
    const known = sourceCandidates(memory);
    if (action.tool === 'search') {
      const providers = action.providers.filter(
        (provider) => provider !== 'web' || !!webProvider,
      );
      if (!providers.length) providers.push('crossref', 'openalex', 'harvard');
      const found = await runConnectorSearch(
        { ...action, providers },
        { webProvider, webKey, dplaKey: process.env.DPLA_API_KEY },
      );
      candidates = found.candidates.map((candidate) =>
        sourceCandidate.parse({
          ...candidate,
          snippet: candidate.snippet.slice(0, 1600),
        }),
      );
      status = found.searches.every((search) => search.status === 'unavailable')
        ? 'unavailable'
        : 'completed';
      outcome = JSON.stringify(found.searches);
    } else if ('result_id' in action) {
      const candidate = known.get(action.result_id);
      if (!candidate)
        throw new Error(`Model selected unknown result ${action.result_id}`);
      candidates = [
        sourceCandidate.parse({
          ...candidate,
          verification_level:
            action.tool === 'inspect_result' && candidate.snippet
              ? 'abstract'
              : candidate.verification_level,
        }),
      ];
      outcome =
        action.tool === 'reject_result' || action.tool === 'save_source_lead'
          ? action.reason
          : action.tool === 'resolve_full_text'
            ? candidate.download_url
              ? 'Resolved public download URL.'
              : 'No public download URL in normalized metadata; save a lead if relevant.'
            : 'Read-only evaluation recorded this candidate without importing it.';
    } else {
      memory.stopped = true;
      memory.stop_reason = action.reason;
      outcome = action.reason;
    }
    memory.steps.push({
      action: sourceSearchAction.parse(action),
      outcome,
      candidates,
      status,
    });
  }
  if (!memory.stopped) {
    memory.stopped = true;
    memory.stop_reason = 'Evaluation operation limit reached.';
  }
  const unique = [...sourceCandidates(memory).values()];
  reports.push({
    case: testCase,
    model,
    effort: 'max',
    selection_criteria: selectionCriteria,
    duration_ms: Math.round(performance.now() - started),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metrics: evaluateCandidates(testCase, unique),
    memory,
  });
}

const stamp = new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-');
const directory = path.resolve('artifacts/source-search-evaluations');
await fs.mkdir(directory, { recursive: true });
const target = path.join(directory, `kimi-k3-max-${stamp}.json`);
await fs.writeFile(
  target,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      model,
      effort: 'max',
      credential_policy:
        'Credentials came from process environment and are not stored in this artifact.',
      reports,
    },
    null,
    2,
  ),
);
console.log(
  `Saved ${reports.length} live source-search evaluations to ${target}`,
);
