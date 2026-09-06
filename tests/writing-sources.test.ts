import test from 'node:test';
import assert from 'node:assert/strict';
import { writingSources } from '../lib/writing-sources';
import { writingPageReferences } from '../lib/writing-export';
import { WorkbenchStore } from '../lib/workbench-store';
import type { ResearchStore } from '../lib/store';
import type { WorkbenchData } from '../lib/workbench-types';

void test('saved excerpts and page citations include the locator once, with or without a bibliography entry', async (t) => {
  const project = '11111111-1111-4111-8111-111111111111';
  const version = '22222222-2222-4222-8222-222222222222';
  const otherVersion = '33333333-3333-4333-8333-333333333333';
  const origin = 'http://127.0.0.1:3000';
  t.mock.method(
    WorkbenchStore.prototype,
    'workbench',
    async () =>
      ({
        bibliography: [
          {
            id: 'entry',
            source_id: 'catalogued',
            csl: {
              type: 'book',
              title: 'Archive ledger',
              author: [{ literal: 'Archive' }],
            },
          },
        ],
        claims: [],
        claim_evidence: [],
      }) as unknown as WorkbenchData,
  );
  const store = {
    owner: 'researcher',
    db: {},
    async readProject() {
      return {
        sources: [
          { id: 'catalogued', title: 'Archive ledger' },
          { id: 'uncatalogued', title: 'Uncatalogued letter' },
        ],
        source_versions: [
          {
            id: version,
            source_id: 'catalogued',
            revision: 1,
            pages: [{ page: 7, text: 'Original passage' }],
          },
          {
            id: otherVersion,
            source_id: 'uncatalogued',
            revision: 1,
            pages: [{ page: 8, text: 'Letter passage' }],
          },
        ],
        evidence: [
          {
            id: 'excerpt',
            source_id: 'catalogued',
            version_id: version,
            page: 7,
            quote: 'Original passage',
          },
          {
            id: 'letter-excerpt',
            source_id: 'uncatalogued',
            version_id: otherVersion,
            page: 8,
            quote: 'Letter passage',
          },
        ],
      };
    },
  } as unknown as ResearchStore;
  const pageReferences = writingPageReferences(
    `[1](/?project=${project}&tab=sources&version=${version}&page=7)\n[2](/?project=${project}&tab=sources&version=${otherVersion}&page=8)`,
    null,
    origin,
  );
  const { citations } = await writingSources(
    store,
    project,
    origin,
    pageReferences,
  );
  assert.equal(citations.length, 4);
  for (const citation of citations) {
    const page = citation.href.endsWith('page=7') ? 7 : 8;
    assert.equal(
      citation.text.match(new RegExp(`\\b${page}\\b`, 'g'))?.length,
      1,
      citation.text,
    );
    if (page === 8) assert.match(citation.text, /Uncatalogued letter, p\. 8\./);
    assert.match(citation.text, /Canwoo version 1/);
    assert.ok(citation.href.startsWith(origin));
    if (citation.id.startsWith('page:'))
      assert.doesNotMatch(citation.text, /Original passage|Letter passage/);
  }
});
