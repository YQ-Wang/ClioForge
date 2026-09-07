import { z } from 'zod';
import { richDocumentString } from './rich-document';
const readingRequest = z.object({
  signature: z.string().min(1).max(6000),
  requestId: z.uuid(),
});
export const draftValue = z
  .object({
    kind: z.enum(['source', 'note', 'reading']),
    entityId: z.string(),
    sourceId: z.string().optional(),
    versionId: z.string().optional(),
    page: z.number().int().positive().optional(),
    ocrRunId: z.string().optional(),
    partial: z.boolean().optional(),
    title: z.string().max(2000),
    text: z.string().max(100000),
    document: richDocumentString.nullable().optional(),
    question: z.string().max(2000).optional(),
    readingRequest: readingRequest.optional(),
  })
  .refine(
    (value) =>
      value.kind !== 'reading' ||
      Boolean(
        value.entityId && value.sourceId && value.versionId && value.page,
      ),
    { message: 'A reading draft requires its saved excerpt and source page.' },
  );
export type DraftValue = z.infer<typeof draftValue>;
export const draftRecord = z.object({
  updatedAt: z.string(),
  value: draftValue,
});
export type DraftRecord = z.infer<typeof draftRecord> & { key: string };
export const draftPrefix = (user: string, project: string) =>
  `foliotrace:draft:${encodeURIComponent(user)}:${encodeURIComponent(project)}:`;
export function readDrafts(storage: Storage, prefix: string): DraftRecord[] {
  const drafts: DraftRecord[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const parsed = draftRecord.safeParse(
        JSON.parse(storage.getItem(key) || ''),
      );
      if (parsed.success) drafts.push({ key, ...parsed.data });
    } catch {
      /* A corrupt entry must not prevent opening other drafts. */
    }
  }
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// Keep the accepted request identity with the unsent question, so reloading the
// page after a lost response does not turn a retry into another model call.
export function prepareReadingRequest(
  value: DraftValue,
  signature: string,
): DraftValue {
  if (value.kind !== 'reading') throw new Error('Expected a reading draft.');
  const request = readingRequest.parse({
    signature,
    requestId:
      value.readingRequest?.signature === signature
        ? value.readingRequest.requestId
        : crypto.randomUUID(),
  });
  return { ...value, readingRequest: request };
}
export function confirmReadingRequest(
  value: DraftValue,
  requestId: string,
): DraftValue {
  if (value.kind !== 'reading' || value.readingRequest?.requestId !== requestId)
    return value;
  let originalQuestion: unknown;
  try {
    originalQuestion = (
      JSON.parse(value.readingRequest.signature) as { question?: unknown }
    ).question;
  } catch {
    /* An invalid signature must never erase a newer question. */
  }
  return {
    ...value,
    question:
      typeof originalQuestion === 'string' &&
      value.question?.trim() === originalQuestion
        ? ''
        : value.question,
    readingRequest: undefined,
  };
}

export function discardDraft(
  storage: Storage,
  prefix: string,
  expected: DraftRecord,
): boolean {
  if (!expected.key.startsWith(prefix)) return false;
  const raw = storage.getItem(expected.key);
  if (!raw) return true;
  const current = draftRecord.safeParse(JSON.parse(raw));
  if (
    !current.success ||
    current.data.updatedAt !== expected.updatedAt ||
    JSON.stringify(current.data.value) !== JSON.stringify(expected.value)
  )
    return false;
  storage.removeItem(expected.key);
  return true;
}
