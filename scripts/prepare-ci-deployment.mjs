import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { validateDeployment, deploymentConfigPaths } from './cloudflare.mjs';

export function parsePrivateDeployment(appText, jobsText) {
  const parse = (text, label) => {
    if (!text) throw new Error(`Missing ${label} production configuration.`);
    const parsed = ts.parseConfigFileTextToJson(label, text);
    if (parsed.error) throw new Error(`Invalid ${label} production JSONC.`);
    return parsed.config;
  };
  const app = parse(appText, 'app');
  const jobs = parse(jobsText, 'research');
  validateDeployment(app, jobs);
  if (
    app.name !== 'clioforge' ||
    jobs.name !== 'clioforge-research' ||
    app.vars?.BETTER_AUTH_URL !== 'https://clioforge.com' ||
    app.vars?.PRIVATE_GITHUB_ACCESS !== '1' ||
    app.main !== 'workers/app.ts' ||
    jobs.main !== 'workers/research.ts' ||
    jobs.workers_dev !== false ||
    jobs.preview_urls !== false ||
    jobs.routes?.length
  )
    throw new Error('CI requires the private ClioForge production targets.');
  return { app, jobs };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { app, jobs } = parsePrivateDeployment(
      process.env.CLIOFORGE_APP_CONFIG,
      process.env.CLIOFORGE_RESEARCH_CONFIG,
    );
    const { appPath, jobsPath } = deploymentConfigPaths();
    writeFileSync(appPath, JSON.stringify(app), { mode: 0o600, flag: 'wx' });
    writeFileSync(jobsPath, JSON.stringify(jobs), { mode: 0o600, flag: 'wx' });
    console.log('Private production configuration validated.');
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Invalid CI configuration.',
    );
    process.exitCode = 1;
  }
}
