import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HighlightedText from '../app/highlighted-text';

void test('temporary citation focus preserves saved annotations and source text without creating extra annotation buttons', () => {
  const text = 'The letter proposes a petition, not a received petition.';
  const html = renderToStaticMarkup(
    createElement(HighlightedText, {
      text,
      focus: { start: 0, end: 30, quote: text.slice(0, 30) },
      highlights: [
        { id: 'saved', start: 11, end: 30, quote: text.slice(11, 30) },
      ],
      activeId: 'saved',
      onSelect: () => {},
      onSelection: () => {},
      label: 'Original letter',
    }),
  );
  assert.equal(html.replace(/<[^>]*>/g, ''), text);
  assert.equal((html.match(/role="button"/g) || []).length, 1);
  assert.match(html, /data-active="true"/);
  assert.match(html, /<mark/);
  assert.doesNotMatch(html, /temporary-citation-focus/);
});
