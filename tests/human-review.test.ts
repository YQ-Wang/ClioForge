import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { MissionStore } from '../lib/platform/missions';
import { submitHumanReview } from '../lib/platform/human-review';
import { taskInputSchema } from '../lib/platform/types';
import { HttpError } from '../lib/errors';
import { repairProse } from '../lib/platform/repair';
import { correctionChanges } from '../lib/platform/review-quality';
import {
  compactReviewCitations,
  groupedCitations,
  mergeResearchTexts,
} from '../lib/review-citations';
import { builtin } from '../lib/platform/execute';
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

void test('review deduplication remaps prose numbers without merging distinct source spans', () => {
  const a = {
    version_id: crypto.randomUUID(),
    page: 1,
    quote: 'same text',
    start: 0,
  };
  const b = { ...a, start: 20 };
  const compact = compactReviewCitations(
    'First [1], repeated [2], second occurrence [3].',
    [a, { ...a }, b],
  );
  assert.equal(
    compact.summary,
    'First [1], repeated [1], second occurrence [2].',
  );
  assert.deepEqual(compact.citations, [a, b]);
  assert.deepEqual(groupedCitations([a, { ...a }, b]), [
    { citation: a, numbers: [1, 2] },
    { citation: b, numbers: [3] },
  ]);
});

void test('a shortened researcher draft retains only cited passages and renumbers them', () => {
  const a = {
    version_id: crypto.randomUUID(),
    page: 1,
    quote: 'first',
    start: 0,
  };
  const b = { ...a, quote: 'second', start: 20 };
  assert.deepEqual(compactReviewCitations('Keep [2], again [2].', [a, b]), {
    summary: 'Keep [1], again [1].',
    citations: [b],
  });
  assert.deepEqual(
    compactReviewCitations('General review.', [a, b]).citations,
    [a, b],
  );
  assert.deepEqual(
    mergeResearchTexts([
      { summary: 'First [1].', citations: [a] },
      { summary: 'Second [1], first again [2].', citations: [b, a] },
    ]),
    {
      summary: 'First [1].\n\nSecond [2], first again [1].',
      citations: [a, b],
    },
  );
  assert.throws(
    () =>
      mergeResearchTexts([
        { summary: 'Unbound [2].', citations: [a] },
        { summary: 'Other [1].', citations: [b] },
      ]),
    status(400),
  );
});

void test('publishing a reviewed draft preserves its citation bindings instead of model ordering', async () => {
  const f = await fixture();
  const second = { ...f.citation, quote: 'Commodo', start: 10 };
  await db
    .prepare('UPDATE mission_tasks SET executor=?,result=? WHERE id=?')
    .bind(
      'model',
      JSON.stringify({
        summary: 'Original [1] [2].',
        citations: [f.citation, second],
        checks: [],
      }),
      f.parent,
    )
    .run();
  await db
    .prepare(
      'INSERT INTO task_dependencies(task_id,depends_on,mission_id) VALUES(?,?,?)',
    )
    .bind(f.publish, f.parent, f.mission)
    .run();
  const submitted = await submitHumanReview(f.store, f.human, {
    ...f.submission,
    summary: 'Only the second source survives review [2].',
    citations: [f.citation, second],
  });
  assert.deepEqual(submitted.result?.citations, [second]);
  await f.store.review(
    f.human,
    'accepted',
    'Source checked for this regression.',
    submitted.revision,
  );
  const published = await builtin(f.store, await f.store.task(f.publish));
  assert.equal(
    published.summary,
    'Only the second source survives review [1].',
  );
  assert.deepEqual(published.citations, [second]);
  const claim = await f.store.claim(f.publish, 'test-builtin', 'builtin');
  await f.store.submit(f.publish, claim.lease, 'test-builtin', published);
  const artifact = (await f.store.view(f.mission)).artifacts[0];
  assert.equal(artifact.body.summary, published.summary);
  assert.deepEqual(artifact.body.citations, [second]);
});

void test('explicit review citations keep their meaning when upstream numbering differs', async () => {
  const f = await fixture();
  const second = { ...f.citation, quote: 'Commodo', start: 10 };
  await db
    .prepare('UPDATE mission_tasks SET result=? WHERE id=?')
    .bind(
      JSON.stringify({
        summary: 'Names [1] [2].',
        citations: [f.citation, second],
        checks: [],
      }),
      f.parent,
    )
    .run();
  const submitted = await submitHumanReview(f.store, f.human, {
    ...f.submission,
    summary: 'A researcher-selected name [1], then the full phrase [2].',
    citations: [second, f.citation],
  });
  assert.equal(submitted.result?.citations[0].quote, 'Commodo');
  assert.equal(submitted.result?.citations[1].quote, f.citation.quote);
  assert.equal(submitted.status, 'review');
  assert.equal((await f.store.task(f.publish)).status, 'blocked');
  const retry = await submitHumanReview(f.store, f.human, {
    ...f.submission,
    summary: 'A researcher-selected name [1], then the full phrase [2].',
    citations: [second, f.citation],
  });
  assert.equal(retry.attempt, submitted.attempt);
});

