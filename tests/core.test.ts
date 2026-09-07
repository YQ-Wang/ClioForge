import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { MissionStore } from '../lib/platform/missions';
import { VersionStore } from '../lib/platform/versions';
import { searchPages } from '../lib/platform/search';
import { importLedSample } from '../lib/platform/dataset';
import { researchTemplate } from '../lib/platform/templates';
import {
  cloudProvider,
  startOAuth,
  completeOAuth,
  cancelOAuth,
  cloudToken,
  readGoogleFile,
  importCloudText,
  type ConnectionEnv,
} from '../lib/platform/connections';
import { builtin } from '../lib/platform/execute';
import { ResearchStore, validatePages } from '../lib/store';
import { encrypt, decrypt } from '../lib/crypto';
import {
  providerRequest,
  invoke,
  ProviderError,
  safeProviderFailure,
} from '../lib/providers';
import {
  boundedBytes,
  MAX_FILE_BYTES,
  USER_STORAGE_BYTES,
  SITE_STORAGE_BYTES,
} from '../lib/files';
import { dateLabel, editDate } from '../lib/csl-values';
import { createAuth, googleConfigured } from '../lib/auth';
import { safeWorkspaceReturn, projectPath } from '../lib/navigation';
import { reportMarkdown } from '../lib/research-report';
import { TeamStore } from '../lib/project-team';
import { AccountSettingsStore, accountInput } from '../lib/account-settings';
import { workspaceRoute } from '../lib/navigation';
import { selectedPages } from '../lib/page-selection';
import { readableResponse } from '../lib/readable-response';
void test('readable model responses preserve citations without trusting provider-authored checks', () => {
  const citation = {
    version_id: 'c2ee4bfe-7dc3-4c6a-833a-575330c765cb',
    page: 1,
    quote: 'original words',
  };
  const text =
    '```json\n' +
    JSON.stringify({
      summary: 'A candidate interpretation',
      citations: [citation],
      checks: [{ name: 'verified', passed: true, detail: 'model claim' }],
    }) +
    '\n```';
  const parsed = readableResponse(text);
  assert.equal(parsed?.summary, 'A candidate interpretation');
  assert.deepEqual(parsed?.citations, [citation]);
  assert.deepEqual(parsed?.checks, []);
  assert.equal(readableResponse('{"summary":"truncated'), null);
  assert.equal(readableResponse('Plain text'), null);
  assert.equal(readableResponse('{"summary":5}'), null);
});
import { projectArchive } from '../lib/project-export';
import { unzipSync, strFromU8 } from 'fflate';
import { sha256 } from '../lib/platform/search';
import {
  reserveDirectRun,
  finishDirectRun,
  recoverDirectRuns,
  directPrice,
} from '../lib/direct-research';
let mf: Miniflare;
let db: D1Database;
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch(){ return new Response("ok") } }',
      d1Databases: ['DB'],
      r2Buckets: ['FILES'],
      compatibilityDate: '2026-09-04',
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  const auth = await fs.readFile(
    new URL('../drizzle/0000_luxuriant_arachne.sql', import.meta.url),
    'utf8',
  );
  for (const sql of auth.split('--> statement-breakpoint'))
    if (sql.trim()) await db.prepare(sql.trim()).run();
  const research = await fs.readFile(
    new URL('../drizzle/0001_research.sql', import.meta.url),
    'utf8',
  );
  for (const sql of research.split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  const extension = await fs.readFile(
    new URL('../drizzle/0002_workbench.sql', import.meta.url),
    'utf8',
  );
  for (const sql of extension.split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  const storage = await fs.readFile(
    new URL('../drizzle/0003_storage_budget.sql', import.meta.url),
    'utf8',
  );
  for (const sql of storage.split('\n'))
    if (sql.trim() && !sql.trim().startsWith('--')) await db.prepare(sql).run();
  const platform = await fs.readFile(
    new URL('../drizzle/0004_platform.sql', import.meta.url),
    'utf8',
  );
  for (const sql of platform.split('\n'))
    if (sql.trim() && !sql.startsWith('--')) await db.prepare(sql).run();
  const fences = await fs.readFile(
    new URL('../drizzle/0005_execution_fences.sql', import.meta.url),
    'utf8',
  );
  for (const sql of fences.split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  await db
    .prepare(
      await fs.readFile(
        new URL('../drizzle/0006_oauth_return.sql', import.meta.url),
        'utf8',
      ),
    )
    .run();
  const invitations = await fs.readFile(
    new URL('../drizzle/0007_project_invitations.sql', import.meta.url),
    'utf8',
  );
  for (const sql of invitations.split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  const noteLibrary = await fs.readFile(
    new URL('../drizzle/0008_note_library.sql', import.meta.url),
    'utf8',
  );
  for (const sql of noteLibrary.split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  await db
    .prepare(
      await fs.readFile(
        new URL('../drizzle/0009_account_preferences.sql', import.meta.url),
        'utf8',
      ),
    )
    .run();
  const costs = await fs.readFile(
    new URL('../drizzle/0010_direct_run_costs.sql', import.meta.url),
    'utf8',
  );
  for (const sql of costs.split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  const lifecycle = await fs.readFile(
    new URL('../drizzle/0011_data_lifecycle.sql', import.meta.url),
    'utf8',
  );
  for (const sql of lifecycle.split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  const closedUploads = await fs.readFile(
    new URL('../drizzle/0012_closed_uploads.sql', import.meta.url),
    'utf8',
  );
  for (const sql of closedUploads.split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  for (const sql of (
    await fs.readFile(
      new URL('../drizzle/0013_research_methods.sql', import.meta.url),
      'utf8',
    )
  ).split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  for (const sql of (
    await fs.readFile(
      new URL('../drizzle/0014_semantic_search.sql', import.meta.url),
      'utf8',
    )
  ).split('\n'))
    if (sql.trim()) await db.prepare(sql).run();
  await db
    .prepare(
      await fs.readFile(
        new URL('../drizzle/0015_rich_notes.sql', import.meta.url),
        'utf8',
      ),
    )
    .run();
  for (const statement of (
    await fs.readFile(
      new URL('../drizzle/0017_invitation_delivery.sql', import.meta.url),
      'utf8',
    )
  ).split('\n'))
    if (statement.trim()) await db.prepare(statement).run();
  for (const statement of (
    await fs.readFile(
      new URL('../drizzle/0016_material_preparation.sql', import.meta.url),
      'utf8',
    )
  ).split('\n'))
    if (statement.trim()) await db.prepare(statement).run();
  for (const statement of (
    await fs.readFile(
      new URL('../drizzle/0018_research_attention.sql', import.meta.url),
      'utf8',
    )
  ).split('\n'))
    if (statement.trim()) await db.prepare(statement).run();
  for (const statement of (
    await fs.readFile(
      new URL('../drizzle/0019_claim_assessments.sql', import.meta.url),
      'utf8',
    )
  ).split('\n'))
    if (statement.trim()) await db.prepare(statement).run();
  for (const statement of (
    await fs.readFile(
      new URL('../drizzle/0020_research_inbox.sql', import.meta.url),
      'utf8',
    )
  ).split('\n'))
    if (statement.trim()) await db.prepare(statement).run();
  for (const statement of (
    await fs.readFile(
      new URL('../drizzle/0021_mission_boards.sql', import.meta.url),
      'utf8',
    )
  ).split('\n'))
    if (statement.trim()) await db.prepare(statement).run();
});
after(async () => {
  await mf?.dispose();
});
void test('OCR and background work share one atomic budget and settle or retain reservations without double charging', async () => {
  const { owner, a, work, input } = await jobSetup();
  const job = await createJob(owner, input);
  const run = {
    id: crypto.randomUUID(),
    project_id: a.project.id,
    kind: 'ocr',
    prompt: 'Transcribe page',
    source_version_ids: [a.versionId],
    model_snapshot: { provider: 'openai', model_id: 'test', page: 1 },
  };
  const price = { input_rate: 1, output_rate: 2, max_output: 128 };
  await work.mutate({
    action: 'budget',
    project_id: a.project.id,
    limit_units: job!.reserved_units + 356,
  });
  const submissions = await Promise.all([
    reserveDirectRun(owner, run, price, 100),
    reserveDirectRun(owner, run, price, 100),
  ]);
  assert.equal(submissions.filter(Boolean).length, 1);
  assert.equal(
    (await work.workbench(a.project.id)).budget!.committed_units,
    job!.reserved_units + 356,
  );
  await assert.rejects(
    createJob(owner, { ...input, id: crypto.randomUUID() }),
    /预算/,
  );
  await finishDirectRun(
    owner,
    run.id,
    {
      status: 'succeeded',
      result: '原文',
      input_tokens: 20,
      output_tokens: 30,
    },
    true,
  );
  await finishDirectRun(owner, run.id, { status: 'failed' }, false);
  assert.equal((await owner.run(run.id))!.result, '原文');
  assert.equal(
    (await work.workbench(a.project.id)).budget!.committed_units,
    job!.reserved_units + 80,
  );
  await assert.rejects(
    reserveDirectRun(owner, { ...run, id: crypto.randomUUID() }, price, 100),
    /预算/,
  );
  await controlJob(owner, job!.id, 'cancel');
  const uncertain = { ...run, id: crypto.randomUUID() };
  await reserveDirectRun(owner, uncertain, price, 100);
  await db
    .prepare('UPDATE research_runs SET created_at=? WHERE id=?')
    .bind('2000-01-01T00:00:00.000Z', uncertain.id)
    .run();
  await recoverDirectRuns(db);
  await recoverDirectRuns(db);
  assert.equal((await owner.run(uncertain.id))!.status, 'failed');
  assert.equal(
    (await work.workbench(a.project.id)).budget!.committed_units,
    436,
  );
  const outsider = await user();
  await assert.rejects(
    reserveDirectRun(outsider, { ...run, id: crypto.randomUUID() }, price, 100),
    /不存在/,
  );
  await assert.rejects(directPrice(owner, input.model_id, 'ocr'), /费率/);
});
void test('batch transcription page ranges reject invalid or oversized requests and deduplicate pages', () => {
  const available = Array.from({ length: 500 }, (_, index) => index + 1);
  assert.deepEqual(selectedPages('1-3, 2, 8，9', available), [1, 2, 3, 8, 9]);
  for (const input of [
    '',
    '0',
    '3-1',
    '1-11',
    '1-500',
    '2;3',
    '501',
    '1,2,3,4,5,6,7,8,9,10,11',
  ])
    assert.throws(() => selectedPages(input, available));
  assert.throws(() => selectedPages('2', [1, 3]));
});
void test('provider truncation preserves candidate text and stops background publication without automatic retries', async () => {
  for (const [provider, body] of [
    [
      'openrouter',
      {
        choices: [
          {
            message: { content: 'Partial historical text' },
            finish_reason: 'length',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 30 },
      },
    ],
    [
      'anthropic',
      {
        content: [{ type: 'text', text: 'Partial historical text' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 20, output_tokens: 30 },
      },
    ],
    [
      'google',
      {
        candidates: [
          {
            content: { parts: [{ text: 'Partial historical text' }] },
            finishReason: 'MAX_TOKENS',
          },
        ],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 30 },
      },
    ],
  ] as const) {
    const response = await invoke(
      {
        provider,
        model: 'test',
        key: 'test',
        prompt: 'transcribe',
        system: 'test',
      },
      async () => Response.json(body),
    );
    assert.equal(response.truncated, true);
    assert.equal(response.text, 'Partial historical text');
  }
  const { owner, input, secret } = await jobSetup();
  const job = await createJob(owner, input);
  let calls = 0;
  const fake: typeof invoke = async () => {
    calls++;
    return {
      text: 'Partial historical text',
      inputTokens: 20,
      outputTokens: 30,
      truncated: true,
    };
  };
  await executeJob(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: secret },
    job!.id,
    fake,
  );
  await executeJob(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: secret },
    job!.id,
    fake,
  );
  const final = await jobById(db, job!.id);
  assert.equal(calls, 1);
  assert.equal(final!.status, 'failed');
  assert.equal(final!.result, 'Partial historical text');
  assert.match(final!.error!, /长度限制/);
});
void test('research packages preserve originals and note versions, exclude credentials and reject foreign or incomplete exports', async () => {
  const owner = await user(),
    outsider = await user();
  const item = await source(owner);
  const other = await source(outsider);
  const files = (await mf.getR2Bucket('FILES')) as unknown as R2Bucket;
  const original = new TextEncoder().encode('原始航运记录\n1861');
  await files.put(item.path, original);
  const first = await owner.saveNote({
    p_project: item.project.id,
    p_parent: null,
    p_title: '阅读札记',
    p_body: '初读',
  });
  await owner.saveNote({
    p_project: item.project.id,
    p_parent: first,
    p_title: '阅读札记',
    p_body: '核查后的解释',
  });
  const stream = await projectArchive(owner, files, item.project.id);
  const entries = unzipSync(
    new Uint8Array(await new Response(stream).arrayBuffer()),
  );
  const manifest = JSON.parse(strFromU8(entries['manifest.json']));
  const records = JSON.parse(strFromU8(entries['project.json'])).records;
  assert.equal(records.notes.length, 2);
  assert.equal(records.source_versions.length, 1);
  assert.deepEqual(
    records.sources.map((row: { id: string }) => row.id),
    [item.id],
  );
  assert.ok(!JSON.stringify(records).includes(other.id));
  for (const privateTable of [
    'account',
    'session',
    'model_connections',
    'cloud_connections',
    'agent_credentials',
    'project_invitations',
  ])
    assert.equal(records[privateTable], undefined);
  assert.deepEqual(entries[`originals/${item.id}.txt`], original);
  for (const entry of manifest.files) {
    assert.equal(entry.bytes, entries[entry.path].byteLength);
    assert.equal(entry.sha256, await sha256(entries[entry.path]));
  }
  await assert.rejects(
    projectArchive(outsider, files, item.project.id),
    /不存在/,
  );
  await files.delete(item.path);
  const incomplete = await projectArchive(owner, files, item.project.id);
  await assert.rejects(new Response(incomplete).arrayBuffer(), /missing/);
});
void test('account settings isolate sessions, profile preferences and usage without exposing credentials', async () => {
  const alice = await user(),
    bob = await user();
  const sessionIds = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  for (const [index, id] of sessionIds.entries())
    await db
      .prepare(
        'INSERT INTO session(id,user_id,token,created_at,updated_at,expires_at,user_agent) VALUES(?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        index === 2 ? bob.owner : alice.owner,
        `private-session-${id}`,
        Date.now(),
        Date.now(),
        Date.now() + 3600000,
        'test browser',
      )
      .run();
  const aliceSettings = new AccountSettingsStore(
    db,
    alice.owner,
    sessionIds[0],
  );
  const first = await aliceSettings.read();
  assert.deepEqual(
    first.sessions.map((item) => item.id).sort(),
    sessionIds.slice(0, 2).sort(),
  );
  assert.equal(first.sessions.filter((item) => item.current).length, 1);
  assert.ok(!JSON.stringify(first).includes('private-session-'));
  assert.throws(() =>
    accountInput.parse({ action: 'profile', name: ' ', locale: 'en' }),
  );
  await aliceSettings.mutate(
    accountInput.parse({
      action: 'profile',
      name: 'Historian Alice',
      locale: 'en',
    }),
  );
  assert.equal((await aliceSettings.read()).locale, 'en');
  assert.equal(
    await db
      .prepare('SELECT name FROM user WHERE id=?')
      .bind(alice.owner)
      .first('name'),
    'Historian Alice',
  );
  assert.equal(
    (await new AccountSettingsStore(db, bob.owner, sessionIds[2]).read())
      .locale,
    null,
  );
  await assert.rejects(
    aliceSettings.mutate({ action: 'revoke_session', id: sessionIds[0] }),
    /退出登录/,
  );
  await assert.rejects(
    aliceSettings.mutate({ action: 'revoke_session', id: sessionIds[2] }),
    /不存在/,
  );
  await aliceSettings.mutate({ action: 'revoke_other_sessions' });
  assert.deepEqual(
    (await aliceSettings.read()).sessions.map((item) => item.id),
    [sessionIds[0]],
  );
  assert.equal(
    (await new AccountSettingsStore(db, bob.owner, sessionIds[2]).read())
      .sessions.length,
    1,
  );
  assert.equal(
    await db
      .prepare('SELECT id FROM session WHERE id=?')
      .bind(sessionIds[1])
      .first('id'),
    null,
  );
});
void test('project settings require ownership and preserve concurrent edits', async () => {
  const owner = await user(),
    editor = await user();
  const project = await owner.createProject('Before', 'Original question');
  await db
    .prepare('INSERT INTO project_members VALUES(?,?,?,?,?)')
    .bind(
      project.id,
      editor.owner,
      'editor',
      owner.owner,
      new Date().toISOString(),
    )
    .run();
  const edit = {
    id: project.id,
    title: 'After',
    description: 'Focused question',
    expected_title: project.title,
    expected_description: project.description,
  };
  await assert.rejects(editor.updateProject(edit), /权限/);
  const result = await owner.updateProject(edit);
  assert.equal(result.title, 'After');
  await assert.rejects(
    owner.updateProject({ ...edit, title: 'Stale edit' }),
    /已有更新/,
  );
  assert.equal(
    (await owner.project(project.id)).description,
    'Focused question',
  );
});
void test('workspace routes preserve project and account context and reject unknown sections', () => {
  const id = crypto.randomUUID();
  assert.deepEqual(
    workspaceRoute(`?project=${id}&tab=notes&settings=security`),
    {
      projectId: id,
      tab: 'notes',
      settings: 'security',
      guide: false,
      inbox: false,
    },
  );
  assert.equal(workspaceRoute(`?project=${id}&tab=findings`).tab, 'findings');
  assert.deepEqual(
    workspaceRoute(
      '?project=https://other.invalid&tab=invalid&settings=invalid',
    ),
    {
      projectId: '',
      tab: 'overview',
      settings: '',
      guide: false,
      inbox: false,
    },
  );
  assert.equal(workspaceRoute(`?project=${id}&view=guide`).guide, true);
});
void test('shared roles preserve private keys and fence source writes and reviews', async () => {
  const owner = await user(),
    viewer = await user(),
    editor = await user(),
    research = await source(owner);
  for (const [member, role] of [
    [viewer, 'viewer'],
    [editor, 'editor'],
  ] as const)
    await db
      .prepare('INSERT INTO project_members VALUES(?,?,?,?,?)')
      .bind(
        research.project.id,
        member.owner,
        role,
        owner.owner,
        new Date().toISOString(),
      )
      .run();
  assert.equal((await viewer.listProjects()).length, 1);
  assert.equal(
    (await viewer.version(research.versionId)).source_id,
    research.id,
  );
  await assert.rejects(
    viewer.reviseSource({
      p_source: research.id,
      p_expected: 1,
      p_pages: [{ page: 1, text: 'unauthorized' }],
      p_method: 'manual',
    }),
    /权限/,
  );
  await assert.rejects(
    viewer.reserveUpload(crypto.randomUUID(), research.project.id, 20),
    /权限/,
  );
  await assert.rejects(editor.project(research.project.id, 'review'), /权限/);
  await assert.rejects(editor.project(research.project.id, 'admin'), /权限/);
  await db
    .prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?')
    .bind(research.project.id, viewer.owner)
    .run();
  await assert.rejects(viewer.version(research.versionId), /不存在/);
});
void test('project invitations support new researchers but require the invited verified email and explicit acceptance', async () => {
  const owner = await user(),
    outsider = await user(),
    research = await source(owner);
  const team = new TeamStore(db, owner.owner);
  const futureId = crypto.randomUUID(),
    email = `${futureId}@example.test`;
  const id = await team.invite(research.project.id, {
    email: ` ${email.toUpperCase()} `,
    role: 'editor',
  });
  assert.equal((await team.team(research.project.id)).members.length, 1);
  const stranger = new TeamStore(db, outsider.owner);
  assert.equal((await stranger.inbox()).length, 0);
  await assert.rejects(stranger.respond(id, true), /失效/);
  await assert.rejects(stranger.team(research.project.id), /不存在/);
  await db
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)',
    )
    .bind(futureId, 'Invited historian', email, Date.now(), Date.now())
    .run();
  const invited = new TeamStore(db, futureId);
  await assert.rejects(invited.inbox(), /验证/);
  await assert.rejects(invited.respond(id, true), /验证/);
  await db
    .prepare('UPDATE user SET email_verified=1 WHERE id=?')
    .bind(futureId)
    .run();
  assert.equal((await invited.inbox())[0].title, research.project.title);
  await assert.rejects(invited.readProject(research.project.id), /不存在/);
  assert.equal(await invited.respond(id, true), research.project.id);
  assert.equal(
    (await invited.project(research.project.id, 'write')).role,
    'editor',
  );
  assert.equal((await invited.inbox()).length, 0);
  await assert.rejects(invited.respond(id, true), /失效/);
  assert.equal((await team.team(research.project.id)).members.length, 2);
  await assert.rejects(
    team.invite(research.project.id, { email, role: 'reviewer' }),
    /已在项目/,
  );
});
void test('owners control project roles and removal preserves contributions while revoking data and agent access', async () => {
  const owner = await user(),
    member = await user(),
    research = await source(owner);
  const team = new TeamStore(db, owner.owner),
    invited = new TeamStore(db, member.owner);
  const id = await team.invite(research.project.id, {
    email: `${member.owner}@example.test`,
    role: 'editor',
  });
  await invited.respond(id, true);
  await assert.rejects(
    invited.invite(research.project.id, {
      email: 'unauthorized@example.test',
      role: 'editor',
    }),
    /权限/,
  );
  await assert.rejects(
    invited.setMemberRole(research.project.id, member.owner, 'reviewer'),
    /权限/,
  );
  await assert.rejects(
    invited.removeMember(research.project.id, owner.owner),
    /权限/,
  );
  await assert.rejects(
    team.removeMember(research.project.id, owner.owner),
    /负责人/,
  );
  await assert.rejects(
    team.setMemberRole(research.project.id, owner.owner, 'viewer'),
    /负责人/,
  );
  const note = await member.saveNote({
    p_project: research.project.id,
    p_parent: null,
    p_title: '共同核查',
    p_body: '保持原引文，区分文字与解释。',
  });
  await team.setMemberRole(research.project.id, member.owner, 'viewer');
  await assert.rejects(
    member.saveNote({
      p_project: research.project.id,
      p_parent: note,
      p_title: '修改',
      p_body: '不应保存',
    }),
    /权限/,
  );
  assert.equal((await member.readProject(research.project.id)).notes.length, 1);
  await assert.rejects(member.project(research.project.id, 'review'), /权限/);
  await team.setMemberRole(research.project.id, member.owner, 'reviewer');
  await member.project(research.project.id, 'review');
  const keyId = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO agent_credentials(id,project_id,owner_id,label,token_hash,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .bind(
      keyId,
      research.project.id,
      member.owner,
      'Collaborator tool',
      crypto.randomUUID(),
      '[]',
      '2099-01-01',
      new Date().toISOString(),
    )
    .run();
  await team.removeMember(research.project.id, member.owner);
  assert.equal((await member.listProjects()).length, 0);
  await assert.rejects(member.version(research.versionId), /不存在/);
  await assert.rejects(member.source(research.id), /不存在/);
  await assert.rejects(member.readProject(research.project.id), /不存在/);
  assert.ok(
    (
      await db
        .prepare('SELECT revoked_at FROM agent_credentials WHERE id=?')
        .bind(keyId)
        .first<{ revoked_at: string }>()
    )?.revoked_at,
  );
  assert.equal((await owner.readProject(research.project.id)).notes.length, 1);
  assert.equal(
    (await owner.version(research.versionId)).pages[0].text,
    '港口于一八六一年开放。',
  );
});
void test('renewed, declined, expired and concurrently revoked invitations cannot resurrect access', async () => {
  const owner = await user(),
    member = await user(),
    project = await owner.createProject('Invitations', '');
  const team = new TeamStore(db, owner.owner),
    invited = new TeamStore(db, member.owner);
  const input = { email: `${member.owner}@example.test`, role: 'editor' };
  const old = await team.invite(project.id, input),
    fresh = await team.invite(project.id, { ...input, role: 'viewer' });
  await assert.rejects(invited.respond(old, true), /失效/);
  await invited.respond(fresh, false);
  await assert.rejects(invited.respond(fresh, true), /失效/);
  const expired = await team.invite(project.id, input);
  await db
    .prepare(
      "UPDATE project_invitations SET expires_at='2000-01-01' WHERE id=?",
    )
    .bind(expired)
    .run();
  assert.equal((await invited.inbox()).length, 0);
  await assert.rejects(invited.respond(expired, true), /失效/);
  const revoked = await team.invite(project.id, input);
  await team.revokeInvitation(project.id, revoked);
  await assert.rejects(invited.respond(revoked, true), /失效/);
  const racing = await team.invite(project.id, input);
  const race = await Promise.allSettled([
    team.revokeInvitation(project.id, racing),
    invited.respond(racing, true),
  ]);
  assert.equal(
    race.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const status = await db
    .prepare('SELECT status FROM project_invitations WHERE id=?')
    .bind(racing)
    .first<{ status: string }>();
  const members = (await team.team(project.id)).members;
  assert.equal(
    members.some((item) => item.user_id === member.owner),
    status?.status === 'accepted',
  );
  await team.removeMember(project.id, member.owner);
  await assert.rejects(invited.respond(racing, true), /失效/);
});
void test('mission dependency gates, concurrent leases and exact citations reject invalid contributions', async () => {
  const owner = await user(),
    research = await source(owner),
    store = new MissionStore(db, owner.owner);
  const draft = researchTemplate({
    title: 'Port research',
    question: 'What does the source say?',
    scope: 'One document',
    acceptance: 'Exact citation and review',
    query: '港口',
    version_ids: [research.versionId],
    locale: 'en',
  });
  draft.tasks[0].executor = 'external';
  const id = await store.create(research.project.id, draft);
  await store.control(id, 'start');
  await assert.rejects(
    store.claim(draft.tasks[1].id, 'agent:b', 'builtin'),
    /不可领取/,
  );
  const attempts = await Promise.allSettled([
    store.claim(draft.tasks[0].id, 'agent:a', 'external'),
    store.claim(draft.tasks[0].id, 'agent:b', 'external'),
  ]);
  assert.equal(
    attempts.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const claim = attempts.find((result) => result.status === 'fulfilled')!;
  assert.equal(claim.status, 'fulfilled');
  const actor = claim.value.task.claimed_by!;
  await assert.rejects(
    store.submit(draft.tasks[0].id, claim.value.lease, actor, {
      summary: 'bad quote',
      citations: [
        { version_id: research.versionId, page: 1, quote: 'fiction' },
      ],
    }),
    /不一致/,
  );
  await store.submit(draft.tasks[0].id, claim.value.lease, actor, {
    summary: 'Located source',
    citations: [
      {
        version_id: research.versionId,
        page: 1,
        quote: '港口于一八六一年开放。',
      },
    ],
  });
  await assert.rejects(
    store.submit(draft.tasks[0].id, claim.value.lease, actor, {
      summary: 'late overwrite',
      citations: [],
    }),
    /租约/,
  );
  assert.equal((await store.task(draft.tasks[1].id)).status, 'ready');
  assert.equal(
    (await db
      .prepare('SELECT COUNT(*) AS n FROM task_attempts WHERE task_id=?')
      .bind(draft.tasks[0].id)
      .first<{ n: number }>())!.n,
    1,
  );
  const current = await store.task(draft.tasks[0].id);
  await Promise.allSettled([
    store.review(current.id, 'accepted', 'Checked original', current.revision),
    store.review(
      current.id,
      'accepted',
      'Concurrent reviewer',
      current.revision,
    ),
  ]);
  assert.equal(
    (await db
      .prepare('SELECT COUNT(*) AS n FROM task_reviews WHERE task_id=?')
      .bind(current.id)
      .first<{ n: number }>())!.n,
    1,
  );
  const invalid = structuredClone(draft);
  invalid.tasks[0].dependencies = [invalid.tasks[1].id];
  await assert.rejects(store.create(research.project.id, invalid), /cycle/);
});
void test('snapshot merge is atomic, detects changed heads and cannot append twice under concurrent acceptance', async () => {
  const owner = await user(),
    research = await source(owner),
    store = new VersionStore(db, owner.owner);
  const snapshot = await store.snapshot(research.project.id, 'Baseline'),
    branch = await store.branch(research.project.id, 'Correction', snapshot);
  await store.editBranch(
    research.project.id,
    branch,
    [
      {
        source_id: research.id,
        base_version: research.versionId,
        pages: [{ page: 1, text: 'Reviewed correction' }],
        reason: 'Read original',
      },
    ],
    1,
  );
  await store.requestReview(research.project.id, branch, 2);
  const merged = await Promise.allSettled([
    store.merge(research.project.id, branch, 3, 'Accept correction'),
    store.merge(research.project.id, branch, 3, 'Duplicate acceptance'),
  ]);
  assert.equal(
    merged.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    (await db
      .prepare('SELECT COUNT(*) AS n FROM source_versions WHERE source_id=?')
      .bind(research.id)
      .first<{ n: number }>())!.n,
    2,
  );
  const conflict = await store.branch(
    research.project.id,
    'Old baseline',
    snapshot,
  );
  await store.editBranch(
    research.project.id,
    conflict,
    [
      {
        source_id: research.id,
        base_version: research.versionId,
        pages: [{ page: 1, text: 'Old correction' }],
        reason: 'Based on old version',
      },
    ],
    1,
  );
  await store.requestReview(research.project.id, conflict, 2);
  await assert.rejects(
    store.merge(research.project.id, conflict, 3, 'Review'),
    /已有修改/,
  );
});
void test('official LED historical sample runs search, comparison, analysis and citation checks through human publication gates', async () => {
  const started = performance.now();
  const owner = await user(),
    store = new MissionStore(db, owner.owner),
    project = await store.createProject(
      'LED validation',
      'Licensed Heidelberg inscription sample',
    );
  const files = (await mf.getR2Bucket('FILES')) as unknown as R2Bucket;
  const contributor = await user(),
    reviewer = await user(),
    team = new TeamStore(db, owner.owner);
  for (const [person, role] of [
    [contributor, 'editor'],
    [reviewer, 'reviewer'],
  ] as const) {
    const invitation = await team.invite(project.id, {
      email: `${person.owner}@example.test`,
      role,
    });
    await new TeamStore(db, person.owner).respond(invitation, true);
  }
  const reviewStore = new MissionStore(db, reviewer.owner);
  const firstBatch = await importLedSample(store, files, project.id, {
    offset: 0,
    limit: 4,
  });
  assert.equal(firstBatch.imported, 4);
  assert.equal(firstBatch.next, 4);
  assert.equal(firstBatch.total, 40);
  const repeatedBatch = await importLedSample(store, files, project.id, {
    offset: 0,
    limit: 4,
  });
  assert.equal(repeatedBatch.imported, 0);
  assert.equal(repeatedBatch.skipped, 4);
  await assert.rejects(
    importLedSample(store, files, project.id, { offset: -1, limit: 4 }),
  );
  const imported = await importLedSample(store, files, project.id);
  assert.equal(imported.imported, 36);
  assert.equal(imported.skipped, 4);
  assert.equal((await importLedSample(store, files, project.id)).skipped, 40);
  const hits = await searchPages(store, project.id, 'Dis Manibus');
  assert.equal(hits.length, 1);
  assert.ok(hits[0].title.startsWith('HD010014'));
  assert.ok(hits[0].text.startsWith('Dis Manibus Q Pompeio Hercliano'));
  const sharedHits = await searchPages(
    new MissionStore(db, contributor.owner),
    project.id,
    'Dis Manibus',
  );
  assert.equal(sharedHits[0].version_id, hits[0].version_id);
  await contributor.saveNote({
    p_project: project.id,
    p_parent: null,
    p_title: 'Funerary formula: working note',
    p_body: `Check the wording in ${hits[0].title}. These 40 records cannot establish its frequency in the Roman world.`,
  });
  const snapshot = await store.readProject(project.id),
    ids = (snapshot.source_versions as { id: string }[]).map(
      (version) => version.id,
    );
  const draft = researchTemplate({
    title: 'LED parallels',
    question: 'Locate funerary wording and inspect textual parallels',
    scope: '40 convenience-sampled LED records',
    acceptance: 'Exact citations; no claim of representative sampling',
    query: 'Dis Manibus | vixit',
    version_ids: ids,
    locale: 'en',
  });
  const mission = await store.create(project.id, draft);
  await store.control(mission, 'start');
  for (let round = 0; round < 10; round++) {
    const view = await store.view(mission);
    const ready = view.tasks.filter(
      (task) => task.status === 'ready' && task.executor === 'builtin',
    );
    if (!ready.length) break;
    for (const task of ready) {
      const claim = await store.claim(task.id, 'test:builtin', 'builtin');
      await store.submit(
        task.id,
        claim.lease,
        'test:builtin',
        await builtin(store, claim.task),
      );
    }
  }
  const gate = await store.task(draft.tasks[4].id);
  assert.equal(gate.status, 'ready');
  assert.equal((await store.task(draft.tasks[5].id)).status, 'blocked');
  const claim = await reviewStore.claim(gate.id, reviewer.owner, 'human');
  await reviewStore.submit(gate.id, claim.lease, reviewer.owner, {
    summary:
      'Checked citations. Lexical parallels are candidates; sample not representative.',
    citations: [],
  });
  let current = await store.task(gate.id);
  await reviewStore.review(
    current.id,
    'accepted',
    'Software workflow validated; historical interpretation remains open',
    current.revision,
  );
  const publish = await store.claim(
    draft.tasks[5].id,
    'test:publisher',
    'builtin',
  );
  await store.submit(
    publish.task.id,
    publish.lease,
    'test:publisher',
    await builtin(store, publish.task),
  );
  current = await store.task(publish.task.id);
  assert.equal(current.status, 'review');
  await reviewStore.review(
    current.id,
    'accepted',
    'Accept reproducible validation artifact',
    current.revision,
  );
  const final = await store.view(mission);
  assert.equal(final.mission.status, 'completed');
  assert.equal(final.artifacts.length, 2);
  const reviews = await db
    .prepare(
      'SELECT r.reviewer FROM task_reviews r JOIN mission_tasks t ON t.id=r.task_id WHERE t.mission_id=?',
    )
    .bind(mission)
    .all<{ reviewer: string }>();
  assert.equal(reviews.results.length, 2);
  assert.ok(
    reviews.results.every((review) => review.reviewer === reviewer.owner),
  );
  await fs.mkdir(new URL('../work/', import.meta.url), { recursive: true });
  await fs.writeFile(
    new URL('../work/research-collaboration-evaluation.json', import.meta.url),
    JSON.stringify(
      {
        dataset: 'Official LED convenience sample',
        sources: 40,
        question:
          'Find the Dis Manibus formula, inspect lexical parallels, preserve citations and hand findings to a reviewer',
        participants: ['owner', 'contributor', 'reviewer'],
        exactPhraseHits: hits.length,
        identifiedSource: hits[0].title,
        acceptedArtifacts: final.artifacts.length,
        finalState: final.mission.status,
        softwareDurationMs: Math.round(performance.now() - started),
        realModelCalls: 0,
        limitation:
          'Software integration test with simulated researcher actions; no measured human time saving or expert validation of historical interpretation.',
      },
      null,
      2,
    ),
  );
  const first = await store.version(ids[0]);
  await contributor.reviseSource({
    p_source: first.source_id,
    p_expected: 1,
    p_pages: [{ page: 1, text: first.pages[0].text + ' [local correction]' }],
    p_method: 'manual',
  });
  await store.advance(mission);
  assert.ok(
    (await store.view(mission)).tasks.some((task) => task.status === 'stale'),
  );
});
async function user() {
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)',
    )
    .bind(id, 'Researcher', `${id}@example.test`, Date.now(), Date.now())
    .run();
  return new ResearchStore(db, id);
}
async function source(store: ResearchStore) {
  const project = await store.createProject('港口史', '比较两份材料');
  const id = crypto.randomUUID(),
    path = `${store.owner}/${project.id}/${id}/original.txt`;
  await store.recordUpload(id, project.id, path, 'text/plain');
  const versionId = await store.importSource({
    p_id: id,
    p_project: project.id,
    p_title: '航运记录',
    p_path: path,
    p_type: 'text/plain',
    p_pages: [{ page: 1, text: '港口于一八六一年开放。' }],
  });
  return { project, id, versionId, path };
}
void test('similar spelling search ranks exact words first, paginates without duplicates and preserves pinned scopes and raw snippets', async () => {
  const owner = await user(),
    sample = await source(owner);
  const original = await owner.reviseSource({
    p_source: sample.id,
    p_expected: 1,
    p_method: 'manual',
    p_pages: [
      {
        page: 1,
        text:
          'Editorial notes.\n'.repeat(80) +
          ' \n'.repeat(1000) +
          'Abigail Adams discusses power.',
      },
      { page: 2, text: 'Adam wrote a different letter.' },
      { page: 3, text: 'John Adams replies.' },
    ],
  });
  assert.deepEqual(
    (await searchPages(owner, sample.project.id, 'adam')).map((h) => h.page),
    [2],
  );
  const all = await searchPages(owner, sample.project.id, 'adam', {
    approximate: true,
  });
  assert.equal(all.length, 3);
  assert.equal(all[0].page, 2);
  assert.equal(all[0].match_kind, 'exact');
  assert.ok(all.slice(1).every((h) => h.match_kind === 'similar'));
  assert.ok(all.find((h) => h.page === 1)!.snippet.includes('Abigail Adams'));
  assert.ok(all.every((h) => h.text.includes(h.snippet)));
  const second = await searchPages(owner, sample.project.id, 'adam', {
    approximate: true,
    offset: 1,
    limit: 1,
  });
  assert.equal(second[0].id, all[1].id);
  const reverse = await searchPages(owner, sample.project.id, 'adams', {
    approximate: true,
  });
  assert.equal(reverse.at(-1)?.page, 2);
  assert.equal(reverse.at(-1)?.match_kind, 'similar');
  const next = await owner.reviseSource({
    p_source: sample.id,
    p_expected: 2,
    p_method: 'manual',
    p_pages: [{ page: 1, text: 'Unrelated material.' }],
  });
  assert.equal(
    (await searchPages(owner, sample.project.id, 'adam', { approximate: true }))
      .length,
    0,
  );
  const pinned = await searchPages(owner, sample.project.id, 'adam', {
    approximate: true,
    history: true,
    version_ids: [original],
    page_refs: [{ version_id: original, page: 1 }],
  });
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].version_id, original);
  assert.notEqual(pinned[0].version_id, next);
  const other = await source(await user());
  assert.equal(
    (
      await searchPages(owner, sample.project.id, 'adam', {
        approximate: true,
        history: true,
        version_ids: [other.versionId],
      })
    ).length,
    0,
  );
});

void test('automated search and discovery cite the matching passage after source preparation notes', async () => {
  const owner = await user();
  const sample = await source(owner);
  const text =
    'Preparation notes and archive description. '.repeat(35) +
    '\nWomen will demand a Vote. This is a disputed consequence, not an endorsement.';
  const version = await owner.reviseSource({
    p_source: sample.id,
    p_expected: 1,
    p_method: 'manual',
    p_pages: [{ page: 1, text }],
  });
  const store = new MissionStore(db, owner.owner);
  const draft = researchTemplate({
    title: 'Locate voting language',
    question: 'Where is voting mentioned?',
    scope: 'One supplied excerpt',
    acceptance: 'Retain the actual matching words and fixed version',
    query: 'Women will demand a Vote',
    version_ids: [version],
    locale: 'en',
  });
  await store.create(sample.project.id, draft);
  const task = await store.task(draft.tasks[0].id);
  const search = await builtin(store, task);
  task.input.parameters = { discovery: true, external: false };
  const discovery = await discoverSources(store, task, [], async () => {
    throw new Error('No external catalog was requested');
  });
  for (const result of [search, discovery]) {
    assert.equal(result.citations.length, 1);
    const citation = result.citations[0];
    assert.ok(citation.quote.includes('Women will demand a Vote.'));
    assert.ok(citation.start! > 500);
    assert.equal(
      text.slice(citation.start, citation.start! + citation.quote.length),
      citation.quote,
    );
    assert.equal(citation.version_id, version);
  }
});
void test('artifact summaries identify their research plan without exposing a shared artifact owner plan', async () => {
  const alice = await user(),
    bob = await user();
  const a = await source(alice),
    b = await source(bob);
  const store = new MissionStore(db, alice.owner),
    other = new MissionStore(db, bob.owner);
  const draft = researchTemplate({
    title: 'Private research question',
    question: 'Question',
    scope: 'Selected text',
    acceptance: 'Review sources',
    query: '港口',
    version_ids: [a.versionId],
    locale: 'en',
  });
  const mission = await store.create(a.project.id, draft);
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO artifacts(id,project_id,mission_id,title,kind,body,source_versions,sha256,license,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      id,
      a.project.id,
      mission,
      'Review findings',
      'review',
      JSON.stringify({
        summary: 'A specific, reviewed conclusion.',
        citations: [],
      }),
      JSON.stringify([a.versionId]),
      'test-hash',
      'private',
      alice.owner,
      new Date().toISOString(),
    )
    .run();
  const own = (await store.artifactSummaries(a.project.id)).results.find(
    (row) => row.id === id,
  );
  assert.equal(own?.research_title, draft.title);
  assert.equal(own?.mission_id, mission);
  assert.equal(own?.summary_excerpt, 'A specific, reviewed conclusion.');
  assert.equal((await other.artifactSummaries(b.project.id)).results.length, 0);
  await assert.rejects(other.artifactSummaries(a.project.id), /不存在/);
  await db
    .prepare(
      'INSERT INTO artifact_grants(artifact_id,project_id,granted_by,created_at) VALUES(?,?,?,?)',
    )
    .bind(id, b.project.id, alice.owner, new Date().toISOString())
    .run();
  const shared = (await other.artifactSummaries(b.project.id)).results.find(
    (row) => row.id === id,
  );
  assert.equal(shared?.research_title, null);
  assert.equal(shared?.mission_id, null);
  assert.equal(shared?.summary_excerpt, 'A specific, reviewed conclusion.');
});
void test('tenant boundaries cover sources, versions, projects, upload receipts and model keys', async () => {
  const alice = await user(),
    bob = await user();
  const a = await source(alice);
  await assert.rejects(bob.project(a.project.id), /不存在/);
  await assert.rejects(bob.source(a.id), /不存在/);
  await assert.rejects(bob.version(a.versionId), /不存在/);
  assert.equal((await bob.listProjects()).length, 0);
  await assert.rejects(
    bob.recordUpload(crypto.randomUUID(), a.project.id, 'forged', 'text/plain'),
    /不存在/,
  );
  await alice.saveModel({
    id: a.id,
    label: 'test',
    provider: 'openai',
    model_id: 'test',
    vision: false,
    key_hint: 'masked',
    encrypted_key: 'cipher',
  });
  await assert.rejects(bob.model(a.id), /不存在/);
  assert.equal((await bob.models()).length, 0);
  assert.equal('encrypted_key' in (await alice.models())[0], false);
});
void test('citations pin immutable versions and reject fabricated quotations', async () => {
  const store = await user(),
    s = await source(store);
  await assert.rejects(
    store.addEvidence({
      p_version: s.versionId,
      p_page: 1,
      p_quote: '港口于一八六二年开放。',
      p_question: '何时开放？',
      p_interpretation: '',
      p_relation: 'context',
    }),
    /完全一致/,
  );
  await store.addEvidence({
    p_version: s.versionId,
    p_page: 1,
    p_quote: '一八六一年',
    p_question: '何时开放？',
    p_interpretation: '待核查',
    p_relation: 'context',
  });
  await store.reviseSource({
    p_source: s.id,
    p_expected: 1,
    p_pages: [{ page: 1, text: '校订：一八六二年。' }],
    p_method: 'manual',
  });
  const snapshot = await store.readProject(s.project.id);
  assert.equal(snapshot.evidence[0].version_id, s.versionId);
  assert.equal(
    (await store.version(s.versionId)).pages[0].text,
    '港口于一八六一年开放。',
  );
  await assert.rejects(
    db
      .prepare('UPDATE source_versions SET pages=? WHERE id=?')
      .bind('[]', s.versionId)
      .run(),
    /immutable/,
  );
});
void test('only one concurrent revision can append against a given source head', async () => {
  const store = await user(),
    s = await source(store);
  const input = {
    p_source: s.id,
    p_expected: 1,
    p_pages: [{ page: 1, text: '新校订' }],
    p_method: 'manual',
  };
  const attempts = await Promise.allSettled([
    store.reviseSource(input),
    store.reviseSource(input),
  ]);
  assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
  assert.equal(
    (await store.readProject(s.project.id)).source_versions.length,
    2,
  );
});
void test('notes preserve history and reject a foreign or already edited parent', async () => {
  const store = await user(),
    other = await user();
  const p = await store.createProject('笔记', '');
  const n = await store.saveNote({
    p_project: p.id,
    p_parent: null,
    p_title: '初稿',
    p_body: '原文',
  });
  await store.saveNote({
    p_project: p.id,
    p_parent: n,
    p_title: '二稿',
    p_body: '修订',
  });
  await assert.rejects(
    store.saveNote({
      p_project: p.id,
      p_parent: n,
      p_title: '过期',
      p_body: '冲突',
    }),
    /新版本/,
  );
  const q = await other.createProject('其他', '');
  await assert.rejects(
    other.saveNote({
      p_project: q.id,
      p_parent: n,
      p_title: '不允许',
      p_body: 'x',
    }),
    /不属于/,
  );
  assert.equal((await store.readProject(p.id)).notes.length, 2);
});
void test('note organization follows revisions, preserves history, and enforces project roles', async () => {
  const owner = await user(),
    viewer = await user(),
    stranger = await user();
  const project = await owner.createProject('Writing library', '');
  await db
    .prepare('INSERT INTO project_members VALUES(?,?,?,?,?)')
    .bind(
      project.id,
      viewer.owner,
      'viewer',
      owner.owner,
      new Date().toISOString(),
    )
    .run();
  const root = await owner.saveNote({
    p_project: project.id,
    p_parent: null,
    p_title: 'First reading',
    p_body: 'Quoted passage',
  });
  await owner.setNoteState({
    p_project: project.id,
    p_note: root,
    pinned: true,
  });
  const revision = await owner.saveNote({
    p_project: project.id,
    p_parent: root,
    p_title: 'Revised reading',
    p_body: 'Revised interpretation',
  });
  await owner.setNoteState({
    p_project: project.id,
    p_note: revision,
    archived: true,
  });
  let notes = (await viewer.readProject(project.id)).notes;
  assert.equal(notes.length, 2);
  assert.ok(
    notes.every(
      (note) => note.root_id === root && note.pinned && note.archived,
    ),
  );
  assert.equal(notes.find((note) => note.id === root)?.body, 'Quoted passage');
  await assert.rejects(
    viewer.setNoteState({
      p_project: project.id,
      p_note: revision,
      archived: false,
    }),
    /权限/,
  );
  await assert.rejects(
    stranger.setNoteState({
      p_project: project.id,
      p_note: revision,
      pinned: false,
    }),
    /不存在/,
  );
  const foreign = await owner.createProject('Other project', '');
  await assert.rejects(
    owner.setNoteState({
      p_project: foreign.id,
      p_note: revision,
      archived: false,
    }),
    /不存在/,
  );
  await owner.setNoteState({
    p_project: project.id,
    p_note: root,
    archived: false,
  });
  notes = (await owner.readProject(project.id)).notes;
  assert.ok(notes.every((note) => note.pinned && !note.archived));
});
void test('retrying the same saved note does not duplicate it or overwrite changed content', async () => {
  const owner = await user();
  const project = await owner.createProject('Recovered writing', '');
  const input = {
    p_id: crypto.randomUUID(),
    p_project: project.id,
    p_parent: null,
    p_title: 'One draft',
    p_body: 'One saved note',
  };
  const id = await owner.saveNote(input);
  assert.equal(await owner.saveNote(input), id);
  assert.equal((await owner.readProject(project.id)).notes.length, 1);
  await assert.rejects(
    owner.saveNote({ ...input, p_body: 'Changed after an uncertain response' }),
    /已经保存/,
  );
  assert.equal(
    (await owner.readProject(project.id)).notes[0].body,
    'One saved note',
  );
});
void test('run IDs and active-run constraint prevent duplicate concurrent charges', async () => {
  const store = await user(),
    s = await source(store);
  const run = {
    id: crypto.randomUUID(),
    project_id: s.project.id,
    kind: 'analysis',
    prompt: 'compare',
    model_snapshot: { provider: 'test', model_id: 'test' },
    source_version_ids: [s.versionId],
  };
  await store.startRun(run);
  await assert.rejects(
    store.startRun({ ...run, id: crypto.randomUUID() }),
    /已有任务/,
  );
  await store.finishRun(run.id, {
    status: 'succeeded',
    result: 'line of inquiry',
    input_tokens: 10,
    output_tokens: 2,
  });
  await assert.rejects(store.startRun(run), /已有任务/);
  assert.equal((await store.run(run.id))?.status, 'succeeded');
});
void test('encrypted BYOK is bound to both user and connection', async () => {
  const secret = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  );
  const value = await encrypt('test-key', secret, 'alice:connection');
  assert.equal(await decrypt(value, secret, 'alice:connection'), 'test-key');
  await assert.rejects(decrypt(value, secret, 'bob:connection'));
  await assert.rejects(decrypt(value, secret, 'alice:other'));
});
void test('page validation includes UTF-8 byte size and contiguous numeric page labels', () => {
  assert.throws(() => validatePages([{ page: '1', text: 'x' }]));
  assert.throws(() => validatePages([{ page: 2, text: 'x' }]));
  assert.throws(() =>
    validatePages(
      Array.from({ length: 10 }, (_, i) => ({
        page: i + 1,
        text: '史'.repeat(70000),
      })),
    ),
  );
  validatePages([{ page: 1, text: '' }]);
});
void test('file limit measures streamed bytes even when length header lies', async () => {
  const request = new Request('http://localhost', {
    method: 'POST',
    body: 'too long',
    headers: { 'Content-Length': '1' },
  });
  await assert.rejects(boundedBytes(request, 3), /Too large/);
});
void test('provider requests use fixed hosts, native credentials and bounded output', async () => {
  for (const provider of [
    'openai',
    'anthropic',
    'google',
    'openrouter',
  ] as const) {
    const input = {
      provider,
      model: 'test-model',
      key: 'private-key',
      system: 'source instructions',
      prompt: 'read',
      image: 'data:image/png;base64,YQ==',
    };
    const request = providerRequest(input);
    assert.equal(request.url.includes('private-key'), false);
    let called = false;
    const fake = (async (url, options) => {
      called = true;
      assert.equal(options?.redirect, 'manual');
      assert.match(options?.body as string, /4096/);
      return Response.json(
        provider === 'anthropic'
          ? {
              content: [{ type: 'text', text: 'result' }],
              usage: { input_tokens: 7, output_tokens: 2 },
            }
          : provider === 'google'
            ? {
                candidates: [{ content: { parts: [{ text: 'result' }] } }],
                usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 },
              }
            : {
                choices: [{ message: { content: 'result' } }],
                usage: { prompt_tokens: 7, completion_tokens: 2 },
              },
      );
    }) as typeof fetch;
    const result = await invoke(input, fake);
    assert.equal(called, true);
    assert.deepEqual(result, {
      text: 'result',
      inputTokens: 7,
      outputTokens: 2,
    });
  }
});
void test('Better Auth registers, authenticates and invalidates a cookie session on D1', async () => {
  const auth = createAuth({
    DB: db,
    FILES: {} as R2Bucket,
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'test-only-auth-secret-with-at-least-32-characters',
    AUTH_ALLOW_UNVERIFIED_LOCAL: '1',
  });
  const email = `auth-${crypto.randomUUID()}@example.test`;
  const signup = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: 'a-long-test-password',
        name: 'Test researcher',
      }),
    }),
  );
  assert.equal(signup.status, 200, await signup.clone().text());
  const cookies = signup.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  assert.ok(cookies);
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookies }),
  });
  assert.equal(session?.user.email, email);
  const signout = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-out', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        cookie: cookies,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }),
  );
  assert.equal(signout.status, 200);
  assert.equal(
    await auth.api.getSession({ headers: new Headers({ cookie: cookies }) }),
    null,
  );
});

