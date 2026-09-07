export type Region = { x: number; y: number; width: number; height: number };
export type CSL = {
  [field: string]: unknown;
  id?: string | number;
  type: string;
  title: string;
  author?: { literal?: string; family?: string; given?: string }[];
  issued?: {
    raw?: string;
    literal?: string;
    circa?: number | boolean;
    'date-parts'?: number[][];
  };
  archive?: string;
  archive_location?: string;
  'archive-place'?: string;
  publisher?: string;
  'publisher-place'?: string;
  'container-title'?: string;
  edition?: string;
  volume?: string;
  issue?: string;
  page?: string;
  URL?: string;
  DOI?: string;
  language?: string;
  rights?: string;
  abstract?: string;
};
export type BibliographyEntry = {
  id: string;
  project_id: string;
  source_id: string | null;
  csl: CSL;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type Question = {
  id: string;
  project_id: string;
  title: string;
  detail: string;
  revision: number;
  created_at: string;
};
export type Claim = {
  id: string;
  project_id: string;
  question_id: string;
  body: string;
  kind: 'claim' | 'alternative' | 'next_step';
  status: 'draft' | 'reviewed';
  revision: number;
  created_at: string;
};
export type ClaimEvidence = {
  id: string;
  claim_id: string;
  evidence_id: string;
  relation: 'supports' | 'challenges' | 'context';
  created_at: string;
};
export type SourceRelation = {
  id: string;
  from_source: string;
  to_source: string;
  kind: 'quotes' | 'reprint' | 'translation' | 'shared_origin';
  certainty: 'suspected' | 'confirmed';
  basis: string;
  created_at: string;
};
export type SearchLog = {
  id: string;
  query: string;
  scope: string;
  searched_at: string;
  outcome: 'found' | 'no_hits' | 'unavailable' | 'partial';
  result_count: number | null;
  notes: string;
  created_at: string;
};
export type EvidenceReview = { evidence_id: string; version_id: string };
export type Job = {
  locale?: 'zh-CN' | 'en';
  id: string;
  owner_id: string;
  project_id: string;
  model_id: string;
  model_snapshot: {
    execution_version?: number;
    mission_task?: { id: string; attempt: number };
    page_refs?: { version_id: string; page: number }[];
    output_format?: 'json';
    output_schema?:
      | 'reading_answer_v1'
      | 'research_discussion_v1'
      | 'claim_review_v1';
    provider: string;
    model_id: string;
    effort?: import('./model-routing').ThinkingEffort;
  };
  version_ids: string[];
  prompt: string;
  status:
    | 'queued'
    | 'running'
    | 'paused'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'uncertain';
  stage: string;
  result: string | null;
  error: string | null;
  reserved_units: number;
  input_rate: number;
  output_rate: number;
  max_output: number;
  input_tokens: number;
  output_tokens: number;
  attempt: number;
  started_at: string | null;
  created_at: string;
};
export type Budget = {
  project_id: string;
  limit_units: number;
  committed_units: number;
};
export type Watch = {
  id: string;
  query: string;
  enabled: number;
  interval_days: number;
  checked_at: string | null;
  next_run: string;
  error: string | null;
};
export type InboxItem = {
  id: string;
  kind: 'task' | 'watch';
  title: string;
  body: string;
  url: string;
  status: 'pending' | 'accepted' | 'dismissed';
  created_at: string;
};
export type WorkbenchData = {
  bibliography: BibliographyEntry[];
  questions: Question[];
  claims: Claim[];
  claim_evidence: ClaimEvidence[];
  source_relations: SourceRelation[];
  search_logs: SearchLog[];
  evidence_reviews: EvidenceReview[];
  jobs: Job[];
  budget: Budget | null;
  watches: Watch[];
  inbox: InboxItem[];
};
