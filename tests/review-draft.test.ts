import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readReviewDraft,
  sameReviewDraft,
  removeReviewDraft,
} from '../lib/review-draft';
import { reviewDraftSource } from '../lib/review-citations';
import { taskInputSchema, type MissionTask } from '../lib/platform/types';

const citation = {
  version_id: '741c075b-d088-4333-97a4-161fdd924c14',
  page: 1,
  quote: 'A fixed source',
  start: 0,
};
const draft = {
  humanText: 'Reading [1]',
  reason: '',
  revision: 1,
  citations: [citation],
};

void test('review drafts retain source bindings and do not clear a concurrent citation edit', () => {
  assert.deepEqual(readReviewDraft(JSON.stringify(draft)), draft);
  const changed = { ...draft, citations: [{ ...citation, page: 2 }] };
  assert.equal(sameReviewDraft(draft, changed), false);
  let removed = false;
  assert.equal(
    removeReviewDraft(
      {
        getItem: () => JSON.stringify(changed),
        removeItem: () => {
          removed = true;
        },
      },
      'draft',
      draft,
    ),
    false,
  );
  assert.equal(removed, false);
  assert.ok(
    readReviewDraft(
      JSON.stringify({ humanText: 'Legacy', reason: '', revision: 1 }),
    ),
  );
});

void test('draft selection prefers the synthesis regardless of response order', () => {
  const parent = (
    id: string,
    stage: string,
    executor: MissionTask['executor'] = 'model',
  ) => ({
    id,
    executor,
    created_at: '2026-09-07T00:00:00Z',
    input: taskInputSchema.parse({ parameters: { dossier_stage: stage } }),
    result: { summary: id, citations: [citation], checks: [] },
  });
  const synthesis = parent('z', 'synthesis');
  const others = [parent('a', 'critique'), parent('b', '', 'builtin')];
  assert.equal(reviewDraftSource([...others, synthesis])?.id, 'z');
  assert.equal(reviewDraftSource([synthesis, ...others])?.id, 'z');
});
