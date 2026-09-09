import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  isWorkspaceRequest,
  hasSessionCookie,
  publicMetadata,
  publicPages,
} from '../lib/public-site';
import adams from '../lib/adams-public-case.json';

void test('appearance cookies do not hide the public entrance from indexing', () => {
  assert.equal(
    hasSessionCookie('clioforge_locale=en; clioforge_theme=dark'),
    false,
  );
  assert.equal(hasSessionCookie(null), false);
  assert.equal(hasSessionCookie('better-auth.session_token=test'), true);
  assert.equal(
    hasSessionCookie('locale=en; __Secure-better-auth.session_token=test'),
    true,
  );
  assert.equal(hasSessionCookie('not-better-auth.session_token=test'), false);
});

void test('public entrance keeps auth recovery, invitations and project deep links in the workspace', () => {
  for (const key of [
    'project',
    'view',
    'settings',
    'invitation',
    'error',
    'token',
    'code',
    'state',
    'drive',
    'annotation',
  ]) {
    assert.equal(isWorkspaceRequest({ [key]: 'value' }), true, key);
    assert.equal(isWorkspaceRequest({ [key]: '' }), true, `empty ${key}`);
  }
  assert.equal(isWorkspaceRequest({}), false);
  assert.equal(
    isWorkspaceRequest({ utm_source: 'university', ref: 'github' }),
    false,
  );
});

void test('public canonical URLs contain only deliberately published pages', () => {
  for (const page of Object.keys(publicPages) as (keyof typeof publicPages)[]) {
    const metadata = publicMetadata(page, 'en');
    assert.deepEqual(metadata.robots, { index: true, follow: true });
    const canonical = metadata.alternates?.canonical;
    assert.equal(typeof canonical, 'string');
    const url = new URL(canonical as string);
    assert.equal(url.origin, 'https://clioforge.com');
    assert.equal(url.search, '');
    assert.equal(url.pathname, publicPages[page].path);
    assert.notEqual(metadata.title, publicMetadata(page, 'zh-CN').title);
  }
});

void test('every displayed Adams excerpt matches its attributed downloadable edition', () => {
  assert.deepEqual(
    adams.letters.map((letter) => letter.number),
    [91, 94, 102],
  );
  for (const letter of adams.letters) {
    const bytes = readFileSync(
      new URL(`../public${letter.file}`, import.meta.url),
    );
    const text = bytes.toString();
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      letter.sha256,
    );
    assert.ok(text.includes(letter.excerpt));
    assert.ok(text.includes(`${letter.author} to ${letter.recipient}`));
    assert.ok(text.includes('not the complete letter'));
    assert.ok(text.includes(adams.rightsUrl));
    assert.ok(text.includes('FULL PROJECT GUTENBERG LICENSE'));
    assert.ok(!letter.excerpt.includes('[150]'));
    assert.ok(!letter.excerpt.includes('<'));
  }
});
