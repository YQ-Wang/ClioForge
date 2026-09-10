'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The focusable source region captures native text selection, including keyboard selection. It does not emulate an editable field. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline annotation spans retain native text selection across their boundaries; buttons interrupt that selection. They implement button focus and keyboard activation. */

import { Fragment, useEffect, useMemo, useRef } from 'react';
import {
  textHighlightSegments,
  type TextHighlight,
} from '@/lib/text-highlights';

const citationFocusId = 'clioforge:temporary-citation-focus';

export type TextSelection = { start: number; end: number; quote: string };

export default function HighlightedText({
  text,
  highlights,
  activeId,
  focus,
  focusKey,
  onSelect,
  onSelection,
  label,
}: {
  text: string;
  highlights: TextHighlight[];
  activeId?: string;
  focus?: TextSelection;
  focusKey?: string;
  onSelect: (id: string) => void;
  onSelection: (selection: TextSelection | null) => void;
  label: string;
}) {
  const root = useRef<HTMLElement>(null);
  const lastFocused = useRef('');
  const segments = useMemo(
    () =>
      textHighlightSegments(
        text,
        focus ? [...highlights, { ...focus, id: citationFocusId }] : highlights,
      ),
    [text, highlights, focus],
  );
  useEffect(() => {
    const key = JSON.stringify([
      focusKey,
      focus?.start,
      focus?.end,
      focus?.quote,
    ]);
    const mark = root.current?.querySelector('[data-citation-focus]');
    // Reader state reconciliation can briefly hide the source. Do not pull the
    // reader back to the quotation after an annotation click or a polling update.
    if (!mark || !mark.getClientRects().length || lastFocused.current === key)
      return;
    mark.scrollIntoView({ block: 'center' });
    lastFocused.current = key;
  }, [text, focus?.start, focus?.end, focus?.quote, focusKey]);
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
      {segments.map((segment) => {
        const ids = segment.highlightIds.filter((id) => id !== citationFocusId);
        const content = ids.length ? (
          <span
            key={segment.start}
            className="text-highlight"
            role="button"
            tabIndex={0}
            data-active={activeId ? ids.includes(activeId) : false}
            data-overlap={ids.length > 1}
            aria-pressed={activeId ? ids.includes(activeId) : false}
            aria-label={`${label}: ${segment.text}`}
            onClick={() => {
              // A drag ending on a highlight should remain a text selection.
              if (window.getSelection()?.isCollapsed !== false) activate(ids);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate(ids);
              }
            }}
          >
            {segment.text}
          </span>
        ) : (
          segment.text
        );
        return segment.highlightIds.includes(citationFocusId) ? (
          <mark
            key={segment.start}
            className="citation-focus"
            data-citation-focus
          >
            {content}
          </mark>
        ) : (
          <Fragment key={segment.start}>{content}</Fragment>
        );
      })}
    </section>
  );
}
