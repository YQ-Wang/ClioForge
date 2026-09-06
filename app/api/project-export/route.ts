import { authenticate, failure } from '@/lib/server';
import { projectArchive } from '@/lib/project-export';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { store, settings } = await authenticate(request);
    const id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get('project_id'));
    const body = await projectArchive(store, settings.FILES, id);
    return new Response(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="canwoo-${id}.zip"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return failure(error);
  }
}
