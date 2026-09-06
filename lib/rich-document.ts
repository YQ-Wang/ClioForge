import { z } from 'zod';

export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
};
const nodes = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'inlineMath',
  'blockMath',
  'drawing',
]);
const marks = new Set([
  'bold',
  'italic',
  'strike',
  'underline',
  'code',
  'link',
  'textStyle',
]);
export function parseRichDocument(value: string): RichNode {
  if (new TextEncoder().encode(value).length > 700000)
    throw new Error('Document is too large.');
  const doc = JSON.parse(value) as RichNode;
  let count = 0;
  function visit(n: RichNode, depth: number) {
    if (
      !n ||
      typeof n !== 'object' ||
      !nodes.has(n.type) ||
      depth > 24 ||
      ++count > 12000
    )
      throw new Error('Unsupported document.');
    if (n.text !== undefined && typeof n.text !== 'string')
      throw new Error('Invalid text.');
    if (
      n.marks &&
      (!Array.isArray(n.marks) || n.marks.some((m) => !m || !marks.has(m.type)))
    )
      throw new Error('Invalid formatting.');
    if (
      n.attrs !== undefined &&
      (!n.attrs || typeof n.attrs !== 'object' || Array.isArray(n.attrs))
    )
      throw new Error('Invalid attributes.');
    if (n.type === 'text' && (!n.text || n.content))
      throw new Error('Invalid text node.');
    if (
      n.type === 'heading' &&
      (!Number.isInteger(n.attrs?.level) ||
        Number(n.attrs?.level) < 1 ||
        Number(n.attrs?.level) > 6)
    )
      throw new Error('Invalid heading.');
    if (
      ['inlineMath', 'blockMath'].includes(n.type) &&
      (typeof n.attrs?.latex !== 'string' || n.attrs.latex.length > 2000)
    )
      throw new Error('Invalid equation.');
    if (n.content) {
      const block = new Set([
        'paragraph',
        'heading',
        'bulletList',
        'orderedList',
        'blockquote',
        'codeBlock',
        'horizontalRule',
        'table',
        'blockMath',
        'drawing',
      ]);
      const inline = new Set(['text', 'inlineMath', 'hardBreak']);
      const allowed =
        n.type === 'doc' ||
        n.type === 'blockquote' ||
        n.type === 'listItem' ||
        n.type === 'tableCell' ||
        n.type === 'tableHeader'
          ? block
          : n.type === 'paragraph' || n.type === 'heading'
            ? inline
            : n.type === 'bulletList' || n.type === 'orderedList'
              ? new Set(['listItem'])
              : n.type === 'table'
                ? new Set(['tableRow'])
                : n.type === 'tableRow'
                  ? new Set(['tableCell', 'tableHeader'])
                  : n.type === 'codeBlock'
                    ? new Set(['text'])
                    : new Set<string>();
      if (
        !Array.isArray(n.content) ||
        n.content.some((child) => !child || !allowed.has(child.type))
      )
        throw new Error('Invalid document structure.');
    }
    if (n.type === 'drawing') {
      if (
        typeof n.attrs?.preview !== 'string' ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(n.attrs.preview)
      )
        throw new Error('Invalid drawing preview.');
      if (typeof n.attrs.scene !== 'string' || n.attrs.scene.length > 200000)
        throw new Error('Invalid drawing.');
      const scene = JSON.parse(n.attrs.scene);
      if (
        !Array.isArray(scene.elements) ||
        scene.elements.length > 500 ||
        scene.elements.some(
          (e: { type?: string }) =>
            e.type === 'image' ||
            e.type === 'iframe' ||
            e.type === 'embeddable',
        )
      )
        throw new Error('Unsupported drawing elements.');
    }
    if (n.content) {
      if (!Array.isArray(n.content)) throw new Error('Invalid content.');
      n.content.forEach((child) => visit(child, depth + 1));
    }
  }
  if (doc?.type !== 'doc') throw new Error('Expected a document.');
  visit(doc, 0);
  return doc;
}
export const richDocumentString = z
  .string()
  .max(700000)
  .refine((value) => {
    try {
      parseRichDocument(value);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid or oversized writing document.');

// Plain Markdown is kept alongside the editable document for existing search,
// citations and model context. Drawing descriptions are not image analysis.
export function richMarkdown(node: RichNode): string {
  const children = () => (node.content || []).map(richMarkdown).join('');
  if (node.type === 'text') {
    let text = node.text || '';
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') text = `**${text}**`;
      if (mark.type === 'italic') text = `*${text}*`;
      if (mark.type === 'strike') text = `~~${text}~~`;
      if (mark.type === 'code') text = '`' + text + '`';
      if (
        mark.type === 'link' &&
        typeof mark.attrs?.href === 'string' &&
        /^(https?:\/\/|\/\?)/.test(mark.attrs.href)
      )
        text = `[${text}](${mark.attrs.href})`;
    }
    return text;
  }
  switch (node.type) {
    case 'heading':
      return (
        '#'.repeat(Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))) +
        ' ' +
        children() +
        '\n\n'
      );
    case 'paragraph':
      return children() + '\n\n';
    case 'hardBreak':
      return '\n';
    case 'horizontalRule':
      return '\n---\n\n';
    case 'inlineMath':
      return (
        '$' +
        (typeof node.attrs?.latex === 'string' ? node.attrs.latex : '') +
        '$'
      );
    case 'blockMath':
      return (
        '\n$$\n' +
        (typeof node.attrs?.latex === 'string' ? node.attrs.latex : '') +
        '\n$$\n\n'
      );
    case 'drawing':
      return (
        '\n[' +
        (typeof node.attrs?.caption === 'string'
          ? node.attrs.caption
          : 'Drawing') +
        ' — editable drawing in Canwoo document]\n\n'
      );
    case 'codeBlock':
      return '```\n' + children() + '\n```\n\n';
    case 'blockquote':
      return (
        children()
          .trim()
          .split('\n')
          .map((line) => '> ' + line)
          .join('\n') + '\n\n'
      );
    case 'bulletList':
    case 'orderedList':
      return (
        (node.content || [])
          .map(
            (n, i) =>
              `${node.type === 'orderedList' ? `${i + 1}.` : '-'} ${richMarkdown(n).trim()}\n`,
          )
          .join('') + '\n'
      );
    case 'table': {
      const rows = (node.content || []).map(
        (row) =>
          '| ' +
          (row.content || [])
            .map((cell) =>
              richMarkdown(cell)
                .trim()
                .replaceAll('|', '\\|')
                .replaceAll('\n', '<br>'),
            )
            .join(' | ') +
          ' |',
      );
      if (rows.length)
        rows.splice(
          1,
          0,
          '| ' +
            (node.content?.[0]?.content || []).map(() => '---').join(' | ') +
            ' |',
        );
      return rows.join('\n') + '\n\n';
    }
    default:
      return children();
  }
}
