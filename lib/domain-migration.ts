import { z } from 'zod';

export const PRIMARY_ORIGIN = 'https://clioforge.com';
export const LEGACY_HOST = 'canwoo.com';
export const DRAFT_TRANSFER_LIMIT = 8 * 1024 * 1024;
// Only researcher drafts transfer. Authentication, API keys and UI settings do not.
const draftKey =
  /^(?:foliotrace:draft:[^:]+:[^:]+:.+|canwoo:(?:review-draft|record-draft):[^:]+:[^:]+:[^:]+|canwoo:task-question:[^:]+:[^:]+)$/;
const transfer = z.object({
  format: z.literal('clioforge-browser-drafts'),
  version: z.literal(1),
  entries: z
    .array(
      z.object({
        key: z.string().max(2000).regex(draftKey),
        value: z.string().max(2 * 1024 * 1024),
      }),
    )
    .max(500),
});
export function collectBrowserDrafts(storage: Storage) {
  const entries: { key: string; value: string }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && draftKey.test(key)) {
      const value = storage.getItem(key);
      if (value) entries.push({ key, value });
    }
  }
  return {
    format: 'clioforge-browser-drafts' as const,
    version: 1 as const,
    entries,
  };
}
export function importBrowserDrafts(storage: Storage, raw: string) {
  if (new TextEncoder().encode(raw).length > DRAFT_TRANSFER_LIMIT)
    throw new Error('Draft file is too large.');
  const parsed = transfer.parse(JSON.parse(raw));
  // Validate the complete payload before writing anything, and never replace newer local work.
  for (const entry of parsed.entries) JSON.parse(entry.value);
  let imported = 0,
    skipped = 0;
  for (const { key, value } of parsed.entries) {
    if (storage.getItem(key) !== null) {
      skipped++;
      continue;
    }
    storage.setItem(key, value);
    imported++;
  }
  return { imported, skipped };
}
export function migratedURL(value: string) {
  const target = new URL(value);
  target.protocol = 'https:';
  target.host = 'clioforge.com';
  // Old email-verification and password-reset messages contain an absolute return URL.
  for (const key of ['callbackURL', 'redirectTo']) {
    const callback = target.searchParams.get(key);
    if (!callback) continue;
    try {
      const url = new URL(callback);
      if (url.origin === 'https://canwoo.com') {
        url.host = 'clioforge.com';
        target.searchParams.set(key, url.href);
      }
    } catch {
      /* The auth handler validates relative or malformed callbacks. */
    }
  }
  return target.href;
}
