import { z } from 'zod';
import { authenticate, failure } from '@/lib/server';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      projectId = z
        .uuid()
        .parse(new URL(request.url).searchParams.get('project_id'));
    await store.project(projectId);
    const [review, changed, sources, reading] = await Promise.all([
      store.db
        .prepare(
          "SELECT t.id,t.mission_id,t.title,t.status,t.assignee FROM mission_tasks t JOIN missions m ON m.id=t.mission_id WHERE t.project_id=? AND m.status IN ('active','paused') AND ((t.executor='human' AND t.status='ready') OR t.status='review') ORDER BY CASE WHEN t.assignee=? THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 5",
        )
        .bind(projectId, store.owner)
        .all(),
      store.db
        .prepare(
          'SELECT DISTINCT c.id,c.body FROM claims c JOIN claim_evidence ce ON ce.claim_id=c.id JOIN evidence e ON e.id=ce.evidence_id JOIN source_versions v ON v.id=e.version_id WHERE c.project_id=? AND v.revision<(SELECT MAX(v2.revision) FROM source_versions v2 WHERE v2.source_id=v.source_id) LIMIT 5',
        )
        .bind(projectId)
        .all(),
      store.db
        .prepare(
          'SELECT s.id,s.title,v.id AS version_id,v.revision,v.created_at FROM sources s JOIN source_versions v ON v.source_id=s.id WHERE s.project_id=? AND v.revision=(SELECT MAX(v2.revision) FROM source_versions v2 WHERE v2.source_id=s.id) AND NOT EXISTS(SELECT 1 FROM source_organization o WHERE o.source_id=s.id AND o.trashed_at IS NOT NULL) ORDER BY v.created_at DESC LIMIT 3',
        )
        .bind(projectId)
        .all(),
      store.db
        .prepare(
          'SELECT e.id,s.title,e.question,e.version_id,e.page,MAX(c.created_at) AS updated_at FROM project_comments c JOIN evidence e ON e.id=c.target_id AND e.project_id=c.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE c.project_id=? AND c.resolved=0 GROUP BY e.id,s.title,e.question,e.version_id,e.page ORDER BY updated_at DESC,e.id LIMIT 5',
        )
        .bind(projectId)
        .all(),
    ]);
    return Response.json(
      {
        review: review.results,
        changed: changed.results,
        sources: sources.results,
        reading: reading.results,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
