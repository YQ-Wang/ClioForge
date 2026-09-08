import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMigrations } from '../scripts/check-migrations.mjs';

void test('migration guard permits new migrations but rejects rewrites, deletions and ordering collisions', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'canwoo-migrations-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init');
  mkdirSync(join(cwd, 'drizzle'));
  const original = join(cwd, 'drizzle/0002_original.sql');
  const sql = 'CREATE TABLE example(id TEXT PRIMARY KEY);\n';
  writeFileSync(original, sql);
  git('add', 'drizzle');
  git(
    '-c',
    'user.name=Canwoo Test',
    '-c',
    'user.email=test@example.test',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'Fixture',
  );
  assert.deepEqual(checkMigrations('HEAD', cwd), { existing: 1, added: 0 });
  writeFileSync(original, sql + '-- changed\n');
  assert.throws(() => checkMigrations('HEAD', cwd), /rewrite/);
  rmSync(original);
  assert.throws(() => checkMigrations('HEAD', cwd), /Restore existing/);
  writeFileSync(original, sql);
  for (const [name, pattern] of [
    ['0001_inserted.sql', /must follow/],
    ['0002_duplicate.sql', /Duplicate/],
    ['next.sql', /Invalid migration/],
  ] as const) {
    const path = join(cwd, 'drizzle', name);
    writeFileSync(path, sql);
    assert.throws(() => checkMigrations('HEAD', cwd), pattern);
    rmSync(path);
  }
  writeFileSync(
    join(cwd, 'drizzle/0003_new.sql'),
    'ALTER TABLE example ADD COLUMN name TEXT;\n',
  );
  assert.deepEqual(checkMigrations('HEAD', cwd), { existing: 1, added: 1 });
  assert.throws(() => checkMigrations('missing-reference', cwd));
});
