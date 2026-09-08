import assert from 'node:assert/strict';
import test from 'node:test';
import { citationSpan, validCitationSpan } from '../lib/citation-location';
import { sourcePath } from '../lib/navigation';
import { sourceRoute } from '../lib/source-navigation';

void test('citations locate exact UTF-16 passages without relocating stale or ambiguous anchors', () => {
  const text = '參伍 📜 Adams wrote. Adams wrote.';
  const quote = 'Adams wrote.';
  const start = text.lastIndexOf(quote);
  assert.deepEqual(citationSpan(text, { quote, start }), {
    start,
    end: start + quote.length,
  });
  assert.equal(citationSpan(text, { quote }), null);
  assert.equal(citationSpan(text, { quote, start: 0 }), null);
  assert.deepEqual(citationSpan(text, { quote: '📜' }), { start: 3, end: 5 });
  assert.equal(citationSpan(text, { quote: '' }), null);
  assert.equal(citationSpan(text, { quote: 'missing' }), null);
  for (const [start, end] of [
    [-1, 2],
    [0, 999],
    [1.5, 3],
    [2, 2],
    [NaN, 2],
    [0, Infinity],
  ]) {
    assert.equal(validCitationSpan(text, start, end), null);
  }
});

void test('source links round-trip a temporary passage without changing annotations or accepting invalid bounds', () => {
  const project = 'project';
  const versions = [
    {
      id: 'version',
      project_id: project,
      source_id: 'source',
      pages: [{ page: 3, text: 'Read this exact passage.' }],
    },
  ];
  const span = citationSpan(versions[0].pages[0].text, {
    quote: 'exact passage',
  })!;
  const path = sourcePath(project, 'version', 3, span);
  assert.ok(!path.includes('exact'));
  assert.deepEqual(
    sourceRoute(path.slice(1) + '&annotation=saved', project, versions),
    {
      kind: 'source',
      sourceId: 'source',
      versionId: 'version',
      page: 3,
      annotationId: 'saved',
      ...span,
    },
  );
  const plain = sourcePath(project, 'version', 3).slice(1);
  for (const range of [
    '&start=-1&end=3',
    '&start=0&end=999',
    '&start=4',
    '&start=3&end=2',
  ]) {
    assert.deepEqual(
      sourceRoute(plain + range, project, versions),
      sourceRoute(plain, project, versions),
    );
  }
  assert.equal(
    sourceRoute(path.slice(1), 'foreign', versions).kind,
    'inactive',
  );
});
