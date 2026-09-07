import test from 'node:test';
import assert from 'node:assert/strict';
import { spellingPrefixes, sourceMatchSnippet } from '../lib/search-matching';
void test('similar spellings are bounded Latin prefixes, not automatic identity or short-word expansion', () => {
  assert.deepEqual(
    spellingPrefixes(['adam', 'adams', 'john adams', 'li', '王', 'adam" OR *']),
    ['adam', 'john adam'],
  );
});
void test('matching snippets retain original offsets across accents, ligatures and collapsed whitespace', () => {
  const text =
    'e\u0301\n'.repeat(500) +
    ' '.repeat(600) +
    'The re\u0301publique kept oﬃcial records.';
  const snippet = sourceMatchSnippet(text, ['republique', 'official']);
  assert.ok(snippet.includes('re\u0301publique'));
  assert.ok(snippet.includes('oﬃcial'));
  assert.ok(text.includes(snippet));
  assert.equal(
    sourceMatchSnippet('A full page.', ['unmatched']),
    'A full page.',
  );
});
void test('snippets prioritize the requested name over an earlier expanded alias', () => {
  const text =
    'Abigail Adams\n' + 'Historical letter text. '.repeat(80) + '\nPortia';
  const snippet = sourceMatchSnippet(text, ['portia', 'abigail adams']);
  assert.ok(snippet.includes('Portia'));
  assert.ok(!snippet.includes('Abigail Adams'));
  assert.ok(text.includes(snippet));
  assert.ok(
    sourceMatchSnippet('Abigail Adams wrote this letter.', [
      'portia',
      'abigail adams',
    ]).includes('Abigail Adams'),
  );
});
