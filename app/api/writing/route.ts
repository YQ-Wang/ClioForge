import { richWritingDocx, writingPrintHTML } from '@/lib/rich-writing-export';
import { richDocumentString } from '@/lib/rich-document';
import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { writingDocx, writingPageReferences } from '@/lib/writing-export';
import { writingSources } from '@/lib/writing-sources';
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
    const origin = new URL(request.url).origin;
    const { citations } = await writingSources(
      store,
      input.project_id,
      origin,
      writingPageReferences(input.body, input.document, origin),
    );
    if (input.format === 'print')
      return new Response(
        writingPrintHTML(
          input.title,
          input.body,
          input.document,
          citations,
          origin,
        ),
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
          ? richWritingDocx(input.title, input.document, citations, origin)
          : writingDocx(input.title, input.body, citations, origin),
      ),
      {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition':
            "attachment; filename*=UTF-8''" +
            encodeURIComponent((input.title || 'ClioForge') + '.docx'),
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
