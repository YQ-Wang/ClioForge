import { authenticate, failure, jsonBody } from '@/lib/server';
import { WorkbenchStore } from '@/lib/workbench-store';
import { workbenchInput } from '@/lib/workbench-inputs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    return Response.json(
      await new WorkbenchStore(store.db, store.owner).workbench(
        new URL(request.url).searchParams.get('project_id') || '',
      ),
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
