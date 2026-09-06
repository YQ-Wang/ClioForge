import { boundedBytes } from '@/lib/files';
import { z } from 'zod';
import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import { WorkbenchStore } from '@/lib/workbench-store';
import {
  exportBibliography,
  parseBibliography,
  footnote,
} from '@/lib/bibliography';
import { cslInput } from '@/lib/workbench-inputs';
const inputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('export'),
    project_id: z.uuid(),
    format: z.enum(['csl', 'bibtex', 'ris', 'chicago', 'apa']),
  }),
  z.object({
    action: z.literal('parse'),
    project_id: z.uuid(),
    format: z.enum(['csl', 'bibtex', 'ris']),
    text: z.string().max(1_500_000),
  }),
  z.object({
    action: z.literal('footnote'),
    project_id: z.uuid(),
    entry_id: z.uuid(),
    locator: z.string().max(200),
  }),
  z.object({
    action: z.literal('zotero'),
    library_type: z.enum(['users', 'groups']).default('users'),
    project_id: z.uuid(),
    library: z.string().regex(/^\d{1,12}$/),
    key: z.string().min(1).max(500),
    start: z.number().int().min(0).max(100000).default(0),
  }),
]);
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request),
      input = inputSchema.parse(await jsonBody(request, 2_000_000));
    await store.project(input.project_id);
    const workbench = new WorkbenchStore(store.db, store.owner);
    if (input.action === 'parse')
      return Response.json({
        entries: parseBibliography(input.text, input.format),
      });
    if (input.action === 'zotero') {
      const response = await fetch(
        `https://api.zotero.org/${input.library_type}/${input.library}/items/top?format=csljson&limit=50&start=${input.start}`,
        {
          headers: { 'Zotero-API-Version': '3', 'Zotero-API-Key': input.key },
          redirect: 'manual',
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        throw new HttpError(
          502,
          `Zotero 返回 HTTP ${response.status}，请检查只读访问权限。`,
        );
      const text = new TextDecoder().decode(
        await boundedBytes(response, 1_500_000),
      );
      if (text.length > 1_500_000) throw new HttpError(413, '本页书目过大。');
      const raw: unknown = JSON.parse(text);
      if (!Array.isArray(raw))
        throw new HttpError(502, 'Zotero 返回格式无效。');
      const entries = raw.map((value) => cslInput.parse(value));
      return Response.json({
        entries,
        next: entries.length === 50 ? input.start + 50 : null,
      });
    }
    const entries = (await workbench.workbench(input.project_id)).bibliography;
    if (input.action === 'footnote') {
      const entry = entries.find((e) => e.id === input.entry_id);
      if (!entry) throw new HttpError(404, '书目不存在。');
      return Response.json({ text: footnote(entry, input.locator) });
    }
    return Response.json({ text: exportBibliography(entries, input.format) });
  } catch (error) {
    return failure(error);
  }
}
