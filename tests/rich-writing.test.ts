import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRichDocument,
  richMarkdown,
  type RichNode,
} from '../lib/rich-document';
import { draftRecord } from '../lib/drafts';
import { agentRecipe } from '../lib/platform/research-recipes';
import { validateGraph } from '../lib/platform/types';
const document: RichNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Compare declarations',
          marks: [
            {
              type: 'textStyle',
              attrs: { fontFamily: 'Georgia, serif', fontSize: '20px' },
            },
            {
              type: 'link',
              attrs: {
                href: '/?project=project&tab=sources&version=source&page=1&evidence=evidence',
              },
            },
          ],
        },
        { type: 'inlineMath', attrs: { latex: 'P(H | E)' } },
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
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Date' }],
                },
              ],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '1863' }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'drawing',
      attrs: {
        preview: 'data:image/png;base64,AA==',
        scene: JSON.stringify({
          elements: [{ type: 'rectangle', id: 'shape' }],
        }),
        caption: 'Policy and implementation',
      },
    },
  ],
};
void test('complete drafts preserve editable drawings, fonts, tables and LaTeX; search text retains exact citation links', () => {
  const serialized = JSON.stringify(document),
    restored = draftRecord.parse({
      updatedAt: new Date().toISOString(),
      value: {
        kind: 'note',
        entityId: 'new',
        title: 'Draft',
        text: richMarkdown(document),
        document: serialized,
      },
    });
  assert.deepEqual(parseRichDocument(restored.value.document!), document);
  assert.match(
    restored.value.text,
    /\[Compare declarations\]\(\/\?project=project&tab=sources&version=source&page=1&evidence=evidence\)/,
  );
  assert.match(restored.value.text, /\$P\(H \| E\)\$/);
  assert.match(restored.value.text, /\| Date \|\n\| --- \|\n\| 1863 \|/);
  assert.match(restored.value.text, /Policy and implementation/);
  assert.doesNotMatch(restored.value.text, /base64|fontFamily/);
});
void test('untrusted rich documents reject external drawing previews, embedded sites and excessive depth', () => {
  const unsafe = structuredClone(document);
  unsafe.content![2].attrs!.preview = 'https://tracking.example/pixel.png';
  assert.throws(() => parseRichDocument(JSON.stringify(unsafe)));
  unsafe.content![2].attrs!.preview = 'data:image/png;base64,AA==';
  unsafe.content![2].attrs!.scene = JSON.stringify({
    elements: [{ type: 'embeddable' }],
  });
  assert.throws(() => parseRichDocument(JSON.stringify(unsafe)));
  let nested: RichNode = { type: 'paragraph' };
  for (let i = 0; i < 30; i++)
    nested = { type: 'blockquote', content: [nested] };
  assert.throws(() =>
    parseRichDocument(JSON.stringify({ type: 'doc', content: [nested] })),
  );
});
void test('research discussion has three bounded model turns and researcher feedback gates synthesis and publication', () => {
  const version = crypto.randomUUID();
  const draft = agentRecipe({
    method: {
      title: 'Policy and implementation',
      kind: 'seminar',
      instructions: 'Does this declaration establish actual implementation?',
      fields: ['Interpretation'],
    },
    pages: [{ version_id: version, page: 2 }],
    model_id: crypto.randomUUID(),
    input_rate: 0.15,
    output_rate: 0.5,
    locale: 'en',
    comparisonText: 'The policy was universally implemented.',
  });
  validateGraph(draft.tasks);
  const models = draft.tasks.filter((t) => t.executor === 'model');
  assert.equal(models.length, 3);
  const feedback = draft.tasks.find(
    (t) => t.input.parameters.gate === 'discussion',
  )!;
  assert.ok(models[1].dependencies.includes(models[0].id));
  assert.ok(models[2].dependencies.includes(feedback.id));
  assert.equal(feedback.executor, 'human');
  for (const t of models) {
    assert.equal(t.input.parameters.require_citations, true);
    assert.deepEqual(t.input.page_refs, [{ version_id: version, page: 2 }]);
    assert.match(t.input.prompt, /not independent evidence/);
  }
  assert.equal(models[2].input.effort, 'max');
  assert.match(
    models[2].input.prompt,
    /Respond explicitly to the researcher feedback/,
  );
  const publish = draft.tasks.find((t) => t.kind === 'publish')!;
  assert.ok(
    publish.dependencies.some((id) =>
      draft.tasks.some(
        (t) => t.id === id && t.executor === 'human' && t.id !== feedback.id,
      ),
    ),
  );
});
