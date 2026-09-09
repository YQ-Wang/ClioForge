import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectBrowserDrafts,
  importBrowserDrafts,
  migratedURL,
} from '../lib/domain-migration';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  } satisfies Storage;
}
void test('domain draft transfer excludes credentials and preserves existing work', () => {
  const key = 'foliotrace:draft:user:project:note';
  const review = 'canwoo:review-draft:user:project:task';
  const old = storage({
    [key]: '{"text":"old"}',
    [review]: '{"humanText":"review"}',
    token: 'secret',
    'canwoo:task-question:user:task': '{"question":"why"}',
  });
  const file = collectBrowserDrafts(old);
  assert.equal(file.entries.length, 3);
  const fresh = storage({ [key]: '{"text":"newer"}' });
  assert.deepEqual(importBrowserDrafts(fresh, JSON.stringify(file)), {
    imported: 2,
    skipped: 1,
  });
  assert.equal(fresh.getItem(key), '{"text":"newer"}');
  assert.equal(fresh.getItem('token'), null);
  assert.equal(old.getItem(review), '{"humanText":"review"}');
  assert.deepEqual(importBrowserDrafts(fresh, JSON.stringify(file)), {
    imported: 0,
    skipped: 3,
  });
});
void test('invalid migration payloads make no partial writes', () => {
  const target = storage();
  const good = { key: 'foliotrace:draft:u:p:note', value: '{}' };
  for (const bad of [
    { key: 'auth-token', value: '{}' },
    { key: 'canwoo:review-draft:u:p:t', value: 'not json' },
  ]) {
    assert.throws(() =>
      importBrowserDrafts(
        target,
        JSON.stringify({
          format: 'clioforge-browser-drafts',
          version: 1,
          entries: [good, bad],
        }),
      ),
    );
    assert.equal(target.length, 0);
  }
});
void test('domain redirect preserves project links and rewrites old verification return URLs', () => {
  assert.equal(
    migratedURL('https://canwoo.com/?project=123&tab=sources#page-2'),
    'https://clioforge.com/?project=123&tab=sources#page-2',
  );
  const url = new URL(
    migratedURL(
      'https://canwoo.com/api/auth/verify-email?token=example&callbackURL=https%3A%2F%2Fcanwoo.com%2F%3Fview%3Dinbox',
    ),
  );
  assert.equal(url.searchParams.get('token'), 'example');
  assert.equal(
    url.searchParams.get('callbackURL'),
    'https://clioforge.com/?view=inbox',
  );
  assert.equal(
    new URL(migratedURL('https://canwoo.com/?next=https://evil.test')).origin,
    'https://clioforge.com',
  );
});

void test('saved old-domain citations still resolve and do not weaken self-hosted boundaries', async () => {
  const { writingCitationKey, citedEvidence } =
    await import('../lib/writing-export');
  const old = 'https://canwoo.com/?evidence=example';
  const current = 'https://clioforge.com/?evidence=example';
  assert.equal(writingCitationKey(old), writingCitationKey(current));
  assert.equal(writingCitationKey(old, 'https://research.example'), null);
  assert.equal(
    writingCitationKey('https://clioforge.com.evil.test/?evidence=example'),
    null,
  );
  assert.equal(
    citedEvidence(`[Source](${old})`, [
      {
        id: 'example',
        href: 'https://clioforge.com/',
        label: 'Source',
        text: 'Verified reference',
        stale: false,
      },
    ]).used.length,
    1,
  );
  assert.equal(citedEvidence(`[Source](${old})`, []).missing.length, 1);
});
