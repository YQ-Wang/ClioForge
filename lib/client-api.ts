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
  ) {
    super(message);
  }
}
export async function api<T = { run: Run }>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new ApiError(data.error || '操作失败。', response.status);
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
