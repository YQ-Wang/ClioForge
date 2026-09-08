import { z } from 'zod';
import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import { MissionStore } from '@/lib/platform/missions';
import { dispatchMission } from '@/lib/platform/execute';
import { manuscriptReadiness } from '@/lib/manuscript-readiness';
import {
  manuscriptBundle,
  bundleHash,
  createManuscript,
  manuscriptRuns,
} from '@/lib/manuscript';
export async function GET(request: Request) {
  try {
    const auth = await authenticate(request),
      store = new MissionStore(auth.store.db, auth.user.id);
    const project = z
      .uuid()
      .parse(new URL(request.url).searchParams.get('project_id'));
    await store.project(project);
    const questions = (
      await store.db
        .prepare(
          'SELECT id,title FROM research_questions WHERE project_id=? ORDER BY created_at DESC LIMIT 200',
        )
        .bind(project)
        .all()
    ).results;
    const readiness = await manuscriptReadiness(store, project);
    const claims = readiness.claims.filter(
      (claim) => claim.status === 'reviewed',
    );
    const budget = await store.db
      .prepare(
        'SELECT limit_units,committed_units FROM project_budgets WHERE project_id=?',
      )
      .bind(project)
      .first();
    return Response.json(
      {
        questions,
        claims,
        readiness,
        budget,
        runs: await manuscriptRuns(store, project),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticate(request),
      store = new MissionStore(auth.store.db, auth.user.id);
    const raw = z
      .object({
        project_id: z.uuid(),
        action: z.enum(['preview', 'create']),
        value: z.unknown(),
      })
      .parse(await jsonBody(request));
    await store.project(raw.project_id, 'write');
    if (raw.action === 'preview') {
      const selection = z
        .object({
          question_id: z.uuid(),
          claim_ids: z.array(z.uuid()).min(1).max(20),
        })
        .parse(raw.value);
      const bundle = await manuscriptBundle(
        store,
        raw.project_id,
        selection.question_id,
        selection.claim_ids,
      );
      return Response.json(
        { bundle, hash: await bundleHash(bundle) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    if (!auth.settings.JOB_QUEUE)
      throw new HttpError(503, '后台研究队列尚未配置。');
    const mission = await createManuscript(store, raw.project_id, raw.value);
    if (mission.status === 'draft') await store.control(mission.id, 'start');
    await dispatchMission(auth.settings, mission.id);
    return Response.json(
      { mission_id: mission.id },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
