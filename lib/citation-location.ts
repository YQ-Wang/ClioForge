import type { TaskResult } from './platform/types';

export type CitationSpan = { start: number; end: number };

export function validCitationSpan(
  text: string,
  start: number,
  end: number,
): CitationSpan | null {
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= text.length &&
    end - start <= 10000
    ? { start, end }
    : null;
}

// A legacy quote without an offset is locatable only when it occurs once.
// Never move a stale explicit anchor to another occurrence of the same words.
export function citationSpan(
  text: string,
  citation: Pick<TaskResult['citations'][number], 'quote' | 'start'>,
): CitationSpan | null {
  const start = citation.start ?? text.indexOf(citation.quote);
  const end = start + citation.quote.length;
  if (
    !validCitationSpan(text, start, end) ||
    text.slice(start, end) !== citation.quote
  )
    return null;
  if (
    citation.start === undefined &&
    text.indexOf(citation.quote, start + 1) !== -1
  )
    return null;
  return { start, end };
}
