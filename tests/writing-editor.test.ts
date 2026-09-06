import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Mathematics from '@tiptap/extension-mathematics';
import { Markdown } from '@tiptap/markdown';
import { parseRichDocument, richMarkdown } from '../lib/rich-document';

void test('installed editor preserves formatting, editable tables, math and old Markdown through serialization', () => {
  const options = {
    element: null,
    extensions: [StarterKit, TableKit, TextStyleKit, Mathematics, Markdown],
  };
  const editor = new Editor({
    ...options,
    content:
      '# Reading\n\nCompare **declarations** and implementation.\n\n[source](/?project=abc&tab=sources&page=1)',
    contentType: 'markdown',
  });
  try {
    assert.equal(editor.getJSON().content?.[0].type, 'heading');
    assert.match(richMarkdown(editor.getJSON()), /\*\*declarations\*\*/);
    assert.match(
      richMarkdown(editor.getJSON()),
      /\[source\]\(\/\?project=abc&tab=sources&page=1\)/,
    );
    editor.commands.setTextSelection({ from: 1, to: 8 });
    editor.commands.setFontFamily('Georgia, serif');
    editor.commands.setFontSize('24px');
    editor.commands.setColor('#1d4ed8');
    editor.commands.setBackgroundColor('#fef08a');
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: 'blockMath',
      attrs: { latex: 'P(H | E) = P(E | H) P(H) / P(E)' },
    });
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: 'paragraph',
    });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const saved = JSON.stringify(editor.getJSON());
    parseRichDocument(saved);
    assert.match(saved, /Georgia, serif/);
    assert.match(saved, /24px/);
    assert.match(saved, /#fef08a/);
    assert.match(saved, /#1d4ed8/);
    assert.match(saved, /tableHeader/);
    assert.match(saved, /blockMath/);
    const reopened = new Editor({ ...options, content: JSON.parse(saved) });
    try {
      assert.deepEqual(reopened.getJSON(), editor.getJSON());
      assert.match(richMarkdown(reopened.getJSON()), /\$\$\nP\(H \| E\)/);
    } finally {
      reopened.destroy();
    }
  } finally {
    editor.destroy();
  }
});
