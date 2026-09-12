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
  type SourceSearchAction,
  type SourceCandidate,
} from '../lib/harness/source-search-tools';
import { runConnectorSearch } from '../lib/search/connectors';
import { resolveSourceCandidate } from '../lib/harness/source-search-executor';
import {
  evaluateSourceSearchRun,
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
  64,
  Math.max(2, Number(process.env.SOURCE_SEARCH_STEPS || 32)),
);
const maxRepairs = Math.min(
  4,
  Math.max(0, Number(process.env.SOURCE_SEARCH_REPAIR_ATTEMPTS || 2)),
);
const stamp = new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-');
const directory = path.resolve('artifacts/source-search-evaluations');
const target = path.join(directory, `kimi-k3-max-${stamp}.json`);
const checkpointTarget = path.join(
  directory,
  `kimi-k3-max-${stamp}.partial.json`,
);
const checkpointTemporary = `${checkpointTarget}.tmp`;
const startedAt = new Date().toISOString();
const reports: Array<Record<string, unknown>> = [];
let activeCheckpoint: Record<string, unknown> | null = null;

await fs.mkdir(directory, { recursive: true });

async function writeCheckpoint() {
  await fs.writeFile(
    checkpointTemporary,
    JSON.stringify(
      {
        started_at: startedAt,
        updated_at: new Date().toISOString(),
        model,
        effort: 'max',
        max_steps: maxSteps,
        credential_policy:
          'Credentials came from process environment and are never stored in logs or artifacts.',
        completed_reports: reports,
        active_report: activeCheckpoint,
      },
      null,
      2,
    ),
  );
  await fs.rename(checkpointTemporary, checkpointTarget);
}

function emit(event: Record<string, unknown>) {
  console.log(`[source-search] ${JSON.stringify(event, null, 2)}`);
}

