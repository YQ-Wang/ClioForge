import { z } from 'zod';
import { authenticate, failure, HttpError, jsonBody } from '@/lib/server';
import { directPrice } from '@/lib/direct-research';
import { dispatchMission } from '@/lib/platform/execute';
import { MissionStore } from '@/lib/platform/missions';
import {
  defaultSourceSelectionCriteria,
  sourceSearchRecipe,
} from '@/lib/platform/source-search-recipe';

export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  project_id: z.uuid(),
  query: z.string().trim().min(1).max(12_000),
  selection_criteria: z.string().trim().min(1).max(6_000).optional(),
  locale: z.enum(['zh-CN', 'en']).default('zh-CN'),
  effort: z.enum(['low', 'high', 'max']).default('max'),
  max_steps: z.number().int().min(2).max(64).default(32),
  search_provider: z.enum(['catalogs', 'brave', 'tavily']).default('catalogs'),
});

export async function POST(request: Request) {
  try {
    const auth = await authenticate(request);
    const input = inputSchema.parse(await jsonBody(request));
    await auth.store.project(input.project_id, 'write');
    const policy = await auth.store.db
      .prepare(
        "SELECT model_id FROM model_policies WHERE owner_id=? AND task_kind='analysis'",
      )
      .bind(auth.user.id)
      .first<{ model_id: string }>();
    if (!policy)
      throw new HttpError(
        409,
        '请先在「助手设置」中保存默认模型与费率，再运行 AI 资料搜索。',
      );
    const model = await auth.store.model(policy.model_id);
    const price = await directPrice(auth.store, model.id, 'analysis');
    const selectionCriteria =
      input.selection_criteria || defaultSourceSelectionCriteria(input.locale);
    const store = new MissionStore(auth.store.db, auth.user.id);
    const id = await store.create(
      input.project_id,
      sourceSearchRecipe({
        request: input.query,
        selection_criteria: selectionCriteria,
        locale: input.locale,
        model_id: model.id,
        input_rate: price.input_rate,
        output_rate: price.output_rate,
        max_output: price.max_output,
        max_steps: input.max_steps,
        effort: input.effort,
        search_provider: input.search_provider,
      }),
    );
    await auth.store.db
      .prepare(
        'INSERT INTO source_search_runs(id,project_id,created_by,request,selection_criteria,locale,model_id,reasoning_effort,max_steps,search_provider,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        input.project_id,
        auth.user.id,
        input.query,
        selectionCriteria,
        input.locale,
        model.id,
        input.effort,
        input.max_steps,
        input.search_provider,
        new Date().toISOString(),
      )
      .run();
    await store.control(id, 'start');
    await dispatchMission(auth.settings, id);
    return Response.json(
      { id, mission: await store.view(id) },
      { status: 202 },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: Request) {
  try {
    const auth = await authenticate(request);
    const id = z.uuid().parse(new URL(request.url).searchParams.get('id'));
    const store = new MissionStore(auth.store.db, auth.user.id);
    const mission = await store.view(id);
    const run = await auth.store.db
      .prepare(
        'SELECT id,project_id,request,selection_criteria,locale,model_id,reasoning_effort,max_steps,search_provider,created_at FROM source_search_runs WHERE id=?',
      )
      .bind(id)
      .first();
    if (!run) throw new HttpError(404, '资料搜索不存在。');
    const candidates = (
      await auth.store.db
        .prepare(
          `SELECT r.*,c.verification_level,c.decision,c.relevance_reason,c.rejection_reason,c.limitations,c.updated_at
           FROM source_search_candidates c JOIN library_records r ON r.id=c.record_id
           WHERE c.run_id=? ORDER BY c.updated_at DESC,r.title LIMIT 200`,
        )
        .bind(id)
        .all<Record<string, unknown>>()
    ).results.map((row) => ({
      ...row,
      creators: JSON.parse(String(row.creators)),
      languages: JSON.parse(String(row.languages)),
      metadata: JSON.parse(String(row.metadata)),
    }));
    const leads = (
      await auth.store.db
        .prepare(
          `SELECT l.*,r.title,r.creators,r.issued_date,r.institution,r.landing_url,r.rights,r.license
           FROM source_leads l JOIN library_records r ON r.id=l.record_id
           WHERE l.run_id=? ORDER BY l.updated_at DESC`,
        )
        .bind(id)
        .all<Record<string, unknown>>()
    ).results.map((row) => ({
      ...row,
      creators: JSON.parse(String(row.creators)),
    }));
    return Response.json({ run, mission, candidates, leads });
  } catch (error) {
    return failure(error);
  }
}
