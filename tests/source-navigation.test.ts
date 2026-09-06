import test from 'node:test';
import assert from 'node:assert/strict';
import { sourcePath } from '../lib/navigation';
import {
  canPublishReaderLocation,
  sourceRoute,
} from '../lib/source-navigation';

const project = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';
const annotation = '44444444-4444-4444-8444-444444444444';
const versions = [
  {
    id: first,
    project_id: project,
    source_id: 'source-one',
    pages: [
      { page: 1, text: 'First page' },
      { page: 2, text: 'Second page' },
    ],
  },
  {
    id: second,
    project_id: project,
    source_id: 'source-two',
    pages: [{ page: 1, text: 'Another source' }],
  },
];
const search = (version: string, page: number) =>
  sourcePath(project, version, page).slice(1);

void test('source history resolves every incoming source, page and annotation instead of retaining the previous reader', () => {
  const one = search(first, 2) + `&annotation=${annotation}`;
  const two = search(second, 1);
  assert.deepEqual(sourceRoute(one, project, versions), {
    kind: 'source',
    sourceId: 'source-one',
    versionId: first,
    page: 2,
    annotationId: annotation,
  });
  assert.deepEqual(sourceRoute(two, project, versions), {
    kind: 'source',
    sourceId: 'source-two',
    versionId: second,
    page: 1,
    annotationId: undefined,
  });
  // Back to the first URL restores its fixed page and highlight; Forward restores
  // the second source without carrying the previous annotation across.
  assert.deepEqual(sourceRoute(one, project, versions), {
    kind: 'source',
    sourceId: 'source-one',
    versionId: first,
    page: 2,
    annotationId: annotation,
  });
  assert.equal(sourceRoute(two, project, versions).kind, 'source');
  assert.deepEqual(
    sourceRoute(one.replace('annotation=', 'evidence='), project, versions),
    sourceRoute(one, project, versions),
  );
});

void test('an unreconciled Back or Forward URL blocks a kept reader from publishing its previous page', () => {
  const previous = search(second, 1),
    incoming = search(first, 2);
  assert.equal(canPublishReaderLocation(incoming, previous, project), false);
  assert.equal(canPublishReaderLocation(incoming, incoming, project), true);
  assert.equal(
    canPublishReaderLocation(
      incoming + `&annotation=${annotation}`,
      incoming,
      project,
    ),
    false,
  );
  assert.equal(
    canPublishReaderLocation(
      `?project=${project}&tab=platform`,
      previous,
      project,
    ),
    false,
  );
  assert.equal(
    canPublishReaderLocation(previous, previous, 'different-project'),
    false,
  );
});

void test('unavailable or foreign source links never silently select another version or page', () => {
  assert.deepEqual(sourceRoute(search(first, 3), project, versions), {
    kind: 'unavailable',
  });
  assert.deepEqual(sourceRoute(search(first, 1.5), project, versions), {
    kind: 'unavailable',
  });
  assert.deepEqual(sourceRoute(search(annotation, 1), project, versions), {
    kind: 'unavailable',
  });
  assert.deepEqual(sourceRoute(search(first, 1), project, []), {
    kind: 'unavailable',
  });
  assert.deepEqual(
    sourceRoute(search(first, 1), project, [
      { ...versions[0], project_id: second },
    ]),
    { kind: 'unavailable' },
  );
  assert.deepEqual(sourceRoute(search(first, 1), second, versions), {
    kind: 'inactive',
  });
  assert.deepEqual(
    sourceRoute(
      `?project=${project}&tab=platform&version=${first}&page=2`,
      project,
      versions,
    ),
    { kind: 'inactive' },
  );
  assert.deepEqual(
    sourceRoute(`?project=${project}&tab=sources`, project, versions),
    { kind: 'default' },
  );
});
