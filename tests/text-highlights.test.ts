import test from 'node:test';
import assert from 'node:assert/strict';
import {
  textHighlightSegments,
  validTextHighlights,
  type TextHighlight,
} from '../lib/text-highlights';

void test('an anchor selects the recorded occurrence and never searches for a stale quote', () => {
  const text = 'Roma et Roma';
  const highlights = [
    { id: 'second', start: 8, end: 12, quote: 'Roma' },
    { id: 'stale', start: 5, end: 9, quote: 'Roma' },
  ];
  assert.deepEqual(
    validTextHighlights(text, highlights).map((item) => item.id),
    ['second'],
  );
  assert.deepEqual(textHighlightSegments(text, highlights), [
    { start: 0, end: 8, text: 'Roma et ', highlightIds: [] },
    { start: 8, end: 12, text: 'Roma', highlightIds: ['second'] },
  ]);
});

void test('overlapping and nested ranges retain every annotation without duplicating source text', () => {
  const text = 'abcdefghij';
  const highlights = [
    { id: 'a', start: 1, end: 7, quote: 'bcdefg' },
    { id: 'b', start: 3, end: 9, quote: 'defghi' },
    { id: 'c', start: 4, end: 5, quote: 'e' },
  ];
  const segments = textHighlightSegments(text, highlights);
  assert.equal(segments.map((segment) => segment.text).join(''), text);
  assert.deepEqual(
    segments.map(({ start, end, highlightIds }) => ({
      start,
      end,
      highlightIds,
    })),
    [
      { start: 0, end: 1, highlightIds: [] },
      { start: 1, end: 3, highlightIds: ['a'] },
      { start: 3, end: 4, highlightIds: ['a', 'b'] },
      { start: 4, end: 5, highlightIds: ['a', 'b', 'c'] },
      { start: 5, end: 7, highlightIds: ['a', 'b'] },
      { start: 7, end: 9, highlightIds: ['b'] },
      { start: 9, end: 10, highlightIds: [] },
    ],
  );
});

void test('malformed bounds, mismatched text, and ambiguous duplicate IDs are omitted', () => {
  const text = 'abcd';
  const anchor = { id: 'valid', start: 1, end: 3, quote: 'bc' };
  const highlights: TextHighlight[] = [
    anchor,
    { ...anchor, id: 'negative', start: -1 },
    { ...anchor, id: 'outside', end: 50 },
    { ...anchor, id: 'fraction', start: 1.5 },
    { ...anchor, id: 'nan', start: NaN },
    { ...anchor, id: 'infinite', end: Infinity },
    { ...anchor, id: 'empty', end: 1, quote: '' },
    { ...anchor, id: 'reversed', start: 3, end: 1 },
    { ...anchor, id: 'mismatch', quote: 'BC' },
    { ...anchor, id: '' },
    { ...anchor, id: 'duplicate' },
    { id: 'duplicate', start: 0, end: 1, quote: 'a' },
  ];
  assert.deepEqual(validTextHighlights(text, highlights), [anchor]);
});

void test('UTF-16 anchors preserve astral characters, combining marks, and whitespace exactly', () => {
  const text = '参伍\n😀 cafe\u0301\t原文';
  const quote = '😀 cafe\u0301';
  const start = text.indexOf('😀');
  const segments = textHighlightSegments(text, [
    { id: 'unicode', start, end: start + quote.length, quote },
  ]);
  assert.equal(start, 3);
  assert.equal(quote.length, 8);
  assert.deepEqual(segments, [
    { start: 0, end: 3, text: '参伍\n', highlightIds: [] },
    { start: 3, end: 11, text: quote, highlightIds: ['unicode'] },
    { start: 11, end: 14, text: '\t原文', highlightIds: [] },
  ]);
});

void test('touching ranges do not overlap and unannotated or empty pages remain intact', () => {
  assert.deepEqual(textHighlightSegments('', []), []);
  assert.deepEqual(textHighlightSegments('abc', []), [
    { start: 0, end: 3, text: 'abc', highlightIds: [] },
  ]);
  assert.deepEqual(
    textHighlightSegments('abc', [
      { id: 'left', start: 0, end: 1, quote: 'a' },
      { id: 'right', start: 1, end: 3, quote: 'bc' },
    ]),
    [
      { start: 0, end: 1, text: 'a', highlightIds: ['left'] },
      { start: 1, end: 3, text: 'bc', highlightIds: ['right'] },
    ],
  );
});
