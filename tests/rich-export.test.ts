import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { XMLValidator } from 'fast-xml-parser';
import {
  writingCitationKey,
  writingPageReferences,
  writingDocx,
} from '../lib/writing-export';
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

void test('research-result page links become versioned footnotes in rich Word, Markdown and print exports', () => {
  const path =
    '/?project=11111111-1111-4111-8111-111111111111&tab=sources&version=22222222-2222-4222-8222-222222222222&page=1';
  const href = 'http://127.0.0.1:3000' + path;
  const pageCitation = {
    id: writingCitationKey(href, href)!,
    label: 'Archive page',
    text: 'HD010004, p. 1 (Canwoo version 1)',
    href,
    stale: true,
  };
  const rich = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '原文',
            marks: [{ type: 'link', attrs: { href: path } }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    [...writingPageReferences('', rich, 'http://127.0.0.1:3000')],
    [pageCitation.id],
  );
  for (const bytes of [
    richWritingDocx('Research', rich, [pageCitation]),
    writingDocx('Research', `[原文](${path})`, [pageCitation]),
  ]) {
    const files = unzipSync(bytes);
    assert.match(
      new TextDecoder().decode(files['word/document.xml']),
      /<w:footnoteReference w:id="1"/,
    );
    const notes = new TextDecoder().decode(files['word/footnotes.xml']);
    assert.match(notes, /HD010004/);
    assert.match(notes, /Canwoo version 1/);
    assert.match(notes, /127.0.0.1:3000/);
  }
  assert.match(
    writingPrintHTML('Research', '', rich, [pageCitation]),
    /note-1/,
  );
  assert.throws(() => richWritingDocx('Research', rich, []), /找不到/);
  const otherOrigin = rich.replace(path, 'https://other.invalid' + path);
  const external = unzipSync(
    richWritingDocx('Research', otherOrigin, [pageCitation]),
  );
  assert.doesNotMatch(
    new TextDecoder().decode(external['word/document.xml']),
    /<w:footnoteReference/,
  );
  assert.match(
    new TextDecoder().decode(external['word/_rels/document.xml.rels']),
    /https:\/\/other.invalid/,
  );
  assert.deepEqual(
    [...writingPageReferences('', otherOrigin, 'http://127.0.0.1:3000')],
    [],
  );
});

void test('external links with evidence parameters retain their label and URL instead of borrowing a saved source', () => {
  const localCitation = {
    ...citation,
    href: 'http://127.0.0.1:3000/?project=research&version=original&page=1',
  };
  for (const href of [
    'https://archive.example/?evidence=source',
    'http://127.0.0.1:3000/another-document?evidence=source',
    '/another-document?evidence=source',
  ]) {
    const rich = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'External source',
              marks: [{ type: 'link', attrs: { href } }],
            },
          ],
        },
      ],
    });
    const markdown = `[External source](${href})`;
    const plainFiles = unzipSync(
      writingDocx('Research', markdown, [localCitation]),
    );
    const richFiles = unzipSync(
      richWritingDocx('Research', rich, [localCitation]),
    );
    for (const files of [plainFiles, richFiles]) {
      const bodyXML = new TextDecoder().decode(files['word/document.xml']);
      assert.match(bodyXML, /External source/);
      assert.doesNotMatch(bodyXML, /<w:footnoteReference/);
      assert.doesNotMatch(
        new TextDecoder().decode(files['word/footnotes.xml']),
        /HD010004/,
      );
    }
    assert.ok(
      new TextDecoder().decode(plainFiles['word/document.xml']).includes(href),
    );
    assert.ok(
      new TextDecoder()
        .decode(richFiles['word/_rels/document.xml.rels'])
        .includes(new URL(href, localCitation.href).href),
    );
    for (const html of [
      writingPrintHTML('Research', '', rich, [localCitation]),
      writingPrintHTML('Research', markdown, null, [localCitation]),
    ]) {
      assert.match(html, /External source/);
      assert.ok(html.includes(href));
      assert.doesNotMatch(html, /id="note-1"/);
    }
  }
  const body = `[Saved source](${localCitation.href}&evidence=source)`;
  const localRich = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Saved source',
            marks: [
              {
                type: 'link',
                attrs: { href: `${localCitation.href}&evidence=source` },
              },
            ],
          },
        ],
      },
    ],
  });
  for (const bytes of [
    writingDocx('Research', body, [localCitation]),
    richWritingDocx('Research', localRich, [localCitation]),
  ]) {
    const files = unzipSync(bytes);
    assert.match(
      new TextDecoder().decode(files['word/document.xml']),
      /<w:footnoteReference w:id="1"/,
    );
    assert.match(
      new TextDecoder().decode(files['word/footnotes.xml']),
      /HD010004/,
    );
  }
});

void test('missing internal evidence and page references fail even when a local project has no saved citations', () => {
  const origin = 'http://127.0.0.1:3000';
  for (const path of [
    '/?evidence=missing',
    '/?project=11111111-1111-4111-8111-111111111111&tab=sources&version=22222222-2222-4222-8222-222222222222&page=1',
  ]) {
    for (const href of [path, origin + path]) {
      const rich = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Missing source',
                marks: [{ type: 'link', attrs: { href } }],
              },
            ],
          },
        ],
      });
      const body = `[Missing source](${href})`;
      assert.throws(() => writingDocx('Research', body, [], origin), /找不到/);
      assert.throws(
        () => richWritingDocx('Research', rich, [], origin),
        /找不到/,
      );
      assert.throws(
        () => writingPrintHTML('Research', body, null, [], origin),
        /找不到/,
      );
      assert.throws(
        () => writingPrintHTML('Research', '', rich, [], origin),
        /找不到/,
      );
    }
  }
});
