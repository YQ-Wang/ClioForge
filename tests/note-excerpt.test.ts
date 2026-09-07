import assert from 'node:assert/strict';
import test from 'node:test';
import { noteExcerpt, noteMarkdown } from '../lib/notes';

void test('downloaded notes retain usable fixed-version links without rewriting source text', () => {
  const source =
    '/?project=adams&tab=sources&version=may-letter&page=1&evidence=quote';
  const body = `| Source |\n| --- |\n| [Letter](${source}) |\n\n[Archive](https://founders.archives.gov/documents/Adams/04-01-02-0259)\n\n\`[Example](${source})\`\n\n\`\`\`md\n[Example](${source})\n\`\`\``;
  const note = { title: 'Adams comparison', body };
  const exported = noteMarkdown(note, 'https://canwoo.com');
  assert.ok(exported.includes(`[Letter](https://canwoo.com${source})`));
  assert.ok(
    exported.includes(
      '[Archive](https://founders.archives.gov/documents/Adams/04-01-02-0259)',
    ),
  );
  assert.ok(exported.includes(`\`[Example](${source})\``));
  assert.ok(exported.includes(`\`\`\`md\n[Example](${source})\n\`\`\``));
  assert.equal(note.body, body);
  assert.equal(noteMarkdown(note), `# ${note.title}\n\n${body}\n`);
});

void test('note cards display rich text without markdown and preserve literal symbols', () => {
  const document = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Ost', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'ia ** uncertain_1' },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: '核查原文。' }] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Name' }],
                  },
                ],
              },
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Place' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(
    noteExcerpt('**Ost**ia', document),
    'Ostia ** uncertain_1 核查原文。 Name Place',
  );
  assert.equal(noteExcerpt('Retained text', '{broken'), 'Retained text');
  assert.equal(noteExcerpt('x'.repeat(300)).length, 220);
});

void test('drawing-only notes show their caption instead of appearing empty', () => {
  const document = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'drawing',
        attrs: {
          caption: 'Relationships between the five letters',
          preview: 'data:image/png;base64,AA==',
          scene: JSON.stringify({ elements: [] }),
        },
      },
    ],
  });
  assert.equal(
    noteExcerpt('', document),
    'Relationships between the five letters',
  );
});
