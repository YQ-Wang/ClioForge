import type { Note } from './types';
import { parseRichDocument, type RichNode } from './rich-document';

export function noteExcerpt(body: string, document?: string | null) {
  if (document) {
    try {
      const text = (node: RichNode): string => {
        if (node.type === 'text') return node.text || '';
        if (node.type === 'hardBreak') return ' ';
        if (node.type === 'drawing')
          return typeof node.attrs?.caption === 'string'
            ? node.attrs.caption || '[Drawing]'
            : '[Drawing]';
        if (['inlineMath', 'blockMath'].includes(node.type))
          return typeof node.attrs?.latex === 'string' ? node.attrs.latex : '';
        return (node.content || [])
          .map(text)
          .join(
            ['paragraph', 'heading', 'codeBlock'].includes(node.type)
              ? ''
              : ' ',
          );
      };
      return text(parseRichDocument(document))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
    } catch {
      // Legacy or damaged documents still have their readable text fallback.
    }
  }
  return body
    .split('\n')
    .filter((line) => !/^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\\([\\`*_[\]<>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

export type NoteState = { note_id: string; pinned: number; archived: number };

export function noteRoot(note: Note, notes: Note[]): Note {
  const byId = new Map(notes.map((item) => [item.id, item]));
  const seen = new Set<string>();
  let root = note;
  while (root.parent_id && !seen.has(root.id)) {
    seen.add(root.id);
    const parent = byId.get(root.parent_id);
    if (!parent) break;
    root = parent;
  }
  return root;
}

export function noteHeads(notes: Note[]): Note[] {
  const parents = new Set(notes.map((note) => note.parent_id));
  return notes.filter((note) => !parents.has(note.id));
}

export function withNoteState(notes: Note[], states: NoteState[]): Note[] {
  const byRoot = new Map(states.map((state) => [state.note_id, state]));
  const byId = new Map(notes.map((note) => [note.id, note]));
  const roots = new Map<string, string>();
  for (const note of notes) {
    if (roots.has(note.id)) continue;
    const path: string[] = [];
    const seen = new Set<string>();
    let current = note;
    while (!roots.has(current.id) && !seen.has(current.id)) {
      path.push(current.id);
      seen.add(current.id);
      const parent = current.parent_id
        ? byId.get(current.parent_id)
        : undefined;
      if (!parent) break;
      current = parent;
    }
    // A missing parent remains a local root, as in noteRoot. Corrupt cycles
    // terminate deterministically without recursion or stack exhaustion.
    const root = roots.get(current.id) || current.id;
    for (const id of path) roots.set(id, root);
  }
  return notes.map((note) => {
    const root = roots.get(note.id)!;
    const state = byRoot.get(root);
    return {
      ...note,
      root_id: root,
      pinned: !!state?.pinned,
      archived: !!state?.archived,
    };
  });
}

export function noteMarkdown(
  note: Pick<Note, 'title' | 'body'>,
  origin?: string,
) {
  // Resolve generated project links only on export; stored notes remain portable
  // between deployments. Preserve examples inside fenced and inline code.
  const body = origin
    ? note.body.replace(
        /(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1|(`+)[^`]*?\2|\]\((\/\?project=[^\s)]+)\)/g,
        (match, _fence, _inline, href: string | undefined) =>
          href ? `](${new URL(href, origin).href})` : match,
      )
    : note.body;
  return `# ${note.title}\n\n${body}\n`;
}

export function downloadNote(note: Pick<Note, 'title' | 'body'>) {
  const url = URL.createObjectURL(
    new Blob([noteMarkdown(note, window.location.origin)], {
      type: 'text/markdown;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${note.title.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'note'}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
