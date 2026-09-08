import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Inspect the working tree as well as committed changes so contributors can run
// the same append-only check before committing. No database is contacted.
export function checkMigrations(base = 'origin/main', cwd = process.cwd()) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 8 * 1024 * 1024,
    });
  const commit = git(
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${base}^{commit}`,
  ).trim();
  const previous = git(
    'ls-tree',
    '-rz',
    '--name-only',
    commit,
    '--',
    'drizzle/',
  )
    .split('\0')
    .filter((name) => /^drizzle\/[^/]+\.sql$/.test(name));
  const current = readdirSync(resolve(cwd, 'drizzle'))
    .filter((name) => name.endsWith('.sql'))
    .map((name) => `drizzle/${name}`);
  const numbers = new Set();
  for (const name of current) {
    const match = /^drizzle\/(\d{4})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match) throw new Error(`Invalid migration filename: ${name}`);
    const number = Number(match[1]);
    if (numbers.has(number))
      throw new Error(`Duplicate migration number: ${match[1]}`);
    numbers.add(number);
  }
  for (const name of previous) {
    if (!current.includes(name))
      throw new Error(`Restore existing migration: ${name}`);
    if (
      readFileSync(resolve(cwd, name), 'utf8') !==
      git('show', `${commit}:${name}`)
    )
      throw new Error(
        `Do not rewrite existing migration: ${name}. Add a new migration instead.`,
      );
  }
  const latest = Math.max(
    -1,
    ...previous.map((name) => Number(name.slice(8, 12))),
  );
  for (const name of current) {
    if (!previous.includes(name) && Number(name.slice(8, 12)) <= latest)
      throw new Error(
        `New migration must follow ${String(latest).padStart(4, '0')}: ${name}`,
      );
  }
  return { existing: previous.length, added: current.length - previous.length };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = checkMigrations(process.argv[2]);
    console.log(
      `Migrations: ${result.existing} unchanged, ${result.added} appended.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Migration check failed.',
    );
    process.exitCode = 1;
  }
}
