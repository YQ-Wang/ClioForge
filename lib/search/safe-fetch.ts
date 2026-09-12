import { boundedBytes } from '../files';

const blockedNames = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'instance-data',
]);

function blockedIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function blockedIpv6(hostname: string) {
  const value = hostname.replace(/^\[|\]$/g, '').toLocaleLowerCase();
  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.')
  );
}

export function safePublicUrl(raw: string, allowedHosts?: Set<string>) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Only credential-free HTTPS URLs are allowed');
  const hostname = url.hostname.toLocaleLowerCase().replace(/\.$/, '');
  if (
    !hostname ||
    blockedNames.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    blockedIpv4(hostname) ||
    (hostname.includes(':') && blockedIpv6(hostname))
  )
    throw new Error('Private or local network destinations are blocked');
  if (url.port && url.port !== '443') throw new Error('Unsafe port');
  if (allowedHosts && !allowedHosts.has(hostname))
    throw new Error('Host is not in the connector allowlist');
  url.hash = '';
  return url;
}

export async function fixedJson(
  raw: string,
  allowedHosts: string[],
  request: typeof fetch = fetch,
  init: RequestInit = {},
  maxBytes = 3_000_000,
) {
  const hosts = new Set(allowedHosts.map((host) => host.toLocaleLowerCase()));
  let url = safePublicUrl(raw, hosts);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    const response = await request(url, {
      ...init,
      redirect: 'manual',
      signal: init.signal || AbortSignal.timeout(20_000),
      headers,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new Error('Unsafe redirect');
      url = safePublicUrl(new URL(location, url).href, hosts);
      continue;
    }
    if (!response.ok)
      throw new Error(`Connector returned HTTP ${response.status}`);
    const bytes = await boundedBytes(response, maxBytes);
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  }
  throw new Error('Too many redirects');
}

export async function safeDownload(
  raw: string,
  request: typeof fetch = fetch,
  maxBytes = 20 * 1024 * 1024,
) {
  let url = safePublicUrl(raw);
  for (let redirect = 0; redirect <= 5; redirect++) {
    const response = await request(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(45_000),
      headers: {
        Accept: 'application/pdf,text/plain,text/html,image/jpeg,image/png',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === 5) throw new Error('Unsafe redirect');
      url = safePublicUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok)
      throw new Error(`Download returned HTTP ${response.status}`);
    const mediaType =
      response.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() || '';
    if (
      ![
        'application/pdf',
        'text/plain',
        'text/html',
        'image/jpeg',
        'image/png',
      ].includes(mediaType)
    )
      throw new Error('Unsupported download content type');
    const bytes = await boundedBytes(response, maxBytes);
    if (!bytes.length) throw new Error('Downloaded file is empty');
    if (
      mediaType === 'application/pdf' &&
      new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-'
    )
      throw new Error('Downloaded file does not match its PDF content type');
    return { bytes, mediaType, url: url.href };
  }
  throw new Error('Too many redirects');
}
