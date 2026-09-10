import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, projectRows } from '../lib/client-api';
import { withNoteState, noteRoot } from '../lib/notes';
import type { Note } from '../lib/types';

void test('paged clients preserve all records and reject failed continuations', async (t) => {
  const requests: URL[] = [];
  let fail = false;
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    const url = new URL(path, 'https://clioforge.test');
    requests.push(url);
    if (!url.searchParams.has('before'))
      return Response.json({ rows: [{ id: 'new' }], next: '42' });
    return fail
      ? Response.json(
          { error: 'Try later' },
          { status: 429, headers: { 'Retry-After': '17' } },
        )
      : Response.json({ rows: [{ id: 'old' }], next: null });
  });
  assert.deepEqual(await projectRows('project', 'notes'), [
    { id: 'new' },
    { id: 'old' },
  ]);
  assert.equal(requests[1].searchParams.get('before'), '42');
  fail = true;
  await assert.rejects(
    projectRows('project', 'notes'),
    (e: unknown) =>
      e instanceof ApiError && e.status === 429 && e.retryAfter === 17,
  );
});
void test('paged clients propagate cancellation and refuse a nonadvancing cursor', async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(
    globalThis,
    'fetch',
    async (_path: string, options: RequestInit) => {
      assert.equal(options.signal, controller.signal);
      calls++;
      return Response.json({ rows: [], next: '42' });
    },
  );
  await assert.rejects(
    projectRows('project', 'notes', controller.signal),
    /分页/,
  );
  assert.equal(calls, 2);
});
void test('HTML gateway failures produce a useful error without retrying a write', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('<html>gateway</html>', { status: 502 });
  });
  await assert.rejects(
    api('/api/workspace', { action: 'save_note' }),
    (e: unknown) =>
      e instanceof ApiError && e.status === 502 && !e.message.includes('JSON'),
  );
  assert.equal(calls, 1);
});
void test('malformed collection pages stop immediately instead of looping or returning partial data', async (t) => {
  let response: unknown;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json(response);
  });
  for (const value of [
    null,
    {},
    { rows: null, next: null },
    { rows: [], next: undefined },
    ...['oops', '', '0', '-1', '1e3', '01', '9007199254740992', 42].map(
      (next) => ({ rows: [{ id: 'partial' }], next }),
    ),
  ]) {
    response = value;
    calls = 0;
    await assert.rejects(
      projectRows('project', 'notes'),
      (e: unknown) => e instanceof ApiError && e.status === 502,
    );
    assert.equal(calls, 1);
  }
  calls = 0;
  await assert.rejects(projectRows('project', 'notes', undefined, 'invalid'));
  assert.equal(calls, 0);
});

void test('a malformed continuation never publishes the first page as a complete collection', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    assert.ok(calls <= 2, 'Invalid pagination must not keep requesting pages');
    return Response.json(
      calls === 1
        ? { rows: [{ id: 'first' }], next: '42' }
        : { rows: [{ id: 'second' }], next: 'invalid' },
    );
  });
  await assert.rejects(projectRows('project', 'notes'), /分页/);
  assert.equal(calls, 2);
});
void test('long note histories retain root state without repeated ancestry scans', () => {
  const notes: Note[] = Array.from({ length: 20000 }, (_, i) => ({
    id: String(i),
    project_id: 'project',
    parent_id: i ? String(i - 1) : null,
    revision: i + 1,
    title: 'Research note',
    body: 'text',
    created_at: '2026-09-06',
  })).reverse();
  const started = process.cpuUsage();
  const result = withNoteState(notes, [
    { note_id: '0', pinned: 1, archived: 1 },
  ]);
  const used = process.cpuUsage(started);
  assert.ok(used.user + used.system < 5_000_000);
  assert.ok(
    result.every(
      (note) => note.root_id === '0' && note.pinned && note.archived,
    ),
  );
  assert.equal(noteRoot(notes[0], notes).id, '0');
  assert.equal(notes[0].root_id, undefined);
  const missing = { ...notes[0], parent_id: 'missing' };
  assert.equal(withNoteState([missing], [])[0].root_id, missing.id);
});

void test('snapshot loading passes the same insertion checkpoint to every collection', async (t) => {
  const { loadSnapshot } = await import('../lib/client-api');
  const bounds = {
    sources: '10',
    source_versions: '20',
    notes: '30',
    note_state: '40',
    evidence: '50',
    research_runs: '60',
  };
  const collections: string[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    const params = new URL(path, 'https://clioforge.test').searchParams;
    const collection = params.get('collection');
    if (!collection)
      return Response.json({
        project: { id: 'project' },
        models: [],
        checkpoint: bounds,
      });
    collections.push(collection);
    assert.equal(
      params.get('before'),
      bounds[collection as keyof typeof bounds],
    );
    return Response.json({ rows: [], next: null });
  });
  const data = await loadSnapshot('project');
  assert.deepEqual(data.source_versions, []);
  assert.deepEqual(collections.sort(), Object.keys(bounds).sort());
});
