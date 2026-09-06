'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The focusable source region captures native text selection, including keyboard selection. It does not emulate an editable field. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline annotation spans retain native text selection across their boundaries; buttons interrupt that selection. They implement button focus and keyboard activation. */

import { useEffect, useMemo, useRef } from 'react';
import {
  textHighlightSegments,
  type TextHighlight,
} from '@/lib/text-highlights';

export type TextSelection = { start: number; end: number; quote: string };

export default function HighlightedText({
  text,
  highlights,
  activeId,
  onSelect,
  onSelection,
  label,
}: {
  text: string;
  highlights: TextHighlight[];
  activeId?: string;
  onSelect: (id: string) => void;
  onSelection: (selection: TextSelection | null) => void;
  label: string;
}) {
  const root = useRef<HTMLElement>(null);
  const segments = useMemo(
    () => textHighlightSegments(text, highlights),
    [text, highlights],
  );
  const activeStart = segments.find(
    (segment) => activeId && segment.highlightIds.includes(activeId),
  )?.start;
  useEffect(() => {
    if (activeStart != null)
      root.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest' });
  }, [activeId, activeStart]);
  const selection = (): TextSelection | null => {
    const element = root.current;
    const selected = window.getSelection();
    if (
      !element ||
      !selected ||
      selected.isCollapsed ||
      selected.rangeCount !== 1
    )
      return null;
    const range = selected.getRangeAt(0);
    if (
      !element.contains(range.startContainer) ||
      !element.contains(range.endContainer)
    )
      return null;
    const prefix = document.createRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const quote = range.toString();
    const end = start + quote.length;
    if (!quote || text.slice(start, end) !== quote) return null;
    return { start, end, quote };
  };
  const activate = (ids: string[]) => {
    const current = activeId ? ids.indexOf(activeId) : -1;
    onSelect(ids[(current + 1) % ids.length]);
  };
  return (
    <section
      ref={root}
      className="highlighted-text"
      aria-label={label}
      tabIndex={0}
      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      onPointerUp={() => onSelection(selection())}
      onKeyUp={() => onSelection(selection())}
    >
      {segments.map((segment) =>
        segment.highlightIds.length ? (
          <span
            key={segment.start}
            className="text-highlight"
            role="button"
            tabIndex={0}
            data-active={
              activeId ? segment.highlightIds.includes(activeId) : false
            }
            data-overlap={segment.highlightIds.length > 1}
            aria-pressed={
              activeId ? segment.highlightIds.includes(activeId) : false
            }
            aria-label={`${label}: ${segment.text}`}
            onClick={() => {
              // A drag ending on a highlight should remain a text selection.
              if (window.getSelection()?.isCollapsed !== false)
                activate(segment.highlightIds);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate(segment.highlightIds);
              }
            }}
          >
            {segment.text}
          </span>
        ) : (
          segment.text
        ),
      )}
    </section>
  );
}
