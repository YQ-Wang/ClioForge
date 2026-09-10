import { z } from 'zod';
import { authenticate, failure, HttpError } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      params = new URL(request.url).searchParams,
      projectId = z.uuid().parse(params.get('project_id')),
      id = z.uuid().parse(params.get('id'));
    await store.project(projectId);
    const artifact = await store.db
      .prepare(
        'SELECT a.* FROM artifacts a WHERE a.id=? AND (a.project_id=? OR EXISTS(SELECT 1 FROM artifact_grants g WHERE g.artifact_id=a.id AND g.project_id=?))',
      )
      .bind(id, projectId, projectId)
      .first();
    if (!artifact) throw new HttpError(404, '成果不存在或未获授权。');
    const reviews = (
      await store.db
        .prepare('SELECT * FROM artifact_reviews WHERE artifact_id=?')
        .bind(id)
        .all()
    ).results;
    return Response.json(
      {
        format: 'clioforge-artifact-v1',
        artifact: {
          ...artifact,
          body: JSON.parse(String(artifact.body)),
          source_versions: JSON.parse(String(artifact.source_versions)),
        },
        reviews,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
