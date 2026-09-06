import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { MissionStore } from '../lib/platform/missions';
import { submitHumanReview } from '../lib/platform/human-review';
import { taskInputSchema } from '../lib/platform/types';
import { HttpError } from '../lib/errors';
import { moveBoardTask } from '../lib/platform/task-board';
import { taskColumn } from '../lib/task-presentation';
import { researchInbox } from '../lib/research-inbox';
import { researchAttention } from '../lib/research-attention';
import dataset from '../fixtures/led-sample.json';

let mf: Miniflare, db: D1Database;
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
      compatibilityDate: '2026-09-04',
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const name of (await fs.readdir(new URL('../drizzle/', import.meta.url)))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = await fs.readFile(
      new URL('../drizzle/' + name, import.meta.url),
      'utf8',
    );
    for (const statement of sql.split(
      name.startsWith('0000') ? '--> statement-breakpoint' : '\n',
    ))
      if (statement.trim() && !statement.trim().startsWith('--'))
        await db.prepare(statement).run();
  }
});
after(async () => {
  await mf?.dispose();
});

async function researcher() {
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)',
    )
    .bind(id, 'Review tester', `${id}@example.test`, Date.now(), Date.now())
    .run();
  return new MissionStore(db, id);
}

async function fixture() {
  const store = await researcher();
  const project = await store.createProject(
    'Human submission regression',
    'Review the fixed inscription',
  );
  const source = crypto.randomUUID(),
    version = crypto.randomUUID();
  const record = dataset.records[0];
  await db.batch([
    db
      .prepare('INSERT INTO sources VALUES(?,?,?,?,?,?)')
      .bind(
        source,
        project.id,
        record.record_number,
        `test/${source}/original.txt`,
        'text/plain',
        new Date().toISOString(),
      ),
    db
      .prepare('INSERT INTO source_versions VALUES(?,?,?,?,?,?,?)')
      .bind(
        version,
        source,
        project.id,
        1,
        JSON.stringify([{ page: 1, text: record.text }]),
        'import',
        new Date().toISOString(),
      ),
  ]);
  const parent = crypto.randomUUID(),
    human = crypto.randomUUID(),
    publish = crypto.randomUUID();
  const input = taskInputSchema.parse({ version_ids: [version] });
  const mission = await store.create(project.id, {
    title: 'Inspect an inscription',
    question: 'What does the fixed source establish?',
    scope: 'One source',
    acceptance: 'A documented review',
    tasks: [
      {
        id: parent,
        title: 'Read source',
        kind: 'compute',
        executor: 'builtin',
        dependencies: [],
        input,
      },
      {
        id: human,
        title: 'Review source',
        assignee: store.owner,
        kind: 'review',
        executor: 'human',
        dependencies: [parent],
        input,
      },
      {
        id: publish,
        title: 'Assemble finding',
        kind: 'publish',
        executor: 'builtin',
        dependencies: [human],
        input,
      },
    ],
  });
  await store.control(mission, 'start');
  const claimed = await store.claim(parent, store.owner, 'builtin');
  const citation = {
    version_id: version,
    page: 1,
    quote: 'M Aurelio Commodo Antonino',
    start: 0,
  };
  await store.submit(parent, claimed.lease, store.owner, {
    summary: 'A fixed-source candidate',
    citations: [citation],
  });
  const task = await store.task(human);
  const submission = {
    summary:
      'Software acceptance only: the quoted names occur in this inscription; missing dates remain unknown.',
    expected: task.revision,
  };
  return {
    store,
    project,
    mission,
    parent,
    human,
    publish,
    citation,
    submission,
  };
}

function status(code: number) {
  return (error: unknown) =>
    error instanceof HttpError && error.status === code;
}

async function move(
  f: Awaited<ReturnType<typeof fixture>>,
  target: 'active' | 'waiting' | 'review' | 'planned' | 'done',
  overrides = {},
) {
  const view = await f.store.view(f.mission);
  return moveBoardTask(f.store, f.project.id, f.mission, {
    task_id: f.human,
    target,
    before_id: null,
    expected: view.board!.revision,
    task_revision: view.tasks.find((t) => t.id === f.human)!.revision,
    ...overrides,
  });
}

void test('shared human work arrangement persists without creating an execution or accepting a result', async () => {
  const f = await fixture(),
    original = await f.store.task(f.human);
  for (const target of ['active', 'waiting', 'planned', 'review'] as const) {
    await move(f, target);
    const fresh = await new MissionStore(db, f.store.owner).view(f.mission);
    const task = fresh.tasks.find((t) => t.id === f.human)!;
    assert.equal(taskColumn(task, fresh.mission), target);
    assert.equal(task.status, original.status);
    assert.equal(task.revision, original.revision);
    assert.equal(task.result, null);
    assert.equal(task.attempt, 0);
    const inbox = (await researchInbox(f.store)).items.find(
      (t) => t.title === task.title,
    )!;
    assert.equal(
      inbox.detail,
      target === 'review' ? 'ready' : `human_${target}`,
    );
    assert.equal(
      (await researchAttention(f.store)).tasks.find((t) => t.id === task.id)!
        .board_stage,
      target === 'review' ? undefined : target,
    );
  }
  assert.equal(
    (await db
      .prepare('SELECT COUNT(*) n FROM task_attempts WHERE task_id=?')
      .bind(f.human)
      .first<{ n: number }>())!.n,
    0,
  );
  assert.equal(
    (await db
      .prepare(
        "SELECT COUNT(*) n FROM task_events WHERE mission_id=? AND kind='board_moved'",
      )
      .bind(f.mission)
      .first<{ n: number }>())!.n,
    4,
  );
  await move(f, 'active');
  const reviewed = await submitHumanReview(f.store, f.human, f.submission);
  assert.equal(reviewed.status, 'review');
  const fresh = await f.store.view(f.mission);
  assert.equal(
    fresh.tasks.find((t) => t.id === f.human)!.board_stage,
    undefined,
  );
  assert.equal((await f.store.task(f.publish)).status, 'blocked');
});

