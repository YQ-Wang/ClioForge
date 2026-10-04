import fs from 'node:fs/promises';
import path from 'node:path';

type Metrics = Record<string, unknown>;
type Report = {
  case: { id: string };
  duration_ms: number;
  model_calls: number;
  completed_operations: number;
  input_tokens: number;
  output_tokens: number;
  metrics: Metrics;
};
type Evaluation = {
  model: string;
  effort: string;
  web_provider: string;
  reports: Report[];
};

const files = process.argv.slice(2);
if (files.length !== 2)
  throw new Error(
    'Pass exactly two evaluation artifacts: baseline.json candidate.json',
  );

async function read(file: string): Promise<Evaluation> {
  const value = JSON.parse(await fs.readFile(file, 'utf8')) as Evaluation;
  if (!Array.isArray(value.reports))
    throw new Error(`Evaluation has no reports array: ${file}`);
  return value;
}

const [baseline, candidate] = await Promise.all(files.map(read));
const numericMetrics = [
  'candidate_count',
  'topic_term_coverage',
  'explicit_noise_hit_rate',
  'known_relevant_title_hit_count',
  'inspection_coverage',
  'disposition_coverage',
  'unreviewed_rate',
  'resolution_attempted_count',
  'retained_count',
  'rejected_count',
] as const;

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function summarize(evaluation: Evaluation) {
  const count = evaluation.reports.length || 1;
  const metrics = Object.fromEntries(
    numericMetrics.map((key) => [
      key,
      evaluation.reports.reduce(
        (total, report) => total + number(report.metrics[key]),
        0,
      ) / count,
    ]),
  );
  return {
    cases: evaluation.reports.length,
    model_calls: evaluation.reports.reduce(
      (total, report) => total + number(report.model_calls),
      0,
    ),
    completed_operations: evaluation.reports.reduce(
      (total, report) => total + number(report.completed_operations),
      0,
    ),
    input_tokens: evaluation.reports.reduce(
      (total, report) => total + number(report.input_tokens),
      0,
    ),
    output_tokens: evaluation.reports.reduce(
      (total, report) => total + number(report.output_tokens),
      0,
    ),
    duration_ms: evaluation.reports.reduce(
      (total, report) => total + number(report.duration_ms),
      0,
    ),
    metrics,
  };
}

const baselineSummary = summarize(baseline);
const candidateSummary = summarize(candidate);
const baselineCases = new Map(
  baseline.reports.map((report) => [report.case.id, report]),
);
const candidateCases = new Map(
  candidate.reports.map((report) => [report.case.id, report]),
);
const caseIds = [...baselineCases.keys()].filter((id) =>
  candidateCases.has(id),
);

const delta = Object.fromEntries(
  numericMetrics.map((key) => [
    key,
    number(candidateSummary.metrics[key]) -
      number(baselineSummary.metrics[key]),
  ]),
);

console.log(
  JSON.stringify(
    {
      warning:
        'Metric deltas are diagnostics, not a historical-quality verdict. Review the trace and candidate evidence manually.',
      baseline: {
        file: path.resolve(files[0]),
        provider: baseline.web_provider,
        model: baseline.model,
        effort: baseline.effort,
        summary: baselineSummary,
      },
      candidate: {
        file: path.resolve(files[1]),
        provider: candidate.web_provider,
        model: candidate.model,
        effort: candidate.effort,
        summary: candidateSummary,
      },
      candidate_minus_baseline: delta,
      matched_cases: caseIds.map((id) => ({
        id,
        baseline: baselineCases.get(id)?.metrics,
        candidate: candidateCases.get(id)?.metrics,
      })),
    },
    null,
    2,
  ),
);
