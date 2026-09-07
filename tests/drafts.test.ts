import test from 'node:test';
import assert from 'node:assert/strict';
import {
  draftPrefix,
  discardDraft,
  draftRecord,
  readDrafts,
  prepareReadingRequest,
  confirmReadingRequest,
} from '../lib/drafts';

function browserStorage(entries: Map<string, string>) {
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
  } as Storage;
}
const reading = {
  kind: 'reading' as const,
  entityId: 'saved-excerpt',
  sourceId: 'source',
  versionId: 'fixed-version',
  page: 3,
  title: 'How should we read this phrase?',
  text: 'An unfinished comment.',
  question: 'Does the source distinguish these people?',
};

void test('reading drafts preserve a pending comment and assistant question alongside existing source and note drafts', () => {
  const prefix = draftPrefix('reader', 'project');
  const entries = new Map([
    [
      prefix + 'reading:saved-excerpt',
      JSON.stringify({ updatedAt: '2026-09-05T12:00:00Z', value: reading }),
    ],
    [
      prefix + 'note:note',
      JSON.stringify({
        updatedAt: '2026-09-05T11:00:00Z',
        value: {
          kind: 'note',
          entityId: 'note',
          title: 'Working note',
          text: 'n'.repeat(100000),
        },
      }),
    ],
    [
      prefix + 'source:source:fixed-version:3',
      JSON.stringify({
        updatedAt: '2026-09-05T10:00:00Z',
        value: {
          kind: 'source',
          entityId: 'source',
          sourceId: 'source',
          versionId: 'fixed-version',
          page: 3,
          title: 'Transcription',
          text: 'An unsaved correction.',
          ocrRunId: 'prior-ocr',
        },
      }),
    ],
    [
      draftPrefix('another-reader', 'project') + 'reading:saved-excerpt',
      JSON.stringify({
        updatedAt: '2026-09-05T13:00:00Z',
        value: { ...reading, text: 'Another account.' },
      }),
    ],
  ]);
  const result = readDrafts(browserStorage(entries), prefix);
  assert.deepEqual(
    result.map((draft) => draft.value.kind),
    ['reading', 'note', 'source'],
  );
  assert.deepEqual(result[0].value, reading);
  assert.equal(result[1].value.text.length, 100000);
  assert.equal(result[2].value.ocrRunId, 'prior-ocr');
  assert.equal(result[2].value.text, 'An unsaved correction.');
  assert.equal(
    readDrafts(browserStorage(entries), draftPrefix('reader', 'other-project'))
      .length,
    0,
  );
});

void test('a question-only reading draft survives storage parsing without becoming a note', () => {
  const value = { ...reading, text: '', question: 'What is uncertain here?' };
  const saved = draftRecord.parse(
    JSON.parse(JSON.stringify({ updatedAt: '2026-09-05', value })),
  );
  assert.equal(saved.value.kind, 'reading');
  assert.equal(saved.value.text, '');
  assert.equal(saved.value.question, 'What is uncertain here?');
  assert.equal(saved.value.entityId, 'saved-excerpt');
  assert.equal(saved.value.versionId, 'fixed-version');
  assert.equal(saved.value.page, 3);
});

void test('an invalid reading anchor is ignored without preventing recovery of other local drafts', () => {
  const prefix = draftPrefix('reader', 'project');
  const entries = new Map([
    [
      prefix + 'reading:missing-anchor',
      JSON.stringify({
        updatedAt: '2026-09-05',
        value: { ...reading, versionId: undefined },
      }),
    ],
    [
      prefix + 'reading:too-long-question',
      JSON.stringify({
        updatedAt: '2026-09-05',
        value: { ...reading, question: 'q'.repeat(2001) },
      }),
    ],
    [
      prefix + 'note:legacy',
      JSON.stringify({
        updatedAt: '2026-09-04',
        value: {
          kind: 'note',
          entityId: 'legacy',
          title: 'Older note',
          text: 'Keep this text.',
        },
      }),
    ],
    [prefix + 'broken', 'invalid json'],
  ]);
  const result = readDrafts(browserStorage(entries), prefix);
  assert.equal(result.length, 1);
  assert.equal(result[0].value.kind, 'note');
  assert.equal(result[0].value.text, 'Keep this text.');
  assert.equal(
    entries.size,
    4,
    'Parsing must never delete an entry that cannot currently be restored.',
  );
});

void test('a reading request restored after a lost response reuses its task id and preserves unsent comments', () => {
  const signature = JSON.stringify({
    model_id: crypto.randomUUID(),
    question: reading.question,
    effort: 'high',
  });
  const first = prepareReadingRequest(reading, signature);
  const restored = draftRecord.parse(
    JSON.parse(JSON.stringify({ updatedAt: '2026-09-05', value: first })),
  ).value;
  const retry = prepareReadingRequest(restored, signature);
  assert.equal(
    retry.readingRequest?.requestId,
    first.readingRequest?.requestId,
  );
  assert.equal(retry.readingRequest?.signature, signature);
  const confirmed = confirmReadingRequest(
    retry,
    retry.readingRequest!.requestId,
  );
  assert.equal(confirmed.readingRequest, undefined);
  assert.equal(confirmed.question, '');
  assert.equal(confirmed.text, reading.text);
  assert.equal(confirmed.entityId, reading.entityId);
});

void test('editing a question creates a new request while an older confirmation never erases newer writing', () => {
  const first = prepareReadingRequest(
    reading,
    JSON.stringify({ question: reading.question }),
  );
  const edited = {
    ...first,
    question: 'A different research question',
    text: 'A newer unfinished comment.',
  };
  const confirmed = confirmReadingRequest(
    edited,
    first.readingRequest!.requestId,
  );
  assert.equal(confirmed.question, edited.question);
  assert.equal(confirmed.text, edited.text);
  const next = prepareReadingRequest(
    edited,
    JSON.stringify({ question: edited.question }),
  );
  assert.notEqual(
    next.readingRequest?.requestId,
    first.readingRequest?.requestId,
  );
  assert.equal(
    confirmReadingRequest(next, first.readingRequest!.requestId),
    next,
  );
  assert.equal(next.question, edited.question);
  assert.equal(
    draftRecord.safeParse({
      updatedAt: '2026-09-05',
      value: {
        ...reading,
        readingRequest: { signature: '{}', requestId: 'invalid' },
      },
    }).success,
    false,
  );
});

void test('discarding a draft rejects other accounts and changed content, preserving all other entries', () => {
  const prefix = draftPrefix('reader', 'project');
  const key = prefix + 'reading:excerpt';
  const foreign = draftPrefix('other-reader', 'project') + 'reading:excerpt';
  const original = { updatedAt: '2026-09-07', value: reading };
  const entries = new Map([
    [key, JSON.stringify(original)],
    [foreign, JSON.stringify(original)],
  ]);
  const storage = browserStorage(entries);
  const expected = readDrafts(storage, prefix)[0];
  assert.equal(
    discardDraft(storage, prefix, { ...expected, key: foreign }),
    false,
  );
  entries.set(
    key,
    JSON.stringify({
      ...original,
      value: { ...reading, text: 'A newer edit at the same timestamp.' },
    }),
  );
  assert.equal(discardDraft(storage, prefix, expected), false);
  assert.match(storage.getItem(key)!, /newer edit/);
  assert.equal(
    discardDraft(storage, prefix, readDrafts(storage, prefix)[0]),
    true,
  );
  assert.equal(storage.getItem(key), null);
  assert.ok(storage.getItem(foreign));
});
