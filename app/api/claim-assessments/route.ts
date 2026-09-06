import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { claimAssessments, assessClaim } from '@/lib/claim-assessments';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      id = z.uuid().parse(new URL(request.url).searchParams.get('task_id'));
    return Response.json(await claimAssessments(store, id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request);
    await assessClaim(store, await jsonBody(request));
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
