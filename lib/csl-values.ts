import type { CSL } from './workbench-types';

export function dateLabel(date?: CSL['issued']) {
  return (
    date?.literal ||
    date?.raw ||
    date?.['date-parts']?.map((parts) => parts.join('-')).join(' / ') ||
    ''
  );
}

export function editDate(
  value: string,
  previous?: CSL['issued'],
): CSL['issued'] {
  if (value === dateLabel(previous)) return previous;
  const text = value.trim();
  if (!text) return undefined;
  // Only explicit Gregorian dates receive numeric precision. Retain original eras and uncertainty.
  if (
    /^\d{4}(?:-(?:0?[1-9]|1[0-2])(?:-(?:0?[1-9]|[12]\d|3[01]))?)?$/.test(text)
  )
    return { 'date-parts': [text.split('-').map(Number)] };
  return { literal: text };
}
