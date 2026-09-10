import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrivateDeployment } from '../scripts/prepare-ci-deployment.mjs';
import {
  deploymentConfigPaths,
  readConfig,
  validateDeployment,
} from '../scripts/cloudflare.mjs';

void test('deployment config rename preserves existing operator targets', () => {
  const old = {
    CANWOO_CONFIG: 'existing-app.jsonc',
    CANWOO_JOBS_CONFIG: 'existing-jobs.jsonc',
  };
  assert.deepEqual(deploymentConfigPaths(old), {
    appPath: 'existing-app.jsonc',
    jobsPath: 'existing-jobs.jsonc',
  });
  assert.deepEqual(
    deploymentConfigPaths({ ...old, CLIOFORGE_CONFIG: 'selected-app.jsonc' }),
    { appPath: 'selected-app.jsonc', jobsPath: 'existing-jobs.jsonc' },
  );
  assert.deepEqual(
    deploymentConfigPaths({
      ...old,
      CLIOFORGE_CONFIG: 'selected-app.jsonc',
      CLIOFORGE_JOBS_CONFIG: 'selected-jobs.jsonc',
    }),
    { appPath: 'selected-app.jsonc', jobsPath: 'selected-jobs.jsonc' },
  );
  assert.deepEqual(deploymentConfigPaths({}), {
    appPath: 'wrangler.jsonc',
    jobsPath: 'wrangler.jobs.jsonc',
  });
});

function deployment() {
  const app = readConfig('wrangler.jsonc');
  const jobs = readConfig('wrangler.jobs.jsonc');
  for (const config of [app, jobs]) {
    config.account_id = 'test-account';
    config.d1_databases[0].database_id = '11111111-2222-4333-8444-555555555555';
  }
  app.vars.BETTER_AUTH_URL = 'https://research.test.org';
  app.vars.EMAIL_FROM = 'noreply@test.org';
  app.routes = [{ pattern: 'research.test.org', custom_domain: true }];
  app.send_email[0].allowed_sender_addresses = ['noreply@test.org'];
  return { app, jobs };
}

void test('public defaults cannot be deployed as a production target', () => {
  assert.throws(
    () =>
      validateDeployment(
        readConfig('wrangler.jsonc'),
        readConfig('wrangler.jobs.jsonc'),
      ),
    /own D1 database/,
  );
});

void test('a consistent private deployment configuration is accepted', () => {
  const { app, jobs } = deployment();
  assert.doesNotThrow(() => validateDeployment(app, jobs));
});

void test('application deployment cannot reactivate the retired hosted domain', () => {
  for (const host of ['clioforge.com', 'www.clioforge.com', 'clioforge.com.']) {
    const { app, jobs } = deployment();
    app.vars.BETTER_AUTH_URL = `https://${host}`;
    app.routes = [{ pattern: host, custom_domain: true }];
    assert.throws(() => validateDeployment(app, jobs), /domain is retired/);
  }
  const { app, jobs } = deployment();
  app.routes.push({ pattern: 'www.clioforge.com', custom_domain: true });
  assert.throws(() => validateDeployment(app, jobs), /domain is retired/);
});

void test('deployment refuses split resources and unsafe public settings', () => {
  const mutations = [
    ({ jobs }: ReturnType<typeof deployment>) => {
      jobs.d1_databases[0].database_id = 'other';
    },
    ({ jobs }: ReturnType<typeof deployment>) => {
      jobs.account_id = 'other';
    },
    ({ jobs }: ReturnType<typeof deployment>) => {
      jobs.r2_buckets[0].bucket_name = 'other';
    },
    ({ jobs }: ReturnType<typeof deployment>) => {
      jobs.queues.consumers[0].queue = 'other';
    },
    ({ jobs }: ReturnType<typeof deployment>) => {
      jobs.queues.producers[0].queue = 'other';
    },
    ({ app }: ReturnType<typeof deployment>) => {
      app.vars.BETTER_AUTH_URL = 'http://127.0.0.1:3000';
    },
    ({ app }: ReturnType<typeof deployment>) => {
      app.routes = [];
    },
    ({ app }: ReturnType<typeof deployment>) => {
      app.send_email[0].allowed_sender_addresses = [];
    },
  ];
  for (const mutate of mutations) {
    const config = deployment();
    mutate(config);
    assert.throws(() => validateDeployment(config.app, config.jobs));
  }
});

void test('private deployment enforces worker-first assets, exact IDs and disabled alternate URLs', () => {
  const { app, jobs } = deployment();
  app.vars.BETTER_AUTH_URL = 'https://clioforge.com';
  app.routes = [{ pattern: 'clioforge.com', custom_domain: true }];
  app.vars.PRIVATE_GITHUB_ACCESS = '1';
  app.vars.PRIVATE_GITHUB_USER_IDS = '123,456';
  app.vars.PRIVATE_GITHUB_CLIENT_ID = 'test-client';
  assert.doesNotThrow(() => validateDeployment(app, jobs));
  for (const key of ['PRIVATE_GITHUB_USER_IDS', 'PRIVATE_GITHUB_CLIENT_ID']) {
    const invalid = structuredClone(app);
    delete invalid.vars[key];
    assert.throws(
      () => validateDeployment(invalid, jobs),
      /Private GitHub access requires/,
    );
  }
  for (const change of [
    { workers_dev: true },
    { preview_urls: true },
    { assets: { run_worker_first: false } },
    { assets: { run_worker_first: true } },
  ])
    assert.throws(
      () => validateDeployment({ ...app, ...change }, jobs),
      /Private GitHub access requires/,
    );
});

void test('CI rejects missing config, wrong targets and public research worker URLs', () => {
  const { app, jobs } = deployment();
  app.vars.BETTER_AUTH_URL = 'https://clioforge.com';
  app.routes = [{ pattern: 'clioforge.com', custom_domain: true }];
  app.vars.PRIVATE_GITHUB_ACCESS = '1';
  app.vars.PRIVATE_GITHUB_USER_IDS = '123,456';
  app.vars.PRIVATE_GITHUB_CLIENT_ID = 'test-client';
  const parse = (a = app, j = jobs) =>
    parsePrivateDeployment(JSON.stringify(a), JSON.stringify(j));
  assert.deepEqual(parse(), { app, jobs });
  assert.throws(
    () => parsePrivateDeployment('', JSON.stringify(jobs)),
    /Missing app/,
  );
  assert.throws(
    () => parsePrivateDeployment('{broken', JSON.stringify(jobs)),
    /Invalid app/,
  );
  assert.throws(
    () => parse({ ...app, name: 'another-worker' }),
    /private ClioForge/,
  );
  assert.throws(
    () => parse({ ...app, main: 'workers/offline.ts' }),
    /private ClioForge/,
  );
  assert.throws(
    () => parse(app, { ...jobs, workers_dev: true }),
    /private ClioForge/,
  );
  assert.throws(
    () => parse(app, { ...jobs, preview_urls: true }),
    /private ClioForge/,
  );
  assert.throws(
    () =>
      parse(app, {
        ...jobs,
        routes: [{ pattern: 'jobs.clioforge.com', custom_domain: true }],
      }),
    /private ClioForge/,
  );
});
