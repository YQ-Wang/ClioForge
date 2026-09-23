import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { LiteratureStore } from '@/lib/literature-store';
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request);
    const input = z
      .object({
        project_id: z.uuid(),
        session_id: z.uuid(),
        candidate_id: z.string().min(1).max(1000),
      })
      .parse(await jsonBody(request));
    return Response.json({
      result: await new LiteratureStore(store).saveCandidate(
        input.project_id,
        input.session_id,
        input.candidate_id,
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