void test('review rejects a real but unselected quotation and missing citation numbers', async () => {
  const f = await fixture();
  await assert.rejects(
    submitHumanReview(f.store, f.human, {
      ...f.submission,
      citations: [{ ...f.citation, quote: 'Commodo', start: 10 }],
    }),
    status(400),
  );
  await assert.rejects(
    submitHumanReview(f.store, f.human, {
      ...f.submission,
      summary: 'A source claim [2].',
      citations: [f.citation],
    }),
    status(400),
  );
  assert.equal((await f.store.task(f.human)).status, 'ready');
  assert.equal((await f.store.task(f.publish)).status, 'blocked');
});

void test('repair of an uncertain comparison keeps cost records and requires a new review', async () => {
  const f = await fixture();
  const task = await f.store.task(f.human);
  await db
    .prepare(
      "UPDATE mission_tasks SET executor='model',kind='compare',status='uncertain',cost_units=1234,input=? WHERE id=?",
    )
    .bind(
      JSON.stringify({
        ...task.input,
        parameters: {
          output_schema: 'comparison_answer_v1',
          require_citations: true,
        },
      }),
      f.human,
    )
    .run();
  const repaired = await repairProse(f.store, f.human, {
    summary: 'The supplied text names a person [1].',
    citations: [f.citation],
    reason:
      'Transcribed and checked the fixed source after a failed model response.',
    expected: task.revision,
  });
  assert.equal(repaired.status, 'review');
  assert.equal(repaired.cost_units, 1234);
  assert.equal(repaired.attempt, 0);
  assert.equal((await f.store.task(f.publish)).status, 'blocked');
  const correction = await db
    .prepare('SELECT * FROM task_corrections WHERE task_id=?')
    .bind(f.human)
    .first<{
      id: string;
      task_id: string;
      reason: string;
      actor: string;
      created_at: string;
      body: string;
    }>();
  assert.doesNotThrow(() =>
    correctionChanges({ ...correction!, body: JSON.parse(correction!.body) }),
  );
});

void test('repair rejects a dependency changed while citations were being checked', async () => {
  const f = await fixture();
  const task = await submitHumanReview(f.store, f.human, f.submission);
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
    repairProse(f.store, f.human, {
      summary: 'Names [1].',
      citations: [f.citation],
      reason: 'Checked.',
      expected: task.revision,
    }),
    status(409),
  );
  assert.equal((await f.store.task(f.human)).revision, task.revision);
  assert.equal(
    (await db
      .prepare('SELECT COUNT(*) AS n FROM task_corrections WHERE task_id=?')
      .bind(f.human)
      .first<{ n: number }>())!.n,
    0,
  );
});

void test('human submission compacts duplicate inherited citations before exact validation', async () => {
  const f = await fixture();
  const parent = await f.store.task(f.parent);
  await db
    .prepare('UPDATE mission_tasks SET result=? WHERE id=?')
    .bind(
      JSON.stringify({ ...parent.result, citations: [f.citation, f.citation] }),
      f.parent,
    )
    .run();
  const result = await submitHumanReview(f.store, f.human, {
    ...f.submission,
    summary: 'Name [1], same quotation [2].',
  });
  assert.equal(result.result?.summary, 'Name [1], same quotation [1].');
  assert.deepEqual(result.result?.citations, [f.citation]);
  assert.equal(result.result?.checks.length, 1);
});

void test('prose repair preserves the original attempt and requires acceptance without paid work', async () => {
  const f = await fixture();
  const original = await submitHumanReview(f.store, f.human, f.submission);
  const repaired = await repairProse(f.store, f.human, {
    summary: 'Corrected account of the names [1].',
    citations: [f.citation],
    reason: 'Compared with the fixed text.',
    expected: original.revision,
  });
  assert.equal(repaired.status, 'review');
  assert.equal(repaired.attempt, original.attempt);
  assert.equal(repaired.result?.checks[0].passed, true);
  assert.equal((await f.store.task(f.publish)).status, 'blocked');
  const attempt = await db
    .prepare('SELECT result FROM task_attempts WHERE task_id=?')
    .bind(f.human)
    .first<{ result: string }>();
  assert.equal(JSON.parse(attempt!.result).summary, f.submission.summary);
  const correction = await db
    .prepare('SELECT body FROM task_corrections WHERE task_id=?')
    .bind(f.human)
    .first<{ body: string }>();
  assert.equal(
    JSON.parse(correction!.body).before.summary,
    f.submission.summary,
  );
  assert.equal(
    JSON.parse(correction!.body).after.summary,
    repaired.result?.summary,
  );
  assert.equal(
    (await db
      .prepare('SELECT COUNT(*) AS n FROM research_jobs WHERE project_id=?')
      .bind(f.project.id)
      .first<{ n: number }>())!.n,
    0,
  );
});

void test('prose repair rejects invalid quotations, citation numbers, viewers and stale edits', async () => {
  const f = await fixture(),
    other = await researcher();
  const task = await submitHumanReview(f.store, f.human, f.submission);
  const input = {
    summary: 'Names [1].',
    citations: [f.citation],
    reason: 'Checked.',
    expected: task.revision,
  };
  await assert.rejects(
    repairProse(f.store, f.human, {
      ...input,
      citations: [{ ...f.citation, quote: 'Invented words' }],
    }),
  );
  await assert.rejects(
    repairProse(f.store, f.human, { ...input, summary: 'Names [2].' }),
  );
  await assert.rejects(
    repairProse(f.store, f.human, { ...input, expected: task.revision - 1 }),
    status(409),
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
  await assert.rejects(repairProse(other, f.human, input), status(403));
  assert.equal((await f.store.task(f.human)).revision, task.revision);
});

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
