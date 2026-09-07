import { authenticate, failure, jsonBody } from '@/lib/server';
import { WorkbenchStore } from '@/lib/workbench-store';
import { readCollection } from '@/lib/project-collections';
import { workbenchInput } from '@/lib/workbench-inputs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    const params = new URL(request.url).searchParams;
    const projectId = params.get('project_id') || '';
    await store.project(projectId);
    return Response.json(
      params.has('collection')
        ? await readCollection(
            store,
            projectId,
            params.get('collection')!,
            params.get('before'),
          )
        : {
            budget: await store.db
              .prepare('SELECT * FROM project_budgets WHERE project_id=?')
              .bind(projectId)
              .first(),
          },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request);
    const input = workbenchInput.parse(await jsonBody(request, 2_000_000));
    return Response.json({
      result: await new WorkbenchStore(store.db, store.owner).mutate(input),
    });
  } catch (error) {
    return failure(error);
  }
}