void test('manual ordering is durable and stale board or task revisions cannot overwrite it', async () => {
  const f = await fixture();
  const first = await move(f, 'active');
  const order = first.board!.order;
  assert.equal(order.at(-1), f.human);
  await assert.rejects(move(f, 'waiting', { expected: 0 }), status(409));
  await assert.rejects(move(f, 'waiting', { task_revision: 999 }), status(409));
  assert.deepEqual((await f.store.view(f.mission)).board, first.board);
  const old = await f.store.view(f.mission);
  const input = {
    task_id: f.human,
    target: 'waiting',
    before_id: null,
    expected: old.board!.revision,
    task_revision: f.submission.expected,
  };
  const results = await Promise.allSettled([
    moveBoardTask(f.store, f.project.id, f.mission, input),
    moveBoardTask(f.store, f.project.id, f.mission, input),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await f.store.view(f.mission)).board!.revision, 2);
});

void test('permissions, project boundaries, dependency gates and review requirements are enforced', async () => {
  const f = await fixture(),
    viewer = await researcher();
  const input = {
    task_id: f.human,
    target: 'active',
    before_id: null,
    expected: 0,
    task_revision: f.submission.expected,
  };
  await assert.rejects(
    moveBoardTask(viewer, f.project.id, f.mission, input),
    status(404),
  );
  await db
    .prepare('INSERT INTO project_members VALUES(?,?,?,?,?)')
    .bind(
      f.project.id,
      viewer.owner,
      'viewer',
      f.store.owner,
      new Date().toISOString(),
    )
    .run();
  await assert.rejects(
    moveBoardTask(viewer, f.project.id, f.mission, input),
    status(403),
  );
  await assert.rejects(
    moveBoardTask(f.store, crypto.randomUUID(), f.mission, input),
    status(404),
  );
  await assert.rejects(
    move(f, 'active', { task_id: crypto.randomUUID() }),
    status(404),
  );
  await assert.rejects(move(f, 'active', { before_id: f.parent }), status(409));
  await assert.rejects(move(f, 'done'), status(409));
  await assert.rejects(
    move(f, 'active', {
      task_id: f.parent,
      task_revision: (await f.store.task(f.parent)).revision,
    }),
    status(409),
  );
  await f.store.control(f.mission, 'pause');
  await assert.rejects(move(f, 'active'), status(409));
  await f.store.control(f.mission, 'resume');
  await db
    .prepare(
      "UPDATE mission_tasks SET status='stale',revision=revision+1 WHERE id=?",
    )
    .bind(f.parent)
    .run();
  await assert.rejects(move(f, 'active'), status(409));
  assert.equal((await f.store.view(f.mission)).board!.revision, 0);
});

void test('a dependency or mission change during save prevents both arrangement and audit event', async () => {
  for (const kind of ['dependency', 'mission'] as const) {
    const f = await fixture(),
      read = f.store.view.bind(f.store);
    f.store.view = async (id) => {
      const snapshot = await read(id);
      if (kind === 'dependency')
        await db
          .prepare('UPDATE mission_tasks SET revision=revision+1 WHERE id=?')
          .bind(f.parent)
          .run();
      else
        await db
          .prepare('UPDATE missions SET revision=revision+1 WHERE id=?')
          .bind(f.mission)
          .run();
      return snapshot;
    };
    await assert.rejects(move(f, 'active'), status(409));
    assert.equal((await read(f.mission)).board!.revision, 0);
    assert.equal(
      (await db
        .prepare(
          "SELECT COUNT(*) n FROM task_events WHERE mission_id=? AND kind='board_moved'",
        )
        .bind(f.mission)
        .first<{ n: number }>())!.n,
      0,
    );
  }
});

void test('an audit failure rolls back the board update atomically', async () => {
  const f = await fixture();
  await db
    .prepare(
      "CREATE TRIGGER fail_board_event BEFORE INSERT ON task_events WHEN NEW.kind='board_moved' BEGIN SELECT RAISE(ABORT,'simulated board event failure'); END",
    )
    .run();
  try {
    await assert.rejects(move(f, 'active'), /simulated board event failure/);
  } finally {
    await db.prepare('DROP TRIGGER fail_board_event').run();
  }
  assert.equal((await f.store.view(f.mission)).board!.revision, 0);
  await move(f, 'active');
  await db
    .prepare('UPDATE mission_tasks SET revision=revision+1 WHERE id=?')
    .bind(f.human)
    .run();
  assert.equal(
    (await f.store.view(f.mission)).tasks.find((t) => t.id === f.human)!
      .board_stage,
    undefined,
  );
});
