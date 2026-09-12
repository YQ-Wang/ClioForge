import type { SourceVersion } from './types';
// Source originals are immutable. A correction on another page must not force
// researchers to pay for OCR again, but edits to this page invalidate reuse.
export function unchangedOcrPage(
  candidate: Pick<
    SourceVersion,
    'source_id' | 'project_id' | 'revision' | 'pages'
  >,
  target: Pick<
    SourceVersion,
    'source_id' | 'project_id' | 'revision' | 'pages'
  >,
  page: number,
) {
  if (
    candidate.source_id !== target.source_id ||
    candidate.project_id !== target.project_id ||
    candidate.revision > target.revision
  )
    return false;
  const original = candidate.pages.find((p) => p.page === page);
  const current = target.pages.find((p) => p.page === page);
  return !!original && !!current && original.text === current.text;
}
