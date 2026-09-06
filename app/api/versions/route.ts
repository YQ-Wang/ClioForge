import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { VersionStore } from '@/lib/platform/versions';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      projectId = z
        .uuid()
        .parse(new URL(request.url).searchParams.get('project_id'));
    await store.project(projectId);
    const [snapshots, branches, reviews] = await Promise.all([
      store.db
        .prepare(
          'SELECT * FROM project_snapshots WHERE project_id=? ORDER BY created_at DESC LIMIT 100',
        )
        .bind(projectId)
        .all(),
      store.db
        .prepare(
          'SELECT * FROM research_branches WHERE project_id=? ORDER BY created_at DESC LIMIT 100',
        )
        .bind(projectId)
        .all(),
      store.db
        .prepare(
          'SELECT r.* FROM branch_reviews r JOIN research_branches b ON b.id=r.branch_id WHERE b.project_id=? ORDER BY r.created_at DESC LIMIT 100',
        )
        .bind(projectId)
        .all(),
    ]);
    return Response.json(
      {
        snapshots: snapshots.results,
        branches: branches.results,
        reviews: reviews.results,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticate(request),
      store = new VersionStore(auth.store.db, auth.user.id);
    const input = z
      .object({
        project_id: z.uuid(),
        action: z.enum(['snapshot', 'branch', 'edit', 'review', 'merge']),
        id: z.uuid().optional(),
        title: z.string().min(1).max(200).optional(),
        expected: z.number().int().optional(),
        reason: z.string().min(1).max(10000).optional(),
        changes: z.unknown().optional(),
      })
      .parse(await jsonBody(request, 2_000_000));
    let result: unknown;
    switch (input.action) {
      case 'snapshot':
        result = await store.snapshot(
          input.project_id,
          z.string().min(1).parse(input.title),
        );
        break;
      case 'branch':
        result = await store.branch(
          input.project_id,
          z.string().min(1).parse(input.title),
          z.uuid().parse(input.id),
        );
        break;
      case 'edit':
        result = await store.editBranch(
          input.project_id,
          z.uuid().parse(input.id),
          input.changes,
          z.number().int().parse(input.expected),
        );
        break;
      case 'review':
        result = await store.requestReview(
          input.project_id,
          z.uuid().parse(input.id),
          z.number().int().parse(input.expected),
        );
        break;
      case 'merge':
        result = await store.merge(
          input.project_id,
          z.uuid().parse(input.id),
          z.number().int().parse(input.expected),
          z.string().min(1).parse(input.reason),
        );
        break;
    }
    return Response.json({ result });
  } catch (error) {
    return failure(error);
  }
}
