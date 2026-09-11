import { z } from 'zod';
import { MAX_FILE_BYTES } from './files';
export const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
export const MAX_METADATA_BYTES = 8 * 1024 * 1024;
export const packageManifest = z.object({
  format: z.enum(['clioforge-research-package', 'canwoo-research-package']),
  version: z.literal(1),
  files: z
    .array(
      z.object({
        path: z.string().max(200),
        bytes: z.number().int().nonnegative().max(MAX_FILE_BYTES),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        source_id: z.uuid().optional(),
        title: z.string().optional(),
      }),
    )
    .min(1)
    .max(501),
});
export const packageMetadata = z.object({
  format: z.enum(['clioforge-research-package', 'canwoo-research-package']),
  version: z.literal(1),
  exported_at: z.string(),
  project: z.object({
    id: z.uuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(10000).default(''),
  }),
  people: z
    .array(z.object({ id: z.string().max(200), name: z.string().max(200) }))
    .max(1000)
    .optional(),
  records: z.record(
    z.string(),
    z.array(z.record(z.string(), z.unknown())).max(50000),
  ),
});
export type BackupMetadata = z.infer<typeof packageMetadata>;
export type BackupManifest = z.infer<typeof packageManifest>;
// Dependency order is intentional; archive-supplied table/column identifiers
// are never interpolated into SQL without checking this allowlist and schema.
export const restoreTables = [
  'sources',
  'source_groups',
  'source_organization',
  'source_versions',
  'source_pages',
  'notes',
  'note_state',
  'evidence',
  'bibliography_entries',
  'bibliography_history',
  'research_questions',
  'claims',
  'claim_evidence',
  'source_relations',
  'search_logs',
  'evidence_reviews',
  'research_runs',
  'direct_run_costs',
  'research_jobs',
  'project_budgets',
  'research_watches',
  'research_inbox',
  'missions',
  'library_records',
  'source_search_runs',
  'source_search_candidates',
  'source_leads',
  'mission_tasks',
  'mission_boards',
  'research_methods',
  'task_corrections',
  'claim_assessments',
  'task_dependencies',
  'task_inputs',
  'task_events',
  'task_reviews',
  'task_attempts',
  'project_comments',
  'search_aliases',
  'artifacts',
  'artifact_reviews',
  'artifact_dependencies',
  'artifact_lineage',
  'project_snapshots',
  'research_branches',
  'branch_reviews',
  'entities',
  'entity_relations',
  'evaluation_runs',
  'source_origins',
  'ingestion_items',
] as const;
export function checkManifest(manifest: BackupManifest) {
  const names = new Set<string>();
  let total = 0;
  for (const file of manifest.files) {
    if (
      names.has(file.path) ||
      !/^(project\.json|originals\/[a-f0-9-]{36}\.(pdf|txt|md|png|jpg|webp))$/.test(
        file.path,
      )
    )
      throw new Error('备份包含重复或无效的文件路径。');
    if (file.path === 'project.json' && file.bytes > MAX_METADATA_BYTES)
      throw new Error('项目记录超过 8 MB。');
    names.add(file.path);
    total += file.bytes;
  }
  if (!names.has('project.json') || total > MAX_PACKAGE_BYTES)
    throw new Error('备份不完整或超过 512 MB。');
}
