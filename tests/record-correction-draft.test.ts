import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRecordCorrectionDraftIfUnchanged,
  readRecordCorrectionDraft,
  type RecordCorrectionDraft,
} from '../lib/record-correction-draft';

const quote = {
  version_id: '3615e3cb-aa2b-4e71-8d18-d39949c9888b',
  page: 3,
  quote: 'Exact source quotation',
  start: 12,
};
const draft: RecordCorrectionDraft = {
  data: {
    coverage: 'Working coverage',
    records: [
      {
        label: 'A person',
        cells: [
          {
            field: 'Name',
            value: 'A corrected reading',
            status: 'inferred',
            citation: 1,
          },
        ],
      },
    ],
  },
  revision: 7,
  reason: 'The page shows a different name.',
  quotes: [quote],
  quote: 'An unfinished quotation',
  page: { version_id: quote.version_id, page: quote.page },
  focus: quote,
};

void test('a delayed correction success cannot clear a newer draft from a remounted editor', () => {
  const key = 'researcher:project:task';
  const entries = new Map([[key, JSON.stringify(draft)]]);
  const storage = {
    getItem: (name: string) => entries.get(name) ?? null,
    removeItem: (name: string) => {
      entries.delete(name);
    },
  };
  const nextDraft = {
    ...draft,
    reason: 'New correction after returning from the source',
  };
  entries.set(key, JSON.stringify(nextDraft));
  assert.equal(
    clearRecordCorrectionDraftIfUnchanged(storage, key, draft),
    false,
  );
  assert.deepEqual(readRecordCorrectionDraft(entries.get(key)!), nextDraft);
  assert.equal(
    clearRecordCorrectionDraftIfUnchanged(storage, key, nextDraft),
    true,
  );
  assert.equal(entries.has(key), false);
});

void test('a restored correction clears after confirmed save despite serialized property order', () => {
  const key = 'researcher:project:task';
  const { revision, ...rest } = draft;
  const entries = new Map([[key, JSON.stringify({ revision, ...rest })]]);
  const restored = readRecordCorrectionDraft(entries.get(key)!)!;
  assert.equal(
    clearRecordCorrectionDraftIfUnchanged(
      {
        getItem: (name) => entries.get(name) ?? null,
        removeItem: (name) => {
          entries.delete(name);
        },
      },
      key,
      restored,
    ),
    true,
  );
  assert.equal(entries.has(key), false);
});

void test('record correction drafts restore the full correction and original revision', () => {
  const recovered = readRecordCorrectionDraft(JSON.stringify(draft));
  assert.deepEqual(recovered, draft);
  assert.equal(recovered?.revision, 7);
  assert.deepEqual(recovered?.page, { version_id: quote.version_id, page: 3 });
});

void test('in-progress corrections may have temporarily empty labels and coverage', () => {
  const incomplete = {
    ...draft,
    reason: '',
    data: { coverage: '', records: [{ ...draft.data.records[0], label: '' }] },
  };
  assert.deepEqual(
    readRecordCorrectionDraft(JSON.stringify(incomplete)),
    incomplete,
  );
});

void test('a malformed revision, extraction or quotation rejects the entire stored correction', () => {
  for (const invalid of [
    { ...draft, revision: -1 },
    { ...draft, revision: undefined },
    {
      ...draft,
      data: { ...draft.data, records: [{ label: 'No fields', cells: [] }] },
    },
    { ...draft, quotes: [{ ...quote, page: 0 }] },
    { ...draft, page: { ...draft.page, version_id: 'invalid' } },
  ])
    assert.equal(readRecordCorrectionDraft(JSON.stringify(invalid)), null);
  assert.equal(readRecordCorrectionDraft('invalid json'), null);
});
