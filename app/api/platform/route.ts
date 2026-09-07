import { postDiscussion } from '@/lib/research-attention';
import { discussionTarget } from '@/lib/platform/discussions';
import { saveEvaluation } from '@/lib/platform/evaluation';
import { citationSchema } from '@/lib/platform/types';
import { updateMission } from '@/lib/platform/incremental';
import { methodSchema } from '@/lib/platform/research-recipes';
import { TeamStore } from '@/lib/project-team';
import { importLedSample, sampleBatchSchema } from '@/lib/platform/dataset';
import { z } from 'zod';
import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import { MissionStore } from '@/lib/platform/missions';
import { dispatchMission } from '@/lib/platform/execute';
import { submitHumanReview } from '@/lib/platform/human-review';
import { repairProse } from '@/lib/platform/repair';
import { moveBoardTask } from '@/lib/platform/task-board';
import { reindexProject, searchPages, sha256 } from '@/lib/platform/search';
const inputSchema = z.object({
  action: z.enum([
    'create_mission',
    'move_board_task',
    'save_method',
    'update_mission',
    'correct_task',
    'evaluate_task',
    'assign_task',
    'control_mission',
    'review_task',
    'retry_task',
    'claim_task',
    'submit_task',
    'submit_human_task',
    'repair_prose',
    'reindex',
    'alias',
    'member',
    'remove_member',
    'comment',
    'resolve_comment',
    'create_credential',
    'revoke_credential',
    'grant_artifact',
    'import_dataset',
  ]),
  project_id: z.uuid(),
  id: z.uuid().optional(),
  value: z.unknown().optional(),
});
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const auth = await authenticate(request),
      store = new MissionStore(auth.store.db, auth.user.id),
      params = new URL(request.url).searchParams,
      projectId = z.uuid().parse(params.get('project_id'));
    const project = await store.project(projectId);
    if (params.has('comments')) {
      const target = z.uuid().parse(params.get('comments'));
      await discussionTarget(store, projectId, target);
      return Response.json(
        {
          role: project.role,
          comments: (
            await store.db
              .prepare(
                'SELECT c.*,u.name AS author_name FROM project_comments c JOIN user u ON u.id=c.author WHERE c.project_id=? AND c.target_id=? ORDER BY c.created_at DESC LIMIT 100',
              )
              .bind(projectId, target)
              .all()
          ).results,
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    if (params.has('methods'))
      return Response.json(
        {
          methods: (
            await store.db
              .prepare(
                'SELECT * FROM research_methods WHERE project_id=? ORDER BY created_at DESC LIMIT 50',
              )
              .bind(projectId)
              .all()
          ).results.map((r) => ({ ...r, body: JSON.parse(String(r.body)) })),
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    const missionId = params.get('mission_id');
    if (missionId) {
      const view = await store.view(missionId);
      if (view.mission.project_id !== projectId)
        throw new HttpError(404, '研究计划不存在。');
      return Response.json(view, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    if (params.has('q'))
      return Response.json(
        {
          hits: await searchPages(store, projectId, params.get('q') || '', {
            offset: Number(params.get('offset')) || 0,
            approximate: params.get('approximate') === '1',
            history: params.get('history') === '1',
            source_id: params.get('source_id') || undefined,
            language: params.get('language') || undefined,
            year_start: params.has('year_start')
              ? Number(params.get('year_start'))
              : undefined,
            year_end: params.has('year_end')
              ? Number(params.get('year_end'))
              : undefined,
          }),
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    const [
      missions,
      members,
      comments,
      artifacts,
      credentials,
      aliases,
      index,
    ] = await Promise.all([
      store.list(projectId),
      new TeamStore(store.db, store.owner)
        .team(projectId)
        .then((team) => team.members),
      store.db
        .prepare(
          'SELECT c.*,u.name AS author_name FROM project_comments c JOIN user u ON u.id=c.author WHERE project_id=? ORDER BY created_at DESC LIMIT 100',
        )
        .bind(projectId)
        .all(),
      store.artifactSummaries(projectId),
      store.db
        .prepare(
          'SELECT id,label,scopes,expires_at,revoked_at,last_used_at FROM agent_credentials WHERE project_id=? AND owner_id=? ORDER BY created_at DESC',
        )
        .bind(projectId, store.owner)
        .all(),
      store.db
        .prepare('SELECT * FROM search_aliases WHERE project_id=?')
        .bind(projectId)
        .all(),
      store.db
        .prepare(
          'SELECT (SELECT COUNT(*) FROM source_versions WHERE project_id=?) AS versions,(SELECT COUNT(DISTINCT version_id) FROM source_pages WHERE project_id=?) AS indexed_versions,(SELECT COUNT(*) FROM source_pages WHERE project_id=?) AS pages',
        )
        .bind(projectId, projectId, projectId)
        .first(),
    ]);
    return Response.json(
      {
        project,
        missions,
        members,
        comments: comments.results,
        artifacts: artifacts.results,
        credentials: credentials.results,
        aliases: aliases.results,
        index,
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
      store = new MissionStore(auth.store.db, auth.user.id),
      input = inputSchema.parse(await jsonBody(request, 8_000_000));
    await store.project(input.project_id, 'write');
    let result: unknown;
    const requireId = () => z.uuid().parse(input.id);
    switch (input.action) {
      case 'move_board_task':
        result = await moveBoardTask(
          store,
          input.project_id,
          requireId(),
          input.value,
        );
        break;
      case 'import_dataset':
        result = await importLedSample(
          store,
          auth.settings.FILES,
          input.project_id,
          input.value === undefined
            ? undefined
            : sampleBatchSchema.parse(input.value),
        );
        break;
      case 'update_mission': {
        result = await updateMission(store, input.project_id, requireId());
        break;
      }
      case 'save_method': {
        const method = methodSchema.parse(input.value);
        result = crypto.randomUUID();
        await store.db
          .prepare('INSERT INTO research_methods VALUES(?,?,?,?,?,?)')
          .bind(
            result,
            input.project_id,
            method.title,
            JSON.stringify(method),
            store.owner,
            new Date().toISOString(),
          )
          .run();
        break;
      }
      case 'assign_task': {
        const task = await store.task(requireId(), 'write');
        if (task.project_id !== input.project_id || task.executor !== 'human')
          throw new HttpError(400, '请选择此项目的人工核查步骤。');
        const value = z
          .object({
            user_id: z.string().min(1).max(150),
            expected: z.number().int(),
          })
          .parse(input.value);
        if (
          !(await store.db
            .prepare(
              "SELECT u.id FROM user u WHERE u.id=? AND (EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=? AND m.user_id=u.id AND m.role IN ('editor','reviewer')) OR EXISTS(SELECT 1 FROM projects p WHERE p.id=? AND p.owner_id=u.id))",
            )
            .bind(value.user_id, input.project_id, input.project_id)
            .first())
        )
          throw new HttpError(400, '请选择仍在项目内且可以参与核查的成员。');
        const saved = await store.db
          .prepare(
            'UPDATE mission_tasks SET assignee=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
          )
          .bind(
            value.user_id,
            new Date().toISOString(),
            task.id,
            value.expected,
          )
          .run();
        if (!saved.meta.changes)
          throw new HttpError(409, '任务已经更新，请刷新。');
        await store.event(task.mission_id, task.id, 'assigned', value.user_id);
        result = task.id;
        break;
      }
      case 'evaluate_task': {
        const task = await store.task(requireId());
        if (task.project_id !== input.project_id)
          throw new HttpError(404, '任务不属于此项目。');
        result = await saveEvaluation(store, task.id, input.value);
        break;
      }
      case 'correct_task': {
        const task = await store.task(requireId());
        if (task.project_id !== input.project_id)
          throw new HttpError(404, '任务不属于此项目。');
        const value = z
          .object({
            data: z.unknown(),
            citations: z.array(citationSchema).max(100).optional(),
            reason: z.string().min(1).max(10000),
            expected: z.number().int(),
          })
          .parse(input.value);
        result = await store.correct(
          task.id,
          value.data,
          value.reason,
          value.expected,
          value.citations,
        );
        break;
      }
      case 'create_mission':
        result = await store.create(input.project_id, input.value);
        break;
      case 'control_mission': {
        const id = requireId();
        if ((await store.mission(id)).project_id !== input.project_id)
          throw new HttpError(404, '计划不属于此项目。');
        await store.control(
          id,
          z.enum(['start', 'pause', 'resume', 'cancel']).parse(input.value),
        );
        await dispatchMission(auth.settings, id);
        result = id;
        break;
      }
      case 'review_task': {
        const id = requireId(),
          task = await store.task(id);
        if (task.project_id !== input.project_id)
          throw new HttpError(404, '任务不属于此项目。');
        const value = z
          .object({
            decision: z.enum(['accepted', 'rejected']),
            reason: z.string().min(1).max(10000),
            expected: z.number().int(),
          })
          .parse(input.value);
        await store.review(id, value.decision, value.reason, value.expected);
        await dispatchMission(auth.settings, task.mission_id);
        result = id;
        break;
      }
      case 'retry_task': {
        const id = requireId(),
          task = await store.task(id);
        if (task.project_id !== input.project_id)
          throw new HttpError(404, '任务不属于此项目。');
        await store.retry(id, z.number().int().parse(input.value));
        await dispatchMission(auth.settings, task.mission_id);
        result = id;
        break;
      }
      case 'claim_task': {
        const id = requireId(),
          task = await store.task(id);
        if (task.project_id !== input.project_id || task.executor !== 'human')
          throw new HttpError(400, '请选择人工任务。');
        result = await store.claim(id, auth.user.id, 'human');
        break;
      }
      case 'repair_prose': {
        const id = requireId();
        if ((await store.task(id)).project_id !== input.project_id)
          throw new HttpError(404, '任务不属于此项目。');
        result = await repairProse(store, id, input.value);
        break;
      }
      case 'submit_human_task': {
        const id = requireId(),
          task = await store.task(id);
        if (task.project_id !== input.project_id)
          throw new HttpError(404, '任务不属于此项目。');
        result = await submitHumanReview(store, id, input.value);
        break;
      }
      case 'submit_task': {
        const id = requireId(),
          task = await store.task(id);
        if (task.project_id !== input.project_id)
          throw new HttpError(404, '任务不属于此项目。');
        const value = z
          .object({ lease: z.string(), result: z.unknown() })
          .parse(input.value);
        result = await store.submit(
          id,
          value.lease,
          auth.user.id,
          value.result,
        );
        break;
      }
      case 'reindex':
        result = await reindexProject(
          store,
          input.project_id,
          z.string().default('').parse(input.value),
        );
        break;
      case 'alias': {
        const value = z
          .object({
            term: z.string().trim().min(1).max(100),
            variants: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
            basis: z.string().max(3000),
          })
          .parse(input.value);
        await store.db
          .prepare(
            'INSERT INTO search_aliases VALUES(?,?,?,?,?,?,?) ON CONFLICT(project_id,term) DO UPDATE SET variants=excluded.variants,basis=excluded.basis',
          )
          .bind(
            crypto.randomUUID(),
            input.project_id,
            value.term,
            JSON.stringify(value.variants),
            value.basis,
            store.owner,
            new Date().toISOString(),
          )
          .run();
        result = true;
        break;
      }
      case 'member':
        result = await new TeamStore(store.db, store.owner).invite(
          input.project_id,
          input.value,
        );
        break;
      case 'remove_member':
        await new TeamStore(store.db, store.owner).removeMember(
          input.project_id,
          z.string().min(1).parse(input.value),
        );
        result = true;
        break;
      case 'comment':
        result = await postDiscussion(store, input.project_id, input.value);
        break;
      case 'resolve_comment':
        await store.project(input.project_id, 'review');
        await store.db
          .prepare(
            'UPDATE project_comments SET resolved=1 WHERE id=? AND project_id=?',
          )
          .bind(requireId(), input.project_id)
          .run();
        result = true;
        break;
      case 'create_credential': {
        const label = z.string().trim().min(1).max(100).parse(input.value),
          token =
            'cw_' +
            crypto.randomUUID().replaceAll('-', '') +
            crypto.randomUUID().replaceAll('-', ''),
          id = crypto.randomUUID();
        await store.db
          .prepare(
            'INSERT INTO agent_credentials(id,project_id,owner_id,label,token_hash,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            input.project_id,
            store.owner,
            label,
            await sha256(token),
            JSON.stringify(['read', 'claim', 'submit']),
            new Date(Date.now() + 30 * 86400000).toISOString(),
            new Date().toISOString(),
          )
          .run();
        result = { id, token, expires_in_days: 30 };
        break;
      }
      case 'revoke_credential':
        await store.db
          .prepare(
            'UPDATE agent_credentials SET revoked_at=? WHERE id=? AND project_id=? AND owner_id=?',
          )
          .bind(
            new Date().toISOString(),
            requireId(),
            input.project_id,
            store.owner,
          )
          .run();
        result = true;
        break;
      case 'grant_artifact': {
        await store.project(input.project_id, 'admin');
        const artifact = await store.db
          .prepare('SELECT id FROM artifacts WHERE id=? AND project_id=?')
          .bind(requireId(), input.project_id)
          .first();
        if (!artifact) throw new HttpError(404, '成果不存在。');
        const target = z.uuid().parse(input.value);
        await store.project(target, 'write');
        await store.db
          .prepare('INSERT OR IGNORE INTO artifact_grants VALUES(?,?,?,?)')
          .bind(requireId(), target, store.owner, new Date().toISOString())
          .run();
        result = true;
        break;
      }
    }
    return Response.json(
      { result },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