console.log(
  `Live source-search evaluation started.\nCheckpoint: ${checkpointTarget}`,
);

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
  let modelCalls = 0;
  let operations = 0;
  let correction = '';
  const validationErrors: Array<{
    call: number;
    detail: string;
    proposed_tool: string;
  }> = [];
  const trace: Array<Record<string, unknown>> = [];
  const started = performance.now();
  const caseStartedAt = new Date().toISOString();
  const snapshot = async () => {
    activeCheckpoint = {
      case: testCase,
      selection_criteria: selectionCriteria,
      started_at: caseStartedAt,
      duration_ms: Math.round(performance.now() - started),
      model_calls: modelCalls,
      completed_operations: operations,
      validation_errors: validationErrors,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      metrics: evaluateSourceSearchRun(testCase, memory),
      trace,
      memory,
    };
    await writeCheckpoint();
  };
  emit({ event: 'case_started', case: testCase.id, max_steps: maxSteps });
  await snapshot();
  while (
    operations < maxSteps &&
    modelCalls < maxSteps + maxRepairs &&
    !memory.stopped
  ) {
    modelCalls++;
    const callStarted = performance.now();
    const callTrace: Record<string, unknown> = {
      event: 'model_call',
      case: testCase.id,
      call: modelCalls,
      status: 'waiting',
      started_at: new Date().toISOString(),
    };
    trace.push(callTrace);
    emit(callTrace);
    await snapshot();
    const response = await invoke({
      provider: 'fireworks',
      model,
      key: apiKey,
      system: sourceSearchSystem,
      prompt: `Research request:\n${testCase.request}\n\nResearcher-controlled source selection criteria (mandatory):\n${selectionCriteria}\n\nAvailable broad web search: ${webProvider || 'not configured; requests for web will be recorded as unavailable'}\n\nCurrent source-search ledger:\n${JSON.stringify(sourceSearchContext(memory))}${correction}\n\nThis is a read-only evaluation. import_source is simulated as would-import without writing. Choose exactly one next operation and return JSON only.`,
      outputFormat: 'json',
      outputSchema: 'source_search_tool_v1',
      maxOutput: 16384,
      effort: 'max',
      taskKind: 'search',
    });
    inputTokens += response.inputTokens;
    outputTokens += response.outputTokens;
    Object.assign(callTrace, {
      status: 'model_completed',
      model_latency_ms: Math.round(performance.now() - callStarted),
      input_tokens: response.inputTokens,
      output_tokens: response.outputTokens,
      response_text: response.text,
    });
    emit(callTrace);
    await snapshot();
    let action: SourceSearchAction;
    let proposedTool = 'unparseable';
    try {
      const raw = JSON.parse(response.text) as {
        data?: { tool?: unknown };
      };
      if (typeof raw.data?.tool === 'string') proposedTool = raw.data.tool;
      const decision = resultSchema.parse(raw);
      action = validateSourceSearchAction(decision, memory);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message.slice(0, 1000)
          : 'The response did not satisfy the source-search operation contract.';
      validationErrors.push({
        call: modelCalls,
        detail,
        proposed_tool: proposedTool,
      });
      Object.assign(callTrace, {
        status: 'validation_rejected',
        proposed_tool: proposedTool,
        validation_error: detail,
      });
      emit(callTrace);
      correction = `\n\nPrevious operation rejected by the deterministic validator: ${JSON.stringify(detail)}. Do not repeat it. Return a corrected action that follows the ledger sequence exactly: triage_results shortlist or inspect_result before resolve_full_text; resolve_full_text before import_source or save_source_lead.`;
      await snapshot();
      continue;
    }
    correction = '';
    let candidates: SourceCandidate[] = [];
    let outcome = '';
    let status: 'completed' | 'unavailable' | 'blocked' = 'completed';
    const known = sourceCandidates(memory);
    if (action.tool === 'search') {
      const found = await runConnectorSearch(action, {
        webProvider,
        webKey,
        dplaKey: process.env.DPLA_API_KEY,
      });
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
    } else if (action.tool === 'triage_results') {
      candidates = action.decisions.map((item) => {
        const candidate = known.get(item.result_id);
        if (!candidate)
          throw new Error(`Model selected unknown result ${item.result_id}`);
        return sourceCandidate.parse({
          ...candidate,
          verification_level:
            candidate.verification_level === 'metadata' && candidate.snippet
              ? 'abstract'
              : candidate.verification_level,
        });
      });
      const shortlisted = action.decisions.filter(
        (item) => item.decision === 'shortlist',
      ).length;
      outcome = `Batch triage recorded item by item: ${shortlisted} shortlisted and ${action.decisions.length - shortlisted} rejected.`;
    } else if ('result_id' in action) {
      const candidate = known.get(action.result_id);
      if (!candidate)
        throw new Error(`Model selected unknown result ${action.result_id}`);
      if (action.tool === 'resolve_full_text') {
        const resolved = await resolveSourceCandidate(candidate, fetch);
        candidates = [resolved];
        outcome =
          resolved.download_status === 'verified'
            ? `Verified public file (${resolved.resolved_media_type}).`
            : resolved.resolution_note || 'No public file could be verified.';
      } else {
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
          action.tool === 'reject_result'
            ? 'One inspected candidate was explicitly rejected.'
            : action.tool === 'save_source_lead'
              ? 'Relevant candidate saved as an actionable lead after resolution was attempted.'
              : action.tool === 'import_source'
                ? candidate.download_status === 'verified'
                  ? 'Read-only evaluation: verified file would be imported.'
                  : 'Read-only evaluation: import would be blocked because no file was verified.'
                : 'Bibliographic metadata and available abstract inspected.';
      }
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
    operations++;
    Object.assign(callTrace, {
      status: 'operation_completed',
      action,
      operation_status: status,
      outcome,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        provider: candidate.provider,
        title: candidate.title,
        issued_date: candidate.issued_date,
        institution: candidate.institution,
        verification_level: candidate.verification_level,
        download_status: candidate.download_status,
        resolution_note: candidate.resolution_note,
      })),
      cumulative_input_tokens: inputTokens,
      cumulative_output_tokens: outputTokens,
      elapsed_ms: Math.round(performance.now() - started),
    });
    emit(callTrace);
    await snapshot();
  }
  if (!memory.stopped) {
    memory.stopped = true;
    memory.stop_reason =
      operations >= maxSteps
        ? 'Evaluation operation limit reached.'
        : `Evaluation model-call limit reached after ${validationErrors.length} rejected operation(s).`;
  }
  const report = {
    case: testCase,
    model,
    effort: 'max',
    selection_criteria: selectionCriteria,
    duration_ms: Math.round(performance.now() - started),
    model_calls: modelCalls,
    completed_operations: operations,
    validation_errors: validationErrors,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metrics: evaluateSourceSearchRun(testCase, memory),
    trace,
    memory,
  };
  reports.push(report);
  activeCheckpoint = null;
  emit({
    event: 'case_completed',
    case: testCase.id,
    duration_ms: report.duration_ms,
    model_calls: modelCalls,
    completed_operations: operations,
    stop_reason: memory.stop_reason,
    metrics: report.metrics,
  });
  await writeCheckpoint();
}

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
await fs.rm(checkpointTarget, { force: true });
console.log(
  `Saved ${reports.length} live source-search evaluations to ${target}`,
);
