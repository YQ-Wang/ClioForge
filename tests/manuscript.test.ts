import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { MissionStore } from '../lib/platform/missions';
import { executeMissionTask, builtin } from '../lib/platform/execute';
import {
  manuscriptBundle,
  bundleHash,
  manuscriptRecipe,
  createManuscript,
  validateManuscriptSection,
  manuscriptRuns,
  type ManuscriptInput,
} from '../lib/manuscript';
import { encrypt } from '../lib/crypto';
import { writingSources } from '../lib/writing-sources';
import { writingPageReferences, writingDocx } from '../lib/writing-export';
import type { invoke } from '../lib/providers';
import type { Note } from '../lib/types';
import { providerRequest } from '../lib/providers';
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
    .filter((n) => n.endsWith('.sql'))
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
async function fixture() {
  const owner = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)',
    )
    .bind(
      owner,
      'Manuscript researcher',
      `${owner}@example.test`,
      Date.now(),
      Date.now(),
    )
    .run();
  const store = new MissionStore(db, owner),
    project = await store.createProject(
      '1776 correspondence',
      'Bounded letter study',
    ),
    source = crypto.randomUUID(),
    version = crypto.randomUUID(),
    question = crypto.randomUUID(),
    claim = crypto.randomUUID(),
    model = crypto.randomUUID(),
    secret = btoa('m'.repeat(32)),
    date = new Date().toISOString();
  const quote = 'you insist upon retaining an absolute power over Wives.';
  await db.batch([
    db
      .prepare('INSERT INTO sources VALUES(?,?,?,?,?,?)')
      .bind(
        source,
        project.id,
        'Abigail to John, 7 May 1776',
        `test/${source}.txt`,
        'text/plain',
        date,
      ),
    db.prepare('INSERT INTO source_versions VALUES(?,?,?,?,?,?,?)').bind(
      version,
      source,
      project.id,
      1,
      JSON.stringify([
        {
          page: 1,
          text: `Abigail Adams to John Adams, 7 May 1776. ${quote} The surrounding letter addresses other concerns.`,
        },
      ]),
      'import',
      date,
    ),
    db
      .prepare('INSERT INTO research_questions VALUES(?,?,?,?,1,?)')
      .bind(
        question,
        project.id,
        'What power is criticized?',
        'One letter cannot establish an entire voting programme.',
        date,
      ),
    db
      .prepare("INSERT INTO claims VALUES(?,?,?,?, 'claim','reviewed',1,?)")
      .bind(
        claim,
        project.id,
        question,
        'Abigail criticizes marital power; the passage does not establish voting rules.',
        date,
      ),
  ]);
  const evidence = await store.addEvidence({
    p_version: version,
    p_page: 1,
    p_quote: quote,
    p_question: 'What power?',
    p_interpretation: 'Marital power, not a complete franchise proposal.',
    p_relation: 'supports',
  });
  await db
    .prepare("INSERT INTO claim_evidence VALUES(?,?,?,?, 'supports',?)")
    .bind(crypto.randomUUID(), project.id, claim, evidence, date)
    .run();
  await store.saveModel({
    id: model,
    label: 'Manuscript test model',
    provider: 'openrouter',
    model_id: 'z-ai/glm-5.3-flash',
    vision: true,
    key_hint: 'test',
    encrypted_key: await encrypt('test-only', secret, `${owner}:${model}`),
  });
  await db
    .prepare(
      'INSERT INTO project_budgets VALUES(?,10000000,0) ON CONFLICT(project_id) DO UPDATE SET limit_units=10000000',
    )
    .bind(project.id)
    .run();
  const bundle = await manuscriptBundle(store, project.id, question, [claim]);
  const input: ManuscriptInput = {
    request_id: crypto.randomUUID(),
    question_id: question,
    claim_ids: [claim],
    title: 'Marital power in a 1776 letter',
    audience: 'Historical researchers',
    locale: 'en',
    sections: [
      { title: 'Argument', goal: 'Explain the supported claim.' },
      { title: 'Limits', goal: 'Preserve the evidence gap.' },
    ],
    model_id: model,
    input_rate: 0.15,
    output_rate: 0.5,
    budget_usd: 1,
    snapshot_hash: await bundleHash(bundle),
    confirmed: true,
  };
  const response = () => ({
    summary: 'Untrusted model summary is replaced.',
    citations: [{ version_id: version, page: 1, quote }],
    checks: [],
    data: {
      paragraphs: [
        {
          text: 'The letter criticizes marital power; it does not establish a voting programme.',
          basis: 'interpretation',
          claim_ids: [claim],
          citations: [1],
        },
        {
          text: 'Further letters and scholarship are needed to assess representational claims.',
          basis: 'gap',
          claim_ids: [],
          citations: [],
        },
      ],
    },
  });
  return {
    store,
    project,
    source,
    version,
    question,
    claim,
    evidence,
    bundle,
    input,
    secret,
    response,
  };
}
void test('manuscript workflow freezes research, drafts sequentially, saves once, preserves edits and exports source footnotes', async () => {
  const f = await fixture();
  const [mission, repeated] = await Promise.all([
    createManuscript(f.store, f.project.id, f.input),
    createManuscript(f.store, f.project.id, f.input),
  ]);
  assert.equal(mission.id, repeated.id);
  let view = await f.store.view(mission.id);
  const ordered = manuscriptRecipe(f.input, f.bundle);
  assert.equal(ordered.tasks[1].input.effort, 'low');
  await f.store.control(mission.id, 'start');
  let calls = 0;
  const model: typeof invoke = async (request) => {
    calls++;
    assert.match(request.prompt, /dossier/);
    assert.match(request.prompt, /Marital power/);
    assert.equal(request.outputSchema, 'manuscript_section_v1');
    assert.match(
      JSON.stringify(providerRequest(request).body),
      /manuscript_section_v1/,
    );
    assert.match(JSON.stringify(providerRequest(request).body), /paragraphs/);
    return {
      text: JSON.stringify(f.response()),
      inputTokens: 300,
      outputTokens: 220,
    };
  };
  const env = { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret };
  for (let i = 0; i < 5; i++) {
    view = await f.store.view(mission.id);
    const task = view.tasks.find(
      (t) => t.status === 'ready' && t.executor !== 'human',
    );
    if (!task) break;
    await executeMissionTask(env, task.id, model);
  }
  view = await f.store.view(mission.id);
  assert.equal(calls, 2);
  const assembly = view.tasks.find(
    (t) => t.input.parameters.manuscript_stage === 'assemble',
  )!;
  assert.equal(assembly.status, 'succeeded', assembly.error || '');
  assert.equal(view.tasks.find((t) => t.executor === 'human')!.status, 'ready');
  const runs = await manuscriptRuns(f.store, f.project.id);
  assert.equal(runs[0].changed, false);
  const noteId = runs[0].note_id!;
  assert.ok(noteId);
  const note = await db
    .prepare('SELECT * FROM notes WHERE id=?')
    .bind(noteId)
    .first<Note>();
  assert.ok(note);
  assert.match(note.body, /AI-assisted draft/);
  assert.match(note.body, /Research gap/);
  assert.match(note.body, /evidence=/);
  assert.doesNotMatch(note.body, /Untrusted model summary/);
  const child = await f.store.saveNote({
    p_project: f.project.id,
    p_parent: note.id,
    p_title: note.title,
    p_body: note.body + '\n\nResearcher revision.',
  });
  await builtin(f.store, assembly);
  assert.equal(
    (await db
      .prepare('SELECT COUNT(*) n FROM notes WHERE project_id=?')
      .bind(f.project.id)
      .first<{ n: number }>())!.n,
    2,
  );
  assert.ok(
    await db.prepare('SELECT id FROM notes WHERE id=?').bind(child).first(),
  );
  await executeMissionTask(
    env,
    view.tasks.find((t) => t.executor === 'model')!.id,
    model,
  );
  assert.equal(calls, 2);
  const refs = await writingSources(
    f.store,
    f.project.id,
    'https://canwoo.test',
    writingPageReferences(note.body, null, 'https://canwoo.test'),
  );
  const docx = writingDocx(
    note.title,
    note.body,
    refs.citations,
    'https://canwoo.test',
  );
  assert.ok(docx.byteLength > 1000);
  assert.ok(refs.citations.some((c) => c.id === f.evidence));
  await db
    .prepare('UPDATE claims SET body=?,revision=revision+1 WHERE id=?')
    .bind('Changed after drafting.', f.claim)
    .run();
  await assert.rejects(
    f.store.checkResult(
      view.tasks.find((t) => t.executor === 'human')!,
      {
        summary: 'Reviewed',
        citations: [],
        checks: [],
        data: {},
      },
    ),
    /依据已有变化/,
  );
});
void test('changed claims block paid continuation, flag existing drafts and reject stale confirmation', async () => {
  const f = await fixture(),
    mission = await createManuscript(f.store, f.project.id, f.input);
  await f.store.control(mission.id, 'start');
  await executeMissionTask({ DB: db }, f.input.request_id);
  await db
    .prepare('UPDATE claims SET body=?,revision=revision+1 WHERE id=?')
    .bind('A revised, narrower interpretation.', f.claim)
    .run();
  let calls = 0;
  const task = (await f.store.view(mission.id)).tasks.find(
    (t) => t.executor === 'model' && t.status === 'ready',
  )!;
  await executeMissionTask(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret },
    task.id,
    async () => {
      calls++;
      throw new Error('must not call');
    },
  );
  assert.equal(calls, 0);
  assert.equal((await f.store.task(task.id)).status, 'failed');
  assert.match((await f.store.task(task.id)).error!, /依据已有变化/);
  assert.equal((await manuscriptRuns(f.store, f.project.id))[0].changed, true);
  await assert.rejects(
    createManuscript(f.store, f.project.id, {
      ...f.input,
      request_id: crypto.randomUUID(),
    }),
    /依据已变化/,
  );
});
void test('omitted claims and counterevidence stay visible, and an expired assembly lease cannot save a note', async () => {
  const f = await fixture();
  const secondClaim = crypto.randomUUID();
  await db
    .prepare("INSERT INTO claims VALUES(?,?,?,?, 'alternative','reviewed',1,?)")
    .bind(
      secondClaim,
      f.project.id,
      f.question,
      'The surrounding letter may complicate the interpretation.',
      new Date().toISOString(),
    )
    .run();
  const counterevidence = await f.store.addEvidence({
    p_version: f.version,
    p_page: 1,
    p_quote: 'The surrounding letter addresses other concerns.',
    p_question: 'What remains outside the excerpt?',
    p_interpretation: 'A competing contextual reading requires examination.',
    p_relation: 'challenges',
  });
  await db
    .prepare("INSERT INTO claim_evidence VALUES(?,?,?,?, 'challenges',?)")
    .bind(
      crypto.randomUUID(),
      f.project.id,
      secondClaim,
      counterevidence,
      new Date().toISOString(),
    )
    .run();
  f.input.claim_ids.push(secondClaim);
  f.input.snapshot_hash = await bundleHash(
    await manuscriptBundle(
      f.store,
      f.project.id,
      f.question,
      f.input.claim_ids,
    ),
  );
  const mission = await createManuscript(f.store, f.project.id, f.input);
  await f.store.control(mission.id, 'start');
  const model: typeof invoke = async () => ({
    text: JSON.stringify(f.response()),
    inputTokens: 300,
    outputTokens: 220,
  });
  const env = { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret };
  for (let i = 0; i < 3; i++) {
    const task = (await f.store.view(mission.id)).tasks.find(
      (t) => t.status === 'ready' && t.executor !== 'human',
    )!;
    await executeMissionTask(env, task.id, model);
  }
  const assembly = (await f.store.view(mission.id)).tasks.find(
    (t) => t.input.parameters.manuscript_stage === 'assemble',
  )!;
  const claimed = await f.store.claim(assembly.id, 'lease-test', 'builtin');
  const result = await builtin(f.store, claimed.task);
  assert.equal(
    result.checks.find((c) => c.name === 'research_coverage')!.passed,
    false,
  );
  const data = result.data as {
    manuscript_note: { body: string };
    coverage: {
      missing_claim_ids: string[];
      missing_counterevidence_ids: string[];
    };
  };
  assert.deepEqual(data.coverage.missing_claim_ids, [secondClaim]);
  assert.deepEqual(data.coverage.missing_counterevidence_ids, [
    counterevidence,
  ]);
  assert.match(
    data.manuscript_note.body,
    /Claims and counterevidence still to integrate/,
  );
  await db
    .prepare(
      "UPDATE mission_tasks SET lease_until='2000-01-01T00:00:00.000Z' WHERE id=?",
    )
    .bind(assembly.id)
    .run();
  await assert.rejects(
    f.store.submit(assembly.id, claimed.lease, 'lease-test', result),
    /租约已失效/,
  );
  assert.equal(
    (await db
      .prepare('SELECT COUNT(*) n FROM notes WHERE project_id=?')
      .bind(f.project.id)
      .first<{ n: number }>())!.n,
    0,
  );
});
void test('manuscript budget stops before a provider call and uncertain calls never auto-retry', async () => {
  const f = await fixture();
  f.input.budget_usd = 0.01;
  f.input.input_rate = 100;
  const mission = await createManuscript(f.store, f.project.id, f.input);
  await f.store.control(mission.id, 'start');
  await executeMissionTask({ DB: db }, f.input.request_id);
  const task = (await f.store.view(mission.id)).tasks.find(
    (t) => t.executor === 'model' && t.status === 'ready',
  )!;
  let calls = 0;
  await executeMissionTask(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret },
    task.id,
    async () => {
      calls++;
      throw new Error('must not call');
    },
  );
  assert.equal(calls, 0);
  assert.equal((await f.store.task(task.id)).status, 'failed');
  assert.match((await f.store.task(task.id)).error!, /预算不足/);
  const g = await fixture(),
    m = await createManuscript(g.store, g.project.id, g.input),
    env = { DB: db, FOLIOTRACE_ENCRYPTION_KEY: g.secret };
  await g.store.control(m.id, 'start');
  await executeMissionTask(env, g.input.request_id);
  const section = (await g.store.view(m.id)).tasks.find(
    (t) => t.executor === 'model' && t.status === 'ready',
  )!;
  const timeout: typeof invoke = async () => {
    calls++;
    throw new Error('provider timeout');
  };
  await executeMissionTask(env, section.id, timeout);
  await executeMissionTask(env, section.id, timeout);
  assert.equal(calls, 1);
  assert.equal((await g.store.task(section.id)).status, 'uncertain');
  assert.equal((await manuscriptRuns(g.store, g.project.id))[0].note_id, null);
});
void test('draft and foreign claims, altered evidence, invented citations and unsupported paragraph links are rejected', async () => {
  const f = await fixture();
  const bad = f.response();
  bad.data.paragraphs[0].citations = [2];
  assert.throws(() => validateManuscriptSection(bad, f.bundle), /引用编号/);
  const uncited = f.response();
  uncited.data.paragraphs[0].citations = [];
  assert.throws(
    () => validateManuscriptSection(uncited, f.bundle),
    /缺少论点或原文/,
  );
  const invented = f.response();
  invented.citations[0].quote = 'A fabricated voting law.';
  assert.throws(() => validateManuscriptSection(invented, f.bundle), /未选入/);
  const foreign = f.response();
  foreign.data.paragraphs[0].claim_ids = [crypto.randomUUID()];
  assert.throws(
    () => validateManuscriptSection(foreign, f.bundle),
    /未选中的论点/,
  );
  const g = await fixture();
  const unlinked = f.response();
  unlinked.data.paragraphs[0].claim_ids.push(g.claim);
  assert.throws(
    () =>
      validateManuscriptSection(unlinked, {
        ...f.bundle,
        claims: [...f.bundle.claims, g.bundle.claims[0]],
      }),
    /缺少与其关联的引文/,
  );
  await assert.rejects(
    manuscriptBundle(f.store, f.project.id, f.question, [g.claim]),
    /请选择该问题/,
  );
  await db
    .prepare("UPDATE claims SET status='draft' WHERE id=?")
    .bind(f.claim)
    .run();
  await assert.rejects(
    manuscriptBundle(f.store, f.project.id, f.question, [f.claim]),
    /已审读/,
  );
});
