const encoder = new TextEncoder();
function bytes(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function base64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}
async function key(secret: string) {
  const raw = bytes(secret);
  if (raw.byteLength !== 32) throw new Error('Encryption key must be 32 bytes');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function encrypt(value: string, secret: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    await key(secret),
    encoder.encode(value),
  );
  return `v1.${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
export async function decrypt(value: string, secret: string, context: string) {
  const [version, iv, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext)
    throw new Error('Invalid ciphertext');
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bytes(iv),
        additionalData: encoder.encode(context),
      },
      await key(secret),
      bytes(ciphertext),
    ),
  );
}
