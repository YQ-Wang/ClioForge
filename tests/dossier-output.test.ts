import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dossierPassages,
  resolveDossierCitations,
} from '../lib/dossier-output';
import { resultSchema } from '../lib/platform/types';
import { checkReadingOutput } from '../lib/reading-output';
import { providerRequest } from '../lib/providers';
const version = '741c075b-d088-4333-97a4-161fdd924c14';
const text =
  'I think I will get you to join me in a petition to Congress.\n\nDo not put such unlimited power into the hands of the Husbands.';
const pages = [
  {
    id: version,
    pages: [
      { page: 1, text },
      { page: 2, text: 'Unselected text.' },
    ],
  },
];
const refs = [{ version_id: version, page: 1 }];
const details = {
  limitations: ['No evidence of submission here.'],
  alternatives: ['The proposal [P1] might be rhetorical.'],
  next_steps: [
    'Look for a received petition record to test whether it was submitted.',
  ],
};
void test('dossier passage references resolve to exact fixed source spans with stable numbering', () => {
  const bank = dossierPassages(pages, refs);
  const result = resolveDossierCitations(
    resultSchema.parse({
      summary:
        'The legal concern [P2] differs from the proposed petition [P1]. Revisit that concern [P2].',
      citations: [],
      data: details,
    }),
    bank,
  );
  assert.ok(
    result.summary.startsWith(
      'The legal concern [1] differs from the proposed petition [2]. Revisit that concern [1].',
    ),
  );
  assert.match(result.summary, /Competing interpretations/);
  assert.match(result.summary, /received petition record/);
  assert.equal(result.citations.length, 2);
  for (const c of result.citations) {
    assert.equal(c.page, 1);
    assert.equal(text.slice(c.start, c.start! + c.quote.length), c.quote);
  }
  checkReadingOutput(result, true);
  assert.equal(bank.length, 2, 'Unselected pages must never enter the bank');
});
void test('dossier reference selection rejects invented, malformed and manually written citations', () => {
  const bank = dossierPassages(pages, refs);
  for (const summary of [
    'Claim [P999].',
    'Claim [P0].',
    'Claim [P-1] and [P1].',
    'Claim [P1-P2].',
    'Claim [P1.5] and [P2].',
    'Claim [1].',
    'Claim without a source.',
  ]) {
    assert.throws(() =>
      resolveDossierCitations(
        resultSchema.parse({
          summary,
          citations: [],
          data: details,
        }),
        bank,
      ),
    );
  }
  assert.throws(() =>
    resolveDossierCitations(
      resultSchema.parse({
        summary: 'Claim [P1].',
        citations: [{ version_id: version, page: 1, quote: 'Invented text' }],
      }),
      bank,
    ),
  );
});
void test('v1 passage segmentation preserves exact offsets through long lines and Unicode', () => {
  const original =
    ('漢'.repeat(479) + '😀' + ' abc ').repeat(5) + '\r\nLast line.';
  const bank = dossierPassages([
    { id: version, pages: [{ page: 1, text: original }] },
  ]);
  assert.equal(
    bank
      .map((p) => p.quote)
      .join('')
      .replace(/\s/g, ''),
    original.replace(/\s/g, ''),
  );
  assert.ok(
    bank.every(
      (p) =>
        p.quote.length <= 480 &&
        original.slice(p.start, p.start! + p.quote.length) === p.quote,
    ),
  );
  assert.ok(bank.every((p) => p.quote.isWellFormed()));
});
void test('dossier provider schema selects source references instead of generating quotation objects', () => {
  const request = providerRequest({
    provider: 'openrouter',
    model: 'test-model',
    key: 'test-only',
    system: 'Research',
    prompt: 'Read',
    outputFormat: 'json',
    outputSchema: 'dossier_answer_v1',
    sourceVersionIds: [version],
  });
  const schema = (
    request.body as {
      response_format: {
        json_schema: {
          schema: {
            properties: {
              citations: { maxItems: number };
              summary: { description: string };
            };
          };
        };
      };
    }
  ).response_format.json_schema.schema;
  assert.equal(schema.properties.citations.maxItems, 0);
  assert.match(schema.properties.summary.description, /\[P1\]/);
});

void test('grouped dossier citations preserve each explicitly selected passage', () => {
  const result = resolveDossierCitations(
    resultSchema.parse({
      summary: 'Both passages [P2, P1]; revisit [P1，P2].',
      citations: [],
      data: details,
    }),
    dossierPassages(pages, refs),
  );
  assert.ok(
    result.summary.startsWith('Both passages [1] [2]; revisit [2] [1].'),
  );
  assert.equal(result.citations.length, 2);
  checkReadingOutput(result, true);
});

void test('a dossier cannot omit competing readings or its next evidence plan', () => {
  assert.throws(() =>
    resolveDossierCitations(
      resultSchema.parse({
        summary: 'Proposal [P1].',
        citations: [],
        data: { limitations: [] },
      }),
      dossierPassages(pages, refs),
    ),
  );
});

void test('bare repeated passage IDs resolve to their source rather than a display citation number', () => {
  const result = resolveDossierCitations(
    resultSchema.parse({
      summary: 'The proposal [P1] and legal concern [P2].',
      citations: [],
      data: {
        ...details,
        alternatives: ['P2 concerns power, while P1 proposes a petition.'],
        limitations: ['P2 cannot establish submission.'],
      },
    }),
    dossierPassages(pages, refs).reverse(),
  );
  assert.match(result.summary, /\[2\] concerns power, while \[1\] proposes/);
  assert.deepEqual(result.data, {
    limitations: ['[2] cannot establish submission.'],
  });
  assert.doesNotMatch(result.summary, /\bP\d/);
  assert.equal(result.citations[1].quote, text.split('\n\n')[0]);
});

void test('bare passages cannot silently introduce new references or ambiguous ranges', () => {
  for (const alternative of [
    'P2 is new.',
    'P99 is missing.',
    'P1-P2',
    '[P1',
    'P1]',
  ])
    assert.throws(() =>
      resolveDossierCitations(
        resultSchema.parse({
          summary: 'Proposal [P1].',
          citations: [],
          data: { ...details, alternatives: [alternative] },
        }),
        dossierPassages(pages, refs),
      ),
    );
});
