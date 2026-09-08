import { z } from 'zod';
import { evaluationInput } from '../platform/evaluation';
import { recipeKinds } from '../platform/research-recipes';
import type { MissionStore } from '../platform/missions';

export type ModelEvidence = {
  model_id: string;
  label: string;
  samples: number;
  errors: number;
  review_minutes: number;
  cost_units: number;
};
export async function modelEvidence(
  store: MissionStore,
  projectId: string,
  recipe: string,
): Promise<ModelEvidence[]> {
  await store.project(projectId);
  z.enum(recipeKinds).parse(recipe);
  // Only the most recent evaluation of an unchanged result counts. A changed
  // connection must not inherit measurements made with a different model.
  const rows = (
    await store.db
      .prepare(`SELECT e.config,e.metrics,t.cost_units,m.id model_id,m.label,m.provider,m.model_id configured_model
    FROM evaluation_runs e JOIN mission_tasks t ON t.id=json_extract(e.config,'$.task_id')
    JOIN model_connections m ON m.id=json_extract(e.config,'$.model_id') AND m.owner_id=?
    WHERE e.project_id=? AND t.project_id=e.project_id AND json_extract(e.config,'$.recipe')=?
      AND json_extract(e.results,'$.result')=t.result AND t.status IN ('succeeded','review','accepted')
      AND NOT EXISTS(SELECT 1 FROM evaluation_runs newer WHERE newer.project_id=e.project_id AND json_extract(newer.config,'$.task_id')=t.id AND (newer.created_at>e.created_at OR (newer.created_at=e.created_at AND newer.rowid>e.rowid)))
    ORDER BY e.created_at DESC LIMIT 1000`)
      .bind(store.owner, projectId, recipe)
      .all<{
        config: string;
        metrics: string;
        cost_units: number;
        model_id: string;
        label: string;
        provider: string;
        configured_model: string;
      }>()
  ).results;
  const groups = new Map<string, ModelEvidence>();
  for (const row of rows) {
    const config = JSON.parse(row.config) as {
      provider?: string;
      model_name?: string;
    };
    if (
      config.provider !== row.provider ||
      config.model_name !== row.configured_model
    )
      continue;
    const metrics = evaluationInput.parse(JSON.parse(row.metrics));
    const group = groups.get(row.model_id) || {
      model_id: row.model_id,
      label: row.label,
      samples: 0,
      errors: 0,
      review_minutes: 0,
      cost_units: 0,
    };
    group.samples++;
    group.errors +=
      metrics.missed +
      metrics.false_inclusions +
      metrics.wrong_values +
      metrics.wrong_categories;
    group.review_minutes += metrics.review_minutes;
    group.cost_units += row.cost_units;
    groups.set(row.model_id, group);
  }
  return [...groups.values()];
}
