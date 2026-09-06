import test from 'node:test';
import assert from 'node:assert/strict';
import { authReturnPath } from '../lib/auth-return';

const project = '6ecab0b5-bcdc-4af0-b294-7d3a27b24bf2';
const version = 'c6e9dd6d-fd80-4e66-ba61-0eb6247022a6';
const annotation = '16a56468-e1b9-4a39-8ad9-5e186603bd94';

void test('authentication returns to the exact fixed reading page and highlight', () => {
  const route = `/?project=${project}&tab=sources&version=${version}&page=3&annotation=${annotation}`;
  assert.equal(authReturnPath(route), route);
  assert.equal(
    authReturnPath(route.replace('annotation=', 'evidence=')),
    route.replace('annotation=', 'evidence='),
  );
});

void test('authentication retains plan, inbox, settings and invitation destinations', () => {
  for (const route of [
    `/?project=${project}&tab=platform&mission=${version}&task=${annotation}&tasks=board`,
    `/?project=${project}&tab=team&discussion=${annotation}`,
    `/?project=${project}&tab=sources&settings=models`,
    '/?view=inbox',
    '/?settings=security',
    '/?view=guide',
    `/?invitation=${annotation}`,
  ])
    assert.equal(authReturnPath(route), route);
});

void test('authentication strips errors, reset credentials and nested redirects while preserving destination', () => {
  const route = `/?project=${project}&tab=sources&version=${version}&page=3`;
  assert.equal(
    authReturnPath(
      `${route}&error=google&error_description=cancelled&token=reset-secret&code=oauth-secret&state=oauth-state&redirect=https%3A%2F%2Fevil.test&callbackURL=%2F%2Fevil.test#access_token=secret`,
    ),
    route,
  );
  assert.equal(authReturnPath('/?token=secret&error=google'), '/');
  assert.equal(
    authReturnPath('/?settings=security&settings=models&unknown=secret'),
    '/?settings=security',
  );
});

void test('authentication callback is always a relative workspace URL', () => {
  for (const route of [
    'https://evil.test/',
    '//evil.test/',
    '/\\evil.test/',
    '\\evil.test',
    'javascript:alert(1)',
    '/api/auth/sign-out',
    '/privacy',
    '/%2f%2fevil.test',
    '/\n/evil.test',
    'https://canwoo.invalid/?view=inbox',
  ])
    assert.equal(authReturnPath(route), '/', route);
  assert.equal(
    authReturnPath(
      '/?project=invalid&tab=unknown&page=0&settings=unknown&view=other',
    ),
    '/',
  );
  assert.equal(authReturnPath('/?page=9007199254740992'), '/');
});
