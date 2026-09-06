import type { Note } from './types';

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
  return notes.map((note) => {
    const root = noteRoot(note, notes);
    const state = byRoot.get(root.id);
    return {
      ...note,
      root_id: root.id,
      pinned: !!state?.pinned,
      archived: !!state?.archived,
    };
  });
}

export function noteMarkdown(note: Pick<Note, 'title' | 'body'>) {
  return `# ${note.title}\n\n${note.body}\n`;
}

export function downloadNote(note: Pick<Note, 'title' | 'body'>) {
  const url = URL.createObjectURL(
    new Blob([noteMarkdown(note)], { type: 'text/markdown;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${note.title.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'note'}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
