import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResearchText from '../app/research-text';

void test('research reports preserve numbered next steps, including separated paragraphs', () => {
  const html = renderToStaticMarkup(
    createElement(ResearchText, {
      text: '1. Consult the original letter.\n2. Compare the reply.\n\n3. Check the archive.',
    }),
  );
  assert.match(
    html,
    /<ol><li value="1">Consult the original letter\.<\/li><li value="2">Compare the reply\.<\/li><\/ol>/,
  );
  assert.match(html, /<ol><li value="3">Check the archive\.<\/li><\/ol>/);
});

void test('only resolved citations become accessible source controls, including inside emphasis', () => {
  const html = renderToStaticMarkup(
    createElement(ResearchText, {
      text: '**A qualified conclusion [1]** with an unknown reference [9].',
      citationLink: (number) =>
        number === 1
          ? { label: 'Open the original letter, page 1', onOpen: () => {} }
          : undefined,
    }),
  );
  assert.match(html, /<strong>A qualified conclusion <button/);
  assert.match(html, /aria-label="Open the original letter, page 1"/);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, /unknown reference \[9\]/);
});

void test('report rendering escapes source HTML and does not activate unsafe links', () => {
  const html = renderToStaticMarkup(
    createElement(ResearchText, {
      text: '<script>alert(1)</script> [unsafe](javascript:alert(1))\n\n[Archive](https://example.org/letter)',
    }),
  );
  assert.doesNotMatch(html, /<script|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/example.org\/letter"/);
});