void test('public signup sends verification through the email binding and requires verification', async () => {
  const messages: EmailMessageBuilder[] = [];
  const origin = 'https://canwoo.com';
  const auth = createAuth({
    DB: db,
    FILES: {} as R2Bucket,
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET:
      'test-only-public-auth-secret-with-at-least-32-characters',
    AUTH_ALLOW_UNVERIFIED_LOCAL: '1',
    EMAIL_FROM: 'noreply@canwoo.com',
    EMAIL: {
      async send(message) {
        if (!('subject' in message)) throw new Error('Expected composed email');
        messages.push(message);
        return { messageId: 'test-only-email' };
      },
    },
  });
  const email = `verify-${crypto.randomUUID()}@example.test`;
  const body = {
    email,
    password: 'a-long-verification-test-password',
    name: 'Test researcher',
  };
  const request = (endpoint: string) =>
    new Request(`${origin}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: 'canwoo_locale=en',
        'Accept-Language': 'zh-CN',
      },
      body: JSON.stringify(body),
    });
  const signup = await auth.handler(request('sign-up/email'));
  assert.equal(signup.status, 200, await signup.clone().text());
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].from, {
    email: 'noreply@canwoo.com',
    name: 'Canwoo',
  });
  assert.equal(messages[0].to, email);
  assert.equal(messages[0].subject, 'Canwoo · Verify your email');
  assert.match(messages[0].text || '', /If you did not request this/);
  const link = messages[0].text?.match(/https:\/\/\S+/)?.[0];
  assert.ok(link);
  assert.equal(new URL(link).origin, origin);
  assert.equal(
    await db
      .prepare('SELECT email_verified FROM user WHERE email=?')
      .bind(email)
      .first('email_verified'),
    0,
  );
  assert.equal((await auth.handler(request('sign-in/email'))).status, 403);
  const verification = await auth.handler(new Request(link));
  assert.ok(verification.status < 400);
  assert.equal(
    await db
      .prepare('SELECT email_verified FROM user WHERE email=?')
      .bind(email)
      .first('email_verified'),
    1,
  );
  assert.equal((await auth.handler(request('sign-in/email'))).status, 200);
});

void test('concurrent uploads cannot exceed the user storage allowance', async () => {
  const owner = await user();
  const project = await owner.createProject('Storage quota test', '');
  try {
    for (
      let used = 0;
      used < USER_STORAGE_BYTES - MAX_FILE_BYTES;
      used += MAX_FILE_BYTES
    )
      await owner.reserveUpload(
        crypto.randomUUID(),
        project.id,
        MAX_FILE_BYTES,
      );
    const outcomes = await Promise.allSettled([
      owner.reserveUpload(crypto.randomUUID(), project.id, MAX_FILE_BYTES),
      owner.reserveUpload(crypto.randomUUID(), project.id, MAX_FILE_BYTES),
    ]);
    assert.equal(
      outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      await db
        .prepare(
          'SELECT SUM(bytes) AS total FROM upload_reservations WHERE owner_id=?',
        )
        .bind(owner.owner)
        .first('total'),
      USER_STORAGE_BYTES,
    );
    // Reservations count even when no R2 completion receipt arrives.
    assert.equal(
      await db
        .prepare(
          'SELECT COUNT(*) AS count FROM upload_receipts WHERE owner_id=?',
        )
        .bind(owner.owner)
        .first('count'),
      0,
    );
    const other = await user();
    await assert.rejects(
      other.reserveUpload(crypto.randomUUID(), project.id, 1),
      /不存在/,
    );
    await assert.rejects(
      owner.reserveUpload(crypto.randomUUID(), project.id, -1),
      /大小无效/,
    );
  } finally {
    await db
      .prepare('DELETE FROM upload_reservations WHERE owner_id=?')
      .bind(owner.owner)
      .run();
  }
});

void test('site storage allowance is atomic across different accounts', async () => {
  const fixtures: { owner: ResearchStore; projectId: string }[] = [];
  const alice = await user(),
    bob = await user();
  const a = await alice.createProject('Storage quota A', '');
  const b = await bob.createProject('Storage quota B', '');
  try {
    for (let index = 0; index < 10; index++) {
      const owner = await user();
      const project = await owner.createProject('Existing uploads', '');
      fixtures.push({ owner, projectId: project.id });
    }
    const statements: D1PreparedStatement[] = [];
    const existingBytes =
      (await db
        .prepare(
          'SELECT COALESCE(SUM(bytes),0) AS bytes FROM upload_reservations',
        )
        .first<number>('bytes')) || 0;
    let remaining = SITE_STORAGE_BYTES - MAX_FILE_BYTES - existingBytes;
    for (let index = 0; remaining > 0; index++) {
      const fixture = fixtures[index % fixtures.length];
      const bytes = Math.min(remaining, MAX_FILE_BYTES);
      statements.push(
        db
          .prepare('INSERT INTO upload_reservations VALUES(?,?,?,?,?)')
          .bind(
            crypto.randomUUID(),
            fixture.owner.owner,
            fixture.projectId,
            bytes,
            new Date().toISOString(),
          ),
      );
      remaining -= bytes;
    }
    await db.batch(statements);
    const outcomes = await Promise.allSettled([
      alice.reserveUpload(crypto.randomUUID(), a.id, MAX_FILE_BYTES),
      bob.reserveUpload(crypto.randomUUID(), b.id, MAX_FILE_BYTES),
    ]);
    assert.equal(
      outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      await db
        .prepare('SELECT SUM(bytes) AS total FROM upload_reservations')
        .first('total'),
      SITE_STORAGE_BYTES,
    );
  } finally {
    await db.batch(
      [...fixtures.map((f) => f.owner), alice, bob].map((owner) =>
        db
          .prepare('DELETE FROM upload_reservations WHERE owner_id=?')
          .bind(owner.owner),
      ),
    );
  }
});

// Workbench extensions use the same real D1 engine and migrated schema.
import { WorkbenchStore } from '../lib/workbench-store';
import {
  createJob,
  controlJob,
  executeJob,
  jobById,
  recoverAndDispatch,
  type JobsEnv,
} from '../lib/jobs';
import { checkWatches } from '../lib/watches';
import {
  parseBibliography,
  exportBibliography,
  footnote,
} from '../lib/bibliography';
import { draftPrefix, readDrafts } from '../lib/drafts';
import { workbenchInput, regionInput } from '../lib/workbench-inputs';
void test('bibliography, argument edges and provenance enforce project boundaries and revision fences', async () => {
  const owner = await user(),
    other = await user(),
    a = await source(owner),
    b = await source(other);
  const work = new WorkbenchStore(db, owner.owner),
    foreign = new WorkbenchStore(db, other.owner);
  const csl = {
    type: 'manuscript' as const,
    title: '港口档案',
    author: [{ literal: '某档案馆' }],
    archive: '市档案馆',
    archive_location: 'A-001',
    issued: { 'date-parts': [[1861]] },
  };
  const entry = (await work.mutate({
    action: 'bibliography',
    project_id: a.project.id,
    source_id: a.id,
    csl,
  })) as string;
  await assert.rejects(
    work.mutate({
      action: 'bibliography',
      project_id: a.project.id,
      source_id: b.id,
      csl,
    }),
    /不存在/,
  );
  await assert.rejects(foreign.workbench(a.project.id), /不存在/);
  const edits = await Promise.allSettled([
    work.mutate({
      action: 'bibliography',
      project_id: a.project.id,
      id: entry,
      source_id: a.id,
      expected: 1,
      csl: { ...csl, title: '校订 A' },
    }),
    work.mutate({
      action: 'bibliography',
      project_id: a.project.id,
      id: entry,
      source_id: a.id,
      expected: 1,
      csl: { ...csl, title: '校订 B' },
    }),
  ]);
  assert.equal(edits.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (
      await db
        .prepare(
          'SELECT COUNT(*) AS n FROM bibliography_history WHERE entry_id=?',
        )
        .bind(entry)
        .first<{ n: number }>()
    )?.n,
    2,
  );
  const question = (await work.mutate({
    action: 'question',
    project_id: a.project.id,
    title: '何时开放？',
    detail: '',
  })) as string;
  const claim = (await work.mutate({
    action: 'claim',
    project_id: a.project.id,
    question_id: question,
    body: '可能是一八六一年',
    kind: 'claim',
    status: 'draft',
  })) as string;
  const ownEvidence = await owner.addEvidence({
    p_version: a.versionId,
    p_page: 1,
    p_quote: '一八六一年',
    p_question: '何时？',
    p_interpretation: '',
    p_relation: 'supports',
  });
  const otherEvidence = await other.addEvidence({
    p_version: b.versionId,
    p_page: 1,
    p_quote: '一八六一年',
    p_question: '何时？',
    p_interpretation: '',
    p_relation: 'supports',
  });
  await work.mutate({
    action: 'link_evidence',
    project_id: a.project.id,
    claim_id: claim,
    evidence_id: ownEvidence,
    relation: 'supports',
  });
  await assert.rejects(
    work.mutate({
      action: 'link_evidence',
      project_id: a.project.id,
      claim_id: claim,
      evidence_id: otherEvidence,
      relation: 'supports',
    }),
    /不属于/,
  );
  await assert.rejects(
    work.mutate({
      action: 'source_relation',
      project_id: a.project.id,
      from_source: a.id,
      to_source: b.id,
      kind: 'quotes',
      certainty: 'suspected',
      basis: '待核查',
    }),
    /不存在/,
  );
  await assert.rejects(
    work.mutate({
      action: 'source_relation',
      project_id: a.project.id,
      from_source: a.id,
      to_source: a.id,
      kind: 'quotes',
      certainty: 'confirmed',
      basis: '循环',
    }),
    /不同资料/,
  );
  await work.mutate({
    action: 'search_log',
    project_id: a.project.id,
    query: '港口 开放',
    scope: '某馆目录 1860–1865',
    searched_at: new Date().toISOString(),
    outcome: 'no_hits',
    result_count: 0,
    notes: '只检索已数字化目录',
  });
  const snapshot = await work.workbench(a.project.id);
  assert.equal(snapshot.claim_evidence.length, 1);
  assert.equal(snapshot.search_logs[0].result_count, 0);
  await assert.rejects(
    work.mutate({
      action: 'review_evidence',
      project_id: a.project.id,
      evidence_id: ownEvidence,
      version_id: b.versionId,
    }),
    /不存在/,
  );
  await work.mutate({
    action: 'review_evidence',
    project_id: a.project.id,
    evidence_id: ownEvidence,
    version_id: a.versionId,
  });
  assert.equal((await work.workbench(a.project.id)).evidence_reviews.length, 1);
});
void test('citation offsets identify repeated passages and regions stay normalized', async () => {
  const owner = await user(),
    a = await source(owner);
  const version = await owner.reviseSource({
    p_source: a.id,
    p_expected: 1,
    p_pages: [{ page: 1, text: '港口记录。港口记录。' }],
    p_method: 'manual',
  });
  const id = await owner.addEvidence({
    p_version: version,
    p_page: 1,
    p_quote: '港口记录',
    p_start: 5,
    p_question: '重复记述？',
    p_interpretation: '',
    p_relation: 'context',
    p_region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  });
  const row = (await owner.readProject(a.project.id)).evidence.find(
    (e) => e.id === id,
  )!;
  assert.equal(row.quote_start, 5);
  assert.equal(row.quote_end, 9);
  assert.deepEqual(row.region, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  await assert.rejects(
    owner.addEvidence({
      p_version: version,
      p_page: 1,
      p_quote: '港口记录',
      p_start: 1,
      p_question: '错误偏移',
      p_interpretation: '',
      p_relation: 'context',
    }),
    /定位/,
  );
  assert.equal(
    regionInput.safeParse({ x: 0.9, y: 0, width: 0.5, height: 0.2 }).success,
    false,
  );
});
void test('CSL, BibTeX and RIS round trip Unicode metadata; formal citations include the locator', () => {
  const csl = {
    type: 'book' as const,
    title: '港口与迁徙',
    author: [{ family: 'Wang', given: 'Li' }],
    issued: { 'date-parts': [[1861]] },
    publisher: '历史出版社',
    DOI: '10.1234/folio',
    edition: '第二版',
    editor: [{ family: 'Chen', given: 'Li' }],
  };
  const entry = {
    id: 'book1',
    project_id: 'project',
    source_id: null,
    csl,
    revision: 1,
    created_at: '',
    updated_at: '',
  };
  assert.equal(
    parseBibliography(exportBibliography([entry], 'csl'), 'csl')[0].title,
    csl.title,
  );
  assert.equal(
    parseBibliography(exportBibliography([entry], 'bibtex'), 'bibtex')[0].title,
    csl.title,
  );
  assert.equal(
    parseBibliography(exportBibliography([entry], 'ris'), 'ris')[0].title,
    csl.title,
  );
  assert.equal(
    parseBibliography(exportBibliography([entry], 'csl'), 'csl')[0].edition,
    '第二版',
  );
  assert.deepEqual(editDate('1861'), { 'date-parts': [[1861]] });
  assert.deepEqual(editDate('约 1890 年 / 光绪十六年'), {
    literal: '约 1890 年 / 光绪十六年',
  });
  const range = { 'date-parts': [[1861], [1863]], circa: true };
  assert.deepEqual(editDate(dateLabel(range), range), range);
  assert.match(exportBibliography([entry], 'chicago'), /1861/);
  assert.match(footnote(entry, '23–25'), /23/);
  assert.throws(() =>
    parseBibliography('https://example.invalid/private', 'bibtex'),
  );
  assert.throws(() =>
    parseBibliography('https://example.invalid/private', 'ris'),
  );
});
void test('bibliography import is deduplicated without silently changing an existing entry', async () => {
  const owner = await user(),
    a = await source(owner),
    work = new WorkbenchStore(db, owner.owner);
  const entries = [
    { type: 'book' as const, title: 'A', DOI: '10.1234/test' },
    { type: 'book' as const, title: 'B', DOI: '10.1234/test' },
  ];
  assert.deepEqual(
    await work.mutate({
      action: 'import_bibliography',
      project_id: a.project.id,
      entries,
    }),
    { imported: 1, skipped: 1 },
  );
  assert.deepEqual(
    await work.mutate({
      action: 'import_bibliography',
      project_id: a.project.id,
      entries,
    }),
    { imported: 0, skipped: 2 },
  );
  assert.equal(
    (await work.workbench(a.project.id)).bibliography[0].csl.title,
    'A',
  );
  const simultaneous = await Promise.all(
    [0, 1].map(() =>
      work.mutate({
        action: 'import_bibliography',
        project_id: a.project.id,
        entries: [{ type: 'book', title: 'Concurrent' }],
      }),
    ),
  );
  assert.equal(
    simultaneous.reduce<number>(
      (count, result) => count + (result as { imported: number }).imported,
      0,
    ),
    1,
  );
});
async function jobSetup() {
  const owner = await user(),
    a = await source(owner),
    work = new WorkbenchStore(db, owner.owner),
    modelId = crypto.randomUUID();
  const secret = Buffer.alloc(32, 7).toString('base64');
  await owner.saveModel({
    id: modelId,
    label: 'Test',
    provider: 'openai',
    model_id: 'test',
    vision: false,
    key_hint: 'test',
    encrypted_key: await encrypt(
      'test-key',
      secret,
      `${owner.owner}:${modelId}`,
    ),
  });
  await work.mutate({
    action: 'budget',
    project_id: a.project.id,
    limit_units: 1_000_000,
  });
  const input = {
    id: crypto.randomUUID(),
    project_id: a.project.id,
    model_id: modelId,
    version_ids: [a.versionId],
    prompt: '比较材料',
    input_rate: 1,
    output_rate: 2,
    max_output: 128,
  };
  return { owner, a, work, secret, input };
}
void test('queued model work does not spend after its creator becomes a read-only collaborator', async () => {
  const { owner, input, secret } = await jobSetup();
  const projectOwner = await user(),
    research = await source(projectOwner);
  const team = new TeamStore(db, projectOwner.owner),
    member = new TeamStore(db, owner.owner);
  const invitation = await team.invite(research.project.id, {
    email: `${owner.owner}@example.test`,
    role: 'editor',
  });
  await member.respond(invitation, true);
  const work = new WorkbenchStore(db, projectOwner.owner);
  await work.mutate({
    action: 'budget',
    project_id: research.project.id,
    limit_units: 1_000_000,
  });
  const job = await createJob(owner, {
    ...input,
    project_id: research.project.id,
    version_ids: [research.versionId],
  });
  await team.setMemberRole(research.project.id, owner.owner, 'viewer');
  let calls = 0;
  await executeJob(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: secret },
    job.id,
    async () => {
      calls++;
      return { text: 'unexpected', inputTokens: 0, outputTokens: 0 };
    },
  );
  assert.equal(calls, 0);
  assert.equal((await jobById(db, job.id))?.status, 'failed');
  assert.equal(
    (await work.workbench(research.project.id)).budget?.committed_units,
    0,
  );
});
void test('job budget reservation is atomic and duplicate submissions or cancellation do not double-charge', async () => {
  const { owner, work, a, input } = await jobSetup();
  const first = await createJob(owner, input),
    again = await createJob(owner, input);
  assert.equal(first.id, again.id);
  assert.equal(
    (await work.workbench(a.project.id)).budget?.committed_units,
    first.reserved_units,
  );
  await controlJob(owner, first.id, 'pause');
  await controlJob(owner, first.id, 'cancel');
  assert.equal((await work.workbench(a.project.id)).budget?.committed_units, 0);
  await assert.rejects(controlJob(owner, first.id, 'cancel'), /状态/);
  await work.mutate({
    action: 'budget',
    project_id: a.project.id,
    limit_units: first.reserved_units,
  });
  const competing = await Promise.allSettled([
    createJob(owner, { ...input, id: crypto.randomUUID() }),
    createJob(owner, { ...input, id: crypto.randomUUID() }),
  ]);
  assert.equal(competing.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await work.workbench(a.project.id)).budget?.committed_units,
    first.reserved_units,
  );
});
void test('queue delivery is idempotent and result settlement releases unused reservation', async () => {
  const { owner, work, a, input, secret } = await jobSetup();
  let calls = 0;
  const job = await createJob(owner, input),
    env = { DB: db, FOLIOTRACE_ENCRYPTION_KEY: secret };
  const provider: typeof invoke = async (request) => {
    calls++;
    assert.equal(request.maxOutput, 128);
    return { text: '待核查的线索', inputTokens: 10, outputTokens: 20 };
  };
  await controlJob(owner, job.id, 'pause');
  await executeJob(env, job.id, provider);
  assert.equal(calls, 0);
  await controlJob(owner, job.id, 'resume');
  await Promise.all([
    executeJob(env, job.id, provider),
    executeJob(env, job.id, provider),
  ]);
  assert.equal(calls, 1);
  assert.equal((await jobById(db, job.id))?.status, 'succeeded');
  assert.equal(
    (await work.workbench(a.project.id)).budget?.committed_units,
    50,
  );
  assert.equal((await work.workbench(a.project.id)).inbox.length, 1);
  await executeJob(env, job.id, provider);
  assert.equal(calls, 1);
  const stranger = await user();
  await assert.rejects(controlJob(stranger, job.id, 'cancel'), /不存在/);
});
void test('uncertain external calls retain budget and are never automatically replayed', async () => {
  const { owner, work, a, input, secret } = await jobSetup();
  let calls = 0;
  const job = await createJob(owner, input),
    env = { DB: db, FOLIOTRACE_ENCRYPTION_KEY: secret };
  const provider: typeof invoke = async () => {
    calls++;
    throw new Error('lost response');
  };
  await executeJob(env, job.id, provider);
  await executeJob(env, job.id, provider);
  assert.equal(calls, 1);
  assert.equal((await jobById(db, job.id))?.status, 'uncertain');
  assert.equal(
    (await work.workbench(a.project.id)).budget?.committed_units,
    job.reserved_units,
  );
  const queued: string[] = [];
  const queue = {
    send: async (body: { id: string }) => {
      queued.push(body.id);
    },
  } as unknown as JobsEnv['JOB_QUEUE'];
  const stale = await createJob(owner, { ...input, id: crypto.randomUUID() });
  await db
    .prepare(
      "UPDATE research_jobs SET status='running',stage='calling',started_at='2000-01-01' WHERE id=?",
    )
    .bind(stale.id)
    .run();
  await recoverAndDispatch({ ...env, JOB_QUEUE: queue });
  assert.equal((await jobById(db, stale.id))?.status, 'uncertain');
  assert.equal(queued.includes(stale.id), false);
});
void test('watch polling deduplicates unchanged metadata and records an unavailable source honestly', async () => {
  const owner = await user(),
    a = await source(owner),
    work = new WorkbenchStore(db, owner.owner);
  const watch = (await work.mutate({
    action: 'watch',
    project_id: a.project.id,
    query: '港口历史',
    interval_days: 1,
  })) as string;
  const response: typeof fetch = async (request) => {
    assert.equal(
      new URL(
        request instanceof Request
          ? request.url
          : request instanceof URL
            ? request.href
            : request,
      ).hostname,
      'api.crossref.org',
    );
    return Response.json({
      message: { items: [{ DOI: '10.1234/test', title: ['史料线索'] }] },
    });
  };
  await checkWatches({ DB: db }, response);
  assert.equal((await work.workbench(a.project.id)).inbox.length, 1);
  await db
    .prepare("UPDATE research_watches SET next_run='2000-01-01' WHERE id=?")
    .bind(watch)
    .run();
  await checkWatches({ DB: db }, response);
  assert.equal((await work.workbench(a.project.id)).inbox.length, 1);
  await db
    .prepare("UPDATE research_watches SET next_run='2000-01-01' WHERE id=?")
    .bind(watch)
    .run();
  await checkWatches(
    { DB: db },
    async () => new Response('unavailable', { status: 503 }),
  );
  assert.match(
    (await work.workbench(a.project.id)).watches[0].error || '',
    /失败/,
  );
  assert.equal((await work.workbench(a.project.id)).inbox.length, 1);
  assert.equal(
    workbenchInput.safeParse({
      action: 'inbox',
      project_id: a.project.id,
      id: crypto.randomUUID(),
      status: 'auto_proven',
    }).success,
    false,
  );
});
void test('draft recovery is scoped by account and project and tolerates a malformed entry', () => {
  const records = new Map<string, string>();
  const prefix = draftPrefix('alice', 'project');
  records.set(
    prefix + 'note:1',
    JSON.stringify({
      updatedAt: '2026-01-01',
      value: { kind: 'note', entityId: '1', title: '草稿', text: '尚未保存' },
    }),
  );
  records.set(
    draftPrefix('bob', 'project') + 'note:2',
    JSON.stringify({
      updatedAt: '2026-01-01',
      value: {
        kind: 'note',
        entityId: '2',
        title: '其他账户',
        text: '不应读取',
      },
    }),
  );
  records.set(prefix + 'corrupt', 'not json');
  const storage = {
    get length() {
      return records.size;
    },
    key: (index: number) => [...records.keys()][index] ?? null,
    getItem: (key: string) => records.get(key) ?? null,
  } as Storage;
  const restored = readDrafts(storage, prefix);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].value.text, '尚未保存');
  assert.equal(readDrafts(storage, draftPrefix('alice', 'other')).length, 0);
});

void test('a recovered job fences an older worker before it can invoke or settle a newer attempt', async () => {
  const { owner, input, secret } = await jobSetup();
  await createJob(owner, input);
  let calls = 0;
  const fencedDb = {
    prepare(sql: string) {
      if (!sql.includes("SET stage='calling'")) return db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              // Interleave recovery and another claim immediately before the old worker checkpoints.
              await db
                .prepare(
                  "UPDATE research_jobs SET attempt=attempt+1 WHERE id=? AND status='running'",
                )
                .bind(input.id)
                .run();
              return db
                .prepare(sql)
                .bind(...values)
                .run();
            },
          };
        },
      } as D1PreparedStatement;
    },
    batch: db.batch.bind(db),
  } as D1Database;
  await executeJob(
    { DB: fencedDb, FOLIOTRACE_ENCRYPTION_KEY: secret },
    input.id,
    async () => {
      calls++;
      return { text: 'obsolete result', inputTokens: 10, outputTokens: 10 };
    },
  );
  assert.equal(calls, 0);
  const current = await jobById(db, input.id);
  assert.equal(current?.status, 'running');
  assert.equal(current?.attempt, 2);
  assert.equal(current?.result, null);
});

void test('Google OAuth uses per-file scope, account-bound single-use PKCE state and encrypted refresh tokens', async () => {
  const alice = await user(),
    bob = await user();
  const env: ConnectionEnv = {
    DB: db,
    FILES: (await mf.getR2Bucket('FILES')) as unknown as R2Bucket,
    BETTER_AUTH_URL: 'https://canwoo.com',
    FOLIOTRACE_ENCRYPTION_KEY: btoa('g'.repeat(32)),
    GOOGLE_DRIVE_CLIENT_ID: 'test-client',
    GOOGLE_DRIVE_CLIENT_SECRET: 'test-secret',
  };
  const authorization = new URL(await startOAuth(env, alice.owner, 'google')),
    state = authorization.searchParams.get('state')!;
  assert.equal(
    authorization.searchParams.get('scope'),
    'https://www.googleapis.com/auth/drive.file',
  );
  assert.equal(
    authorization.searchParams.get('redirect_uri'),
    'https://canwoo.com/api/connections/callback/google',
  );
  assert.equal(cloudProvider.safeParse('microsoft').success, false);
  let calls = 0;
  const provider: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(
      url instanceof Request ? url.url : url.toString(),
      'https://oauth2.googleapis.com/token',
    );
    const form = options?.body as URLSearchParams;
    assert.equal(form.get('client_secret'), 'test-secret');
    const verifier = form.get('code_verifier')!;
    const digest = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ).toString('base64url');
    assert.equal(digest, authorization.searchParams.get('code_challenge'));
    return Response.json({
      access_token: 'test-access',
      refresh_token: 'test-refresh',
      expires_in: 3600,
    });
  };
  await assert.rejects(
    completeOAuth(env, bob.owner, 'google', state, 'test-code', provider),
    /状态/,
  );
  assert.equal(calls, 0);
  await completeOAuth(env, alice.owner, 'google', state, 'test-code', provider);
  assert.equal(
    await cloudToken(env, alice.owner, 'google', provider),
    'test-access',
  );
  assert.equal(calls, 1);
  const row = await db
    .prepare(
      "SELECT encrypted_token FROM cloud_connections WHERE owner_id=? AND provider='google'",
    )
    .bind(alice.owner)
    .first<{ encrypted_token: string }>();
  assert.ok(row);
  assert.ok(row.encrypted_token.startsWith('v1.'));
  assert.ok(!row.encrypted_token.includes('test-refresh'));
  await assert.rejects(
    decrypt(
      row.encrypted_token,
      env.FOLIOTRACE_ENCRYPTION_KEY!,
      `cloud:${bob.owner}:google`,
    ),
  );
  await assert.rejects(
    completeOAuth(env, alice.owner, 'google', state, 'test-code', provider),
    /状态/,
  );
  assert.equal(calls, 1);
  const reconnect = new URL(await startOAuth(env, alice.owner, 'google'));
  await completeOAuth(
    env,
    alice.owner,
    'google',
    reconnect.searchParams.get('state')!,
    'new-account',
    async () =>
      Response.json({ access_token: 'new-account-access', expires_in: 1 }),
  );
  await assert.rejects(
    cloudToken(env, alice.owner, 'google', provider),
    /重新连接/,
  );
  assert.equal(
    calls,
    1,
    'must not refresh a new Google account using the old account refresh token',
  );
});

void test('Google import fences duplicate requests and source changes and bounds chunked downloads', async () => {
  const alice = await user(),
    bob = await user(),
    project = await alice.createProject('Google imports', '');
  const env: ConnectionEnv = {
    DB: db,
    FILES: (await mf.getR2Bucket('FILES')) as unknown as R2Bucket,
    FOLIOTRACE_ENCRYPTION_KEY: btoa('h'.repeat(32)),
  };
  await db
    .prepare('INSERT INTO cloud_connections VALUES(?,?,?,?,?,?)')
    .bind(
      crypto.randomUUID(),
      alice.owner,
      'google',
      await encrypt(
        JSON.stringify({ access_token: 'mock-access', expires_in: 3600 }),
        env.FOLIOTRACE_ENCRYPTION_KEY!,
        `cloud:${alice.owner}:google`,
      ),
      new Date(Date.now() + 3600000).toISOString(),
      new Date().toISOString(),
    )
    .run();
  const store = new MissionStore(db, alice.owner);
  let revision = '1',
    content = 'Dis Manibus',
    oversized = false,
    mutateDuringDownload = false,
    downloads = 0;
  const provider: typeof fetch = async (input, options) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(
      new Headers(options?.headers).get('Authorization'),
      'Bearer mock-access',
    );
    if (url.searchParams.get('alt') === 'media') {
      downloads++;
      if (mutateDuringDownload) revision = '2';
      if (oversized)
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(MAX_FILE_BYTES));
              controller.enqueue(new Uint8Array(1));
              controller.close();
            },
          }),
        );
      return new Response(content);
    }
    return Response.json({
      id: 'archive-123',
      name: 'Canonical archive.txt',
      mimeType: 'text/plain',
      size: 11,
      version: revision,
    });
  };
  await assert.rejects(
    importCloudText(
      env,
      new MissionStore(db, bob.owner),
      project.id,
      'google',
      { id: 'archive-123', revision: '1' },
      provider,
    ),
    /不存在/,
  );
  const outcomes = await Promise.allSettled(
    [1, 2].map(() =>
      importCloudText(
        env,
        store,
        project.id,
        'google',
        { id: 'archive-123', revision: '1' },
        provider,
      ),
    ),
  );
  assert.equal(
    outcomes.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(downloads, 1);
  const result = await importCloudText(
    env,
    store,
    project.id,
    'google',
    { id: 'archive-123', revision: '1' },
    provider,
  );
  assert.equal(result.skipped, true);
  assert.equal(
    (await store.source(result.source_id!)).title,
    'Canonical archive.txt',
  );
  assert.equal(
    await db
      .prepare('SELECT COUNT(*) AS n FROM sources WHERE project_id=?')
      .bind(project.id)
      .first('n'),
    1,
  );
  revision = '2';
  const metadataOnly = await importCloudText(
    env,
    store,
    project.id,
    'google',
    { id: 'archive-123', revision },
    provider,
  );
  assert.equal(
    metadataOnly.skipped,
    true,
    'metadata changes must not duplicate a source',
  );
  assert.equal(metadataOnly.source_id, result.source_id);
  assert.equal(
    await db
      .prepare('SELECT COUNT(*) AS n FROM sources WHERE project_id=?')
      .bind(project.id)
      .first('n'),
    1,
  );
  const otherProject = await alice.createProject('Another cloud corpus', '');
  const separate = await importCloudText(
    env,
    store,
    otherProject.id,
    'google',
    { id: 'archive-123', revision },
    provider,
  );
  assert.equal(
    separate.skipped,
    false,
    'source reuse must remain project scoped',
  );
  assert.notEqual(separate.source_id, result.source_id);
  revision = '3';
  content = 'Dis Manibus. Changed text.';
  const changed = await importCloudText(
    env,
    store,
    project.id,
    'google',
    { id: 'archive-123', revision },
    provider,
  );
  assert.equal(
    changed.skipped,
    false,
    'changed content must be preserved as a new source',
  );
  assert.notEqual(changed.source_id, result.source_id);
  assert.equal(
    await db
      .prepare('SELECT COUNT(*) AS n FROM sources WHERE project_id=?')
      .bind(project.id)
      .first('n'),
    2,
  );
  content = 'Dis Manibus';
  revision = '1';
  mutateDuringDownload = true;
  await assert.rejects(
    readGoogleFile(env, alice.owner, 'archive-123', '1', provider),
    /发生变化/,
  );
  mutateDuringDownload = false;
  oversized = true;
  await assert.rejects(
    readGoogleFile(env, alice.owner, 'archive-123', '2', provider),
    /20 MiB/,
  );
  await assert.rejects(
    readGoogleFile(env, alice.owner, 'archive-123', '1', provider),
    /已更新/,
  );
  await db
    .prepare('DELETE FROM upload_reservations WHERE owner_id=?')
    .bind(alice.owner)
    .run();
});

void test('cancelled and source-invalidated task leases cannot publish a late result', async () => {
  const owner = await user(),
    research = await source(owner),
    store = new MissionStore(db, owner.owner);
  for (const change of ['cancel', 'source'] as const) {
    const taskId = crypto.randomUUID();
    const mission = await store.create(research.project.id, {
      title: 'Late result fence',
      question: 'Check fixed source',
      scope: 'One fixed source',
      acceptance: 'No late overwrite',
      tasks: [
        {
          id: taskId,
          title: 'External extraction',
          kind: 'extract',
          executor: 'external',
          input: { version_ids: [research.versionId] },
        },
      ],
    });
    await store.control(mission, 'start');
    const lease = await store.claim(taskId, 'external-test', 'external');
    if (change === 'cancel') await store.control(mission, 'cancel');
    else
      await owner.reviseSource({
        p_source: research.id,
        p_expected: 1,
        p_pages: [{ page: 1, text: 'A revised historical transcription.' }],
        p_method: 'manual',
      });
    await assert.rejects(
      store.submit(taskId, lease.lease, 'external-test', {
        summary: 'late answer',
        citations: [],
        checks: [],
      }),
      /租约/,
    );
    const task = await store.task(taskId);
    assert.equal(task.status, change === 'cancel' ? 'cancelled' : 'stale');
    assert.equal(task.result, null);
  }
});

void test('GLM task routing sets supported efforts and bounds provider price without exposing reasoning text', () => {
  const base = {
    provider: 'openrouter' as const,
    model: 'z-ai/glm-5.3-flash',
    key: 'test-key',
    system: 'Research',
    prompt: 'Public source',
  };
  const extraction = providerRequest({ ...base, taskKind: 'extract' }).body as {
    reasoning: { effort: string; exclude: boolean };
    provider: { max_price: { prompt: number; completion: number } };
  };
  const analysis = providerRequest({ ...base, taskKind: 'compare' }).body as {
    reasoning: { effort: string };
  };
  const synthesis = providerRequest({ ...base, taskKind: 'synthesis' })
    .body as { reasoning: { effort: string } };
  assert.deepEqual(extraction.reasoning, { effort: 'low', exclude: true });
  assert.equal(analysis.reasoning.effort, 'high');
  assert.equal(synthesis.reasoning.effort, 'max');
  assert.deepEqual(extraction.provider.max_price, {
    prompt: 0.15,
    completion: 0.5,
  });
  const override = providerRequest({
    ...base,
    taskKind: 'extract',
    effort: 'high',
    priceCeiling: { input: 0.1, output: 0.3 },
  }).body as typeof extraction;
  assert.equal(override.reasoning.effort, 'high');
  assert.deepEqual(override.provider.max_price, {
    prompt: 0.1,
    completion: 0.3,
  });
  const direct = providerRequest({ ...base, provider: 'openai' }).body;
  assert.ok(!('reasoning' in direct));
});

void test('Google sign-in uses app credentials, normal identity scopes and protected callback destinations', async () => {
  const environment = {
    DB: db,
    FILES: {} as R2Bucket,
    BETTER_AUTH_URL: 'https://canwoo.com',
    BETTER_AUTH_SECRET: 'test-only-google-login-secret-long-enough',
    GOOGLE_DRIVE_CLIENT_ID: 'test-canwoo.apps.googleusercontent.com',
    GOOGLE_DRIVE_CLIENT_SECRET: 'test-google-secret',
  };
  assert.equal(googleConfigured(environment), true);
  assert.equal(
    googleConfigured({ ...environment, GOOGLE_DRIVE_CLIENT_SECRET: undefined }),
    false,
  );
  const auth = createAuth(environment);
  const signIn = (callbackURL: string, origin = 'https://canwoo.com') =>
    auth.handler(
      new Request('https://canwoo.com/api/auth/sign-in/social', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          Cookie: 'canwoo_locale=en',
        },
        body: JSON.stringify({
          provider: 'google',
          callbackURL,
          disableRedirect: true,
        }),
      }),
    );
  const response = await signIn('/');
  assert.equal(response.status, 200);
  const body = (await response.json()) as { url: string };
  const url = new URL(body.url);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(
    url.searchParams.get('client_id'),
    environment.GOOGLE_DRIVE_CLIENT_ID,
  );
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://canwoo.com/api/auth/callback/google',
  );
  assert.ok(url.searchParams.get('state'));
  assert.match(url.searchParams.get('scope') || '', /openid/);
  assert.doesNotMatch(url.searchParams.get('scope') || '', /drive/);
  assert.notEqual(
    (await signIn('https://untrusted.example/steal')).status,
    200,
  );
  assert.equal((await signIn('/', 'https://untrusted.example')).status, 403);
  const context = await auth.$context;
  assert.equal(context.options.account?.encryptOAuthTokens, true);
});

void test('Drive authorization returns to its project and cancellation consumes only the owning user state', async () => {
  const alice = await user(),
    bob = await user();
  const project = await alice.createProject('OAuth project continuity', '');
  const environment = {
    DB: db,
    FILES: {} as R2Bucket,
    BETTER_AUTH_URL: 'https://canwoo.com',
    FOLIOTRACE_ENCRYPTION_KEY: btoa('a'.repeat(32)),
    GOOGLE_DRIVE_CLIENT_ID: 'test-client',
    GOOGLE_DRIVE_CLIENT_SECRET: 'test-secret',
  };
  const path = projectPath(project.id, 'drive');
  assert.equal(safeWorkspaceReturn(path), path);
  for (const candidate of [
    'https://attacker.example/',
    '//attacker.example/',
    '/api/files',
    '/?project=invalid',
    '/\\\\attacker.example/',
  ])
    assert.equal(safeWorkspaceReturn(candidate), '/');
  const url = new URL(
    await startOAuth(environment, alice.owner, 'google', path),
  );
  const state = url.searchParams.get('state')!;
  await assert.rejects(cancelOAuth(environment, bob.owner, state));
  assert.equal(await cancelOAuth(environment, alice.owner, state), path);
  await assert.rejects(cancelOAuth(environment, alice.owner, state));
  const success = new URL(
    await startOAuth(environment, alice.owner, 'google', path),
  );
  const result = await completeOAuth(
    environment,
    alice.owner,
    'google',
    success.searchParams.get('state')!,
    'test-code',
    async () =>
      Response.json({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        expires_in: 3600,
      }),
  );
  assert.equal(result, path);
});

void test('readable research exports preserve exact quotes, named sources and bounded interpretation', () => {
  const version = crypto.randomUUID();
  const result = {
    summary: '仅依据本批材料。',
    citations: [
      { version_id: version, page: 3, quote: '原文第一行\n原文第二行' },
    ],
    checks: [],
    data: {
      rows: [{ version_id: version, page: 3, counts: { 港口: 2 } }],
      pairs: [],
    },
  };
  const text = reportMarkdown(
    '港口研究',
    result,
    () => '海关档案',
    'zh-CN',
    'CC-BY-SA-4.0',
  );
  assert.match(text, /海关档案 · 页 3/);
  assert.match(text, /> 原文第一行\n> 原文第二行/);
  assert.match(text, /港口 \(2\)/);
  assert.match(text, /不能据此推断历史总体/);
  assert.match(text, /CC-BY-SA-4.0/);
});

void test('AI reading plans require real citations and do not trust model-authored checks', async () => {
  const owner = await user(),
    material = await source(owner);
  const modelId = crypto.randomUUID();
  await owner.saveModel({
    id: modelId,
    label: 'Test reading model',
    provider: 'openrouter',
    model_id: 'z-ai/glm-5.3-flash',
    vision: true,
    key_hint: 'test',
    encrypted_key: 'not-used-in-this-test',
  });
  const store = new MissionStore(db, owner.owner);
  const draft = researchTemplate({
    title: 'Read sources',
    question: 'What does this passage establish?',
    scope: 'One test passage',
    acceptance: 'Exact citation, human review',
    query: '',
    version_ids: [material.versionId],
    locale: 'en',
    model_id: modelId,
    input_rate: 0.15,
    output_rate: 0.5,
  });
  assert.deepEqual(
    draft.tasks.map((task) => task.executor),
    ['model', 'builtin', 'human', 'builtin'],
  );
  assert.equal(draft.tasks[0].input.effort, 'low');
  const missionId = await store.create(material.project.id, draft);
  await store.control(missionId, 'start');
  const claim = await store.claim(draft.tasks[0].id, 'test-model', 'model');
  await assert.rejects(
    store.submit(draft.tasks[0].id, claim.lease, 'test-model', {
      summary: 'Unsupported conclusion',
      citations: [],
      checks: [
        { name: 'Model says verified', passed: true, detail: 'Trust me' },
      ],
    }),
    /没有提供原文引文/,
  );
  const version = await owner.version(material.versionId);
  const quote = version.pages[0].text.slice(0, 12);
  await assert.rejects(
    store.submit(draft.tasks[0].id, claim.lease, 'test-model', {
      summary: 'Invented quotation [1]',
      data: { limitations: [] },
      citations: [
        {
          version_id: version.id,
          page: 1,
          quote: 'This is not present in the source',
        },
      ],
    }),
    /不一致/,
  );
  await store.submit(draft.tasks[0].id, claim.lease, 'test-model', {
    summary: 'A bounded reading [1]',
    data: { limitations: [] },
    citations: [{ version_id: version.id, page: 1, quote }],
    checks: [{ name: 'Model says verified', passed: true, detail: 'Trust me' }],
  });
  const task = await store.task(draft.tasks[0].id);
  assert.equal(task.result?.checks.length, 1);
  assert.match(task.result!.checks[0].name, /^citation:/);
  assert.equal((await store.task(draft.tasks[2].id)).status, 'blocked');
  assert.equal((await store.task(draft.tasks[3].id)).status, 'blocked');
  const verification = await store.claim(
    draft.tasks[1].id,
    'checks',
    'builtin',
  );
  await store.submit(
    verification.task.id,
    verification.lease,
    'checks',
    await builtin(store, verification.task),
  );
  const verified = (await store.task(verification.task.id)).result!;
  assert.equal(
    verified.checks.filter((check) => check.name.startsWith('citation:'))
      .length,
    verified.citations.length,
  );
  const reviewer = await store.claim(draft.tasks[2].id, 'historian', 'human');
  await store.submit(reviewer.task.id, reviewer.lease, 'historian', {
    summary: 'Reviewed account with corrected interpretation [1]',
    citations: [...task.result!.citations, ...task.result!.citations],
  });
  const reviewed = await store.task(reviewer.task.id);
  await store.review(
    reviewed.id,
    'accepted',
    'Compared the source and corrected the model',
    reviewed.revision,
  );
  const report = await store.claim(draft.tasks[3].id, 'assembly', 'builtin');
  const result = await builtin(store, report.task);
  assert.equal(
    result.summary,
    'Reviewed account with corrected interpretation [1]',
  );
  assert.equal(result.citations.length, 1);
  const lineage = result.data as {
    dependencies: { result: { summary: string } }[];
  };
  assert.ok(
    lineage.dependencies.some(
      (dep) => dep.result.summary === 'A bounded reading [1]',
    ),
  );
});

void test('retrying uploaded source registration preserves one original and version', async () => {
  const owner = await user(),
    material = await source(owner);
  const row = await owner.source(material.id),
    version = await owner.version(material.versionId);
  const id = await owner.importSource({
    p_id: row.id,
    p_project: row.project_id,
    p_title: row.title,
    p_path: row.object_path,
    p_type: row.media_type,
    p_pages: version.pages,
  });
  assert.equal(id, version.id);
  const snapshot = await owner.readProject(row.project_id);
  assert.equal(snapshot.sources.length, 1);
  assert.equal(snapshot.source_versions.length, 1);
});

void test('provider diagnostics retain safe HTTP causes without echoing credentials or source material', async () => {
  const request = {
    provider: 'openrouter' as const,
    model: 'test',
    key: 'secret-key',
    system: '',
    prompt: 'private-source',
  };
  const fetcher = (async () =>
    new Response('secret-key private-source', { status: 401 })) as typeof fetch;
  await assert.rejects(invoke(request, fetcher), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.match(safeProviderFailure(error), /HTTP 401/);
    assert.doesNotMatch(
      safeProviderFailure(error),
      /secret-key|private-source/,
    );
    return true;
  });
  assert.doesNotMatch(
    safeProviderFailure(new Error('secret-key')),
    /secret-key/,
  );
  const { owner, work, a, input, secret } = await jobSetup();
  const job = await createJob(owner, input);
  await executeJob(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: secret },
    job.id,
    async () => {
      throw new ProviderError(
        'http_401',
        '模型服务返回 HTTP 401。密钥未通过验证。',
      );
    },
  );
  assert.match((await jobById(db, job.id))?.error || '', /HTTP 401/);
  assert.equal(
    (await work.workbench(a.project.id)).budget?.committed_units,
    job.reserved_units,
  );
});

import {
  agentRecipe,
  checkExtraction,
  extractionCsv,
  interleavePages,
} from '../lib/platform/research-recipes';
import { discoverSources, validateShortlist } from '../lib/platform/discovery';
import { executeMissionTask } from '../lib/platform/execute';
import { jobMaterials } from '../lib/jobs';
async function extractionStudy() {
  const fixture = await jobSetup();
  const version = await fixture.owner.reviseSource({
    p_source: fixture.a.id,
    p_expected: 1,
    p_method: 'manual',
    p_pages: [
      {
        page: 1,
        text: 'On 22 September 1862, a preliminary proclamation announced a future policy.',
      },
      {
        page: 2,
        text: 'On 1 January 1863, the final proclamation identified designated areas.',
      },
      {
        page: 3,
        text: 'The declaration did not itself document enforcement in every locality.',
      },
      {
        page: 4,
        text: 'Military implementation requires additional local records.',
      },
    ],
  });
  const store = new MissionStore(db, fixture.owner.owner);
  const draft = agentRecipe({
    method: {
      title: 'Proclamation reading',
      kind: 'extract',
      instructions:
        'Identify what these documents state, without inferring implementation.',
      fields: ['Statement'],
    },
    pages: [1, 2, 3, 4].map((page) => ({ version_id: version, page })),
    model_id: fixture.input.model_id,
    input_rate: 1,
    output_rate: 2,
    locale: 'en',
  });
  const id = await store.create(fixture.a.project.id, draft);
  return { ...fixture, version, store, draft, id };
}
function extracted(version: string, page: number, quote: string) {
  return {
    summary: 'A record to review [1].',
    citations: [{ version_id: version, page, quote }],
    checks: [],
    data: {
      records: [
        {
          label: 'Declaration',
          cells: [
            {
              field: 'Statement',
              value: quote,
              status: 'explicit',
              citation: 1,
            },
          ],
        },
      ],
      coverage: 'Read the designated page only.',
    },
  };
}
void test('page-scoped jobs send only designated pages and reject nonexistent or foreign selections', async () => {
  const f = await extractionStudy();
  const text = await jobMaterials(f.owner, [f.version], f.a.project.id, [
    { version_id: f.version, page: 2 },
  ]);
  assert.match(text, /1 January 1863/);
  assert.doesNotMatch(text, /22 September|additional local/);
  await assert.rejects(
    jobMaterials(f.owner, [f.version], f.a.project.id, [
      { version_id: f.version, page: 999 },
    ]),
    /所选页/,
  );
  const job = await createJob(f.owner, {
    ...f.input,
    id: crypto.randomUUID(),
    version_ids: [f.version],
    page_refs: [{ version_id: f.version, page: 2 }],
  });
  let calls = 0;
  await executeJob(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret },
    job.id,
    async (input) => {
      calls++;
      assert.match(input.prompt, /1 January/);
      assert.doesNotMatch(input.prompt, /22 September/);
      return { text: 'ok', inputTokens: 10, outputTokens: 10 };
    },
  );
  assert.equal(calls, 1);
});
void test('sample corrections and held-out approval gate later paid extraction; corrections are preserved and downstream becomes stale', async () => {
  const f = await extractionStudy(),
    env = { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret };
  await f.store.control(f.id, 'start');
  let calls = 0;
  const model: typeof invoke = async (req) => {
    calls++;
    const page = Number(req.prompt.match(/\[页 (\d+)\]/)?.[1]);
    assert.ok(page);
    const v = await f.owner.version(f.version);
    const quote = v.pages.find((p) => p.page === page)!.text;
    return {
      text: JSON.stringify(extracted(f.version, page, quote)),
      inputTokens: 100,
      outputTokens: 150,
    };
  };
  const samples = f.draft.tasks.filter(
    (t) => t.kind === 'extract' && !t.dependencies.length,
  );
  for (const task of samples) await executeMissionTask(env, task.id, model);
  assert.equal(calls, 2);
  const gate = f.draft.tasks.find((t) => t.input.parameters.gate === 'sample')!;
  const validation = f.draft.tasks.find(
    (t) => t.input.parameters.gate === 'validation',
  )!;
  const holdout = f.draft.tasks.find(
    (t) => t.kind === 'extract' && t.dependencies.includes(gate.id),
  )!;
  assert.equal((await f.store.task(gate.id)).status, 'ready');
  await executeMissionTask(env, holdout.id, model);
  assert.equal(calls, 2, 'unreviewed sample cannot start the held-out call');
  const lease = await f.store.claim(gate.id, f.owner.owner, 'human');
  await f.store.submit(gate.id, lease.lease, f.owner.owner, {
    summary: 'Retain declarations, not inferred implementation.',
    citations: [],
    checks: [],
  });
  assert.equal((await f.store.task(holdout.id)).status, 'blocked');
  await f.store.review(
    gate.id,
    'accepted',
    'Checked samples against original wording',
    (await f.store.task(gate.id)).revision,
  );
  await executeMissionTask(env, holdout.id, model);
  assert.equal(calls, 3);
  const rest = f.draft.tasks.find(
    (t) => t.kind === 'extract' && t.dependencies.includes(validation.id),
  )!;
  await executeMissionTask(env, rest.id, model);
  assert.equal(calls, 3, 'held-out approval is also mandatory');
  const h = await f.store.claim(validation.id, f.owner.owner, 'human');
  await f.store.submit(validation.id, h.lease, f.owner.owner, {
    summary: 'Held-out evidence checked; continue cautiously.',
    citations: [],
    checks: [],
  });
  await f.store.review(
    validation.id,
    'accepted',
    'Independent page checked',
    (await f.store.task(validation.id)).revision,
  );
  await executeMissionTask(env, rest.id, model);
  assert.equal(calls, 4);
  const sample = await f.store.task(samples[0].id),
    data = structuredClone(sample.result!.data) as {
      records: { cells: { value: string; status: string }[] }[];
    };
  data.records[0].cells[0].value = 'A policy announcement';
  data.records[0].cells[0].status = 'inferred';
  await f.store.correct(
    sample.id,
    data,
    'Distinguish description from literal transcription',
    sample.revision,
  );
  assert.equal((await f.store.task(sample.id)).status, 'review');
  assert.equal(
    (await f.store.task(rest.id)).status,
    'stale',
    'late correction invalidates dependent findings',
  );
  const log = await db
    .prepare('SELECT body FROM task_corrections WHERE task_id=?')
    .bind(sample.id)
    .first<{ body: string }>();
  assert.equal(
    JSON.parse(log!.body).before.data.records[0].cells[0].status,
    'explicit',
  );
  assert.equal(
    JSON.parse(log!.body).after.data.records[0].cells[0].status,
    'inferred',
  );
  await assert.rejects(
    f.store.correct(sample.id, data, 'Competing edit', sample.revision),
    /更新/,
  );
});
void test('extraction rejects invented citations, filled missing values and repeated columns; CSV is safe for spreadsheets', () => {
  const id = crypto.randomUUID(),
    result = extracted(id, 1, 'A statement');
  assert.equal(checkExtraction(result, ['Statement']).records.length, 1);
  const missing = structuredClone(result);
  missing.data.records[0].cells[0].status = 'missing';
  assert.throws(() => checkExtraction(missing, ['Statement']), /缺失/);
  const forged = structuredClone(result);
  forged.data.records[0].cells[0].citation = 2;
  assert.throws(() => checkExtraction(forged, ['Statement']), /原文/);
  const duplicate = structuredClone(result);
  duplicate.data.records[0].cells.push(duplicate.data.records[0].cells[0]);
  assert.throws(() => checkExtraction(duplicate, ['Statement']), /重复/);
  result.data.records[0].cells[0].value = '=HYPERLINK("bad")';
  assert.match(extractionCsv(result, ['Statement']), /"'=HYPERLINK/);
});
void test('source revisions invalidate queued research without dispatching paid recomputation and create one change notification', async () => {
  const f = await extractionStudy();
  await f.store.control(f.id, 'start');
  const task = f.draft.tasks[0];
  await db
    .prepare("UPDATE mission_tasks SET status='queued' WHERE id=?")
    .bind(task.id)
    .run();
  await f.owner.reviseSource({
    p_source: f.a.id,
    p_expected: 2,
    p_method: 'manual',
    p_pages: [{ page: 1, text: 'Corrected transcription.' }],
  });
  assert.equal((await f.store.task(task.id)).status, 'stale');
  const rows = await db
    .prepare(
      "SELECT * FROM research_inbox WHERE project_id=? AND item_key LIKE 'source-change:%'",
    )
    .bind(f.a.project.id)
    .all();
  assert.equal(rows.results.length, 1);
  assert.match(
    String(rows.results[0].id),
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  let calls = 0;
  await executeMissionTask(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret },
    task.id,
    async () => {
      calls++;
      throw new Error('Unexpected paid call');
    },
  );
  assert.equal(calls, 0);
});
void test('directed discovery sends only bounded queries to fixed catalogs, records failures and rejects invented shortlist IDs', async () => {
  const f = await extractionStudy();
  const task = await f.store.task(f.draft.tasks[0].id);
  task.kind = 'search';
  task.executor = 'builtin';
  task.input.parameters = { discovery: true, external: true };
  const dep = {
    result: {
      summary: 'Plan',
      citations: [],
      checks: [],
      data: { queries: ['proclamation'] },
    },
  };
  let calls = 0;
  const result = await discoverSources(
    f.store,
    task,
    [dep],
    async (url, init) => {
      calls++;
      const target = new URL(url instanceof Request ? url.url : url.toString());
      assert.ok(['api.crossref.org', 'www.loc.gov'].includes(target.hostname));
      assert.equal(init?.redirect, 'manual');
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      assert.doesNotMatch(target.toString(), /22 September/);
      return target.hostname === 'www.loc.gov'
        ? new Response('unavailable', { status: 503 })
        : Response.json({
            message: {
              items: [
                {
                  DOI: '10.1234/record',
                  title: ['Catalog record'],
                  publisher: 'Archive',
                },
              ],
            },
          });
    },
  );
  assert.equal(calls, 2);
  assert.ok(
    result.citations.every((c) => c.page === 1),
    'discovery must respect the pages actually selected',
  );
  const shortlist = validateShortlist(
    {
      summary: 'Reading lead',
      citations: [],
      checks: [],
      data: {
        shortlist: [
          {
            id: 'doi:10.1234/record',
            reason: 'A relevant catalog record',
            limitation: 'Full text unread',
            url: 'javascript:bad',
          },
        ],
      },
    },
    [{ result }],
  );
  assert.equal(shortlist.shortlist[0].url, 'https://doi.org/10.1234/record');
  assert.equal(shortlist.shortlist[0].access, 'catalog_only');
  const data = result.data as {
    candidates: { id: string; access: string }[];
    searches: { status: string }[];
  };
  assert.ok(data.candidates.some((c) => c.access === 'catalog_only'));
  assert.ok(data.searches.some((s) => s.status === 'unavailable'));
  assert.throws(
    () =>
      validateShortlist(
        {
          summary: 'Fake',
          citations: [],
          checks: [],
          data: {
            shortlist: [
              { id: 'invented', reason: 'Relevant', limitation: 'Unread' },
            ],
          },
        },
        [{ result }],
      ),
    /实际检索/,
  );
  task.input.parameters.external = false;
  await discoverSources(f.store, task, [dep], async () => {
    throw new Error('Must not contact an external catalog');
  });
});
void test('sampling crosses documents, holds out unseen pages and rejects repeated pages', () => {
  const a = crypto.randomUUID(),
    b = crypto.randomUUID();
  assert.deepEqual(
    interleavePages([
      { version_id: a, pages: [1, 2] },
      { version_id: b, pages: [1] },
    ]),
    [
      { version_id: a, page: 1 },
      { version_id: b, page: 1 },
      { version_id: a, page: 2 },
    ],
  );
  assert.throws(
    () =>
      agentRecipe({
        method: {
          title: 'Test',
          kind: 'extract',
          instructions: 'Extract names',
          fields: ['Name'],
        },
        pages: [
          { version_id: a, page: 1 },
          { version_id: a, page: 1 },
          { version_id: a, page: 2 },
        ],
        model_id: crypto.randomUUID(),
        input_rate: 1,
        output_rate: 1,
        locale: 'en',
      }),
    /重复/,
  );
});
import { updateMission } from '../lib/platform/incremental';
void test('incremental research reuses unaffected finished work and rewrites only affected source inputs', async () => {
  const f = await extractionStudy();
  const unaffectedVersion = f.a.versionId;
  const template = researchTemplate({
    title: 'Incremental corpus',
    question: 'How do declarations differ?',
    scope: 'Two versions',
    acceptance: 'Review',
    query: 'policy',
    version_ids: [unaffectedVersion],
    locale: 'en',
  });
  // A separate source makes the first branch independent of the changed one.
  const id = crypto.randomUUID(),
    path = `${f.owner.owner}/${f.a.project.id}/${id}/original.txt`;
  await f.owner.recordUpload(id, f.a.project.id, path, 'text/plain');
  const stable = await f.owner.importSource({
    p_id: id,
    p_project: f.a.project.id,
    p_title: 'Independent source',
    p_path: path,
    p_type: 'text/plain',
    p_pages: [{ page: 1, text: 'Independent record of policy.' }],
  });
  const first = structuredClone(template.tasks[0]);
  first.dependencies = [];
  first.input.version_ids = [stable];
  const second = structuredClone(template.tasks[2]);
  second.dependencies = [];
  second.input.version_ids = [f.version];
  const study = await f.store.create(f.a.project.id, {
    ...template,
    tasks: [first, second],
  });
  await f.store.control(study, 'start');
  await executeMissionTask({ DB: db }, first.id);
  await executeMissionTask({ DB: db }, second.id);
  const changed = await f.owner.reviseSource({
    p_source: f.a.id,
    p_expected: 2,
    p_method: 'manual',
    p_pages: [{ page: 1, text: 'A corrected policy passage.' }],
  });
  const next = await updateMission(f.store, f.a.project.id, study),
    view = await f.store.view(next);
  assert.equal(
    view.mission.status,
    'draft',
    'new paid work always requires Start',
  );
  const reused = view.tasks.find(
    (t) => t.input.parameters.reuse_task === first.id,
  )!;
  assert.ok(reused);
  assert.equal(reused.executor, 'builtin');
  const updated = view.tasks.find((t) => !t.input.parameters.reuse_task)!;
  assert.deepEqual(updated.input.version_ids, [changed]);
  await f.store.control(next, 'start');
  await executeMissionTask({ DB: db }, reused.id);
  assert.equal((await f.store.task(reused.id)).status, 'succeeded');
});
void test('researchers can add omitted records with new exact quotations, but cannot cite unread pages', async () => {
  const f = await extractionStudy();
  await f.store.control(f.id, 'start');
  const task = f.draft.tasks[0],
    claim = await f.store.claim(task.id, 'test-model', 'model'),
    page = (await f.owner.version(f.version)).pages[0];
  await f.store.submit(
    task.id,
    claim.lease,
    'test-model',
    extracted(f.version, 1, page.text),
  );
  const original = await f.store.task(task.id),
    data = structuredClone(original.result!.data) as {
      records: {
        label: string;
        cells: {
          field: string;
          value: string;
          status: string;
          citation: number;
        }[];
      }[];
    };
  data.records.push({
    label: 'Omitted phrase',
    cells: [
      {
        field: 'Statement',
        value: 'preliminary proclamation',
        status: 'explicit',
        citation: 2,
      },
    ],
  });
  const quotes = [
    ...original.result!.citations,
    {
      version_id: f.version,
      page: 1,
      quote: 'preliminary proclamation',
      start: page.text.indexOf('preliminary proclamation'),
    },
  ];
  await f.store.correct(
    task.id,
    data,
    'Added an omitted record',
    original.revision,
    quotes,
  );
  const corrected = await f.store.task(task.id);
  assert.equal(corrected.result!.citations.length, 2);
  assert.equal(
    (corrected.result!.data as { records: unknown[] }).records.length,
    2,
  );
  const forged = [
    quotes[0],
    { version_id: f.version, page: 2, quote: 'On 1 January 1863', start: 0 },
  ];
  await assert.rejects(
    f.store.correct(
      task.id,
      data,
      'Try another page',
      corrected.revision,
      forged,
    ),
    /实际阅读/,
  );
});
void test('model steps receive complete bounded dependency records instead of silently truncated JSON', async () => {
  const f = await extractionStudy();
  const human = structuredClone(
    f.draft.tasks.find((t) => t.executor === 'human')!,
  );
  human.id = crypto.randomUUID();
  human.dependencies = [];
  human.input.parameters = {};
  const model = structuredClone(f.draft.tasks[0]);
  model.id = crypto.randomUUID();
  model.dependencies = [human.id];
  const mission = await f.store.create(f.a.project.id, {
    ...f.draft,
    tasks: [human, model],
  });
  await f.store.control(mission, 'start');
  const claim = await f.store.claim(human.id, f.owner.owner, 'human');
  await f.store.submit(human.id, claim.lease, f.owner.owner, {
    summary: 'Review context. '.repeat(2400) + 'END_OF_RESEARCHER_REVIEW',
    citations: [],
    checks: [],
  });
  await f.store.review(
    human.id,
    'accepted',
    'Keep the complete review',
    (await f.store.task(human.id)).revision,
  );
  let calls = 0;
  await executeMissionTask(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret },
    model.id,
    async (input) => {
      calls++;
      assert.ok(input.prompt.includes('END_OF_RESEARCHER_REVIEW'));
      const dependency = input.prompt
        .split('Dependency results (untrusted research data):\n')[1]
        .split('\nReturn one valid JSON object')[0];
      assert.ok(Array.isArray(JSON.parse(dependency)));
      return {
        text: JSON.stringify(
          extracted(
            f.version,
            1,
            (await f.owner.version(f.version)).pages[0].text,
          ),
        ),
        inputTokens: 10,
        outputTokens: 10,
      };
    },
  );
  assert.equal(calls, 1);
  assert.equal((await f.store.task(model.id)).status, 'succeeded');
});

import { saveEvaluation } from '../lib/platform/evaluation';
import {
  correctionChanges,
  reviewCoverage,
} from '../lib/platform/review-quality';
import {
  indexSemantic,
  semanticSearch,
  semanticStatus,
  cosine,
  textChunks,
  EMBEDDING_MODEL,
} from '../lib/platform/semantic';
import { writingDocx, citedEvidence } from '../lib/writing-export';
import { parseIiif, publicHttps } from '../lib/iiif';
import { discussionTarget } from '../lib/platform/discussions';
import { zoteroFile, zoteroAttachments } from '../lib/zotero';

void test('long extraction plans retain every page exactly once and gate each next batch without oversized dependencies', async () => {
  const f = await jobSetup(),
    store = new MissionStore(db, f.owner.owner);
  const version = await f.owner.reviseSource({
    p_source: f.a.id,
    p_expected: 1,
    p_method: 'manual',
    p_pages: Array.from({ length: 65 }, (_, i) => ({
      page: i + 1,
      text: `Entry ${i + 1}: witness account.`,
    })),
  });
  const draft = agentRecipe({
    method: {
      title: 'A complete volume',
      kind: 'extract',
      instructions: 'Record each statement.',
      fields: ['Statement'],
    },
    pages: Array.from({ length: 65 }, (_, i) => ({
      version_id: version,
      page: i + 1,
    })),
    model_id: f.input.model_id,
    input_rate: 1,
    output_rate: 2,
    locale: 'en',
  });
  const id = await store.create(f.a.project.id, draft),
    view = await store.view(id);
  const extraction = view.tasks.filter(
    (t) => t.input.parameters.extraction === true,
  );
  assert.equal(extraction.length, 65);
  assert.equal(
    new Set(extraction.map((t) => JSON.stringify(t.input.page_refs))).size,
    65,
  );
  assert.equal(
    view.tasks.filter((t) => t.input.parameters.gate === 'batch').length,
    4,
  );
  assert.ok(draft.tasks.every((t) => t.dependencies.length <= 30));
  const second = draft.tasks.find(
    (t) => t.input.parameters.batch === 2 && t.input.parameters.extraction,
  )!;
  const firstGate = draft.tasks.find(
    (t) =>
      t.input.parameters.gate === 'batch' && t.input.parameters.batch === 1,
  )!;
  assert.ok(second.dependencies.includes(firstGate.id));
  await store.control(id, 'start');
  assert.equal((await store.task(second.id)).status, 'blocked');
  await store.control(id, 'pause');
  assert.equal((await store.mission(id)).status, 'paused');
  await store.control(id, 'resume');
  assert.equal((await store.mission(id)).status, 'active');
  assert.equal(reviewCoverage(view.tasks).length, 65);
  const thousand = agentRecipe({
    method: {
      title: 'Corpus',
      kind: 'extract',
      instructions: 'Read',
      fields: ['Statement'],
    },
    pages: Array.from({ length: 1000 }, (_, i) => ({
      version_id: version,
      page: i + 1,
    })),
    model_id: f.input.model_id,
    input_rate: 1,
    output_rate: 2,
    locale: 'en',
  });
  assert.ok(thousand.tasks.length <= 1200);
  assert.throws(() =>
    agentRecipe({
      method: {
        title: 'Too large',
        kind: 'extract',
        instructions: 'Read',
        fields: ['Statement'],
      },
      pages: Array.from({ length: 1001 }, (_, i) => ({
        version_id: version,
        page: i + 1,
      })),
      model_id: f.input.model_id,
      input_rate: 1,
      output_rate: 2,
      locale: 'en',
    }),
  );
});
void test('manual evaluation is pinned to the reviewed result and rejects stale revisions, impossible counts and other tenants', async () => {
  const f = await extractionStudy();
  await f.store.control(f.id, 'start');
  const sample = f.draft.tasks.find(
    (t) => t.input.parameters.phase === 'sample',
  )!;
  const lease = await f.store.claim(sample.id, 'test', 'model');
  const page = sample.input.page_refs![0].page,
    quote = (await f.store.version(f.version)).pages[page - 1].text;
  await f.store.submit(
    sample.id,
    lease.lease,
    'test',
    extracted(f.version, page, quote),
  );
  const task = await f.store.task(sample.id),
    metrics = {
      expected: task.revision,
      missed: 2,
      false_inclusions: 0,
      wrong_values: 0,
      wrong_categories: 1,
      review_minutes: 4,
      manual_minutes: null,
      notes: 'Kinship is not office; check the entire page for omissions.',
    };
  await saveEvaluation(f.store, task.id, metrics);
  assert.equal((await f.store.view(f.id)).evaluations?.[0].metrics.missed, 2);
  assert.equal((await f.store.view(f.id)).evaluations?.[0].current, 1);
  await db
    .prepare('UPDATE mission_tasks SET revision=revision+1 WHERE id=?')
    .bind(task.id)
    .run();
  assert.equal(
    (await f.store.view(f.id)).evaluations?.[0].current,
    1,
    'assignment/status revision must not invalidate unchanged research',
  );
  await db
    .prepare('UPDATE mission_tasks SET revision=revision-1 WHERE id=?')
    .bind(task.id)
    .run();
  await assert.rejects(
    saveEvaluation(f.store, task.id, { ...metrics, expected: 0 }),
    /更新/,
  );
  await assert.rejects(
    saveEvaluation(f.store, task.id, { ...metrics, false_inclusions: 2 }),
    /总数/,
  );
  const other = await user();
  await assert.rejects(
    saveEvaluation(new MissionStore(db, other.owner), task.id, metrics),
    /不存在/,
  );
  const changed = structuredClone(task.result!.data) as {
    records: { cells: { status: string }[] }[];
  };
  changed.records[0].cells[0].status = 'inferred';
  await f.store.correct(
    task.id,
    changed,
    'Do not treat the classification as explicit.',
    task.revision,
  );
  const after = await f.store.view(f.id);
  assert.equal(after.evaluations![0].current, 0);
  assert.equal(correctionChanges(after.corrections![0]).classifications, 1);
  assert.notEqual(
    after.evaluations![0].config.revision,
    (await f.store.task(task.id)).revision,
  );
});
void test('Word export creates real footnotes, escapes XML, preserves fixed-source references and rejects unknown evidence', () => {
  const citation = {
    id: crypto.randomUUID(),
    label: 'Archive',
    text: 'A & B <letter>, p. 2.',
    href: 'https://canwoo.com/?project=x&version=y&page=2',
    stale: true,
  };
  const body = `## A finding\nThe letter says so [Archive](${citation.href}&evidence=${citation.id}).`;
  const parsed = citedEvidence(body, [citation]);
  assert.equal(parsed.used.length, 1);
  const doc = unzipSync(writingDocx('研究 & notes', body, [citation]));
  assert.match(
    strFromU8(doc['word/document.xml']),
    /w:footnoteReference w:id="1"/,
  );
  assert.match(
    strFromU8(doc['word/footnotes.xml']),
    /A &amp; B &lt;letter&gt;/,
  );
  assert.match(strFromU8(doc['word/footnotes.xml']), /newer version/);
  assert.match(
    strFromU8(doc['[Content_Types].xml']),
    /wordprocessingml.footnotes/,
  );
  assert.throws(() => writingDocx('Draft', body, []), /找不到/);
});
void test('IIIF v2 and v3 preserve canvas order, rights and attribution and reject private or credential-bearing image URLs', () => {
  const v3 = {
    id: 'https://archive.example/manifest',
    type: 'Manifest',
    label: { en: ['A letter'] },
    rights: 'https://creativecommons.org/publicdomain/mark/1.0/',
    requiredStatement: {
      label: { en: ['Attribution'] },
      value: { en: ['University archive'] },
    },
    items: [
      {
        id: 'https://archive.example/canvas/2',
        type: 'Canvas',
        label: { none: ['Verso'] },
        items: [
          {
            items: [
              {
                body: {
                  id: 'https://archive.example/image.jpg',
                  type: 'Image',
                  format: 'image/jpeg',
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const parsed = parseIiif(v3);
  assert.equal(parsed.pages[0].order, 1);
  assert.equal(parsed.pages[0].label, 'Verso');
  assert.equal(parsed.attribution, 'University archive');
  const v2 = {
    '@id': 'https://archive.example/manifest',
    '@type': 'sc:Manifest',
    label: 'Archive',
    sequences: [
      {
        canvases: [
          {
            '@id': 'https://archive.example/canvas',
            label: '1',
            images: [
              {
                resource: {
                  '@id': 'https://archive.example/1.jpg',
                  '@type': 'dctypes:Image',
                },
              },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(parseIiif(v2).pages.length, 1);
  for (const url of [
    'http://archive.example/image',
    'https://127.0.0.1/image',
    'https://user:secret@archive.example/image',
    'https://[::1]/image',
    'https://localhost./image',
  ])
    assert.throws(() => publicHttps(url));
});
void test('evidence discussion targets cannot point into another project', async () => {
  const owner = await user(),
    a = await source(owner),
    b = await source(owner);
  await discussionTarget(owner, a.project.id, a.versionId);
  await assert.rejects(
    discussionTarget(owner, a.project.id, b.versionId),
    /不属于/,
  );
});
void test('Zotero group attachments use fixed API routes and never forward the API key to storage', async () => {
  const config = {
    library: '123',
    library_type: 'groups' as const,
    key: 'test-private',
  };
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.match(
        url instanceof Request ? url.url : url.toString(),
        /groups\/123\/items\/ABCDEFGH\/file/,
      );
      assert.equal(
        (options!.headers as Record<string, string>)['Zotero-API-Key'],
        'test-private',
      );
      return new Response('', {
        status: 302,
        headers: { location: 'https://zotero.s3.amazonaws.com/file.pdf' },
      });
    }
    assert.equal(options?.headers, undefined);
    return new Response('%PDF-test');
  };
  assert.ok((await zoteroFile(config, 'ABCDEFGH', fetcher)).length);
  assert.equal(calls, 2);
  await assert.rejects(
    zoteroFile(
      config,
      'ABCDEFGH',
      async () =>
        new Response('', {
          status: 302,
          headers: { location: 'https://evil.example/file' },
        }),
    ),
    /不支持/,
  );
  const items = await zoteroAttachments(config, 0, async () =>
    Response.json([
      {
        key: 'ABCDEFGH',
        data: {
          title: 'Letter',
          contentType: 'application/pdf',
          linkMode: 'imported_file',
        },
      },
    ]),
  );
  assert.equal(items.items.length, 1);
});
void test('semantic indexing reuses fixed chunks, filters superseded versions, charges zero output and refuses replay', async () => {
  const f = await jobSetup();
  await db
    .prepare("UPDATE model_connections SET provider='openrouter' WHERE id=?")
    .bind(f.input.model_id)
    .run();
  let paid = 0;
  const fetcher: typeof fetch = async (url, opts) => {
    if ((url instanceof Request ? url.url : url.toString()).endsWith('/models'))
      return Response.json({
        data: [{ id: EMBEDDING_MODEL, pricing: { prompt: '0.00000002' } }],
      });
    paid++;
    assert.equal(opts?.redirect, 'manual');
    const body = JSON.parse(
      typeof opts?.body === 'string' ? opts.body : '{}',
    ) as { input: string[]; dimensions: number };
    assert.equal(body.dimensions, 256);
    return Response.json({
      model: EMBEDDING_MODEL,
      data: body.input.map((_, i) => ({
        index: i,
        embedding: Array.from({ length: 256 }, (_, j) => (j === 0 ? 1 : 0)),
      })),
      usage: { prompt_tokens: 10 },
    });
  };
  const request = crypto.randomUUID(),
    indexed = await indexSemantic(
      f.owner,
      f.secret,
      f.a.project.id,
      f.input.model_id,
      request,
      fetcher,
    );
  assert.equal(indexed.done, true);
  assert.equal(paid, 1);
  await indexSemantic(
    f.owner,
    f.secret,
    f.a.project.id,
    f.input.model_id,
    crypto.randomUUID(),
    fetcher,
  );
  assert.equal(paid, 1, 'cached index must not spend again');
  const cost = await db
    .prepare('SELECT reserved_units FROM direct_run_costs WHERE run_id=?')
    .bind(request)
    .first<{ reserved_units: number }>();
  assert.equal(cost?.reserved_units, 1);
  const searchId = crypto.randomUUID(),
    search = await semanticSearch(
      f.owner,
      f.secret,
      f.a.project.id,
      f.input.model_id,
      searchId,
      'opening port',
      fetcher,
    );
  assert.equal(search.hits[0].version_id, f.a.versionId);
  await assert.rejects(
    semanticSearch(
      f.owner,
      f.secret,
      f.a.project.id,
      f.input.model_id,
      searchId,
      'opening port',
      fetcher,
    ),
    /重复调用/,
  );
  assert.equal(paid, 2);
  await f.owner.reviseSource({
    p_source: f.a.id,
    p_expected: 1,
    p_method: 'manual',
    p_pages: [{ page: 1, text: 'Revised account.' }],
  });
  assert.equal((await semanticStatus(f.owner, f.a.project.id)).indexed, 0);
  const b = await source(f.owner);
  assert.equal((await semanticStatus(f.owner, b.project.id)).indexed, 0);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(textChunks('a'.repeat(5000)).at(-1)?.start, 4200);
});

void test('researcher dialogue gates model synthesis, includes corrections and stops after three model calls', async () => {
  const f = await extractionStudy(),
    env = { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret };
  const draft = agentRecipe({
    method: {
      title: 'Bounded seminar',
      kind: 'seminar',
      instructions: 'Separate policy announcements from implementation.',
      fields: ['Interpretation'],
    },
    pages: [{ version_id: f.version, page: 1 }],
    model_id: f.input.model_id,
    input_rate: 1,
    output_rate: 2,
    locale: 'en',
  });
  const id = await f.store.create(f.a.project.id, draft);
  await f.store.control(id, 'start');
  let calls = 0;
  const quote = (await f.owner.version(f.version)).pages[0].text;
  const model: typeof invoke = async (req) => {
    calls++;
    if (calls === 2) assert.match(req.prompt, /Interpretation reply/);
    if (calls === 3)
      assert.match(
        req.prompt,
        /Researcher correction: declarations are not implementation/,
      );
    return {
      text: JSON.stringify({
        summary:
          calls === 1
            ? 'Interpretation reply [1].'
            : 'Contested interpretation [1].',
        citations: [{ version_id: f.version, page: 1, quote }],
        data: { limitations: ['Implementation not established.'] },
      }),
      inputTokens: 100,
      outputTokens: 100,
    };
  };
  const models = draft.tasks.filter((t) => t.executor === 'model');
  await executeMissionTask(env, models[0].id, model);
  await executeMissionTask(env, models[1].id, model);
  const firstCheck = draft.tasks.find((t) => t.kind === 'verify')!;
  await executeMissionTask(env, firstCheck.id, model);
  const gate = draft.tasks.find(
    (t) => t.input.parameters.gate === 'discussion',
  )!;
  assert.equal((await f.store.task(gate.id)).status, 'ready');
  await executeMissionTask(env, models[2].id, model);
  assert.equal(calls, 2);
  const lease = await f.store.claim(gate.id, f.owner.owner, 'human');
  await f.store.submit(gate.id, lease.lease, f.owner.owner, {
    summary: 'Researcher correction: declarations are not implementation',
    citations: [],
    checks: [],
  });
  await executeMissionTask(env, models[2].id, model);
  assert.equal(calls, 2, 'feedback still requires researcher acceptance');
  await f.store.review(
    gate.id,
    'accepted',
    'Send my correction to the next assistant',
    (await f.store.task(gate.id)).revision,
  );
  await executeMissionTask(env, models[2].id, model);
  assert.equal(calls, 3);
  await executeMissionTask(env, models[2].id, model);
  assert.equal(calls, 3, 'completed turn is not charged again');
  const publish = draft.tasks.find((t) => t.kind === 'publish')!;
  assert.equal(
    (await f.store.task(publish.id)).status,
    'blocked',
    'final review cannot be skipped',
  );
});

import {
  startPreparation,
  executePreparation,
  controlPreparation,
  preparationStatus,
  recoverPreparations,
} from '../lib/material-preparation';
import {
  saveEntity,
  mergeEntity,
  listEntities,
} from '../lib/historical-entities';
void test('background preparation survives a closed page, claims once, preserves budget identity and supports explicit cancellation', async () => {
  const f = await jobSetup();
  await db
    .prepare("UPDATE model_connections SET provider='openrouter' WHERE id=?")
    .bind(f.input.model_id)
    .run();
  let queued = 0,
    calls = 0;
  const env = {
    DB: db,
    FOLIOTRACE_ENCRYPTION_KEY: f.secret,
    JOB_QUEUE: {
      send: async () => {
        queued++;
      },
    } as unknown as Queue<{ id: string; kind?: 'mission' | 'preparation' }>,
  };
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    if ((url instanceof Request ? url.url : url.toString()).endsWith('/models'))
      return Response.json({
        data: [
          {
            id: 'openai/text-embedding-3-small',
            pricing: { prompt: '0.00000002' },
          },
        ],
      });
    calls++;
    const input = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
      .input as string[];
    return Response.json({
      model: 'openai/text-embedding-3-small',
      data: input.map((_, index) => ({
        index,
        embedding: Array.from({ length: 256 }, (_, i) => (i === index ? 1 : 0)),
      })),
      usage: { prompt_tokens: 12 },
    });
  }) as typeof fetch;
  const id = crypto.randomUUID();
  await startPreparation(f.owner, env, f.a.project.id, f.input.model_id, id);
  assert.equal(queued, 1);
  await startPreparation(f.owner, env, f.a.project.id, f.input.model_id, id);
  assert.equal(queued, 1);
  await Promise.all([
    executePreparation(env, id, fake),
    executePreparation(env, id, fake),
  ]);
  const state = await preparationStatus(f.owner, f.a.project.id);
  assert.equal(state.preparation?.status, 'completed');
  assert.equal(state.indexed, 1);
  assert.equal(calls, 1);
  assert.equal(state.sources[0].readable, 1);
  const cancelled = crypto.randomUUID();
  await startPreparation(
    f.owner,
    env,
    f.a.project.id,
    f.input.model_id,
    cancelled,
  );
  await controlPreparation(f.owner, env, cancelled, 'cancel');
  await executePreparation(env, cancelled, fake);
  assert.equal(calls, 1);
  const stale = crypto.randomUUID();
  await startPreparation(f.owner, env, f.a.project.id, f.input.model_id, stale);
  await controlPreparation(f.owner, env, stale, 'pause');
  assert.equal(
    (await preparationStatus(f.owner, f.a.project.id)).preparation?.status,
    'paused',
  );
  await f.owner.reviseSource({
    p_source: f.a.id,
    p_expected: 1,
    p_pages: [{ page: 1, text: '港口记录校订。' }],
    p_method: 'manual',
  });
  await controlPreparation(f.owner, env, stale, 'resume');
  assert.equal(
    (await preparationStatus(f.owner, f.a.project.id)).preparation?.status,
    'stale',
  );
  assert.equal(calls, 1);
  const outsider = await user();
  await assert.rejects(preparationStatus(outsider, f.a.project.id));
});
void test('abandoned preparation leases become uncertain without silently repeating a paid request', async () => {
  const f = await jobSetup();
  await db
    .prepare("UPDATE model_connections SET provider='openrouter' WHERE id=?")
    .bind(f.input.model_id)
    .run();
  let queued = 0;
  const env = {
    DB: db,
    FOLIOTRACE_ENCRYPTION_KEY: f.secret,
    JOB_QUEUE: {
      send: async () => {
        queued++;
      },
    } as unknown as Queue<{ id: string; kind?: 'mission' | 'preparation' }>,
  };
  const id = crypto.randomUUID();
  await startPreparation(f.owner, env, f.a.project.id, f.input.model_id, id);
  await db
    .prepare(
      "UPDATE material_preparations SET status='running',updated_at='2000-01-01T00:00:00.000Z' WHERE id=?",
    )
    .bind(id)
    .run();
  await recoverPreparations(env);
  assert.equal(
    (await preparationStatus(f.owner, f.a.project.id)).preparation?.status,
    'uncertain',
  );
  assert.equal(queued, 1);
  await assert.rejects(
    startPreparation(
      f.owner,
      env,
      f.a.project.id,
      f.input.model_id,
      crypto.randomUUID(),
    ),
    /已有准备任务/,
  );
});
void test('historical identities require exact project evidence and reviewer approval; grouping can be reversed without losing originals', async () => {
  const owner = await user(),
    s = await source(owner),
    other = await user();
  const input = {
    project_id: s.project.id,
    kind: 'place',
    name: '港口',
    aliases: ['Port'],
    date_start: 1860,
    date_end: 1862,
    evidence: [{ version_id: s.versionId, page: 1, quote: '港口' }],
    status: 'confirmed',
    reason: 'Compare source wording',
  };
  const a = await saveEntity(owner, input),
    b = await saveEntity(owner, { ...input, name: '海港' });
  const history = (await listEntities(owner, s.project.id)).history;
  assert.equal(history.filter((row) => row.kind === 'create').length, 2);
  assert.ok(
    history.some(
      (row) => JSON.parse(String(row.basis)).reason === input.reason,
    ),
  );
  await assert.rejects(
    saveEntity(owner, {
      ...input,
      name: 'Invalid',
      evidence: [{ version_id: s.versionId, page: 1, quote: '不存在的原文' }],
    }),
    /出处/,
  );
  await assert.rejects(
    saveEntity(owner, { ...input, date_start: 1865, date_end: 1860 }),
  );
  await assert.rejects(mergeEntity(other, a, b, 1, 'Same name'));
  await mergeEntity(owner, a, b, 1, 'Identified from source');
  let entries = (await listEntities(owner, s.project.id)).entities;
  assert.equal(entries.find((e) => e.id === a)?.canonical_id, b);
  assert.equal(entries.find((e) => e.id === a)?.evidence[0].quote, '港口');
  await assert.rejects(mergeEntity(owner, b, a, 1, 'Cycle'));
  await mergeEntity(owner, a, null, 2, 'Further evidence shows a distinction');
  entries = (await listEntities(owner, s.project.id)).entities;
  assert.equal(entries.find((e) => e.id === a)?.canonical_id, null);
  assert.equal(entries.find((e) => e.id === a)?.revision, 3);
  await assert.rejects(
    saveEntity(owner, { ...input, id: a, expected: 1, name: 'Old edit' }),
    /已有更新/,
  );
});

import { sendInvitation } from '../lib/invitation-delivery';
void test('invitation mail is owner-authorized, bound to the invited email and never repeated after an uncertain response', async () => {
  const owner = await user(),
    project = await owner.createProject('Research <project>', ''),
    team = new TeamStore(db, owner.owner),
    outsider = await user();
  const id = await team.invite(project.id, {
    email: 'colleague@example.test',
    role: 'reviewer',
  });
  let sends = 0;
  const env = {
    DB: db,
    FILES: {} as R2Bucket,
    EMAIL_FROM: 'noreply@canwoo.com',
    BETTER_AUTH_URL: 'https://canwoo.com',
    EMAIL: {
      send: async (input: { to: string; html: string; text: string }) => {
        sends++;
        assert.equal(input.to, 'colleague@example.test');
        assert.match(input.html, /Research &lt;project&gt;/);
        assert.match(input.text, new RegExp(id));
        return { messageId: 'fixture' };
      },
    } as unknown as SendEmail,
  };
  await assert.rejects(
    sendInvitation(
      new TeamStore(db, outsider.owner),
      env,
      project.id,
      id,
      'en',
    ),
  );
  assert.equal(sends, 0);
  await Promise.allSettled([
    sendInvitation(team, env, project.id, id, 'en'),
    sendInvitation(team, env, project.id, id, 'en'),
  ]);
  assert.equal(sends, 1);
  assert.equal(
    (
      await db
        .prepare(
          'SELECT status FROM invitation_deliveries WHERE invitation_id=?',
        )
        .bind(id)
        .first<{ status: string }>()
    )?.status,
    'sent',
  );
  const id2 = await team.invite(project.id, {
    email: 'colleague2@example.test',
    role: 'editor',
  });
  const failed = {
    ...env,
    EMAIL: {
      send: async () => {
        sends++;
        throw new Error('Lost response');
      },
    } as unknown as SendEmail,
  };
  await assert.rejects(
    sendInvitation(team, failed, project.id, id2, 'en'),
    /无法确认/,
  );
  await assert.rejects(
    sendInvitation(team, failed, project.id, id2, 'en'),
    /已提交/,
  );
  assert.equal(sends, 2);
});

import { postDiscussion, researchAttention } from '../lib/research-attention';
void test('colleague reminders are opt-in visible work, validate recipients, and disappear immediately on removal or resolution', async () => {
  const owner = await user(),
    reader = await user(),
    other = await user(),
    s = await source(owner);
  await db
    .prepare(
      "INSERT INTO project_members(project_id,user_id,role,added_by,created_at) VALUES(?,?,'reviewer',?,?)",
    )
    .bind(s.project.id, reader.owner, owner.owner, new Date().toISOString())
    .run();
  await assert.rejects(
    postDiscussion(owner, s.project.id, {
      target_id: s.project.id,
      body: 'Review this evidence',
      mentions: [other.owner],
    }),
    /当前项目成员/,
  );
  const comment = await postDiscussion(owner, s.project.id, {
    target_id: s.project.id,
    body: 'Please inspect the identity inference',
    mentions: [reader.owner],
  });
  assert.equal((await researchAttention(reader)).mentions.length, 1);
  assert.equal((await researchAttention(other)).mentions.length, 0);
  await db
    .prepare('INSERT INTO attention_preferences VALUES(?,1,0)')
    .bind(reader.owner)
    .run();
  assert.equal((await researchAttention(reader)).mentions.length, 0);
  await db
    .prepare('UPDATE attention_preferences SET mentions=1 WHERE owner_id=?')
    .bind(reader.owner)
    .run();
  await db
    .prepare('UPDATE project_comments SET resolved=1 WHERE id=?')
    .bind(comment)
    .run();
  assert.equal((await researchAttention(reader)).mentions.length, 0);
  await postDiscussion(owner, s.project.id, {
    target_id: s.project.id,
    body: 'Follow up',
    mentions: [reader.owner],
  });
  await new TeamStore(db, owner.owner).removeMember(s.project.id, reader.owner);
  assert.equal((await researchAttention(reader)).mentions.length, 0);
});

import { assessClaim, claimAssessments } from '../lib/claim-assessments';
void test('individual claim decisions are fenced, retained and required before final audit approval', async () => {
  const f = await jobSetup(),
    store = new MissionStore(db, f.owner.owner);
  const draftText =
    'The port opened in 1861. Every port followed the same policy.';
  const draft = agentRecipe({
    method: {
      title: 'Audit',
      kind: 'audit',
      instructions: 'Check claims',
      fields: ['claim'],
    },
    pages: [{ version_id: f.a.versionId, page: 1 }],
    model_id: f.input.model_id,
    input_rate: 1,
    output_rate: 1,
    locale: 'en',
    comparisonText: draftText,
  });
  const mission = await store.create(f.a.project.id, draft);
  await store.control(mission, 'start');
  const model = await store.claim(draft.tasks[0].id, 'fixture', 'model');
  await store.submit(model.task.id, model.lease, 'fixture', {
    summary: 'A limited declaration',
    citations: [
      { version_id: f.a.versionId, page: 1, quote: '港口于一八六一年开放。' },
    ],
    data: {
      coverage: 'One page',
      findings: [
        {
          claim: 'The port opened in 1861.',
          support: 'direct',
          assessment: 'The source states a date.',
          alternative: 'Opening could mean administrative designation.',
          next_step: 'Find operational records.',
          citations: [1],
        },
        {
          claim: 'Every port followed the same policy.',
          support: 'insufficient',
          assessment: 'One port is insufficient.',
          alternative: 'Local policies differed.',
          next_step: 'Compare other ports.',
          citations: [],
        },
      ],
    },
  });
  const verification = await store.claim(
    draft.tasks.find((t) => t.kind === 'verify')!.id,
    'verify',
    'builtin',
  );
  await store.submit(
    verification.task.id,
    verification.lease,
    'verify',
    await builtin(store, verification.task),
  );
  const human = await store.claim(
    draft.tasks.find((t) => t.executor === 'human')!.id,
    f.owner.owner,
    'human',
  );
  await store.submit(human.task.id, human.lease, f.owner.owner, {
    summary: 'Retain the recorded date; remove the universal assertion.',
    citations: [
      { version_id: f.a.versionId, page: 1, quote: '港口于一八六一年开放。' },
    ],
  });
  const gate = await store.task(human.task.id);
  await assert.rejects(
    store.review(gate.id, 'accepted', 'Checked', gate.revision),
    /每条论述/,
  );
  const first = await claimAssessments(store, model.task.id);
  const input = {
    task_id: model.task.id,
    index: 0,
    hash: first.hash,
    revision: first.revision,
    decision: 'accept',
    reason: 'Exact date, interpreted as the source statement.',
  };
  await assert.rejects(
    assessClaim(store, { ...input, hash: '0'.repeat(64) }),
    /变化/,
  );
  const outsider = await user();
  await assert.rejects(assessClaim(outsider, input), /不存在/);
  await assessClaim(store, input);
  await assert.rejects(
    assessClaim(store, { ...input, reason: 'Stale reviewer overwrite' }),
    /变化/,
  );
  await assert.rejects(
    store.review(gate.id, 'accepted', 'Checked', gate.revision),
    /每条论述/,
  );
  const next = await claimAssessments(store, model.task.id);
  await assessClaim(store, {
    ...input,
    index: 1,
    revision: next.revision,
    decision: 'reject',
    reason: 'No material establishes a universal policy.',
  });
  const all = await claimAssessments(store, model.task.id);
  assert.deepEqual(
    all.reviews.map((r) => r.decision),
    ['accept', 'reject'],
  );
  assert.equal(
    (await store.view(mission)).events.filter(
      (e) => e.kind === 'claim_assessment',
    ).length,
    2,
  );
  await store.review(
    gate.id,
    'accepted',
    'The final account removes the rejected assertion.',
    gate.revision,
  );
  assert.equal(
    (await claimAssessments(store, model.task.id)).reviewable,
    false,
  );
  await assert.rejects(
    assessClaim(store, { ...input, revision: all.revision }),
    /变化/,
  );
  assert.equal(
    (await store.task(draft.tasks.find((t) => t.kind === 'publish')!.id))
      .status,
    'ready',
  );
});

import { startTaskMessage, taskConversation } from '../lib/task-conversation';
import { researchInbox, seeInboxItem } from '../lib/research-inbox';
async function conversationFixture() {
  const f = await jobSetup(),
    store = new MissionStore(db, f.owner.owner),
    root = crypto.randomUUID();
  await db
    .prepare('INSERT INTO model_policies VALUES(?,?,?,?,?,?,?,?)')
    .bind(
      crypto.randomUUID(),
      f.owner.owner,
      'analysis',
      f.input.model_id,
      1,
      2,
      1024,
      new Date().toISOString(),
    )
    .run();
  const mission = await store.create(f.a.project.id, {
    title: 'Interpret a port record',
    question: 'What does this establish?',
    scope: 'One record',
    acceptance: 'Review evidence',
    tasks: [
      {
        id: root,
        title: 'Reading the recorded date',
        kind: 'manual',
        executor: 'human',
        assignee: f.owner.owner,
        dependencies: [],
        input: {
          version_ids: [f.a.versionId],
          page_refs: [{ version_id: f.a.versionId, page: 1 }],
          locale: 'en',
        },
      },
    ],
  });
  await store.control(mission, 'start');
  const claim = await store.claim(root, f.owner.owner, 'human');
  await store.submit(root, claim.lease, f.owner.owner, {
    summary:
      'The record states an opening date; implementation remains to be checked.',
    citations: [
      { version_id: f.a.versionId, page: 1, quote: '港口于一八六一年开放。' },
    ],
  });
  const input = {
    task_id: root,
    request_id: crypto.randomUUID(),
    question: 'Does the wording establish implementation?',
    model_id: f.input.model_id,
    after_id: null,
    extra_pages: [],
    locale: 'en',
    effort: 'high',
  };
  return { ...f, store, root, mission, input };
}
void test('a failed answer cannot inject invented source IDs into a follow-up scope', async () => {
  const f = await conversationFixture();
  await db
    .prepare("UPDATE mission_tasks SET status='uncertain',result=? WHERE id=?")
    .bind(
      JSON.stringify({
        summary: 'Unverified response',
        citations: [
          { version_id: crypto.randomUUID(), page: 1, quote: 'Invented' },
        ],
        checks: [],
      }),
      f.root,
    )
    .run();
  const next = await startTaskMessage(f.store, f.input, async () => {});
  const task = await f.store.task(next.task_id);
  assert.deepEqual(task.input.version_ids, [f.a.versionId]);
  assert.deepEqual(task.input.page_refs, [
    { version_id: f.a.versionId, page: 1 },
  ]);
});

void test('task follow-ups persist one graph per request, check source scope and require researcher review', async () => {
  const f = await conversationFixture();
  let dispatches = 0,
    calls = 0;
  const dispatch = async () => {
    dispatches++;
  };
  const [a, b] = await Promise.all([
    startTaskMessage(f.store, f.input, dispatch),
    startTaskMessage(f.store, f.input, dispatch),
  ]);
  assert.deepEqual(a, b);
  assert.equal(dispatches, 1);
  await assert.rejects(
    startTaskMessage(
      f.store,
      { ...f.input, question: 'A changed request' },
      dispatch,
    ),
    /编号/,
  );
  await assert.rejects(
    startTaskMessage(
      f.store,
      { ...f.input, request_id: crypto.randomUUID() },
      dispatch,
    ),
    /追问/,
  );
  const env = {
    DB: db,
    FILES: {} as R2Bucket,
    FOLIOTRACE_ENCRYPTION_KEY: f.secret,
  };
  await f.store.control(a.mission_id, 'pause');
  await executeMissionTask(env, a.task_id, async () => {
    throw new Error('Paused work must not invoke a model');
  });
  assert.equal((await f.store.task(a.task_id)).status, 'ready');
  await assert.rejects(
    startTaskMessage(
      f.store,
      { ...f.input, request_id: crypto.randomUUID() },
      dispatch,
    ),
    /追问/,
  );
  await f.store.control(a.mission_id, 'resume');
  await executeMissionTask(env, a.task_id, async (request) => {
    calls++;
    assert.equal(request.key, 'test-key');
    assert.match(request.prompt, /implementation remains/);
    return {
      text: JSON.stringify({
        summary:
          'The wording states a date [1]; it does not document implementation.',
        citations: [
          {
            version_id: f.a.versionId,
            page: 1,
            quote: '港口于一八六一年开放。',
          },
        ],
        data: { limitations: ['No implementation record.'] },
      }),
      inputTokens: 100,
      outputTokens: 70,
      truncated: false,
    };
  });
  await executeMissionTask(env, a.task_id, async () => {
    throw new Error('Duplicate invocation');
  });
  assert.equal(calls, 1);
  let view = await f.store.view(a.mission_id);
  assert.equal(view.tasks.find((t) => t.kind === 'publish')?.status, 'blocked');
  await executeMissionTask(
    env,
    view.tasks.find((t) => t.kind === 'verify')!.id,
  );
  view = await f.store.view(a.mission_id);
  assert.equal(view.tasks.find((t) => t.executor === 'human')?.status, 'ready');
  assert.equal(
    view.tasks.find((t) => t.executor === 'human')?.assignee,
    f.owner.owner,
  );
  assert.equal((await taskConversation(f.store, a.task_id)).root.id, f.root);
  assert.equal(
    (await taskConversation(f.store, f.root)).turns[0].result?.citations[0]
      .quote,
    '港口于一八六一年开放。',
  );
  const outsider = await user(),
    foreign = await source(outsider);
  await assert.rejects(
    startTaskMessage(new MissionStore(db, outsider.owner), f.input, dispatch),
    /不存在/,
  );
  await assert.rejects(
    startTaskMessage(
      f.store,
      {
        ...f.input,
        request_id: crypto.randomUUID(),
        after_id: a.task_id,
        extra_pages: [{ version_id: foreign.versionId, page: 1 }],
      },
      dispatch,
    ),
    /不存在|属于/,
  );
  const second = await startTaskMessage(
    f.store,
    {
      ...f.input,
      request_id: crypto.randomUUID(),
      after_id: a.task_id,
      question: 'What new evidence would discriminate?',
    },
    dispatch,
  );
  assert.match(
    (await f.store.task(second.task_id)).input.prompt,
    /does not document implementation/,
  );
  await db
    .prepare(
      "UPDATE mission_tasks SET result=json_set(result,'$.summary','Corrected researcher interpretation'),revision=revision+1 WHERE id=?",
    )
    .bind(f.root)
    .run();
  let secondCalls = 0;
  await executeMissionTask(env, second.task_id, async () => {
    secondCalls++;
    throw new Error('Must not call');
  });
  assert.equal(secondCalls, 0);
  assert.equal((await f.store.task(second.task_id)).status, 'failed');
  assert.match((await f.store.task(second.task_id)).error || '', /修订/);
});
void test('competing task questions cannot start two paid branches at the same time', async () => {
  const f = await conversationFixture();
  const outcomes = await Promise.allSettled([
    startTaskMessage(f.store, f.input, async () => {}),
    startTaskMessage(
      f.store,
      {
        ...f.input,
        request_id: crypto.randomUUID(),
        question: 'A separate simultaneous question',
      },
      async () => {},
    ),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await taskConversation(f.store, f.root)).turns.length, 1);
});
void test('research inbox receipts are personal, revisions resurface and revoked members lose access immediately', async () => {
  const f = await conversationFixture(),
    reviewer = await user(),
    outsider = await user();
  await db
    .prepare("INSERT INTO project_members VALUES(?,?,'reviewer',?,?)")
    .bind(
      f.a.project.id,
      reviewer.owner,
      f.owner.owner,
      new Date().toISOString(),
    )
    .run();
  const first = (await researchInbox(f.owner)).items.find(
    (i) => i.kind === 'review',
  )!;
  assert.ok(first);
  await seeInboxItem(f.owner, {
    key: first.key,
    fingerprint: first.fingerprint,
    seen: true,
  });
  assert.equal(
    (await researchInbox(f.owner)).items.find((i) => i.key === first.key)?.seen,
    true,
  );
  assert.equal(
    (await researchInbox(reviewer)).items.find((i) => i.key === first.key)
      ?.seen,
    false,
  );
  await assert.rejects(
    seeInboxItem(outsider, {
      key: first.key,
      fingerprint: first.fingerprint,
      seen: true,
    }),
    /权限|变化/,
  );
  await db
    .prepare('UPDATE mission_tasks SET revision=revision+1 WHERE id=?')
    .bind(f.root)
    .run();
  assert.ok(
    (await researchInbox(f.owner)).items.some(
      (i) => i.kind === 'review' && !i.seen,
    ),
  );
  await f.owner.addEvidence({
    p_version: f.a.versionId,
    p_page: 1,
    p_quote: '一八六一年',
    p_question: 'Date?',
    p_interpretation: 'Record wording',
    p_relation: 'context',
  });
  await f.owner.reviseSource({
    p_source: f.a.id,
    p_expected: 1,
    p_method: 'manual',
    p_pages: [{ page: 1, text: '港口于一八六一年开放。校订说明。' }],
  });
  const changed = (await researchInbox(f.owner)).items.find(
    (i) => i.kind === 'source',
  )!;
  assert.ok(changed);
  assert.equal(changed.detail, '1');
  await seeInboxItem(f.owner, {
    key: changed.key,
    fingerprint: changed.fingerprint,
    seen: true,
  });
  await f.owner.reviseSource({
    p_source: f.a.id,
    p_expected: 2,
    p_method: 'manual',
    p_pages: [{ page: 1, text: '港口于一八六一年开放。新增原件对照说明。' }],
  });
  assert.ok(
    (await researchInbox(f.owner)).items.some(
      (i) => i.kind === 'source' && !i.seen,
    ),
  );
  await db
    .prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?')
    .bind(f.a.project.id, reviewer.owner)
    .run();
  assert.equal((await researchInbox(reviewer)).items.length, 0);
});

void test('writing page citations are resolved from the authorized project and never from arbitrary links', async () => {
  const { writingSources } = await import('../lib/writing-sources');
  const { writingPageReferences } = await import('../lib/writing-export');
  const owner = await user(),
    other = await user(),
    item = await source(owner);
  const path = `/?project=${item.project.id}&tab=sources&version=${item.versionId}&page=1`;
  const keys = writingPageReferences(
    `[1](${path})\n[missing](${path.replace('page=1', 'page=99')})`,
    null,
    'https://canwoo.com',
  );
  const data = await writingSources(
    owner,
    item.project.id,
    'https://canwoo.com',
    keys,
  );
  assert.equal(data.evidence.length, 0);
  assert.equal(data.citations.length, 1);
  assert.match(data.citations[0].text, /航运记录/);
  assert.ok(data.citations[0].href.endsWith('page=1'));
  await assert.rejects(
    writingSources(other, item.project.id, 'https://canwoo.com', keys),
    /不存在/,
  );
  const unrelated = await source(owner);
  assert.equal(
    (
      await writingSources(
        owner,
        unrelated.project.id,
        'https://canwoo.com',
        keys,
      )
    ).citations.length,
    0,
  );
});

void test('watch responses are bounded while streaming, before the body is buffered', async () => {
  const { a, work } = await jobSetup();
  await work.mutate({
    action: 'watch',
    project_id: a.project.id,
    query: 'bounded response',
    interval_days: 1,
  });
  let cancelled = false;
  let chunks = 0;
  await checkWatches(
    { DB: db },
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (++chunks <= 4) controller.enqueue(new Uint8Array(1_000_000));
            else controller.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  assert.equal(
    cancelled,
    true,
    'Oversized response must be cancelled, not fully buffered',
  );
  assert.match(
    (await work.workbench(a.project.id)).watches[0].error || '',
    /失败/,
  );
});

void test('stale recovery cannot reset or settle a freshly reclaimed job', async () => {
  for (const snapshot of ['current', 'stale'] as const) {
    const { owner, input } = await jobSetup();
    await createJob(owner, input);
    await db
      .prepare(
        "UPDATE research_jobs SET status='running',stage='preparing',attempt=1,started_at='2000-01-01' WHERE id=?",
      )
      .bind(input.id)
      .run();
    let intercepted = false;
    const racingDb = {
      prepare(sql: string) {
        if (sql !== 'SELECT * FROM research_jobs WHERE id=?')
          return db.prepare(sql);
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                const previous = await db
                  .prepare(sql)
                  .bind(...values)
                  .first();
                if (!intercepted && values[0] === input.id) {
                  intercepted = true;
                  await db
                    .prepare(
                      'UPDATE research_jobs SET attempt=2,stage=?,started_at=? WHERE id=?',
                    )
                    .bind(
                      snapshot === 'current' ? 'calling' : 'preparing',
                      new Date().toISOString(),
                      input.id,
                    )
                    .run();
                  if (snapshot === 'current')
                    return db
                      .prepare(sql)
                      .bind(...values)
                      .first();
                }
                return previous;
              },
            };
          },
        } as D1PreparedStatement;
      },
      batch: db.batch.bind(db),
    } as D1Database;
    await recoverAndDispatch({
      DB: racingDb,
      JOB_QUEUE: { async send() {} } as unknown as Queue<{ id: string }>,
    });
    const job = await jobById(db, input.id);
    assert.equal(
      job?.status,
      'running',
      `${snapshot} snapshot must not invalidate the fresh attempt`,
    );
    assert.equal(job?.attempt, 2);
    assert.equal(job?.result, null);
  }
});

void test('model jobs stop spending when their mission is paused, cancelled, superseded or loses its execution record', async () => {
  for (const interruption of [
    'pause',
    'cancel',
    'supersede',
    'expired',
    'event_failure',
  ] as const) {
    const { owner, a, input, secret, work } = await jobSetup();
    const store = new MissionStore(db, owner.owner);
    const taskId = crypto.randomUUID();
    const missionId = await store.create(a.project.id, {
      title: 'Execution guard',
      question: 'What does this source say?',
      scope: 'One source',
      acceptance: 'Human review',
      tasks: [
        {
          id: taskId,
          title: 'Read source',
          kind: 'extract',
          executor: 'model',
          dependencies: [],
          input: {
            version_ids: input.version_ids,
            model_id: input.model_id,
            prompt: 'Read the source',
            input_rate: 1,
            output_rate: 2,
            max_output: 128,
          },
        },
      ],
    });
    await store.control(missionId, 'start');
    let intercepted = false;
    const interruptedDb = {
      prepare(sql: string) {
        if (!sql.startsWith('INSERT INTO task_events')) return db.prepare(sql);
        return {
          bind(...values: unknown[]) {
            return {
              async run() {
                if (!intercepted && values[3] === 'model_job') {
                  intercepted = true;
                  if (interruption === 'event_failure')
                    throw new Error('Simulated lost event write');
                  if (interruption === 'supersede')
                    await db
                      .prepare(
                        "UPDATE mission_tasks SET attempt=attempt+1,lease_hash='superseding-lease' WHERE id=?",
                      )
                      .bind(taskId)
                      .run();
                  else if (interruption === 'expired')
                    await db
                      .prepare(
                        "UPDATE mission_tasks SET lease_until='2000-01-01' WHERE id=?",
                      )
                      .bind(taskId)
                      .run();
                  else await store.control(missionId, interruption);
                }
                return db
                  .prepare(sql)
                  .bind(...values)
                  .run();
              },
            };
          },
        } as D1PreparedStatement;
      },
      batch: db.batch.bind(db),
    } as D1Database;
    let calls = 0;
    const model: typeof invoke = async () => {
      calls++;
      return {
        text: JSON.stringify({ summary: 'Candidate', citations: [] }),
        inputTokens: 10,
        outputTokens: 10,
      };
    };
    const env = { DB: interruptedDb, FOLIOTRACE_ENCRYPTION_KEY: secret };
    await executeMissionTask(env, taskId, model);
    const jobs = (
      await db
        .prepare('SELECT id FROM research_jobs WHERE project_id=?')
        .bind(a.project.id)
        .all<{ id: string }>()
    ).results;
    assert.equal(jobs.length, 1);
    // Recovery can redeliver the durable job even after the parent executor has exited.
    await executeJob(
      { DB: db, FOLIOTRACE_ENCRYPTION_KEY: secret },
      jobs[0].id,
      model,
    );
    assert.equal(calls, 0, `${interruption} must not start a paid model call`);
    assert.equal((await jobById(db, jobs[0].id))?.status, 'failed');
    const currentTask = await store.task(taskId);
    assert.equal(
      currentTask.status,
      interruption === 'supersede'
        ? 'running'
        : interruption === 'cancel'
          ? 'cancelled'
          : 'failed',
    );
    if (interruption === 'supersede') assert.equal(currentTask.attempt, 2);
    assert.equal(
      (await work.workbench(a.project.id)).budget?.committed_units,
      0,
    );
  }
});

void test('legacy queued jobs require explicit retry under the current execution contract', async () => {
  const { owner, a, work, input, secret } = await jobSetup();
  await createJob(owner, input);
  await db
    .prepare(
      "UPDATE research_jobs SET model_snapshot=json_remove(model_snapshot,'$.execution_version') WHERE id=?",
    )
    .bind(input.id)
    .run();
  let calls = 0;
  const model: typeof invoke = async () => {
    calls++;
    return { text: 'Confirmed new request', inputTokens: 10, outputTokens: 10 };
  };
  const env = { DB: db, FOLIOTRACE_ENCRYPTION_KEY: secret };
  await executeJob(env, input.id, model);
  assert.equal(calls, 0);
  assert.equal((await jobById(db, input.id))?.status, 'failed');
  assert.match((await jobById(db, input.id))?.error || '', /旧版/);
  assert.equal((await work.workbench(a.project.id)).budget?.committed_units, 0);
  const retry = await createJob(owner, { ...input, id: crypto.randomUUID() });
  await executeJob(env, retry.id, model);
  assert.equal(calls, 1);
  assert.equal((await jobById(db, retry.id))?.status, 'succeeded');
});

void test('project collection pages are bounded, tenant-scoped and stable across concurrent imports', async () => {
  const { readCollection, COLLECTION_PAGE_BYTES } =
    await import('../lib/project-collections');
  const owner = await user(),
    outsider = await user();
  const { project, id } = await source(owner);
  const text = '史'.repeat(100000);
  const pages = JSON.stringify(
    Array.from({ length: 5 }, (_, i) => ({ page: i + 1, text })),
  );
  await db.batch(
    Array.from({ length: 6 }, (_, i) =>
      db
        .prepare('INSERT INTO source_versions VALUES(?,?,?,?,?,?,?)')
        .bind(
          crypto.randomUUID(),
          id,
          project.id,
          i + 2,
          pages,
          'manual',
          new Date().toISOString(),
        ),
    ),
  );
  const first = await readCollection(owner, project.id, 'source_versions');
  assert.ok(first.next);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(first)).length <
      COLLECTION_PAGE_BYTES,
  );
  assert.ok(first.rows.length > 0 && first.rows.length < 7);
  const added = crypto.randomUUID();
  await db
    .prepare('INSERT INTO source_versions VALUES(?,?,?,?,?,?,?)')
    .bind(added, id, project.id, 8, pages, 'manual', new Date().toISOString())
    .run();
  const rows = [...first.rows];
  let cursor: string | null = first.next;
  while (cursor) {
    const page = await readCollection(
      owner,
      project.id,
      'source_versions',
      cursor,
    );
    rows.push(...page.rows);
    cursor = page.next;
  }
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map((row) => row.id)).size, 7);
  assert.ok(!rows.some((row) => row.id === added));
  assert.ok(Array.isArray(rows[0].pages));
  await assert.rejects(
    readCollection(outsider, project.id, 'source_versions', first.next),
    /不存在/,
  );
  await assert.rejects(
    readCollection(owner, project.id, 'model_connections'),
    /未知/,
  );
  for (const invalid of ['-1', '1 OR 1=1', 'NaN', '9007199254740992'])
    await assert.rejects(
      readCollection(owner, project.id, 'notes', invalid),
      /分页/,
    );
  assert.deepEqual(await readCollection(owner, project.id, 'notes'), {
    rows: [],
    next: null,
  });
});
void test('concurrent API requests respect account-wide limits without blocking reads or extending a rejected window', async () => {
  const { enforceApiLimit, ApiLimitError } = await import('../lib/api-limits');
  const owner = await user();
  const time = 1_800_000_010_000;
  const outcomes = await Promise.allSettled(
    Array.from({ length: 130 }, () =>
      enforceApiLimit(db, owner.owner, 'POST', time),
    ),
  );
  assert.equal(
    outcomes.filter((item) => item.status === 'fulfilled').length,
    120,
  );
  const rejected = outcomes.filter((item) => item.status === 'rejected');
  assert.ok(
    rejected.every(
      (item) =>
        item.reason instanceof ApiLimitError && item.reason.retryAfter === 50,
    ),
  );
  await enforceApiLimit(db, owner.owner, 'GET', time);
  await enforceApiLimit(db, (await user()).owner, 'POST', time);
  await assert.rejects(
    enforceApiLimit(db, owner.owner, 'POST', time + 49_999),
    (error: unknown) =>
      error instanceof ApiLimitError && error.retryAfter === 1,
  );
  await enforceApiLimit(db, owner.owner, 'POST', time + 50_000);
  assert.equal(
    await db
      .prepare('SELECT count FROM rate_limit WHERE key=?')
      .bind(`canwoo:api:write:${owner.owner}`)
      .first('count'),
    1,
  );
  assert.equal(
    await db
      .prepare('SELECT COUNT(*) AS n FROM rate_limit WHERE key LIKE ?')
      .bind(`canwoo:api:%:${owner.owner}`)
      .first('n'),
    2,
  );
});

void test('project overview counts note families rather than revisions without downloading historical bodies', async () => {
  const owner = await user(),
    outsider = await user();
  const { project } = await source(owner);
  await db.batch(
    Array.from({ length: 8 }, (_, i) =>
      db
        .prepare('INSERT INTO sources VALUES(?,?,?,?,?,?)')
        .bind(
          crypto.randomUUID(),
          project.id,
          `Source ${i}`,
          `overview/${project.id}/${i}`,
          'text/plain',
          new Date().toISOString(),
        ),
    ),
  );
  const root = await owner.saveNote({
    p_project: project.id,
    p_parent: null,
    p_title: 'Reading notes',
    p_body: 'private manuscript body',
  });
  await owner.saveNote({
    p_project: project.id,
    p_parent: root,
    p_title: 'Revised notes',
    p_body: 'private manuscript revision',
  });
  const archived = await owner.saveNote({
    p_project: project.id,
    p_parent: null,
    p_title: 'Archive',
    p_body: 'Archived',
  });
  await owner.setNoteState({
    p_project: project.id,
    p_note: archived,
    archived: true,
  });
  const overview = await owner.overview(project.id);
  assert.deepEqual(overview.counts, { sources: 9, notes: 1, evidence: 0 });
  assert.equal(overview.sources.length, 6);
  assert.ok(!JSON.stringify(overview).includes('private manuscript'));
  await assert.rejects(outsider.overview(project.id), /不存在/);
});

void test('one insertion checkpoint keeps linked collections aligned during a project load', async () => {
  const { collectionCheckpoint, readCollection } =
    await import('../lib/project-collections');
  const owner = await user();
  const first = await source(owner);
  const checkpoint = await collectionCheckpoint(owner, first.project.id);
  const addedSource = crypto.randomUUID(),
    addedVersion = crypto.randomUUID();
  await db.batch([
    db
      .prepare('INSERT INTO sources VALUES(?,?,?,?,?,?)')
      .bind(
        addedSource,
        first.project.id,
        'Concurrent import',
        `checkpoint/${addedSource}`,
        'text/plain',
        new Date().toISOString(),
      ),
    db
      .prepare('INSERT INTO source_versions VALUES(?,?,?,?,?,?,?)')
      .bind(
        addedVersion,
        addedSource,
        first.project.id,
        1,
        '[{"page":1,"text":"New material"}]',
        'import',
        new Date().toISOString(),
      ),
  ]);
  const oldSources = await readCollection(
    owner,
    first.project.id,
    'sources',
    checkpoint.sources,
  );
  const oldVersions = await readCollection(
    owner,
    first.project.id,
    'source_versions',
    checkpoint.source_versions,
  );
  assert.deepEqual(
    oldSources.rows.map((row) => row.id),
    [first.id],
  );
  assert.deepEqual(
    oldVersions.rows.map((row) => row.id),
    [first.versionId],
  );
  const refreshed = await collectionCheckpoint(owner, first.project.id);
  assert.equal(
    (
      await readCollection(
        owner,
        first.project.id,
        'sources',
        refreshed.sources,
      )
    ).rows.length,
    2,
  );
  assert.equal(
    (
      await readCollection(
        owner,
        first.project.id,
        'source_versions',
        refreshed.source_versions,
      )
    ).rows.length,
    2,
  );
});

void test('valid quote-heavy source versions can be paged without an oversized intermediate JSON string', async () => {
  const { readCollection } = await import('../lib/project-collections');
  const owner = await user();
  const material = await source(owner);
  const pages = Array.from({ length: 8 }, (_, i) => ({
    page: i + 1,
    text: '"'.repeat(100000),
  }));
  validatePages(pages);
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO source_versions VALUES(?,?,?,?,?,?,?)')
    .bind(
      id,
      material.id,
      material.project.id,
      2,
      JSON.stringify(pages),
      'manual',
      new Date().toISOString(),
    )
    .run();
  const result = await readCollection(
    owner,
    material.project.id,
    'source_versions',
  );
  assert.deepEqual(result.rows.find((row) => row.id === id)?.pages, pages);
});

void test('explicit follow-up pages replace inherited sources and exclude previous answer content', async () => {
  const f = await conversationFixture();
  const id = crypto.randomUUID();
  const path = `${f.owner.owner}/${f.a.project.id}/${id}/selected.txt`;
  await f.owner.recordUpload(id, f.a.project.id, path, 'text/plain');
  const versionId = await f.owner.importSource({
    p_id: id,
    p_project: f.a.project.id,
    p_title: 'Selected letter',
    p_path: path,
    p_type: 'text/plain',
    p_pages: [
      { page: 1, text: 'A proposed petition, not a submitted petition.' },
      { page: 2, text: 'UNSELECTED_PAGE_SENTINEL' },
    ],
  });
  const root = await f.store.task(f.root);
  await db
    .prepare('UPDATE mission_tasks SET input=? WHERE id=?')
    .bind(
      JSON.stringify({
        ...root.input,
        version_ids: [f.a.versionId, versionId],
        page_refs: [
          { version_id: f.a.versionId, page: 1 },
          { version_id: versionId, page: 1 },
          { version_id: versionId, page: 2 },
        ],
      }),
      f.root,
    )
    .run();
  const foreign = await source(await user());
  for (const pages of [
    [],
    [{ version_id: versionId, page: 99 }],
    [{ version_id: foreign.versionId, page: 1 }],
  ]) {
    await assert.rejects(
      startTaskMessage(
        f.store,
        { ...f.input, source_pages: pages },
        async () => {
          throw new Error('Invalid scope must not dispatch');
        },
      ),
    );
  }
  const request = {
    ...f.input,
    source_pages: [{ version_id: versionId, page: 1 }],
  };
  const next = await startTaskMessage(f.store, request, async () => {});
  assert.deepEqual(
    await startTaskMessage(f.store, request, async () => {
      throw new Error('Duplicate dispatch');
    }),
    next,
  );
  const task = await f.store.task(next.task_id);
  assert.deepEqual(task.input.version_ids, [versionId]);
  assert.deepEqual(task.input.page_refs, request.source_pages);
  assert.doesNotMatch(
    task.input.prompt,
    /implementation remains to be checked/,
  );
  await executeMissionTask(
    { DB: db, FOLIOTRACE_ENCRYPTION_KEY: f.secret },
    next.task_id,
    async (input) => {
      assert.match(
        input.prompt,
        /A proposed petition, not a submitted petition/,
      );
      assert.doesNotMatch(
        input.prompt,
        /UNSELECTED_PAGE_SENTINEL|港口于一八六一年开放/,
      );
      assert.deepEqual(input.sourceVersionIds, [versionId]);
      return {
        text: JSON.stringify({
          summary: 'It records a proposal [1].',
          citations: [
            {
              version_id: versionId,
              page: 1,
              quote: 'A proposed petition, not a submitted petition.',
            },
          ],
          data: { limitations: ['Submission remains unverified.'] },
        }),
        inputTokens: 120,
        outputTokens: 60,
      };
    },
  );
  assert.equal((await f.store.task(next.task_id)).status, 'succeeded');
});
