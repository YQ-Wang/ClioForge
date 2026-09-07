import { withNoteState, type NoteState } from './notes';
import type {
  CollectionPage,
  ProjectCollection,
  CollectionCheckpoint,
} from './project-collections';
import type { WorkbenchData } from './workbench-types';
import type {
  Model,
  Run,
  Project,
  Source,
  SourceVersion,
  Note,
  Evidence,
} from './types';
export type Snapshot = {
  project: Project;
  sources: Source[];
  source_versions: SourceVersion[];
  notes: Note[];
  evidence: Evidence[];
  research_runs: Run[];
  models: Model[];
};
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}
export async function api<T = { run: Run }>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  let data: T & { error?: string };
  try {
    data = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      '服务器暂时无法响应，请稍后重试。',
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      (data && typeof data === 'object' && data.error) || '操作失败。',
      response.status,
      Number(response.headers.get('Retry-After')) || undefined,
    );
  return data;
}
export async function rpc(action: string, input: object) {
  try {
    const data = await api<{ result: unknown }>('/api/workspace', {
      action,
      ...input,
    });
    return { data: data.result, error: null };
  } catch (e) {
    return {
      data: null,
      error: { message: e instanceof Error ? e.message : '操作失败。' },
    };
  }
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function uploadOriginal(
  projectId: string,
  file: File,
  mediaType: string,
) {
  const response = await fetch(
    `/api/files?project_id=${encodeURIComponent(projectId)}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': mediaType },
      body: file,
    },
  );
  const result = (await response.json()) as {
    id: string;
    path: string;
    error?: string;
  };
  if (!response.ok) throw new Error(result.error || '原件上传失败。');
  return result;
}
export async function readOriginal(sourceId: string) {
  const response = await fetch(
    `/api/files?source_id=${encodeURIComponent(sourceId)}`,
    { credentials: 'same-origin' },
  );
  if (!response.ok) throw new Error('无法读取原件。');
  return response.blob();
}

// Only publish a collection once all its pages have arrived. A failed continuation
// must not look like a complete (but silently truncated) library or export.
export async function projectRows<T>(
  projectId: string,
  collection: ProjectCollection,
  signal?: AbortSignal,
  before: string | null = null,
): Promise<T[]> {
  const rows: T[] = [];
  let next: string | null = before;
  do {
    const params = new URLSearchParams({ project_id: projectId, collection });
    if (next) params.set('before', next);
    const page: CollectionPage<T> = await api(
      `/api/workspace?${params}`,
      undefined,
      'GET',
      signal,
    );
    if (page.next && next && Number(page.next) >= Number(next))
      throw new ApiError('分页位置无效，请刷新重试。', 502);
    rows.push(...page.rows);
    next = page.next;
  } while (next);
  return rows;
}
export type SnapshotHeader = {
  project: Project;
  models: Model[];
  checkpoint: CollectionCheckpoint;
};
export function projectHeader(projectId: string, signal?: AbortSignal) {
  return api<SnapshotHeader>(
    `/api/workspace?project_id=${encodeURIComponent(projectId)}`,
    undefined,
    'GET',
    signal,
  );
}
export async function loadSnapshot(
  projectId: string,
  signal?: AbortSignal,
  header?: SnapshotHeader,
): Promise<Snapshot> {
  header ??= await projectHeader(projectId, signal);
  const c = header.checkpoint;
  const [sources, versions, notes, states, evidence, runs] = await Promise.all([
    projectRows<Source>(projectId, 'sources', signal, c.sources),
    projectRows<SourceVersion>(
      projectId,
      'source_versions',
      signal,
      c.source_versions,
    ),
    projectRows<Note>(projectId, 'notes', signal, c.notes),
    projectRows<NoteState>(projectId, 'note_state', signal, c.note_state),
    projectRows<Evidence>(projectId, 'evidence', signal, c.evidence),
    projectRows<Run>(projectId, 'research_runs', signal, c.research_runs),
  ]);
  const newest = <T extends { created_at: string }>(rows: T[]) =>
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    ...header,
    sources: newest(sources),
    source_versions: newest(versions),
    notes: withNoteState(newest(notes), states),
    evidence: newest(evidence),
    research_runs: newest(runs),
  };
}
export async function loadWorkbench(
  projectId: string,
  signal?: AbortSignal,
  checkpoint?: CollectionCheckpoint,
): Promise<WorkbenchData> {
  checkpoint ??= (await projectHeader(projectId, signal)).checkpoint;
  const collections = {
    bibliography: 'bibliography_entries',
    questions: 'research_questions',
    claims: 'claims',
    claim_evidence: 'claim_evidence',
    source_relations: 'source_relations',
    search_logs: 'search_logs',
    evidence_reviews: 'evidence_reviews',
    jobs: 'research_jobs',
    watches: 'research_watches',
    inbox: 'research_inbox',
  } as const;
  const [header, rows] = await Promise.all([
    api<Pick<WorkbenchData, 'budget'>>(
      `/api/workbench?project_id=${encodeURIComponent(projectId)}`,
      undefined,
      'GET',
      signal,
    ),
    Promise.all(
      Object.entries(collections).map(async ([key, collection]) => [
        key,
        await projectRows(
          projectId,
          collection,
          signal,
          checkpoint![collection],
        ),
      ]),
    ),
  ]);
  return { ...header, ...Object.fromEntries(rows) } as WorkbenchData;
}
