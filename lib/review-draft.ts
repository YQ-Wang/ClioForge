import { z } from 'zod';
import { citationSchema } from './platform/types';

export const reviewDraftSchema = z.object({
  humanText: z.string().max(30000),
  reason: z.string().max(10000),
  revision: z.number().int().nonnegative(),
  citations: z.array(citationSchema).max(100).optional(),
});
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;
export function sameReviewDraft(a: ReviewDraft, b: ReviewDraft) {
  return (
    a.humanText === b.humanText &&
    a.reason === b.reason &&
    a.revision === b.revision &&
    JSON.stringify(a.citations) === JSON.stringify(b.citations)
  );
}
export function removeReviewDraft(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
  expected: ReviewDraft,
) {
  const current = readReviewDraft(storage.getItem(key));
  if (current && !sameReviewDraft(current, expected)) return false;
  storage.removeItem(key);
  return true;
}
export function readReviewDraft(value: string | null): ReviewDraft | null {
  try {
    const parsed = reviewDraftSchema.safeParse(JSON.parse(value || 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
