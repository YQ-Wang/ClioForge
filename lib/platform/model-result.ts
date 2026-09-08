import { priorResearch, researchPassages } from '../harness/research-tools';
import { decodeTask } from './missions';
import {
  DOSSIER_OUTPUT_SCHEMA,
  dossierPassages,
  resolveDossierCitations,
} from '../dossier-output';
import { resultSchema, type MissionTask } from './types';
import { alignCitation } from './citation-alignment';
import type { MissionStore } from './missions';
import type { Job } from '../workbench-types';

export async function savedModelResult(
  store: MissionStore,
  task: MissionTask,
  job: Job,
) {
  if (
    job.status !== 'succeeded' ||
    job.project_id !== task.project_id ||
    job.owner_id !== store.owner ||
    job.model_snapshot.mission_task?.id !== task.id ||
    job.model_snapshot.mission_task.attempt !== task.attempt
  )
    throw new Error(
      'Saved response does not belong to this execution attempt.',
    );
  // Derive cost from retained jobs so a crash during handoff cannot count it twice.
  await store.db
    .prepare(
      "UPDATE mission_tasks SET cost_units=(SELECT COALESCE(SUM(j.reserved_units),0) FROM research_jobs j WHERE j.project_id=? AND j.owner_id=? AND j.status='succeeded' AND json_extract(j.model_snapshot,'$.mission_task.id')=?) WHERE id=?",
    )
    .bind(task.project_id, store.owner, task.id, task.id)
    .run();
  const result = resultSchema.parse(
    JSON.parse(
      (job.result || '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''),
    ),
  );
  result.checks = [];
  if (job.model_snapshot.output_schema === 'research_report_v1') {
    const deps = (
      await store.db
        .prepare(
          'SELECT p.* FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=?',
        )
        .bind(task.id)
        .all()
    ).results.map(decodeTask);
    return resolveDossierCitations(
      result,
      researchPassages(priorResearch(deps)),
      task.input.locale,
      24,
    );
  }
  if (job.model_snapshot.output_schema === DOSSIER_OUTPUT_SCHEMA) {
    const versions = await Promise.all(
      [...new Set(job.version_ids)].map((id) => store.version(id)),
    );
    return resolveDossierCitations(
      result,
      dossierPassages(versions, job.model_snapshot.page_refs),
      task.input.locale,
    );
  }
  for (const citation of result.citations) {
    if (!job.version_ids.includes(citation.version_id)) continue;
    const version = await store.version(citation.version_id);
    const page = version.pages.find((p) => p.page === citation.page);
    if (page && citation.start === undefined) {
      const aligned = alignCitation(page.text, citation.quote);
      if (aligned) Object.assign(citation, aligned);
    }
  }
  return result;
}
