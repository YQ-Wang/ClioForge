import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { ResearchStore } from '../lib/store';
import { researchInbox, seeInboxItem } from '../lib/research-inbox';
import { sha256 } from '../lib/platform/search';

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
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)',
    )
    .bind(id, 'Researcher', `${id}@example.test`, Date.now(), Date.now())
    .run();
  return new ResearchStore(db, id);
}
async function missionFixture() {
  const owner = await researcher(),
    editor = await researcher(),
    project = await owner.createProject('Port records', 'Check the chronology'),
    mission = crypto.randomUUID(),
    timestamp = '2026-09-01T12:00:00.000Z';
  await db.batch([
    db
      .prepare("INSERT INTO project_members VALUES(?,?,'editor',?,?)")
      .bind(project.id, editor.owner, owner.owner, timestamp),
    db
      .prepare(
        "INSERT INTO missions(id,project_id,title,question,scope,acceptance,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',?,?,?)",
      )
      .bind(
        mission,
        project.id,
        'Review sources',
        'When?',
        'Port',
        'Check source',
        owner.owner,
        timestamp,
        timestamp,
      ),
  ]);
  return { owner, editor, project, mission };
}
function taskStatement(
  f: Awaited<ReturnType<typeof missionFixture>>,
  id: string,
  assignee: string,
  timestamp: string,
) {
  return db
    .prepare(
      "INSERT INTO mission_tasks(id,mission_id,project_id,title,kind,executor,assignee,status,input,created_at,updated_at) VALUES(?,?,?,?,'manual','human',?,'review','{}',?,?)",
    )
    .bind(
      id,
      f.mission,
      f.project.id,
      'Review the recorded date',
      assignee,
      timestamp,
      timestamp,
    );
}
void test('inbox limits apply after personal task relevance, so assigned work is not hidden by newer teammate tasks', async () => {
  const f = await missionFixture(),
    assigned = crypto.randomUUID();
  await db.batch([
    taskStatement(f, assigned, f.editor.owner, '2026-08-01T12:00:00.000Z'),
    ...Array.from({ length: 201 }, () =>
      taskStatement(
        f,
        crypto.randomUUID(),
        f.owner.owner,
        '2026-09-01T12:00:00.000Z',
      ),
    ),
  ]);
  const items = (await researchInbox(f.editor)).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].key, `task:${assigned}:1`);
  assert.equal(
    items[0].href,
    `/?project=${f.project.id}&tab=platform&mission=${f.mission}&task=${assigned}`,
  );
});
void test('mention dates sort with tasks and preserve previously stored personal receipts', async () => {
  const f = await missionFixture(),
    comment = crypto.randomUUID(),
    task = crypto.randomUUID(),
    created = '2026-09-05T14:00:00.000Z';
  await db.batch([
    taskStatement(f, task, f.editor.owner, '2026-09-04T12:00:00.000Z'),
    db
      .prepare(
        'INSERT INTO project_comments(id,project_id,target_id,author,body,created_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(
        comment,
        f.project.id,
        task,
        f.owner.owner,
        'Can you check this date?',
        created,
      ),
    db
      .prepare('INSERT INTO discussion_mentions VALUES(?,?)')
      .bind(comment, f.editor.owner),
  ]);
  const oldFingerprint = await sha256(
    JSON.stringify({
      key: `mention:${comment}`,
      project_id: f.project.id,
      kind: 'mention',
      title: 'Researcher',
      detail: 'Can you check this date?',
      href: `/?project=${f.project.id}&tab=team&discussion=${task}`,
      updated_at: '',
    }),
  );
  await db
    .prepare('INSERT INTO attention_receipts VALUES(?,?,?,?,?)')
    .bind(
      f.editor.owner,
      f.project.id,
      `mention:${comment}`,
      oldFingerprint,
      created,
    )
    .run();
  let items = (await researchInbox(f.editor)).items;
  assert.equal(items[0].key, `mention:${comment}`);
  assert.equal(items[0].updated_at, created);
  assert.equal(items[0].fingerprint, oldFingerprint);
  assert.equal(items[0].seen, true);
  await seeInboxItem(f.editor, {
    key: items[0].key,
    fingerprint: oldFingerprint,
    seen: false,
  });
  assert.equal((await researchInbox(f.editor)).items[0].seen, false);
  await seeInboxItem(f.editor, {
    key: items[0].key,
    fingerprint: oldFingerprint,
    seen: true,
  });
  await db
    .prepare('UPDATE project_comments SET body=? WHERE id=?')
    .bind('The corrected date needs another look.', comment)
    .run();
  items = (await researchInbox(f.editor)).items;
  assert.equal(items[0].seen, false);
  assert.notEqual(items[0].fingerprint, oldFingerprint);
  await assert.rejects(
    seeInboxItem(f.editor, {
      key: items[0].key,
      fingerprint: oldFingerprint,
      seen: true,
    }),
    /变化/,
  );
});
