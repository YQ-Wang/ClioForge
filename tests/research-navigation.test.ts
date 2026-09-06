import test from 'node:test';
import assert from 'node:assert/strict';
import { missionPath, researchRoute } from '../lib/research-navigation';
import { readReviewDraft, removeReviewDraft } from '../lib/review-draft';

const project = '11111111-1111-4111-8111-111111111111';
const mission = '22222222-2222-4222-8222-222222222222';
const task = '33333333-3333-4333-8333-333333333333';
void test('mission links restore the task and view without crossing project boundaries', () => {
  const path = missionPath(project, mission, task, 'board');
  assert.deepEqual(researchRoute(path.slice(1), project), {
    mission,
    task,
    mode: 'board',
  });
  assert.equal(researchRoute(path.slice(1), mission).mission, '');
  assert.equal(
    researchRoute(path.replace('platform', 'sources').slice(1), project).task,
    '',
  );
  assert.equal(
    researchRoute(`?project=${project}&tab=platform&task=${task}`, project)
      .task,
    '',
  );
  assert.deepEqual(
    researchRoute(missionPath(project, mission, '', 'flow').slice(1), project),
    { mission, task: '', mode: 'flow' },
  );
  assert.deepEqual(researchRoute(missionPath(project).slice(1), project), {
    mission: '',
    task: '',
    mode: 'list',
  });
});
void test('review drafts preserve their original revision and reject corrupt or unbounded content', () => {
  const value = {
    humanText: 'Software acceptance: compare the fixed quotation.',
    reason: 'Check the alternative reading.',
    revision: 7,
  };
  assert.deepEqual(readReviewDraft(JSON.stringify(value)), value);
  for (const invalid of [
    'not JSON',
    JSON.stringify({ ...value, revision: -1 }),
    JSON.stringify({ ...value, humanText: 'a'.repeat(30001) }),
    JSON.stringify({ humanText: 'lost revision' }),
  ])
    assert.equal(readReviewDraft(invalid), null);
});
void test('a delayed save acknowledgement cannot delete a newer review draft', () => {
  const original = { humanText: 'First review', reason: '', revision: 7 };
  const newer = { ...original, humanText: 'Revised after checking the source' };
  let stored: string | null = JSON.stringify(newer);
  const storage = {
    getItem: () => stored,
    removeItem: () => {
      stored = null;
    },
  };
  assert.equal(removeReviewDraft(storage, 'review', original), false);
  assert.deepEqual(readReviewDraft(stored), newer);
  assert.equal(removeReviewDraft(storage, 'review', newer), true);
  assert.equal(stored, null);
});
