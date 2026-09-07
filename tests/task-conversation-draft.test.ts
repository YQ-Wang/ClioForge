import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conversationRequestBody,
  emptyConversationDraft,
  prepareConversationRequest,
  readConversationDraft,
  reconcileConversationDraft,
  writeConversationDraftIfUnchanged,
  type ConversationRequest,
} from '../lib/task-conversation-draft';

const request: ConversationRequest = {
  task_id: 'original-task',
  question: 'What evidence challenges this?',
  model_id: 'chosen-model',
  after_id: 'chosen-answer',
  extra_pages: [{ version_id: 'fixed-version', page: 3 }],
  locale: 'zh-CN',
  effort: 'max',
};
const requestId = '3615e3cb-aa2b-4e71-8d18-d39949c9888b';

void test('an older conversation response cannot overwrite a newer stored question', () => {
  const key = 'researcher:root-task';
  const submitted = {
    ...emptyConversationDraft(),
    question: request.question,
    pending: prepareConversationRequest(request, null, () => requestId),
  };
  const accepted = reconcileConversationDraft(
    submitted,
    [requestId],
    requestId,
  );
  const nextDraft = {
    ...accepted,
    question: 'New question after returning to the task',
    touched: true,
  };
  const entries = new Map([[key, JSON.stringify(nextDraft)]]);
  const storage = {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => {
      entries.set(name, value);
    },
  };
  assert.equal(
    writeConversationDraftIfUnchanged(storage, key, submitted, accepted),
    false,
  );
  assert.deepEqual(JSON.parse(entries.get(key)!), nextDraft);
  entries.set(key, JSON.stringify(submitted));
  assert.equal(
    writeConversationDraftIfUnchanged(storage, key, submitted, accepted),
    true,
  );
  assert.deepEqual(JSON.parse(entries.get(key)!), accepted);
});

void test('intentionally clearing a question survives reload without selecting a new context', () => {
  const cleared = {
    ...emptyConversationDraft('chosen-model', 'chosen-answer'),
    question: '',
    touched: true,
  };
  const restored = readConversationDraft(
    JSON.stringify(cleared),
    {
      ...emptyConversationDraft('different-model', 'new-answer'),
      question: 'Old question',
    },
    request.task_id,
  );
  assert.deepEqual(restored, cleared);
  assert.equal(
    reconcileConversationDraft(restored, ['new-answer'], 'new-answer'),
    restored,
  );
});

void test('a local follow-up draft retains every selection even before models have loaded', () => {
  const draft = {
    ...emptyConversationDraft(),
    question: request.question,
    model: request.model_id,
    effort: 'max' as const,
    after: request.after_id!,
    extra: 'fixed-version',
    pages: '3, 5-6',
    touched: true,
  };
  const restored = readConversationDraft(
    JSON.stringify(draft),
    emptyConversationDraft(),
    request.task_id,
  );
  assert.deepEqual(restored, draft);
  assert.equal(
    reconcileConversationDraft(restored, ['new-answer'], 'new-answer'),
    restored,
  );
});

void test('a late answer cannot replace a selected context or original-task-only draft', () => {
  for (const after of ['', 'chosen-answer']) {
    const draft = {
      ...emptyConversationDraft('model', after),
      question: 'In progress',
      touched: true,
    };
    assert.equal(
      reconcileConversationDraft(draft, ['new-answer'], 'new-answer'),
      draft,
    );
    const selectionOnly = { ...draft, question: '' };
    assert.equal(
      reconcileConversationDraft(selectionOnly, ['new-answer'], 'new-answer'),
      selectionOnly,
    );
  }
  assert.equal(
    reconcileConversationDraft(
      emptyConversationDraft(),
      ['new-answer'],
      'new-answer',
    ).after,
    'new-answer',
  );
});

void test('retry after a lost response preserves the exact request and id across reload and locale changes', () => {
  const pending = prepareConversationRequest(request, null, () => requestId);
  const recovered = readConversationDraft(
    JSON.stringify({ question: request.question, pending }),
    emptyConversationDraft('different-default', 'new-answer'),
    request.task_id,
  );
  const retried = prepareConversationRequest(
    {
      ...request,
      locale: 'en',
      model_id: 'different-default',
      after_id: 'new-answer',
      extra_pages: [],
    },
    recovered.pending,
    () => {
      throw new Error('Retry must not allocate another id');
    },
  );
  assert.deepEqual(conversationRequestBody(retried), {
    ...request,
    request_id: requestId,
  });
  assert.equal(recovered.extra, 'fixed-version');
  assert.equal(recovered.pages, '3');
  assert.equal(recovered.after, 'chosen-answer');
});

void test('polling reconciles an accepted request without erasing model or source preferences', () => {
  const pending = prepareConversationRequest(request, null, () => requestId);
  const draft = readConversationDraft(
    JSON.stringify({ question: request.question, pending }),
    emptyConversationDraft(),
    request.task_id,
  );
  const accepted = reconcileConversationDraft(draft, [requestId], requestId);
  assert.equal(accepted.pending, null);
  assert.equal(accepted.question, '');
  assert.equal(accepted.touched, false);
  assert.equal(accepted.model, request.model_id);
  assert.equal(accepted.extra, 'fixed-version');
  assert.equal(accepted.after, requestId);
});

void test('legacy question drafts recover and malformed or foreign pending requests cannot be sent', () => {
  const fallback = emptyConversationDraft('default-model', 'latest-answer');
  const legacy = readConversationDraft(
    JSON.stringify({ question: 'Saved question' }),
    fallback,
    request.task_id,
  );
  assert.equal(legacy.question, 'Saved question');
  assert.equal(legacy.model, 'default-model');
  assert.equal(legacy.touched, true);
  assert.equal(
    readConversationDraft('{broken', fallback, request.task_id),
    fallback,
  );
  const pending = prepareConversationRequest(request, null, () => requestId);
  const foreign = readConversationDraft(
    JSON.stringify({ question: 'Keep me', pending }),
    fallback,
    'different-task',
  );
  assert.equal(foreign.pending, null);
  assert.equal(foreign.question, 'Keep me');
});

void test('a selected-page follow-up survives a lost submission response without widening its scope', () => {
  const scoped = {
    ...request,
    extra_pages: [],
    source_pages: [
      { version_id: 'selected-version', page: 2 },
      { version_id: 'selected-version', page: 4 },
    ],
  };
  const pending = prepareConversationRequest(scoped, null, () => requestId);
  const restored = readConversationDraft(
    JSON.stringify({ question: 'Earlier draft', pending }),
    emptyConversationDraft(),
    request.task_id,
  );
  assert.equal(restored.scope, 'selected');
  assert.deepEqual(restored.selected, [
    { version_id: 'selected-version', pages: '2, 4' },
  ]);
  assert.deepEqual(conversationRequestBody(restored.pending!), {
    ...scoped,
    request_id: requestId,
  });
  const reconciled = reconcileConversationDraft(
    restored,
    [requestId],
    requestId,
  );
  assert.equal(reconciled.scope, 'selected');
  assert.deepEqual(reconciled.selected, restored.selected);
});
