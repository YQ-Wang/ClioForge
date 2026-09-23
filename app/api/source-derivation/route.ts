import { z } from 'zod';
import { authenticate, failure } from '@/lib/server';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    const version = await store.version(
      z.uuid().parse(new URL(request.url).searchParams.get('version_id')),
    );
    const derivation = await store.db
      .prepare(
        'SELECT d.parent_version_id,d.run_id,d.page,d.reason,d.created_at,v.revision parent_revision FROM source_derivations d JOIN source_versions v ON v.id=d.parent_version_id WHERE d.version_id=? AND d.project_id=?',
      )
      .bind(version.id, version.project_id)
      .first();
    return Response.json(
      { derivation },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
