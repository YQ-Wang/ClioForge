import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { XMLValidator } from 'fast-xml-parser';
import {
  richWritingDocx,
  writingPrintHTML,
  equationOMML,
} from '../lib/rich-writing-export';
const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const citation = {
  id: 'source',
  label: 'Source',
  text: 'HD010004, p. 1. “parentes”',
  href: 'https://canwoo.com/?page=1',
  stale: true,
};
const document = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '$1 Compare $2',
          marks: [
            { type: 'bold' },
            {
              type: 'textStyle',
              attrs: {
                color: '#1d4ed8',
                backgroundColor: '#fef08a',
                fontSize: '20px',
              },
            },
          ],
        },
        {
          type: 'text',
          text: 'citation',
          marks: [
            {
              type: 'link',
              attrs: { href: 'https://canwoo.com/?evidence=source' },
            },
          ],
        },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              attrs: { colspan: 2 },
              content: [paragraph('Columns')],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { rowspan: 2 },
              content: [paragraph('1863')],
            },
            { type: 'tableCell', content: [paragraph('Reading')] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [paragraph('Continuation')] },
          ],
        },
      ],
    },
    { type: 'blockMath', attrs: { latex: 'x^2 + \\frac{a}{b}' } },
    {
      type: 'drawing',
      attrs: {
        scene: '{"elements":[]}',
        caption: '研究图示',
        preview:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2T6IAAAAASUVORK5CYII=',
      },
    },
  ],
});
void test('rich Word export preserves tables, merged cells, image bytes, native math, styling and source footnotes', () => {
  const files = unzipSync(richWritingDocx('Reading', document, [citation]));
  for (const [path, bytes] of Object.entries(files))
    if (path.endsWith('.xml') || path.endsWith('.rels'))
      // eslint-disable-next-line typescript/no-deprecated -- Keep the installed validator for export fixture checks.
      assert.equal(
        // eslint-disable-next-line typescript/no-deprecated -- Existing installed XML fixture validator.
        XMLValidator.validate(new TextDecoder().decode(bytes)),
        true,
        path,
      );
  const xml = new TextDecoder().decode(files['word/document.xml']);
  assert.match(xml, /\$1 Compare \$2/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:gridSpan w:val="2"/);
  assert.match(xml, /<w:vMerge\/>/);
  assert.match(xml, /<w:shd w:val="clear" w:fill="fef08a"/);
  assert.match(xml, /<m:f>/);
  assert.match(xml, /<m:sSup>/);
  assert.match(xml, /<w:drawing>/);
  assert.match(xml, /<w:footnoteReference w:id="1"/);
  assert.ok(files['word/media/diagram1.png']);
  assert.match(
    new TextDecoder().decode(files['word/footnotes.xml']),
    /HD010004/,
  );
  assert.match(
    new TextDecoder().decode(files['word/footnotes.xml']),
    /newer version/,
  );
  assert.throws(() => richWritingDocx('Reading', document, []), /找不到/);
});
void test('print export retains rich content, rendered equations and source notes without executing user markup', () => {
  const html = writingPrintHTML('<script>alert(1)</script>', '', document, [
    citation,
  ]);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /<table/);
  assert.match(html, /rowspan="2"/);
  assert.match(html, /<math/);
  assert.match(html, /data:image\/png/);
  assert.match(html, /id="note-1"/);
  assert.match(html, /background-color:#fef08a/);
  assert.match(equationOMML('\\sqrt{x_1}'), /<m:rad>/);
  assert.throws(() => equationOMML('\\unknownMacro'));
});
