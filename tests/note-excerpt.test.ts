import assert from 'node:assert/strict';
import test from 'node:test';
import { noteExcerpt } from '../lib/notes';

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
