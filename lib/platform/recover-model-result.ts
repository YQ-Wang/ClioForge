import { MissionStore } from './missions';
import { savedModelResult } from './model-result';
import { jobById, type JobsEnv } from '../jobs';
import { sha256 } from './search';
import { assertConversationContext } from '../task-conversation';
import { runMaintenanceSteps } from '../background-maintenance';

export const expiredExecution =
  'Execution lease expired; inspect the previous attempt before retrying.';

// Only a confirmed, persisted response can be recovered. Never replay an external call.
export async function recoverModelResults(env: JobsEnv) {
  const rows = (
    await env.DB.prepare(`
    SELECT t.id,m.created_by,j.id job_id,t.attempt FROM mission_tasks t
    JOIN missions m ON m.id=t.mission_id
    JOIN research_jobs j ON j.project_id=t.project_id AND j.owner_id=m.created_by
      AND json_extract(j.model_snapshot,'$.mission_task.id')=t.id
      AND json_extract(j.model_snapshot,'$.mission_task.attempt')=t.attempt
    WHERE m.status='active' AND t.executor='model' AND t.status='uncertain'
      AND t.error=? AND j.status='succeeded' AND j.result IS NOT NULL
    ORDER BY t.updated_at,t.id LIMIT 20
  `)
      .bind(expiredExecution)
      .all<{
        id: string;
        created_by: string;
        job_id: string;
        attempt: number;
      }>()
  ).results;
  await runMaintenanceSteps(
    rows.map((row) => ({
      name: `recover_saved_response:${row.id}`,
      run: async () => {
        const store = new MissionStore(env.DB, row.created_by);
        await store.task(row.id, 'write');
        // Uncertain tasks are not covered by the ordinary source-change trigger.
        const outdated =
          await env.DB.prepare(`UPDATE mission_tasks SET status='stale',revision=revision+1,updated_at=? WHERE id=? AND status='uncertain' AND error=? AND EXISTS (
        SELECT 1 FROM task_inputs ti JOIN source_versions v ON v.id=ti.version_id
        JOIN source_versions newer ON newer.source_id=v.source_id AND newer.project_id=v.project_id AND newer.revision>v.revision WHERE ti.task_id=mission_tasks.id
      )`)
            .bind(new Date().toISOString(), row.id, expiredExecution)
            .run();
        if (outdated.meta.changes) return;
        const lease = crypto.randomUUID() + crypto.randomUUID(),
          hash = await sha256(lease);
        const date = new Date().toISOString();
        const changed =
          await env.DB.prepare(`UPDATE mission_tasks SET status='running',claimed_by='canwoo:model',lease_hash=?,lease_until=?,revision=revision+1,updated_at=?
        WHERE id=? AND attempt=? AND status='uncertain' AND error=?
          AND EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_id AND m.status='active')
          AND NOT EXISTS(SELECT 1 FROM task_inputs ti JOIN source_versions v ON v.id=ti.version_id JOIN source_versions newer ON newer.source_id=v.source_id AND newer.project_id=v.project_id AND newer.revision>v.revision WHERE ti.task_id=mission_tasks.id)
          AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=mission_tasks.id AND p.status NOT IN ('succeeded','accepted'))`)
            .bind(
              hash,
              new Date(Date.now() + 300_000).toISOString(),
              date,
              row.id,
              row.attempt,
              expiredExecution,
            )
            .run();
        if (!changed.meta.changes) return;
        try {
          const task = await store.task(row.id),
            job = await jobById(env.DB, row.job_id, store.owner);
          if (!job) throw new Error('Saved response unavailable.');
          const attempt = await env.DB.prepare(
            'SELECT input,dependencies FROM task_attempts WHERE task_id=? AND attempt=?',
          )
            .bind(task.id, task.attempt)
            .first<{ input: string; dependencies: string }>();
          const deps = (
            await env.DB.prepare(
              'SELECT p.id,p.attempt,p.input,p.result FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=?',
            )
              .bind(task.id)
              .all<{
                id: string;
                attempt: number;
                input: string;
                result: string | null;
              }>()
          ).results;
          const snapshots = attempt
            ? (JSON.parse(attempt.dependencies) as {
                id: string;
                attempt: number;
                input: unknown;
                result: unknown;
              }[])
            : [];
          if (
            !attempt ||
            JSON.stringify(JSON.parse(attempt.input)) !==
              JSON.stringify(task.input) ||
            snapshots.length !== deps.length ||
            deps.some((dep) => {
              const prior = snapshots.find((s) => s.id === dep.id);
              return (
                !prior ||
                prior.attempt !== dep.attempt ||
                JSON.stringify(prior.input) !==
                  JSON.stringify(JSON.parse(dep.input)) ||
                JSON.stringify(prior.result) !==
                  JSON.stringify(dep.result ? JSON.parse(dep.result) : null)
              );
            })
          )
            throw new Error(
              'Execution inputs or upstream results changed; saved response was not applied.',
            );
          await assertConversationContext(store, task);
          const result = await savedModelResult(store, task, job);
          await store.submit(task.id, lease, 'canwoo:model', result);
          await store.event(
            task.mission_id,
            task.id,
            'response_recovered',
            'Continued from the saved model response; no new model request.',
          );
        } catch (error) {
          const saved = await env.DB.prepare(
            "UPDATE mission_tasks SET status='failed',error=?,lease_hash=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE id=? AND attempt=? AND status='running' AND lease_hash=?",
          )
            .bind(
              'Saved model response could not be validated: ' +
                (error instanceof Error
                  ? error.message.slice(0, 350)
                  : 'Check the execution record.'),
              new Date().toISOString(),
              row.id,
              row.attempt,
              hash,
            )
            .run();
          if (!saved.meta.changes) throw error;
        }
      },
    })),
  );
}
