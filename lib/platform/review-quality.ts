import { extractionSchema } from './research-recipes';
import type { MissionTask, TaskCorrection } from './types';

// Counts describe edits, not ground-truth accuracy. Ambiguous/renamed labels are
// deliberately counted as additions/removals rather than guessed row matches.
export function correctionChanges(correction: TaskCorrection) {
  const before = extractionSchema.safeParse(correction.body.before?.data);
  const after = extractionSchema.safeParse(correction.body.after.data);
  const result = {
    added: 0,
    removed: 0,
    values: 0,
    classifications: 0,
    citations: 0,
  };
  if (!before.success || !after.success) return result;
  const unique = (rows: typeof before.data.records, label: string) =>
    rows.filter((r) => r.label === label);
  for (const row of before.data.records) {
    const matches = unique(after.data.records, row.label);
    if (
      matches.length !== 1 ||
      unique(before.data.records, row.label).length !== 1
    ) {
      result.removed++;
      continue;
    }
    for (const cell of row.cells) {
      const next = matches[0].cells.find((c) => c.field === cell.field);
      if (!next || cell.value !== next.value) result.values++;
      if (!next || cell.status !== next.status) result.classifications++;
      const oldQuote = cell.citation
        ? correction.body.before?.citations[cell.citation - 1]
        : null;
      const newQuote = next?.citation
        ? correction.body.after.citations[next.citation - 1]
        : null;
      if (JSON.stringify(oldQuote) !== JSON.stringify(newQuote))
        result.citations++;
    }
  }
  result.added = after.data.records.filter(
    (row) =>
      unique(before.data.records, row.label).length !== 1 ||
      unique(after.data.records, row.label).length !== 1,
  ).length;
  return result;
}
export function reviewCoverage(tasks: MissionTask[]) {
  return tasks
    .filter((t) => t.input.parameters.extraction === true)
    .map((task) => {
      const parsed = extractionSchema.safeParse(task.result?.data);
      const uncertain =
        parsed.success &&
        parsed.data.records.some((r) =>
          r.cells.some((c) => c.status === 'inferred'),
        );
      // Stable systematic sampling independent of model confidence. A sample is a
      // suggestion to inspect, never an automatic acceptance.
      const sample =
        Array.from(task.id).reduce((n, c) => n + c.charCodeAt(0), 0) % 5 === 0;
      return {
        task,
        records: parsed.success ? parsed.data.records.length : 0,
        needsAttention:
          !!uncertain ||
          (parsed.success &&
            (parsed.data.records.length === 0 ||
              parsed.data.records.length === 20)) ||
          ['failed', 'uncertain', 'stale', 'rejected'].includes(task.status),
        sample,
      };
    });
}
