import { z } from 'zod';
import { extractionSchema } from './platform/research-recipes';
import { citationSchema } from './platform/types';

// Drafts can contain temporarily empty labels and coverage while being edited.
const correctionDataSchema = extractionSchema.extend({
  coverage: z.string().max(2000),
  completeness: extractionSchema.shape.completeness
    .unwrap()
    .extend({ reason: z.string().max(2000) })
    .optional(),
  records: z
    .array(
      extractionSchema.shape.records.element.extend({
        label: z.string().max(200),
      }),
    )
    .max(20),
});
export const recordCorrectionDraftSchema = z.object({
  data: correctionDataSchema,
  revision: z.number().int().nonnegative(),
  reason: z.string().max(2000),
  quotes: z.array(citationSchema).max(100),
  quote: z.string().max(10000),
  page: z
    .object({ version_id: z.uuid(), page: z.number().int().positive() })
    .nullable(),
  focus: citationSchema.nullable(),
});
export type RecordCorrectionDraft = z.infer<typeof recordCorrectionDraftSchema>;

export function readRecordCorrectionDraft(
  raw: string,
): RecordCorrectionDraft | null {
  try {
    const parsed = recordCorrectionDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearRecordCorrectionDraftIfUnchanged(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
  submitted: RecordCorrectionDraft,
): boolean {
  const raw = storage.getItem(key);
  if (!raw) return false;
  const current = readRecordCorrectionDraft(raw);
  const expected = recordCorrectionDraftSchema.safeParse(submitted);
  if (
    !current ||
    !expected.success ||
    JSON.stringify(current) !== JSON.stringify(expected.data)
  )
    return false;
  storage.removeItem(key);
  return true;
}
