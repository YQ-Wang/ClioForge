import type { ResearchStore } from './store';
import type { Claim } from './workbench-types';

export type DraftIssue =
  | 'needs_review'
  | 'missing_evidence'
  | 'invalid_source'
  | 'stale_source'
  | 'quote_mismatch'
  | 'too_many_evidence'
  | 'too_many_sources';
export type DraftClaim = Pick<
  Claim,
  'id' | 'question_id' | 'body' | 'kind' | 'status'
> & {
  evidence_count: number;
  source_count: number;
  issues: DraftIssue[];
};

// This is an actionable preflight, not scholarly approval. Preview and execution
// still validate the selected bundle and its frozen source versions independently.
export async function manuscriptReadiness(
  store: ResearchStore,
  project: string,
) {
  await store.project(project);
  const rows = (
    await store.db
      .prepare(`
    WITH selected AS (
      SELECT id,question_id,body,kind,status FROM claims
      WHERE project_id=? AND kind<>'next_step'
      ORDER BY created_at DESC,id LIMIT 501
    )
    SELECT c.*, COUNT(DISTINCT ce.evidence_id) evidence_count,
      COUNT(DISTINCT e.source_id) source_count,
      MAX(CASE WHEN ce.id IS NOT NULL AND v.id IS NULL THEN 1 ELSE 0 END) invalid_source,
      MAX(CASE WHEN EXISTS (
        SELECT 1 FROM source_versions newer WHERE newer.project_id=?
        AND newer.source_id=e.source_id AND newer.revision>v.revision
      ) THEN 1 ELSE 0 END) stale_source,
      MAX(CASE WHEN v.id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM json_each(v.pages) p
        WHERE json_extract(p.value,'$.page')=e.page
        AND instr(json_extract(p.value,'$.text'),e.quote)>0
      ) THEN 1 ELSE 0 END) quote_mismatch
    FROM selected c
    LEFT JOIN claim_evidence ce ON ce.claim_id=c.id AND ce.project_id=?
    LEFT JOIN evidence e ON e.id=ce.evidence_id AND e.project_id=?
    LEFT JOIN source_versions v ON v.id=e.version_id
      AND v.source_id=e.source_id AND v.project_id=?
    GROUP BY c.id ORDER BY c.id
  `)
      .bind(project, project, project, project, project)
      .all<
        Omit<DraftClaim, 'issues'> & {
          invalid_source: number;
          stale_source: number;
          quote_mismatch: number;
        }
      >()
  ).results;
  const claims: DraftClaim[] = rows.slice(0, 500).map((row) => {
    const issues: DraftIssue[] = [];
    if (row.status !== 'reviewed') issues.push('needs_review');
    if (!row.evidence_count) issues.push('missing_evidence');
    if (row.invalid_source) issues.push('invalid_source');
    if (row.stale_source) issues.push('stale_source');
    if (row.quote_mismatch) issues.push('quote_mismatch');
    if (row.evidence_count > 30) issues.push('too_many_evidence');
    if (row.source_count > 10) issues.push('too_many_sources');
    return {
      id: row.id,
      question_id: row.question_id,
      body: row.body,
      kind: row.kind,
      status: row.status,
      evidence_count: row.evidence_count,
      source_count: row.source_count,
      issues,
    };
  });
  return { claims, truncated: rows.length > 500 };
}
