import { saveOriginalUpload } from '../lib/original-upload';
import { retryObjectCleanup } from '../lib/object-cleanup';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { ResearchStore } from '../lib/store';
import { projectArchive } from '../lib/project-export';
import { ProjectRestore } from '../lib/project-restore';
import { purgeProject, cleanRestoreFiles } from '../lib/project-purge';
import { readBackup } from '../lib/read-backup';
import { moveBoardTask } from '../lib/platform/task-board';
import {
  deletionPreview,
  requestAccountDeletion,
  processAccountDeletions,
} from '../lib/account-deletion';
import { zipSync, strToU8 } from 'fflate';
let mf: Miniflare, db: D1Database, files: R2Bucket;
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
  for (const name of (await fs.readdir(new URL('../drizzle/', import.meta.url)))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const text = await fs.readFile(
      new URL('../drizzle/' + name, import.meta.url),
      'utf8',
    );
    for (const statement of text.split(
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
  const id = crypto.randomUUID(),
    email = `${id}@example.test`,
    session = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)',
    )
    .bind(id, 'Researcher', email, Date.now(), Date.now())
    .run();
  await db
    .prepare(
      'INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      session,
      Date.now() + 3600000,
      crypto.randomUUID(),
      Date.now(),
      Date.now(),
      id,
    )
    .run();
  return { id, email, session, store: new ResearchStore(db, id) };
}
async function fixture() {
  const owner = await researcher(),
    project = await owner.store.createProject(
      'History backup',
      'A reading question',
    );
  const source = crypto.randomUUID(),
    version = crypto.randomUUID(),
    bytes = strToU8('An original text about archives.'),
    path = `${owner.id}/${project.id}/${source}/original.txt`;
  await files.put(path, bytes);
  await db.batch([
    db
      .prepare('INSERT INTO sources VALUES(?,?,?,?,?,?)')
      .bind(
        source,
        project.id,
        'Archive text',
        path,
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
        JSON.stringify([{ page: 1, text: 'An original text about archives.' }]),
        'import',
        new Date().toISOString(),
      ),
    db
      .prepare('INSERT INTO upload_reservations VALUES(?,?,?,?,?)')
      .bind(
        source,
        owner.id,
        project.id,
        bytes.length,
        new Date().toISOString(),
      ),
    db
      .prepare('INSERT INTO project_budgets VALUES(?,?,?)')
      .bind(project.id, 100000, 1200),
  ]);
  await db
    .prepare(
      "INSERT INTO ingestion_items VALUES(?,?,?,'google','external-source','r1','Archive text','succeeded',?,NULL,?,?)",
    )
    .bind(
      source,
      project.id,
      owner.id,
      source,
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run();
  const evidence = await owner.store.addEvidence({
    p_version: version,
    p_page: 1,
    p_quote: 'An original text about archives.',
    p_question: 'Who wrote it?',
    p_interpretation: 'Pending review',
    p_relation: 'context',
  });
  const note1 = crypto.randomUUID(),
    note2 = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        'INSERT INTO notes (id,project_id,parent_id,revision,title,body,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .bind(
        note1,
        project.id,
        null,
        1,
        'Reading note',
        `[source](/?project=${project.id}&tab=sources&version=${version}&page=1&evidence=${evidence})`,
        new Date().toISOString(),
      ),
    db
      .prepare(
        'INSERT INTO notes (id,project_id,parent_id,revision,title,body,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .bind(
        note2,
        project.id,
        note1,
        2,
        'Reading note revised',
        `[source](/?project=${project.id}&tab=sources&version=${version}&page=1&evidence=${evidence})`,
        new Date().toISOString(),
      ),
    db
      .prepare('INSERT INTO note_state VALUES(?,?,1,0)')
      .bind(note2, project.id),
    db
      .prepare('INSERT INTO research_watches VALUES(?,?,?,?,?,?,?,NULL,NULL,?)')
      .bind(
        crypto.randomUUID(),
        owner.id,
        project.id,
        'archives',
        1,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      ),
  ]);
  return { owner, project, source, version, path, bytes, evidence };
}
void test('backup round trip preserves originals, note versions, links and search while disabling permissions and spending', async () => {
  const original = await fixture(),
    target = await researcher();
  const missions = new MissionStore(db, original.owner.id);
  const manual = crypto.randomUUID(),
    second = crypto.randomUUID();
  const mission = await missions.create(original.project.id, {
    title: 'Shared reading arrangement',
    question: 'Which reading should come first?',
    scope: 'Fixed source',
    acceptance: 'Human review',
    tasks: [manual, second].map((id, i) => ({
      id,
      title: `Reading ${i + 1}`,
      kind: 'manual' as const,
      executor: 'human' as const,
      dependencies: [],
      input: taskInputSchema.parse({ version_ids: [original.version] }),
    })),
  });
  await missions.control(mission, 'start');
  await moveBoardTask(missions, original.project.id, mission, {
    task_id: manual,
    target: 'active',
    before_id: null,
    expected: 0,
    task_revision: (await missions.task(manual)).revision,
  });
  const archive = await new Response(
    await projectArchive(original.owner.store, files, original.project.id),
  ).arrayBuffer();
  const backup = await readBackup(new File([archive], 'history.zip'));
  const engine = new ProjectRestore(target.store, files),
    start = await engine.start(
      JSON.parse(backup.metadataText),
      backup.manifest,
      'Restored research',
    );
  await assert.rejects(target.store.project(start.project_id), /项目不存在/);
  await assert.rejects(
    new ProjectRestore(original.owner.store, files).read(start.id),
    /不存在/,
  );
  await assert.rejects(engine.step(start.id), /原件/);
  for (const file of start.files) {
    await assert.rejects(
      engine.upload(start.id, file.source_id, strToU8('tampered')),
      /校验/,
    );
    await engine.upload(start.id, file.source_id, original.bytes);
  }
  let state = await engine.step(start.id);
  while (!state.complete) state = await engine.step(start.id);
  const restoredMission = await db
    .prepare('SELECT id FROM missions WHERE project_id=?')
    .bind(start.project_id)
    .first<{ id: string }>();
  const restoredBoard = await new MissionStore(db, target.id).view(
    restoredMission!.id,
  );
  assert.equal(restoredBoard.mission.status, 'paused');
  assert.deepEqual(restoredBoard.board!.stages, {});
  assert.equal(restoredBoard.board!.revision, 0);
  assert.deepEqual(
    restoredBoard.board!.order.map(
      (id) => restoredBoard.tasks.find((t) => t.id === id)?.title,
    ),
    ['Reading 2', 'Reading 1'],
  );
  assert.ok(
    restoredBoard.board!.order.every((id) => id !== manual && id !== second),
  );
  assert.equal(
    (await target.store.project(start.project_id)).title,
    'Restored research',
  );
  assert.equal((await engine.step(start.id)).complete, true);
  const sources = await db
    .prepare('SELECT * FROM sources WHERE project_id=?')
    .bind(start.project_id)
    .all<{ id: string; object_path: string }>();
  assert.equal(sources.results.length, 1);
  assert.notEqual(sources.results[0].id, original.source);
  assert.deepEqual(
    new Uint8Array(
      await (await files.get(sources.results[0].object_path))!.arrayBuffer(),
    ),
    original.bytes,
  );
  const notes = await db
    .prepare('SELECT * FROM notes WHERE project_id=? ORDER BY revision')
    .bind(start.project_id)
    .all<{ id: string; parent_id: string; body: string }>();
  assert.equal(notes.results.length, 2);
  assert.equal(notes.results[1].parent_id, notes.results[0].id);
  assert.ok(notes.results[1].body.includes(start.project_id));
  assert.ok(!notes.results[1].body.includes(original.project.id));
  const restoredEvidence = await db
    .prepare('SELECT id FROM evidence WHERE project_id=?')
    .bind(start.project_id)
    .first<{ id: string }>();
  assert.ok(restoredEvidence);
  assert.ok(notes.results[1].body.includes('evidence=' + restoredEvidence.id));
  assert.ok(!notes.results[1].body.includes(original.evidence));
  assert.equal(
    (
      await db
        .prepare('SELECT limit_units FROM project_budgets WHERE project_id=?')
        .bind(start.project_id)
        .first<{ limit_units: number }>()
    )?.limit_units,
    0,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT enabled FROM research_watches WHERE project_id=?')
        .bind(start.project_id)
        .first<{ enabled: number }>()
    )?.enabled,
    0,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM source_pages WHERE project_id=?')
        .bind(start.project_id)
        .first<{ n: number }>()
    )?.n,
    1,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM project_members WHERE project_id=?')
        .bind(start.project_id)
        .first<{ n: number }>()
    )?.n,
    0,
  );
  await assert.rejects(
    db
      .prepare('DELETE FROM notes WHERE project_id=?')
      .bind(start.project_id)
      .run(),
    /immutable/,
  );
  await db
    .prepare("INSERT INTO project_lifecycle VALUES(?,'deleting',?)")
    .bind(start.project_id, new Date().toISOString())
    .run();
  await purgeProject(db, files, start.project_id);
  assert.equal(await files.get(sources.results[0].object_path), null);
  assert.ok(await files.get(original.path));
});
void test('restore rejects tampered, oversized and foreign-reference archives and resumes only the same backup', async () => {
  const original = await fixture(),
    target = await researcher();
  const archive = await new Response(
    await projectArchive(original.owner.store, files, original.project.id),
  ).arrayBuffer();
  const backup = await readBackup(new File([archive], 'history.zip'));
  const corrupt = zipSync({
    'project.json': strToU8(backup.metadataText),
    'manifest.json': strToU8(JSON.stringify(backup.manifest)),
    [backup.manifest.files.find((f) => f.source_id)!.path]: strToU8('bad'),
  });
  await assert.rejects(
    readBackup(new File([new Uint8Array(corrupt)], 'bad.zip')),
    /校验/,
  );
  const engine = new ProjectRestore(target.store, files);
  const metadata = JSON.parse(backup.metadataText);
  metadata.records.source_origins = [
    {
      source_id: crypto.randomUUID(),
      provider: 'manual',
      external_id: 'x',
      url: '',
      license: '',
      retrieved_at: new Date().toISOString(),
      content_hash: '',
      metadata: '{}',
    },
  ];
  await assert.rejects(
    engine.start(metadata, backup.manifest, 'Foreign'),
    /包外/,
  );
  assert.equal((await target.store.listProjects()).length, 0);
  const start = await engine.start(
    JSON.parse(backup.metadataText),
    backup.manifest,
    'Interrupted',
  );
  await assert.rejects(
    engine.resume(
      start.id,
      { ...backup.metadata, exported_at: 'different' },
      backup.manifest,
    ),
    /同一份/,
  );
  const resumed = await engine.resume(
    start.id,
    JSON.parse(backup.metadataText),
    backup.manifest,
  );
  assert.equal(resumed.files[0].original_id, original.source);
  await db
    .prepare("UPDATE project_lifecycle SET state='deleting' WHERE project_id=?")
    .bind(start.project_id)
    .run();
  await purgeProject(db, files, start.project_id);
  assert.equal((await engine.active()).length, 0);
  const bomb = zipSync({ 'project.json': new Uint8Array(9 * 1024 * 1024) });
  await assert.rejects(
    readBackup(new File([new Uint8Array(bomb)], 'large.zip')),
    /超过/,
  );
});
void test('account deletion requires a recent own session, removes private originals and credentials, and preserves anonymized shared contributions', async () => {
  const f = await fixture(),
    other = await researcher(),
    shared = await other.store.createProject(
      'Shared research',
      'Preserve contributions',
    );
  await db
    .prepare('INSERT INTO project_members VALUES(?,?,?,?,?)')
    .bind(shared.id, f.owner.id, 'editor', other.id, new Date().toISOString())
    .run();
  await db
    .prepare('INSERT INTO project_comments VALUES(?,?,?,?,?,0,?)')
    .bind(
      crypto.randomUUID(),
      shared.id,
      shared.id,
      f.owner.id,
      'A contribution to keep',
      new Date().toISOString(),
    )
    .run();
  await db
    .prepare(
      'INSERT INTO verification(id,identifier,value,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      'reset-password:test-only',
      f.owner.id,
      Date.now() + 60000,
      Date.now(),
      Date.now(),
    )
    .run();
  const view = await deletionPreview(db, f.owner.id);
  await assert.rejects(
    requestAccountDeletion(
      db,
      f.owner.id,
      other.session,
      f.owner.email,
      view.digest,
    ),
    /重新登录/,
  );
  await assert.rejects(
    requestAccountDeletion(
      db,
      f.owner.id,
      f.owner.session,
      'wrong@example.test',
      view.digest,
    ),
    /邮箱/,
  );
  await assert.rejects(
    requestAccountDeletion(
      db,
      f.owner.id,
      f.owner.session,
      f.owner.email,
      'bad',
    ),
    /清单/,
  );
  await requestAccountDeletion(
    db,
    f.owner.id,
    f.owner.session,
    f.owner.email,
    view.digest,
  );
  assert.equal(
    await db
      .prepare('SELECT id FROM session WHERE user_id=?')
      .bind(f.owner.id)
      .first(),
    null,
  );
  assert.equal(
    await db
      .prepare('SELECT id FROM verification WHERE value=?')
      .bind(f.owner.id)
      .first(),
    null,
  );
  await assert.rejects(f.owner.store.project(shared.id), /不存在/);
  await assert.rejects(f.owner.store.createProject('blocked', ''), /closed/);
  const broken = new Proxy(files, {
    get(target, key) {
      if (key === 'delete')
        return async () => {
          throw new Error('Storage temporarily unavailable');
        };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await processAccountDeletions(db, broken);
  assert.equal(
    (
      await db
        .prepare('SELECT status FROM account_deletions WHERE owner_id=?')
        .bind(f.owner.id)
        .first<{ status: string }>()
    )?.status,
    'pending',
  );
  assert.ok(await files.get(f.path));
  await processAccountDeletions(db, files);
  assert.equal(
    (
      await db
        .prepare('SELECT status FROM account_deletions WHERE owner_id=?')
        .bind(f.owner.id)
        .first<{ status: string }>()
    )?.status,
    'complete',
  );
  assert.equal(await files.get(f.path), null);
  assert.ok(await other.store.project(shared.id));
  const comment = await db
    .prepare(
      'SELECT c.body,u.name,u.email FROM project_comments c JOIN user u ON u.id=c.author WHERE c.project_id=?',
    )
    .bind(shared.id)
    .first<{ body: string; name: string; email: string }>();
  assert.equal(comment?.body, 'A contribution to keep');
  assert.equal(comment?.name, 'Deleted researcher');
  assert.ok(!comment?.email.includes(f.owner.email));
  await processAccountDeletions(db, files);
});

void test('deleting an origin preserves a collaborator artifact and detached lineage', async () => {
  const a = await fixture(),
    b = await fixture();
  const origin = crypto.randomUUID(),
    copy = crypto.randomUUID();
  for (const [id, project, owner, parent] of [
    [origin, a.project.id, a.owner.id, null],
    [copy, b.project.id, b.owner.id, origin],
  ]) {
    await db
      .prepare(
        "INSERT INTO artifacts(id,project_id,title,kind,body,source_versions,sha256,license,created_by,derived_from,created_at) VALUES(?,?,'Reading result','note','{}','[]','original-hash','CC0',?,?,?)",
      )
      .bind(id, project, owner, parent, new Date().toISOString())
      .run();
  }
  await db
    .prepare('INSERT INTO artifact_dependencies VALUES(?,?)')
    .bind(copy, origin)
    .run();
  await db
    .prepare("INSERT INTO project_lifecycle VALUES(?,'deleting',?)")
    .bind(a.project.id, new Date().toISOString())
    .run();
  await purgeProject(db, files, a.project.id);
  const retained = await db
    .prepare('SELECT body,derived_from FROM artifacts WHERE id=?')
    .bind(copy)
    .first();
  assert.deepEqual(retained, { body: '{}', derived_from: null });
  assert.equal(
    (
      await db
        .prepare('SELECT * FROM artifact_lineage WHERE artifact_id=?')
        .bind(copy)
        .all()
    ).results.length,
    2,
  );
  await assert.rejects(
    db.prepare("UPDATE artifacts SET body='[]' WHERE id=?").bind(copy).run(),
    /immutable/,
  );
});

// Keep this fixture frozen: generating an export with today's code would not
// catch a change that breaks both the exporter and importer in the same way.
async function compatibilityArchive() {
  const root = new URL('./fixtures/backup-v1/', import.meta.url);
  const names = [
    'project.json',
    'manifest.json',
    ...(await fs.readdir(new URL('originals/', root))).map(
      (name) => `originals/${name}`,
    ),
  ];
  const entries = await Promise.all(
    names.map(
      async (name) =>
        [name, new Uint8Array(await fs.readFile(new URL(name, root)))] as const,
    ),
  );
  return zipSync(Object.fromEntries(entries));
}

for (const scenario of [
  {
    title:
      'frozen v1 synthetic archive restores originals and research records',
    bytes: compatibilityArchive,
  },
  ...(process.env.CANWOO_BACKUP_TEST_FILE
    ? [
        {
          title:
            'an operator-provided archive restores originals and research records',
          bytes: () => fs.readFile(process.env.CANWOO_BACKUP_TEST_FILE!),
        },
      ]
    : []),
]) {
  void test(scenario.title, async () => {
    const bytes = await scenario.bytes();
    const backup = await readBackup(new File([bytes], 'research.zip'));
    const user = await researcher(),
      engine = new ProjectRestore(user.store, files);
    const started = await engine.start(
      JSON.parse(backup.metadataText),
      backup.manifest,
      'Verified compatible backup',
    );
    for (const file of started.files) {
      const entry = backup.manifest.files.find(
        (f) => f.source_id === file.original_id,
      )!;
      await engine.upload(
        started.id,
        file.source_id,
        new Uint8Array(await backup.entries.get(entry.path)!.arrayBuffer()),
      );
    }
    let step = await engine.step(started.id);
    while (!step.complete) step = await engine.step(started.id);
    const metadata = JSON.parse(backup.metadataText);
    for (const table of [
      'sources',
      'source_versions',
      'notes',
      'mission_tasks',
    ]) {
      const count = await db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id=?`)
        .bind(started.project_id)
        .first<{ n: number }>();
      assert.equal(count?.n, metadata.records[table].length, table);
    }
    for (const file of started.files) {
      const source = await db
        .prepare('SELECT object_path FROM sources WHERE id=?')
        .bind(file.source_id)
        .first<{ object_path: string }>();
      const entry = backup.manifest.files.find(
        (f) => f.source_id === file.original_id,
      )!;
      assert.deepEqual(
        new Uint8Array(
          await (await files.get(source!.object_path))!.arrayBuffer(),
        ),
        new Uint8Array(await backup.entries.get(entry.path)!.arrayBuffer()),
      );
    }
    assert.equal(
      (await user.store.project(started.project_id)).title,
      'Verified compatible backup',
    );
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM research_watches WHERE project_id=? AND enabled<>0',
          )
          .bind(started.project_id)
          .first<{ n: number }>()
      )?.n,
      0,
      'A restored backup must not resume scheduled work',
    );
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM project_budgets WHERE project_id=? AND limit_units<>0',
          )
          .bind(started.project_id)
          .first<{ n: number }>()
      )?.n,
      0,
      'A restored backup must not authorize model spending',
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM missions WHERE project_id=? AND status='active'",
          )
          .bind(started.project_id)
          .first<{ n: number }>()
      )?.n,
      0,
      'Restored missions wait for the researcher to resume them',
    );
  });
}

void test('cancelling during an original upload removes the late file and queued cleanup retries safely', async () => {
  const f = await fixture(),
    target = await researcher();
  const archive = await new Response(
    await projectArchive(f.owner.store, files, f.project.id),
  ).arrayBuffer();
  const backup = await readBackup(new File([archive], 'cancel.zip'));
  const engine = new ProjectRestore(target.store, files);
  const started = await engine.start(
    JSON.parse(backup.metadataText),
    backup.manifest,
    'Cancelled copy',
  );
  let latePath = '';
  const delayed = new Proxy(files, {
    get(bucket, key) {
      if (key === 'put')
        return async (path: string, bytes: Uint8Array, options: unknown) => {
          latePath = path;
          await db.batch([
            db
              .prepare(
                "UPDATE project_restores SET status='cancelled' WHERE id=?",
              )
              .bind(started.id),
            db
              .prepare(
                "UPDATE project_lifecycle SET state='deleting' WHERE project_id=?",
              )
              .bind(started.project_id),
          ]);
          assert.equal((await engine.active())[0].status, 'cancelled');
          await cleanRestoreFiles(db, files);
          return bucket.put(path, bytes, options as R2PutOptions);
        };
      const value = Reflect.get(bucket, key);
      return typeof value === 'function' ? value.bind(bucket) : value;
    },
  });
  await assert.rejects(
    new ProjectRestore(target.store, delayed).upload(
      started.id,
      started.files[0].source_id,
      f.bytes,
    ),
    /状态已改变/,
  );
  assert.equal(await files.get(latePath), null);
  assert.equal((await engine.active()).length, 0);
  assert.ok(await files.get(f.path));
});

void test('a late upload after account deletion is fenced and storage failures leave a durable cleanup marker', async () => {
  const f = await fixture();
  const id = crypto.randomUUID(),
    path = `${f.owner.id}/${f.project.id}/${id}/original.txt`;
  await f.owner.store.reserveUpload(id, f.project.id, f.bytes.length);
  const preview = await deletionPreview(db, f.owner.id);
  const delayed = new Proxy(files, {
    get(bucket, key) {
      if (key === 'put')
        return async (
          key: string,
          bytes: Uint8Array,
          options: R2PutOptions,
        ) => {
          await requestAccountDeletion(
            db,
            f.owner.id,
            f.owner.session,
            f.owner.email,
            preview.digest,
          );
          await processAccountDeletions(db, files);
          return bucket.put(key, bytes, options);
        };
      if (key === 'delete')
        return async () => {
          throw new Error('Temporary storage failure');
        };
      const value = Reflect.get(bucket, key);
      return typeof value === 'function' ? value.bind(bucket) : value;
    },
  });
  await assert.rejects(
    saveOriginalUpload(
      f.owner.store,
      delayed,
      id,
      f.project.id,
      path,
      f.bytes,
      'text/plain',
    ),
    /storage failure/,
  );
  assert.ok(await files.get(path));
  assert.ok(
    await db
      .prepare('SELECT id FROM object_cleanup WHERE path=?')
      .bind(path)
      .first(),
  );
  await retryObjectCleanup(db, files);
  assert.equal(await files.get(path), null);
  assert.equal(
    await db
      .prepare('SELECT id FROM object_cleanup WHERE path=?')
      .bind(path)
      .first(),
    null,
  );
  const shared = await (
    await researcher()
  ).store.createProject('Active project', '');
  await assert.rejects(
    db
      .prepare('INSERT INTO upload_receipts VALUES(?,?,?,?,?,?)')
      .bind(
        id,
        f.owner.id,
        shared.id,
        path,
        'text/plain',
        new Date().toISOString(),
      )
      .run(),
    /closed/,
  );
});
import { MissionStore } from '../lib/platform/missions';
import { taskInputSchema } from '../lib/platform/types';
void test('research methods and correction history survive export/restore and are included in project deletion', async () => {
  const original = await fixture(),
    target = await researcher(),
    store = new MissionStore(db, original.owner.id),
    taskId = crypto.randomUUID();
  await db
    .prepare('INSERT INTO research_methods VALUES(?,?,?,?,?,?)')
    .bind(
      crypto.randomUUID(),
      original.project.id,
      'Archive reading',
      JSON.stringify({
        title: 'Archive reading',
        kind: 'extract',
        instructions: 'Preserve uncertainty',
        fields: ['Name'],
      }),
      original.owner.id,
      new Date().toISOString(),
    )
    .run();
  const mission = await store.create(original.project.id, {
    title: 'Review',
    question: 'What is explicit?',
    scope: 'One original',
    acceptance: 'Exact citations',
    tasks: [
      {
        id: taskId,
        title: 'Check record',
        executor: 'human',
        kind: 'review',
        dependencies: [],
        assignee: 'Researcher',
        input: taskInputSchema.parse({
          version_ids: [original.version],
          parameters: { extraction: true, fields: ['Name'] },
        }),
      },
    ],
  });
  await store.control(mission, 'start');
  const claim = await store.claim(taskId, original.owner.id, 'human');
  const data = {
    records: [
      {
        label: 'Record',
        cells: [
          { field: 'Name', value: 'archives', status: 'explicit', citation: 1 },
        ],
      },
    ],
    coverage: 'One page',
  };
  await store.submit(taskId, claim.lease, original.owner.id, {
    summary: 'Original record',
    citations: [{ version_id: original.version, page: 1, quote: 'archives' }],
    data,
    checks: [],
  });
  data.records[0].cells[0].status = 'inferred';
  await store.correct(
    taskId,
    data,
    'Classification needs review',
    (await store.task(taskId)).revision,
  );
  const archive = await new Response(
      await projectArchive(store, files, original.project.id),
    ).arrayBuffer(),
    backup = await readBackup(new File([archive], 'methods.zip'));
  const metadata = JSON.parse(backup.metadataText);
  assert.equal(metadata.records.research_methods.length, 1);
  assert.equal(metadata.records.task_corrections.length, 1);
  const engine = new ProjectRestore(target.store, files),
    started = await engine.start(metadata, backup.manifest, 'Restored method');
  for (const file of started.files)
    await engine.upload(started.id, file.source_id, original.bytes);
  let step = await engine.step(started.id);
  while (!step.complete) step = await engine.step(started.id);
  const correction = await db
    .prepare('SELECT task_id,body FROM task_corrections WHERE project_id=?')
    .bind(started.project_id)
    .first<{ task_id: string; body: string }>();
  assert.notEqual(correction!.task_id, taskId);
  const history = JSON.parse(correction!.body);
  assert.equal(history.before.data.records[0].cells[0].status, 'explicit');
  assert.equal(history.after.data.records[0].cells[0].status, 'inferred');
  assert.notEqual(history.after.citations[0].version_id, original.version);
  await db
    .prepare(
      "INSERT INTO project_lifecycle(project_id,state,created_at) VALUES(?,'deleting',?)",
    )
    .bind(started.project_id, new Date().toISOString())
    .run();
  await purgeProject(db, files, started.project_id);
  assert.equal(
    (
      await db
        .prepare(
          'SELECT COUNT(*) AS n FROM task_corrections WHERE project_id=?',
        )
        .bind(started.project_id)
        .first<{ n: number }>()
    )?.n,
    0,
  );
  assert.equal(
    (
      await db
        .prepare(
          'SELECT COUNT(*) AS n FROM research_methods WHERE project_id=?',
        )
        .bind(started.project_id)
        .first<{ n: number }>()
    )?.n,
    0,
  );
});

void test('rich notes retain complete immutable versions, retry identity and restored citation targets', async () => {
  const f = await fixture();
  const document = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Read this source',
            marks: [
              { type: 'textStyle', attrs: { fontSize: '24px' } },
              {
                type: 'link',
                attrs: {
                  href: `/?project=${f.project.id}&tab=sources&version=${f.version}&page=1&evidence=${f.evidence}`,
                },
              },
            ],
          },
        ],
      },
      { type: 'blockMath', attrs: { latex: 'P(H | E)' } },
    ],
  });
  const id = crypto.randomUUID(),
    input = {
      p_id: id,
      p_project: f.project.id,
      p_parent: null,
      p_title: 'Rich note',
      p_body: 'client projection is untrusted',
      p_document: document,
    };
  await f.owner.store.saveNote(input);
  assert.equal(await f.owner.store.saveNote(input), id);
  const row = await db
    .prepare('SELECT * FROM notes WHERE id=?')
    .bind(id)
    .first<{ body: string; document: string }>();
  assert.equal(row?.document, document);
  assert.match(row!.body, /Read this source/);
  assert.doesNotMatch(row!.body, /untrusted/);
  const child = await f.owner.store.saveNote({
    ...input,
    p_id: crypto.randomUUID(),
    p_parent: id,
    p_title: 'Second revision',
  });
  await assert.rejects(
    f.owner.store.saveNote({
      ...input,
      p_id: crypto.randomUUID(),
      p_parent: id,
      p_title: 'Stale revision',
    }),
    /新版本/,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT document FROM notes WHERE id=?')
        .bind(child)
        .first<{ document: string }>()
    )?.document,
    document,
  );
  const archive = await new Response(
      await projectArchive(f.owner.store, files, f.project.id),
    ).arrayBuffer(),
    backup = await readBackup(new File([archive], 'rich.zip'));
  const target = await researcher(),
    engine = new ProjectRestore(target.store, files),
    start = await engine.start(
      JSON.parse(backup.metadataText),
      backup.manifest,
      'Restored rich writing',
    );
  for (const file of start.files)
    await engine.upload(start.id, file.source_id, f.bytes);
  let state = await engine.step(start.id);
  while (!state.complete) state = await engine.step(start.id);
  const restored = await db
    .prepare('SELECT document FROM notes WHERE project_id=? AND title=?')
    .bind(start.project_id, 'Second revision')
    .first<{ document: string }>();
  assert.ok(restored);
  assert.match(restored.document, /24px/);
  assert.match(restored.document, /P\(H \| E\)/);
  assert.ok(restored.document.includes(start.project_id));
  assert.ok(!restored.document.includes(f.project.id));
});
