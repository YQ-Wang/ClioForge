import type { SourceVersion } from './types';
import { validCitationSpan } from './citation-location';

export type SourceRoute =
  | { kind: 'inactive' | 'default' | 'unavailable' }
  | {
      kind: 'source';
      sourceId: string;
      versionId: string;
      page: number;
      annotationId?: string;
      start?: number;
      end?: number;
    };

export function sourceRoute(
  search: string,
  projectId: string,
  versions: Pick<SourceVersion, 'id' | 'project_id' | 'source_id' | 'pages'>[],
): SourceRoute {
  const params = new URLSearchParams(search);
  if (params.get('project') !== projectId || params.get('tab') !== 'sources')
    return { kind: 'inactive' };
  if (!params.has('version')) return { kind: 'default' };
  const version = versions.find(
    (item) =>
      item.id === params.get('version') && item.project_id === projectId,
  );
  const page = Number(params.get('page') || 1);
  if (
    !version ||
    !Number.isInteger(page) ||
    !version.pages.some((item) => item.page === page)
  )
    return { kind: 'unavailable' };
  return {
    kind: 'source',
    sourceId: version.source_id,
    versionId: version.id,
    page,
    annotationId:
      params.get('annotation') || params.get('evidence') || undefined,
    ...(params.has('start') && params.has('end')
      ? validCitationSpan(
          version.pages.find((item) => item.page === page)!.text,
          Number(params.get('start')),
          Number(params.get('end')),
        ) || {}
      : {}),
  };
}

// An incoming Back/Forward location must be applied before a kept reader may
// publish its own current page. Also check the live URL, not a render closure.
export function canPublishReaderLocation(
  currentSearch: string,
  appliedSearch: string,
  projectId: string,
) {
  const params = new URLSearchParams(currentSearch);
  return (
    currentSearch === appliedSearch &&
    params.get('project') === projectId &&
    params.get('tab') === 'sources'
  );
}
