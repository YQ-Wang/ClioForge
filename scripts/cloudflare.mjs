import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export function readConfig(file) {
  const result = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));
  if (result.error) throw new Error(`Invalid JSONC configuration: ${file}`);
  return result.config;
}
export function validateDeployment(app, jobs) {
  const database = (config) =>
    config.d1_databases?.find((item) => item.binding === 'DB')?.database_id;
  const id = database(app);
  if (
    !id ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) ||
    /^0+(?:-0+)*$/.test(id)
  )
    throw new Error(
      'Set your own D1 database ID in a private deployment configuration. See docs/deployment.md.',
    );
  if (id !== database(jobs))
    throw new Error(
      'The app and research worker must use the same D1 database.',
    );
  if (app.account_id !== jobs.account_id)
    throw new Error(
      'The app and research worker must use the same Cloudflare account.',
    );
  const bucket = (config) =>
    config.r2_buckets?.find((item) => item.binding === 'FILES')?.bucket_name;
  if (!bucket(app) || bucket(app) !== bucket(jobs))
    throw new Error('Both workers must use the same private R2 bucket.');
  const queue = app.queues?.producers?.find(
    (item) => item.binding === 'JOB_QUEUE',
  )?.queue;
  if (!queue || !jobs.queues?.consumers?.some((item) => item.queue === queue))
    throw new Error(
      'The app queue must have a matching research-worker consumer.',
    );
  if (
    jobs.queues?.producers?.find((item) => item.binding === 'JOB_QUEUE')
      ?.queue !== queue
  )
    throw new Error('Both workers must publish to the same research queue.');
  const origin = new URL(app.vars?.BETTER_AUTH_URL || 'http://localhost');
  if (
    origin.protocol !== 'https:' ||
    /(^|\.)(localhost|example\.com)$/.test(origin.hostname) ||
    ['127.0.0.1', '[::1]'].includes(origin.hostname)
  )
    throw new Error(
      'Set BETTER_AUTH_URL to your public HTTPS origin before deploying.',
    );
  if (
    !app.routes?.some(
      (route) => route.custom_domain && route.pattern === origin.hostname,
    )
  )
    throw new Error('Configure the custom domain matching BETTER_AUTH_URL.');
  const sender = app.vars?.EMAIL_FROM;
  if (
    !sender ||
    sender.endsWith('@example.com') ||
    !app.send_email?.some(
      (binding) =>
        binding.name === 'EMAIL' &&
        binding.allowed_sender_addresses?.includes(sender),
    )
  )
    throw new Error(
      'Configure your verified EMAIL_FROM address and matching EMAIL binding.',
    );
}
function main() {
  const command = process.argv[2];
  const appPath = process.env.CANWOO_CONFIG || 'wrangler.jsonc';
  const jobsPath = process.env.CANWOO_JOBS_CONFIG || 'wrangler.jobs.jsonc';
  const commands = {
    'deploy-app': ['deploy', '--config', 'dist/server/wrangler.json'],
    'deploy-jobs': ['deploy', '--config', jobsPath],
    migrate: [
      'd1',
      'migrations',
      'apply',
      'DB',
      '--remote',
      '--config',
      appPath,
    ],
    'check-jobs': ['deploy', '--dry-run', '--config', jobsPath],
  };
  const args = commands[command];
  if (!args)
    throw new Error(
      'Expected deploy-app, deploy-jobs, migrate, or check-jobs.',
    );
  if (command !== 'check-jobs') {
    const app = readConfig(appPath),
      jobs = readConfig(jobsPath);
    validateDeployment(app, jobs);
    if (command === 'deploy-app') {
      const built = readConfig('dist/server/wrangler.json');
      validateDeployment(built, jobs);
      if (
        built.name !== app.name ||
        built.vars?.BETTER_AUTH_URL !== app.vars?.BETTER_AUTH_URL
      )
        throw new Error(
          'Rebuild with the selected CANWOO_CONFIG before deploying.',
        );
    }
  }
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/wrangler/bin/wrangler.js'), ...args],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Deployment configuration is invalid.',
    );
    process.exitCode = 1;
  }
}
