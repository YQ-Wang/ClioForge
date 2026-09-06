import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceCsv,
  evidenceDraft,
  evidenceMatrix,
  filterEvidence,
} from '../lib/evidence-library';
import { citedEvidence } from '../lib/writing-export';
import type { Evidence, Source, SourceVersion } from '../lib/types';

const project = crypto.randomUUID(),
  sourceA = crypto.randomUUID(),
  sourceB = crypto.randomUUID(),
  versionA = crypto.randomUUID(),
  versionB = crypto.randomUUID();
const sources: Source[] = [
  {
    id: sourceA,
    project_id: project,
    title: 'Decree of 1862',
    object_path: 'a.txt',
    media_type: 'text/plain',
    created_at: '2026-01-01',
  },
  {
    id: sourceB,
    project_id: project,
    title: 'Decree of 1863',
    object_path: 'b.txt',
    media_type: 'text/plain',
    created_at: '2026-01-02',
  },
];
const versions: SourceVersion[] = [
  {
    id: versionA,
    source_id: sourceA,
    project_id: project,
    revision: 2,
    pages: [{ page: 1, text: 'A passage.' }],
    method: 'manual',
    created_at: '2026-01-01',
  },
  {
    id: versionB,
    source_id: sourceB,
    project_id: project,
    revision: 1,
    pages: [{ page: 1, text: 'Another passage.' }],
    method: 'import',
    created_at: '2026-01-02',
  },
];
const first: Evidence = {
  id: crypto.randomUUID(),
  project_id: project,
  source_id: sourceA,
  version_id: versionA,
  page: 1,
  quote: 'A passage.',
  question: 'Where did the decree apply?',
  interpretation: 'A geographic qualification.',
  relation: 'supports',
  created_at: '2026-01-01',
};
const second: Evidence = {
  ...first,
  id: crypto.randomUUID(),
  source_id: sourceB,
  version_id: versionB,
  relation: 'challenges',
  quote: 'Another passage.',
  created_at: '2026-01-02',
};
const needsReview = new Set([first.id]);
void test('evidence search intersects passage, source, relationship and recheck filters without mutating the corpus', () => {
  const items = [first, second],
    filter = {
      query: 'decree',
      source: '',
      relation: '',
      question: '',
      review: false,
    };
  assert.deepEqual(
    filterEvidence(items, sources, filter, needsReview).map((e) => e.id),
    [second.id, first.id],
  );
  assert.deepEqual(
    filterEvidence(
      items,
      sources,
      {
        ...filter,
        query: 'GEOGRAPHIC',
        review: true,
        source: sourceA,
        relation: 'supports',
      },
      needsReview,
    ).map((e) => e.id),
    [first.id],
  );
  assert.equal(
    filterEvidence(
      items,
      sources,
      { ...filter, relation: 'challenges', review: true },
      needsReview,
    ).length,
    0,
  );
  assert.deepEqual(items, [first, second]);
});
void test('question/source cells keep supporting and challenging excerpts separate', () => {
  const matrix = evidenceMatrix([
    first,
    second,
    { ...first, id: crypto.randomUUID(), relation: 'context' },
  ]);
  assert.equal(matrix.size, 1);
  assert.deepEqual(matrix.get(first.question)!.get(sourceA), {
    supports: 1,
    challenges: 0,
    context: 1,
  });
  assert.deepEqual(matrix.get(first.question)!.get(sourceB), {
    supports: 0,
    challenges: 1,
    context: 0,
  });
});
void test('writing drafts retain fixed version, page, evidence links and source-change warnings for Word citations', () => {
  const draft = evidenceDraft(
    [first, second],
    sources,
    versions,
    needsReview,
    true,
  );
  assert.match(draft, /Source changed: review required/);
  assert.match(draft, /v2 · p.1/);
  assert.ok(draft.includes('](/?project='));
  assert.ok(!draft.includes('https://canwoo.com'));
  const refs = [first, second].map((e) => ({
    id: e.id,
    label: 'Source',
    text: e.quote,
    href: 'https://canwoo.com',
    stale: needsReview.has(e.id),
  }));
  const parsed = citedEvidence(draft, refs);
  assert.deepEqual(
    parsed.used.map((c) => c.id),
    [first.id, second.id],
  );
  assert.deepEqual(parsed.missing, []);
  assert.match(draft, /independent corroboration/);
});
void test('CSV exports selected evidence only and protects spreadsheet formulas while preserving multiline quotes', () => {
  const csv = evidenceCsv(
    [
      {
        ...first,
        question: '  =HYPERLINK("evil")',
        quote: 'line one\n"line two"',
      },
    ],
    sources,
    versions,
    needsReview,
    false,
  );
  assert.match(csv, /"'  =HYPERLINK\(""evil""\)"/);
  assert.ok(csv.includes('"line one\n""line two"""'));
  assert.ok(csv.includes(`evidence=${first.id}`));
  assert.ok(!csv.includes(second.id));
  assert.ok(csv.includes('"yes"'));
});
