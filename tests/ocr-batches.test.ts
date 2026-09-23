import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { ResearchStore } from '../lib/store';
import { encrypt } from '../lib/crypto';
import { DEFAULT_RESEARCH_MODEL } from '../lib/model-routing';
import {
  createOcrBatch,
  stageOcrImage,
  controlOcrBatch,
  executeOcrBatch,
  recoverOcrBatches,
  ocrBatchStatus,
} from '../lib/ocr-batches';
import type { JobsEnv } from '../lib/jobs';
let mf: Miniflare, db: D1Database, files: R2Bucket;
const secret = Buffer.alloc(32, 7).toString('base64');
const image = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]).toString('base64')}`;
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
      r2Buckets: ['FILES'],
      compatibilityDate: '2026-09-04',
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  files = (await mf.getR2Bucket('FILES')) as unknown as R2Bucket;
  const dir = new URL('../drizzle/', import.meta.url);
  for (const name of (await fs.readdir(dir))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const sql = await fs.readFile(new URL(name, dir), 'utf8');
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
async function setup() {
  const owner = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)',
    )
    .bind(owner, 'Reader', `${owner}@example.test`, Date.now(), Date.now())
    .run();
  const store = new ResearchStore(db, owner),
    project = await store.createProject('Transcription test', '');
  const source = crypto.randomUUID(),
    path = `${owner}/${project.id}/${source}/original.pdf`;
  await store.recordUpload(source, project.id, path, 'application/pdf');
  const version = await store.importSource({
    p_id: source,
    p_project: project.id,
    p_title: 'Letters',
    p_path: path,
    p_type: 'application/pdf',
    p_pages: [
      { page: 1, text: '' },
      { page: 2, text: '' },
    ],
  });
  const model = crypto.randomUUID();
  await store.saveModel({
    id: model,
    label: 'Test',
    provider: 'openrouter',
    model_id: DEFAULT_RESEARCH_MODEL,
    vision: true,
    key_hint: 'test',
    encrypted_key: await encrypt('test-key', secret, `${owner}:${model}`),
  });
  await db
    .prepare('INSERT INTO project_budgets VALUES(?,?,0)')
    .bind(project.id, 10_000_000)
    .run();
  const dispatched: unknown[] = [];
  const env = {
    DB: db,
    FILES: files,
    FOLIOTRACE_ENCRYPTION_KEY: secret,
    JOB_QUEUE: {
      send: async (message: unknown) => {
        dispatched.push(message);
      },
    },
  } as unknown as JobsEnv;
  const input = {
    id: crypto.randomUUID(),
    project_id: project.id,
    version_id: version,
    connection_id: model,
    pages: [1, 2],
    budget_usd: 1,
    locale: 'en',
  };
  await createOcrBatch(store, env, input);
  for (const page of input.pages)
    await stageOcrImage(store, env, input.id, page, image);
  await controlOcrBatch(store, env, input.id, 'start');
  return { store, env, input, source, project, version, dispatched };
}
void test('durable OCR survives closed clients, duplicate queue delivery and pause; reviewed text retains provenance', async () => {
  const s = await setup();
  let calls = 0;
  const invoke = async () => ({
    text: `Letter ${++calls}`,
    inputTokens: 10,
    outputTokens: 10,
    truncated: false,
  });
  await Promise.all([
    executeOcrBatch(s.env, s.input.id, invoke),
    executeOcrBatch(s.env, s.input.id, invoke),
  ]);
  assert.equal(calls, 1);
  await controlOcrBatch(s.store, s.env, s.input.id, 'pause');
  await executeOcrBatch(s.env, s.input.id, invoke);
  assert.equal(calls, 1);
  await controlOcrBatch(s.store, s.env, s.input.id, 'resume');
  await executeOcrBatch(s.env, s.input.id, invoke);
  await executeOcrBatch(s.env, s.input.id, invoke);
  const view = await ocrBatchStatus(s.store, s.project.id, s.version);
  assert.equal(view.batch?.status, 'completed');
  assert.equal(calls, 2);
  assert.ok(view.pages.every((p) => p.status === 'review'));
  assert.equal((await s.store.version(s.version)).pages[0].text, '');
  const derived = await s.store.reviseSource({
    p_source: s.source,
    p_expected: 1,
    p_method: 'ocr-reviewed',
    p_ocr_run: view.pages[0].run_id,
    p_page: 1,
    p_pages: [
      { page: 1, text: 'Letter 1, corrected' },
      { page: 2, text: '' },
    ],
  });
  const lineage = await db
    .prepare(
      'SELECT parent_version_id,run_id FROM source_derivations WHERE version_id=?',
    )
    .bind(derived)
    .first();
  assert.deepEqual(lineage, {
    parent_version_id: s.version,
    run_id: view.pages[0].run_id,
  });
  await assert.rejects(
    s.store.reviseSource({
      p_source: s.source,
      p_expected: 2,
      p_method: 'ocr-reviewed',
      p_ocr_run: view.pages[0].run_id,
      p_page: 2,
      p_pages: [
        { page: 1, text: 'Changed' },
        { page: 2, text: 'Wrong page' },
      ],
    }),
  );
  const second = await s.store.reviseSource({
    p_source: s.source,
    p_expected: 2,
    p_method: 'ocr-reviewed',
    p_ocr_run: view.pages[1].run_id,
    p_page: 2,
    p_pages: [
      { page: 1, text: 'Letter 1, corrected' },
      { page: 2, text: 'Letter 2, corrected' },
    ],
  });
  assert.equal((await s.store.version(second)).revision, 3);
  assert.equal(
    (
      await db
        .prepare(
          'SELECT parent_version_id FROM source_derivations WHERE version_id=?',
        )
        .bind(second)
        .first()
    )?.parent_version_id,
    derived,
  );
  await assert.rejects(
    s.store.reviseSource({
      p_source: s.source,
      p_expected: 3,
      p_method: 'ocr-reviewed',
      p_ocr_run: view.pages[0].run_id,
      p_page: 1,
      p_pages: [
        { page: 1, text: 'Overwrites a changed page' },
        { page: 2, text: 'Letter 2, corrected' },
      ],
    }),
    /该页原文已变化/,
  );
  await recoverOcrBatches(s.env);
  assert.equal(
    (await files.list({ prefix: `${s.store.owner}/${s.project.id}/` })).objects
      .length,
    0,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT storage_reserved FROM ocr_batches WHERE id=?')
        .bind(s.input.id)
        .first()
    )?.storage_reserved,
    0,
  );
});
void test('uncertain provider failure retains the charge allowance and never auto-repeats a paid request', async () => {
  const s = await setup();
  let calls = 0;
  const fail = async () => {
    calls++;
    throw new Error('upstream timeout');
  };
  await executeOcrBatch(s.env, s.input.id, fail);
  const view = await ocrBatchStatus(s.store, s.project.id, s.version);
  assert.equal(view.batch?.status, 'attention');
  assert.ok(view.committed_units > 0);
  await recoverOcrBatches(s.env);
  await executeOcrBatch(s.env, s.input.id, fail);
  await assert.rejects(controlOcrBatch(s.store, s.env, s.input.id, 'resume'));
  assert.equal(calls, 1);
  assert.equal(
    (
      await db
        .prepare('SELECT phase FROM direct_run_costs WHERE run_id=?')
        .bind(view.pages[0].run_id)
        .first()
    )?.phase,
    'uncertain',
  );
});
void test('cancellation and changed sources prevent a queued OCR request from spending', async () => {
  const s = await setup();
  let calls = 0;
  const invoke = async () => ({
    text: `${++calls}`,
    inputTokens: 10,
    outputTokens: 10,
    truncated: false,
  });
  await controlOcrBatch(s.store, s.env, s.input.id, 'cancel');
  await executeOcrBatch(s.env, s.input.id, invoke);
  assert.equal(calls, 0);
  const other = await setup();
  await other.store.reviseSource({
    p_source: other.source,
    p_expected: 1,
    p_method: 'manual',
    p_pages: [
      { page: 1, text: 'Reviewed' },
      { page: 2, text: '' },
    ],
  });
  await executeOcrBatch(other.env, other.input.id, invoke);
  assert.equal(calls, 0);
  assert.equal(
    (await ocrBatchStatus(other.store, other.project.id, other.version)).batch
      ?.status,
    'stale',
  );
});
void test('completed candidates are reused without another charge, and changed model configuration stops dispatch', async () => {
  const s = await setup();
  let calls = 0;
  const invoke = async () => ({
    text: `Candidate ${++calls}`,
    inputTokens: 10,
    outputTokens: 10,
  });
  for (let i = 0; i < 3; i++) await executeOcrBatch(s.env, s.input.id, invoke);
  const repeat = { ...s.input, id: crypto.randomUUID() };
  const cached = await createOcrBatch(s.store, s.env, repeat);
  assert.ok(cached.pages.every((p) => p.status === 'review'));
  await controlOcrBatch(s.store, s.env, repeat.id, 'start');
  await executeOcrBatch(s.env, repeat.id, invoke);
  assert.equal(calls, 2);
  assert.equal(
    (await ocrBatchStatus(s.store, s.project.id, s.version)).committed_units,
    0,
  );
  const other = await setup();
  await db
    .prepare('UPDATE model_connections SET model_id=? WHERE id=?')
    .bind('different-model', other.input.connection_id)
    .run();
  await executeOcrBatch(other.env, other.input.id, invoke);
  assert.equal(calls, 2);
  assert.equal(
    (await ocrBatchStatus(other.store, other.project.id, other.version)).batch
      ?.status,
    'attention',
  );
});
void test('batch allowance and foreign ownership prevent spending or tampering', async () => {
  const s = await setup(),
    other = await setup();
  let calls = 0;
  await assert.rejects(
    controlOcrBatch(other.store, s.env, s.input.id, 'cancel'),
  );
  await assert.rejects(stageOcrImage(other.store, s.env, s.input.id, 1, image));
  await db
    .prepare('UPDATE ocr_batches SET budget_units=1 WHERE id=?')
    .bind(s.input.id)
    .run();
  await executeOcrBatch(s.env, s.input.id, async () => ({
    text: `${++calls}`,
    inputTokens: 10,
    outputTokens: 10,
  }));
  assert.equal(calls, 0);
  assert.equal(
    (await ocrBatchStatus(s.store, s.project.id, s.version)).committed_units,
    0,
  );
});

void test('source trash respects active OCR batches and cancelled preparation can be discarded', async () => {
  const s = await setup();
  await assert.rejects(
    s.store.trashSources(s.project.id, [s.source]),
    /不能移入回收站/,
  );
  await controlOcrBatch(s.store, s.env, s.input.id, 'cancel');
  assert.deepEqual(await s.store.trashSources(s.project.id, [s.source]), {
    trashed: 1,
  });
  let calls = 0;
  await executeOcrBatch(s.env, s.input.id, async () => {
    calls++;
    return {
      text: 'must not run',
      inputTokens: 1,
      outputTokens: 1,
      truncated: false,
    };
  });
  assert.equal(calls, 0);
});
