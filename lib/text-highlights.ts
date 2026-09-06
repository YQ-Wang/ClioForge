/** Anchors use JavaScript's UTF-16 offsets into the exact stored page text. */
export type TextHighlight = {
  id: string;
  start: number;
  end: number;
  quote: string;
};

export type HighlightedSegment = {
  start: number;
  end: number;
  text: string;
  highlightIds: string[];
};

/** Never relocate a stale quote to a different occurrence of the same words. */
export function validTextHighlights(
  text: string,
  highlights: readonly TextHighlight[],
): TextHighlight[] {
  const counts = new Map<string, number>();
  for (const item of highlights)
    counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  return highlights.filter(
    (item) =>
      typeof item.id === 'string' &&
      item.id.length > 0 &&
      counts.get(item.id) === 1 &&
      Number.isSafeInteger(item.start) &&
      Number.isSafeInteger(item.end) &&
      item.start >= 0 &&
      item.end > item.start &&
      item.end <= text.length &&
      typeof item.quote === 'string' &&
      text.slice(item.start, item.end) === item.quote,
  );
}

/** Split overlaps without duplicating text, so browser selection keeps its offsets. */
export function textHighlightSegments(
  text: string,
  highlights: readonly TextHighlight[],
): HighlightedSegment[] {
  if (!text) return [];
  const anchors = validTextHighlights(text, highlights);
  const positions = new Map<number, { starts: string[]; ends: string[] }>();
  const at = (offset: number) => {
    const existing = positions.get(offset);
    if (existing) return existing;
    const entry = { starts: [] as string[], ends: [] as string[] };
    positions.set(offset, entry);
    return entry;
  };
  at(0);
  at(text.length);
  const order = new Map<string, number>();
  anchors.forEach((anchor, index) => {
    order.set(anchor.id, index);
    at(anchor.start).starts.push(anchor.id);
    at(anchor.end).ends.push(anchor.id);
  });
  const boundaries = [...positions.keys()].sort((a, b) => a - b);
  const active = new Set<string>();
  const result: HighlightedSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const event = positions.get(start)!;
    for (const id of event.ends) active.delete(id);
    for (const id of event.starts) active.add(id);
    result.push({
      start,
      end,
      text: text.slice(start, end),
      highlightIds: [...active].sort((a, b) => order.get(a)! - order.get(b)!),
    });
  }
  return result;
}
