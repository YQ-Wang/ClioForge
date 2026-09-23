import { z } from 'zod';
import { extractionSchema } from './research-recipes';
import {
  resultSchema,
  taskInputSchema,
  taskStates,
  type MissionTask,
} from './types';
export const comparisonOptions = z.object({
  field: z.string().min(1).max(80),
  accepted_only: z.boolean().default(true),
  include_inferred: z.boolean().default(false),
  deduplicate: z.boolean().default(true),
  source_groups: z.record(z.uuid(), z.string().trim().max(100)).default({}),
  one_per_group: z.boolean().default(false),
  date_field: z.string().max(80).default(''),
  year_from: z.number().int().min(1).max(9999).nullable().default(null),
  year_to: z.number().int().min(1).max(9999).nullable().default(null),
  include_undated: z.boolean().default(false),
});
// Count observations, not people or independent historical events. Exact source
// references are the only automatic deduplication key; aliases remain distinct.
export function studyComparison(
  tasks: Pick<MissionTask, 'id' | 'revision' | 'status' | 'input' | 'result'>[],
  raw: unknown,
) {
  const options = comparisonOptions.parse(raw);
  if (
    options.year_from !== null &&
    options.year_to !== null &&
    options.year_from > options.year_to
  )
    throw new Error('The start year must not follow the end year.');
  const counts = new Map<
    string,
    {
      value: string;
      count: number;
      references: {
        task_id: string;
        revision: number;
        version_id: string;
        page: number;
        quote: string;
        status: string;
      }[];
    }
  >();
  const seen = new Set<string>(),
    families = new Set<string>();
  const excluded = {
    unreviewed: 0,
    stale: 0,
    missing: 0,
    inferred: 0,
    duplicate: 0,
    dependent: 0,
    undated: 0,
    outside_dates: 0,
  };
  let records = 0,
    included = 0,
    incomplete = 0;
  const snapshots: {
    task_id: string;
    revision: number;
    status: string;
    result: MissionTask['result'];
    pages: MissionTask['input']['page_refs'];
  }[] = [];
  for (const task of tasks) {
    if (task.input.parameters.extraction !== true) continue;
    const data = extractionSchema.safeParse(task.result?.data);
    if (!data.success || !task.result) continue;
    snapshots.push({
      task_id: task.id,
      revision: task.revision,
      status: task.status,
      result: task.result,
      pages: task.input.page_refs,
    });
    if (data.data.completeness?.status !== 'complete') incomplete++;
    for (const record of data.data.records) {
      records++;
      if (task.status === 'stale') {
        excluded.stale++;
        continue;
      }
      if (options.accepted_only && task.status !== 'accepted') {
        excluded.unreviewed++;
        continue;
      }
      const cell = record.cells.find((c) => c.field === options.field);
      const citation = cell?.citation
        ? task.result.citations[cell.citation - 1]
        : undefined;
      if (!cell || cell.status === 'missing' || !cell.value || !citation) {
        excluded.missing++;
        continue;
      }
      if (!options.include_inferred && cell.status === 'inferred') {
        excluded.inferred++;
        continue;
      }
      if (
        options.date_field &&
        (options.year_from !== null || options.year_to !== null)
      ) {
        const date = record.cells.find((c) => c.field === options.date_field);
        const interval =
          date &&
          date.status !== 'missing' &&
          (options.include_inferred || date.status !== 'inferred')
            ? yearInterval(date.value)
            : null;
        if (!interval && !options.include_undated) {
          excluded.undated++;
          continue;
        }
        if (
          interval &&
          (interval.end < (options.year_from ?? 1) ||
            interval.start > (options.year_to ?? 9999))
        ) {
          excluded.outside_dates++;
          continue;
        }
      }
      const family = options.source_groups[citation.version_id];
      const familyKey = JSON.stringify([family, options.field, cell.value]);
      if (options.one_per_group && family && families.has(familyKey)) {
        excluded.dependent++;
        continue;
      }
      const key = JSON.stringify([
        options.field,
        cell.value,
        citation.version_id,
        citation.page,
        citation.start ?? null,
        citation.quote,
      ]);
      if (options.deduplicate && seen.has(key)) {
        excluded.duplicate++;
        continue;
      }
      seen.add(key);
      if (family) families.add(familyKey);
      included++;
      const item = counts.get(cell.value) || {
        value: cell.value,
        count: 0,
        references: [],
      };
      item.count++;
      item.references.push({
        task_id: task.id,
        revision: task.revision,
        ...citation,
        status: cell.status,
      });
      counts.set(cell.value, item);
    }
  }
  return {
    format: 'clioforge-comparison',
    version: 1,
    options,
    records,
    included,
    incomplete,
    excluded,
    groups: [...counts.values()].sort(
      (a, b) =>
        b.count - a.count ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    ),
    snapshots,
  };
}

export function replayComparison(raw: unknown) {
  const packet = z
    .object({
      format: z.literal('clioforge-comparison'),
      version: z.literal(1),
      options: comparisonOptions,
      snapshots: z
        .array(
          z.object({
            task_id: z.uuid(),
            revision: z.number().int().nonnegative(),
            status: z.enum(taskStates),
            result: resultSchema,
            pages: taskInputSchema.shape.page_refs,
          }),
        )
        .max(1200),
    })
    .parse(raw);
  return studyComparison(
    packet.snapshots.map((s) => ({
      id: s.task_id,
      revision: s.revision,
      status: s.status,
      result: s.result,
      input: taskInputSchema.parse({
        page_refs: s.pages,
        parameters: { extraction: true },
      }),
    })),
    packet.options,
  );
}

// Recognize year notation only. Keep calendars, uncertain identities and the raw
// value unchanged; unrecognized historical date strings stay unclassified.
export function yearInterval(raw: string | null) {
  if (!raw) return null;
  const value = raw.trim();
  const range = /^(\d{4})\s*(?:–|\.\.|\/)\s*(\d{4})$/.exec(value);
  if (range) {
    const start = Number(range[1]),
      end = Number(range[2]);
    return start > 0 && end >= start ? { start, end } : null;
  }
  const point = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(value);
  if (!point) return null;
  const year = Number(point[1]),
    month = Number(point[2]),
    day = Number(point[3]);
  if (
    year < 1 ||
    (point[2] && (month < 1 || month > 12)) ||
    (point[3] && (day < 1 || day > 31))
  )
    return null;
  return { start: year, end: year };
}
