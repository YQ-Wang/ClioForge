import test from 'node:test';
import assert from 'node:assert/strict';
import { readRenamedDraft } from '../lib/legacy-storage';
import { localeFromHeaders } from '../lib/i18n/core';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}
void test('renamed drafts preserve unsaved work without overriding newer drafts or reviving cleared work', () => {
  const s = storage();
  s.setItem('canwoo:review-draft:alice:project:task', 'original');
  s.setItem('canwoo:review-draft:bob:project:task', 'other user');
  const key = 'clioforge:review-draft:alice:project:task';
  assert.equal(readRenamedDraft(s, key), 'original');
  assert.equal(s.getItem('canwoo:review-draft:alice:project:task'), null);
  assert.equal(s.getItem('canwoo:review-draft:bob:project:task'), 'other user');
  s.removeItem(key);
  assert.equal(readRenamedDraft(s, key), null);
  s.setItem('canwoo:review-draft:alice:project:task', 'old');
  s.setItem(key, 'new');
  assert.equal(readRenamedDraft(s, key), 'new');
  s.removeItem(key);
  assert.equal(readRenamedDraft(s, key), null);
});
void test('new language preference takes precedence while legacy cookies remain readable', () => {
  assert.equal(
    localeFromHeaders(new Headers({ cookie: 'canwoo_locale=en' })),
    'en',
  );
  assert.equal(
    localeFromHeaders(
      new Headers({ cookie: 'canwoo_locale=en; clioforge_locale=zh-CN' }),
    ),
    'zh-CN',
  );
});
