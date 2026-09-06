import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { MissionStore } from '../lib/platform/missions';
import { submitHumanReview } from '../lib/platform/human-review';
import { taskInputSchema } from '../lib/platform/types';
import { HttpError } from '../lib/errors';
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

void test('human review saves once with exact inherited citations and remains a review gate', async () => {
  const f = await fixture();
  const outcomes = await Promise.all([
    submitHumanReview(f.store, f.human, f.submission),
    submitHumanReview(f.store, f.human, f.submission),
  ]);
  for (const result of outcomes) {
    assert.equal(result.status, 'review');
    assert.equal(result.attempt, 1);
    assert.equal(result.lease_until, null);
    assert.equal(result.result?.summary, f.submission.summary);
    assert.deepEqual(result.result?.citations, [f.citation]);
    assert.equal(result.result?.checks[0]?.passed, true);
  }
  const attempts = (
    await db
      .prepare('SELECT * FROM task_attempts WHERE task_id=?')
      .bind(f.human)
      .all()
  ).results;
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, 'review');
  assert.equal(JSON.parse(String(attempts[0].dependencies))[0].id, f.parent);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM task_events WHERE task_id=? AND kind='review'",
        )
        .bind(f.human)
        .first<{ n: number }>()
    )?.n,
    1,
  );
  assert.equal((await f.store.task(f.publish)).status, 'blocked');
  await assert.rejects(
    submitHumanReview(f.store, f.human, {
      ...f.submission,
      summary: 'Changed stale submission',
    }),
    status(409),
  );
  await f.store.review(
    f.human,
    'accepted',
    'Checked the fixed passage.',
    outcomes[0].revision,
  );
  assert.equal(
    (await submitHumanReview(f.store, f.human, f.submission)).status,
    'accepted',
  );
  assert.equal((await f.store.task(f.human)).attempt, 1);
});

void test('a failed review event rolls back the task transition and attempt together', async () => {
  const f = await fixture();
  await db
    .prepare(
      "CREATE TRIGGER fail_human_review_event BEFORE INSERT ON task_events WHEN NEW.kind='review' BEGIN SELECT RAISE(ABORT,'simulated review event failure'); END",
    )
    .run();
  try {
    await assert.rejects(
      submitHumanReview(f.store, f.human, f.submission),
      /simulated review event failure/,
    );
  } finally {
    await db.prepare('DROP TRIGGER fail_human_review_event').run();
  }
  const task = await f.store.task(f.human);
  assert.equal(task.status, 'ready');
  assert.equal(task.attempt, 0);
  assert.equal(task.revision, f.submission.expected);
  assert.equal(task.result, null);
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM task_attempts WHERE task_id=?')
        .bind(f.human)
        .first<{ n: number }>()
    )?.n,
    0,
  );
  assert.equal(
    (await submitHumanReview(f.store, f.human, f.submission)).status,
    'review',
  );
});

void test('retry acknowledges a committed human review after its response is lost', async () => {
  const f = await fixture();
  const connection = new Proxy(db, {
    get(target, property) {
      if (property === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          await target.batch(statements);
          throw new Error('simulated lost response after commit');
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await assert.rejects(
    submitHumanReview(
      new MissionStore(connection, f.store.owner),
      f.human,
      f.submission,
    ),
    /lost response/,
  );
  assert.equal(
    (await submitHumanReview(f.store, f.human, f.submission)).attempt,
    1,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM task_attempts WHERE task_id=?')
        .bind(f.human)
        .first<{ n: number }>()
    )?.n,
    1,
  );
});

void test('human submission rejects viewers, other projects, stale revisions, paused plans and changed dependencies', async () => {
  const f = await fixture(),
    other = await researcher();
  await assert.rejects(
    submitHumanReview(other, f.human, f.submission),
    status(404),
  );
  await db
    .prepare('INSERT INTO project_members VALUES(?,?,?,?,?)')
    .bind(
      f.project.id,
      other.owner,
      'viewer',
      f.store.owner,
      new Date().toISOString(),
    )
    .run();
  await assert.rejects(
    submitHumanReview(other, f.human, f.submission),
    status(403),
  );
  await assert.rejects(
    submitHumanReview(f.store, f.parent, f.submission),
    status(400),
  );
  await assert.rejects(
    submitHumanReview(f.store, f.human, {
      ...f.submission,
      expected: f.submission.expected - 1,
    }),
    status(409),
  );
  await assert.rejects(
    submitHumanReview(f.store, f.human, { ...f.submission, summary: '   ' }),
  );
  await f.store.control(f.mission, 'pause');
  await assert.rejects(
    submitHumanReview(f.store, f.human, f.submission),
    status(409),
  );
  await f.store.control(f.mission, 'resume');
  const originalCheck = f.store.checkResult.bind(f.store);
  f.store.checkResult = async (task, result) => {
    const checks = await originalCheck(task, result);
    await db
      .prepare('UPDATE mission_tasks SET revision=revision+1 WHERE id=?')
      .bind(f.parent)
      .run();
    return checks;
  };
  await assert.rejects(
    submitHumanReview(f.store, f.human, f.submission),
    status(409),
  );
  assert.equal((await f.store.task(f.human)).status, 'ready');
  assert.equal((await f.store.task(f.human)).attempt, 0);
});
