import { z } from 'zod';
import { boundedBytes, MAX_FILE_BYTES } from './files';
import { HttpError } from './errors';
export const zoteroLibrary = z.object({
  library: z.string().regex(/^\d{1,12}$/),
  library_type: z.enum(['users', 'groups']),
  key: z.string().min(1).max(500),
});
export async function zoteroAttachments(
  input: z.infer<typeof zoteroLibrary>,
  start: number,
  fetcher: typeof fetch = fetch,
) {
  const r = await fetcher(
    `https://api.zotero.org/${input.library_type}/${input.library}/items?itemType=attachment&format=json&limit=50&start=${start}`,
    {
      headers: { 'Zotero-API-Version': '3', 'Zotero-API-Key': input.key },
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) throw new HttpError(502, `Zotero HTTP ${r.status}`);
  const raw = z
    .array(
      z.object({
        key: z.string().regex(/^[A-Z0-9]{8}$/),
        data: z.object({
          title: z.string(),
          contentType: z.string().optional(),
          linkMode: z.string().optional(),
          filename: z.string().optional(),
        }),
      }),
    )
    .parse(
      JSON.parse(new TextDecoder().decode(await boundedBytes(r, 1_500_000))),
    );
  return {
    items: raw
      .filter(
        (i) =>
          ['imported_file', 'imported_url'].includes(i.data.linkMode || '') &&
          ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(
            i.data.contentType || '',
          ),
      )
      .map((i) => ({
        id: i.key,
        title: i.data.title,
        type: i.data.contentType!,
        filename: i.data.filename,
      })),
    next: raw.length === 50 ? start + 50 : null,
  };
}
export async function zoteroFile(
  input: z.infer<typeof zoteroLibrary>,
  item: string,
  fetcher: typeof fetch = fetch,
) {
  let response = await fetcher(
    `https://api.zotero.org/${input.library_type}/${input.library}/items/${item}/file`,
    {
      headers: { 'Zotero-API-Version': '3', 'Zotero-API-Key': input.key },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    },
  );
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const url = new URL(response.headers.get('location') || '');
    const allowed =
      url.hostname === 'files.zotero.net' ||
      url.hostname.endsWith('.zotero.org') ||
      url.hostname === 'zotero.s3.amazonaws.com' ||
      /^zotero\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(url.hostname);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !allowed
    )
      throw new HttpError(502, 'Zotero 返回了不支持的文件存储地址。');
    await response.body?.cancel();
    response = await fetcher(url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
  }
  if (!response.ok)
    throw new HttpError(502, `Zotero 文件 HTTP ${response.status}`);
  return boundedBytes(response, MAX_FILE_BYTES);
}
