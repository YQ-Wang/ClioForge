import { richWritingDocx, writingPrintHTML } from '@/lib/rich-writing-export';
import { richDocumentString } from '@/lib/rich-document';
import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { WorkbenchStore } from '@/lib/workbench-store';
import { footnote } from '@/lib/bibliography';
import { sourcePath } from '@/lib/navigation';
import { writingDocx, type WritingCitation } from '@/lib/writing-export';
import type { Evidence, Source, SourceVersion } from '@/lib/types';
import type { ResearchStore } from '@/lib/store';
export async function writingSources(
  store: ResearchStore,
  projectId: string,
  origin: string,
) {
  const snapshot = await store.readProject(projectId),
    work = await new WorkbenchStore(store.db, store.owner).workbench(projectId);
  const citations: WritingCitation[] = (snapshot.evidence as Evidence[]).map(
    (e) => {
      const source = (snapshot.sources as Source[]).find(
          (s) => s.id === e.source_id,
        ),
        version = (snapshot.source_versions as SourceVersion[]).find(
          (v) => v.id === e.version_id,
        ),
        entry = work.bibliography.find((b) => b.source_id === e.source_id);
      return {
        id: e.id,
        label: `${source?.title || 'Source'} · ${e.page}`,
        text: `${entry ? footnote(entry, String(e.page)) : source?.title || 'Source'}, p. ${e.page}. “${e.quote}” (Canwoo version ${version?.revision || '?'}; ${e.version_id})`,
        href: origin + sourcePath(projectId, e.version_id, e.page),
        stale: (snapshot.source_versions as SourceVersion[]).some(
          (v) =>
            v.source_id === e.source_id &&
            v.revision > (version?.revision || 0),
        ),
      };
    },
  );
  return {
    citations,
    evidence: snapshot.evidence,
    claims: work.claims,
    links: work.claim_evidence,
  };
}
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      project = z
        .uuid()
        .parse(new URL(request.url).searchParams.get('project_id'));
    return Response.json(
      await writingSources(store, project, new URL(request.url).origin),
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request),
      input = z
        .object({
          project_id: z.uuid(),
          title: z.string().max(200),
          body: z.string().max(100000),
          document: richDocumentString.nullish(),
          format: z.enum(['docx', 'print']).default('docx'),
        })
        .parse(await jsonBody(request, 1600000));
    const { citations } = await writingSources(
      store,
      input.project_id,
      new URL(request.url).origin,
    );
    if (input.format === 'print')
      return new Response(
        writingPrintHTML(input.title, input.body, input.document, citations),
        {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'Content-Security-Policy':
              "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
          },
        },
      );
    return new Response(
      new Uint8Array(
        input.document
          ? richWritingDocx(input.title, input.document, citations)
          : writingDocx(input.title, input.body, citations),
      ),
      {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition':
            "attachment; filename*=UTF-8''" +
            encodeURIComponent((input.title || 'Canwoo') + '.docx'),
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
