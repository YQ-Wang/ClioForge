import test from 'node:test';
import assert from 'node:assert/strict';

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
