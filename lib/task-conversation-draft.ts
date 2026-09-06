import { z } from 'zod';

const requestSchema = z.object({
  task_id: z.string().min(1),
  question: z.string().min(1).max(2000),
  model_id: z.string().min(1),
  after_id: z.string().nullable(),
  extra_pages: z.array(
    z.object({
      version_id: z.string().min(1),
      page: z.number().int().positive(),
    }),
  ),
  locale: z.enum(['zh-CN', 'en']),
  effort: z.enum(['low', 'high', 'max']),
});
const pendingSchema = z.object({ id: z.uuid(), signature: z.string() });
const draftSchema = z.object({
  question: z.string().max(2000),
  model: z.string(),
  effort: z.enum(['low', 'high', 'max']),
  after: z.string(),
  extra: z.string(),
  pages: z.string(),
  touched: z.boolean(),
  pending: pendingSchema.nullable(),
});

export type ConversationRequest = z.infer<typeof requestSchema>;
export type ConversationDraft = z.infer<typeof draftSchema>;
export type PendingConversationRequest = z.infer<typeof pendingSchema>;

export function writeConversationDraftIfUnchanged(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  previous: ConversationDraft,
  next: ConversationDraft,
): boolean {
  const raw = storage.getItem(key);
  if (!raw) return false;
  let current: unknown;
  try {
    current = JSON.parse(raw);
  } catch {
    return false;
  }
  const parsed = draftSchema.safeParse(current);
  if (
    !parsed.success ||
    JSON.stringify(parsed.data) !== JSON.stringify(draftSchema.parse(previous))
  )
    return false;
  storage.setItem(key, JSON.stringify(next));
  return true;
}

export function emptyConversationDraft(
  model = '',
  after = '',
): ConversationDraft {
  return {
    question: '',
    model,
    effort: 'high',
    after,
    extra: '',
    pages: '1',
    touched: false,
    pending: null,
  };
}

export function readConversationDraft(
  raw: string | null,
  fallback: ConversationDraft,
  rootId: string,
): ConversationDraft {
  if (!raw) return fallback;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved))
      return fallback;
    // Missing fields belong to older question-only drafts.
    const parsed = draftSchema.safeParse({
      ...fallback,
      touched: true,
      ...saved,
    });
    if (!parsed.success) return fallback;
    const draft = parsed.data;
    if (!draft.pending) return draft;
    const payload = requestSchema.parse(JSON.parse(draft.pending.signature));
    if (payload.task_id !== rootId) return { ...draft, pending: null };
    // A pending request is immutable, including its original locale and source pages.
    return {
      ...draft,
      question: payload.question,
      model: payload.model_id,
      effort: payload.effort,
      after: payload.after_id || '',
      extra: payload.extra_pages[0]?.version_id || '',
      pages: payload.extra_pages.length
        ? payload.extra_pages.map((page) => page.page).join(', ')
        : draft.pages,
      touched: true,
    };
  } catch {
    return fallback;
  }
}

export function prepareConversationRequest(
  payload: ConversationRequest,
  pending: PendingConversationRequest | null,
  createId: () => string,
): PendingConversationRequest {
  return pending || { signature: JSON.stringify(payload), id: createId() };
}

export function conversationRequestBody(pending: PendingConversationRequest) {
  return {
    ...requestSchema.parse(JSON.parse(pending.signature)),
    request_id: pending.id,
  };
}

export function reconcileConversationDraft(
  draft: ConversationDraft,
  turnIds: string[],
  latestAnswerId: string,
): ConversationDraft {
  if (draft.pending && turnIds.includes(draft.pending.id)) {
    return {
      ...draft,
      question: '',
      pending: null,
      touched: false,
      after: latestAnswerId,
    };
  }
  // Polling may choose a new default only before the researcher starts a draft.
  if (
    !draft.touched &&
    !draft.question &&
    !draft.pending &&
    draft.after !== latestAnswerId
  )
    return { ...draft, after: latestAnswerId };
  return draft;
}
