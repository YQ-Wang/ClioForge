// Move only the requested, user-scoped draft; never enumerate another account's data.
export function readRenamedDraft(storage: Storage, key: string): string | null {
  const current = storage.getItem(key);
  if (!key.startsWith('clioforge:')) return current;
  const legacyKey = key.replace(/^clioforge:/, 'canwoo:');
  if (current !== null) {
    storage.removeItem(legacyKey);
    return current;
  }
  const legacy = storage.getItem(legacyKey);
  if (legacy === null) return null;
  storage.setItem(key, legacy);
  storage.removeItem(legacyKey);
  return legacy;
}
