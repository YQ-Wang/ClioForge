export type PageText = { page: number; text: string };
export type Project = {
  id: string;
  role?: string;
  title: string;
  description: string;
  created_at: string;
};
export type Source = {
  id: string;
  project_id: string;
  title: string;
  object_path: string;
  media_type: string;
  created_at: string;
};
export type SourceVersion = {
  id: string;
  source_id: string;
  project_id: string;
  revision: number;
  pages: PageText[];
  method: string;
  created_at: string;
};
export type Note = {
  id: string;
  root_id?: string;
  pinned?: boolean;
  archived?: boolean;
  project_id: string;
  title: string;
  body: string;
  document?: string | null;
  revision: number;
  parent_id: string | null;
  created_at: string;
};
export type Evidence = {
  id: string;
  project_id: string;
  source_id: string;
  version_id: string;
  page: number;
  quote: string;
  question: string;
  interpretation: string;
  relation: 'supports' | 'challenges' | 'context';
  quote_start?: number | null;
  quote_end?: number | null;
  region?: import('./workbench-types').Region | null;
  created_at: string;
};
export type Provider = 'openai' | 'anthropic' | 'google' | 'openrouter';
export type Model = {
  id: string;
  label: string;
  provider: Provider;
  model_id: string;
  vision: boolean;
  key_hint: string;
  created_at: string;
};
export type Run = {
  id: string;
  project_id: string;
  status: 'running' | 'succeeded' | 'failed';
  kind: 'analysis' | 'ocr';
  prompt: string;
  result: string | null;
  error: string | null;
  model_snapshot: {
    provider: string;
    model_id: string;
    page?: number;
    input_rate?: number;
    output_rate?: number;
    max_output?: number;
  };
  source_version_ids: string[];
  input_tokens: number;
  output_tokens: number;
  created_at: string;
};
