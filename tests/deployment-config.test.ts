import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, validateDeployment } from '../scripts/cloudflare.mjs';

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
