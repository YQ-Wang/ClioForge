export const OCR_BATCH_PAGES = 100;
export const OCR_IMAGE_BYTES = 2_000_000;
export type OcrBatch = {
  id: string;
  project_id: string;
  owner_id: string;
  version_id: string;
  connection_id: string;
  locale: string;
  budget_units: number;
  price: string;
  status:
    | 'staging'
    | 'queued'
    | 'running'
    | 'paused'
    | 'cancelled'
    | 'completed'
    | 'attention'
    | 'stale';
  detail: string;
  created_at: string;
  updated_at: string;
};
export type OcrBatchPage = {
  page: number;
  run_id: string;
  status: 'pending' | 'staged' | 'running' | 'review' | 'attention';
  detail: string;
};
export type OcrBatchView = {
  batch: OcrBatch | null;
  pages: OcrBatchPage[];
  controllable: boolean;
  committed_units: number;
};
