'use client';
/* eslint-disable @next/next/no-img-element -- Drawing previews are bounded local PNG data URLs, not remote images. */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  EditorContent,
  useEditor,
  useEditorState,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { Node, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Mathematics from '@tiptap/extension-mathematics';
import TextAlign from '@tiptap/extension-text-align';
import { Markdown } from '@tiptap/markdown';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Table2,
  Sigma,
  PencilRuler,
  Download,
  Link2,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RemoveFormatting,
  Search,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilePicker } from '@/components/ui/file-picker';
import { useI18n } from '@/lib/i18n/provider';
import { parseRichDocument, richMarkdown } from '@/lib/rich-document';
import 'katex/dist/katex.min.css';
import './rich-writing.css';
import WritingColors from './writing-colors';
const DrawingCanvas = lazy(() => import('./writing-canvas'));
function DrawingView({ node, editor, getPos, selected }: NodeViewProps) {
  const { locale } = useI18n();
  return (
    <NodeViewWrapper
      className={'writing-drawing ' + (selected ? 'selected' : '')}
    >
      <img
        src={node.attrs.preview}
        alt={
          node.attrs.caption ||
          (locale === 'en' ? 'Research diagram' : '研究示意图')
        }
      />
      <p>{node.attrs.caption}</p>
      {editor.isEditable && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const pos = getPos();
            if (typeof pos === 'number')
              editor.view.dom.dispatchEvent(
                new CustomEvent('canwoo-drawing', {
                  detail: { pos, attrs: node.attrs },
                }),
              );
          }}
        >
          {locale === 'en' ? 'Edit drawing' : '编辑图画'}
        </Button>
      )}
    </NodeViewWrapper>
  );
}
const Drawing = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      scene: { default: '' },
      preview: { default: '' },
      caption: { default: '' },
    };
  },
  parseHTML() {
    return [];
  },
  renderHTML({ node }) {
    return [
      'figure',
      {},
      ['img', { src: node.attrs.preview, alt: node.attrs.caption }],
      ['figcaption', {}, node.attrs.caption || ''],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DrawingView);
  },
});
export type RichWritingHandle = {
  insertMarkdown(text: string): void;
  selectedText(): string;
};
export default function RichNoteEditor({
  body,
  title,
  document,
  onChange,
  readOnly,
  handle,
}: {
  body: string;
  title: string;
  document?: string | null;
  readOnly: boolean;
  onChange: (value: { text: string; document: string; title?: string }) => void;
  handle: React.RefObject<RichWritingHandle | null>;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [formula, setFormula] = useState<{
    latex: string;
    pos?: number;
    type: 'inlineMath' | 'blockMath';
  } | null>(null);
  const [drawing, setDrawing] = useState<{
    pos?: number;
    scene?: string;
    caption?: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [findOpen, setFindOpen] = useState(false),
    [find, setFind] = useState(''),
    [replacement, setReplacement] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const current = useRef({ body, document, onChange });
  current.current = { body, document, onChange };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TableKit.configure({ table: { resizable: true } }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Mathematics.configure({
        katexOptions: { trust: false, throwOnError: false },
        inlineOptions: {
          onClick: (node, pos) =>
            setFormula({ latex: node.attrs.latex, pos, type: 'inlineMath' }),
        },
        blockOptions: {
          onClick: (node, pos) =>
            setFormula({ latex: node.attrs.latex, pos, type: 'blockMath' }),
        },
      }),
      Markdown,
      Drawing,
    ],
    content: document ? parseRichDocument(document) : body,
    contentType: document ? 'json' : 'markdown',
    editable: !readOnly,
    editorProps: {
      attributes: {
        'aria-label': L('笔记正文', 'Note body'),
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON(),
        serialized = JSON.stringify(json),
        text = richMarkdown(json);
      try {
        parseRichDocument(serialized);
        if (text.length > 100000)
          throw new Error(
            L(
              '正文最多 100,000 字符，请拆分笔记。',
              'Split notes longer than 100,000 characters.',
            ),
          );
        current.current.onChange({ text, document: serialized });
        setError('');
      } catch {
        // Reject this transaction, retaining the last persistable document.
        editor.commands.setContent(
          current.current.document
            ? parseRichDocument(current.current.document)
            : current.current.body,
          {
            contentType: current.current.document ? 'json' : 'markdown',
            emitUpdate: false,
          },
        );
        setError(
          L(
            '内容超过笔记容量，已保留此前内容。请减少图形数量或拆分笔记。',
            'Note capacity exceeded. Previous content retained; simplify drawings or split this note.',
          ),
        );
      }
    },
  });
  useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            selection: editor.state.selection.from,
            transaction: editor.state.doc,
            marks: editor.state.storedMarks,
          }
        : null,
  });
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);
  useEffect(() => {
    if (!editor) return;
    const listener = (event: Event) => {
      const { pos, attrs } = (event as CustomEvent).detail;
      setDrawing({ pos, scene: attrs.scene, caption: attrs.caption });
    };
    editor.view.dom.addEventListener('canwoo-drawing', listener);
    handle.current = {
      selectedText() {
        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, '\n');
      },
      insertMarkdown(text) {
        editor
          .chain()
          .focus()
          .insertContentAt(editor.state.doc.content.size, text, {
            contentType: 'markdown',
          })
          .run();
      },
    };
    return () => {
      editor.view.dom.removeEventListener('canwoo-drawing', listener);
      handle.current = null;
    };
  }, [editor, handle]);
  useEffect(() => {
    if (!editor) return;
    if (document && JSON.stringify(editor.getJSON()) !== document)
      editor.commands.setContent(parseRichDocument(document), {
        emitUpdate: false,
      });
  }, [document, editor]);
  if (!editor) return <p>{L('正在打开写作工具…', 'Opening writing tools…')}</p>;
  const action = (
    label: string,
    icon: React.ReactNode,
    run: (editor: Editor) => void,
    active = false,
    disabled = false,
  ) => (
    <Button
      key={label}
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => run(editor)}
    >
      {icon}
    </Button>
  );
  return (
    <div className="rich-writing">
      {!readOnly && (
        <fieldset
          className="writing-toolbar"
          aria-label={L('文字与段落格式', 'Text and paragraph formatting')}
        >
          <select
            aria-label={L('段落样式', 'Paragraph style')}
            value={
              editor.isActive('heading')
                ? String(editor.getAttributes('heading').level)
                : '0'
            }
            onChange={(e) =>
              e.target.value === '0'
                ? editor.chain().focus().setParagraph().run()
                : editor
                    .chain()
                    .focus()
                    .toggleHeading({
                      level: Number(e.target.value) as 1 | 2 | 3,
                    })
                    .run()
            }
          >
            <option value="0">{L('正文', 'Body')}</option>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {L('标题', 'Heading')} {n}
              </option>
            ))}
          </select>
          <select
            aria-label={L('字体', 'Font')}
            value={editor.getAttributes('textStyle').fontFamily || ''}
            onChange={(e) =>
              e.target.value
                ? editor.chain().focus().setFontFamily(e.target.value).run()
                : editor.chain().focus().unsetFontFamily().run()
            }
          >
            <option value="">{L('默认字体', 'Default font')}</option>
            <option value="Arial, sans-serif">
              {L('无衬线', 'Sans serif')}
            </option>
            <option value="Georgia, serif">{L('衬线', 'Serif')}</option>
            <option value="monospace">{L('等宽', 'Monospace')}</option>
          </select>
          <select
            aria-label={L('字号', 'Font size')}
            value={editor.getAttributes('textStyle').fontSize || ''}
            onChange={(e) =>
              e.target.value
                ? editor.chain().focus().setFontSize(e.target.value).run()
                : editor.chain().focus().unsetFontSize().run()
            }
          >
            <option value="">{L('字号', 'Size')}</option>
            {[12, 14, 16, 18, 20, 24, 32].map((n) => (
              <option key={n} value={n + 'px'}>
                {n}
              </option>
            ))}
          </select>
          {action(
            L('加粗', 'Bold'),
            <Bold size={16} />,
            (e) => e.chain().focus().toggleBold().run(),
            editor.isActive('bold'),
          )}
          {action(
            L('斜体', 'Italic'),
            <Italic size={16} />,
            (e) => e.chain().focus().toggleItalic().run(),
            editor.isActive('italic'),
          )}
          {action(
            L('下划线', 'Underline'),
            <Underline size={16} />,
            (e) => e.chain().focus().toggleUnderline().run(),
            editor.isActive('underline'),
          )}
          <WritingColors editor={editor} />
          <WritingColors editor={editor} highlight />
          {action(
            L('编辑链接', 'Edit link'),
            <Link2 size={16} />,
            () => setLink(editor.getAttributes('link').href || ''),
            editor.isActive('link'),
          )}
          {action(
            L('引用段落', 'Block quote'),
            <Quote size={16} />,
            (e) => e.chain().focus().toggleBlockquote().run(),
            editor.isActive('blockquote'),
          )}
          {(['left', 'center', 'right'] as const).map((align, i) =>
            action(
              [
                L('左对齐', 'Align left'),
                L('居中', 'Align center'),
                L('右对齐', 'Align right'),
              ][i],
              [
                <AlignLeft key="left" size={16} />,
                <AlignCenter key="center" size={16} />,
                <AlignRight key="right" size={16} />,
              ][i],
              (e) => e.chain().focus().setTextAlign(align).run(),
              editor.isActive({ textAlign: align }),
            ),
          )}
          {action(
            L('清除文字格式', 'Clear text formatting'),
            <RemoveFormatting size={16} />,
            (e) => e.chain().focus().unsetAllMarks().run(),
          )}
          {action(
            L('项目列表', 'Bullet list'),
            <List size={16} />,
            (e) => e.chain().focus().toggleBulletList().run(),
            editor.isActive('bulletList'),
          )}
          {action(
            L('编号列表', 'Numbered list'),
            <ListOrdered size={16} />,
            (e) => e.chain().focus().toggleOrderedList().run(),
            editor.isActive('orderedList'),
          )}
          {action(L('插入表格', 'Insert table'), <Table2 size={16} />, (e) =>
            e
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          )}
          {action(L('插入公式', 'Insert formula'), <Sigma size={16} />, () =>
            setFormula({ latex: '', type: 'blockMath' }),
          )}
          {action(
            L('插入图画', 'Insert drawing'),
            <PencilRuler size={16} />,
            () => setDrawing({}),
          )}
          {action(
            L('撤销', 'Undo'),
            <Undo2 size={16} />,
            (e) => e.chain().focus().undo().run(),
            false,
            !editor.can().undo(),
          )}
          {action(
            L('重做', 'Redo'),
            <Redo2 size={16} />,
            (e) => e.chain().focus().redo().run(),
            false,
            !editor.can().redo(),
          )}
        </fieldset>
      )}
      {!readOnly && editor.isActive('table') && (
        <fieldset
          className="writing-toolbar"
          aria-label={L('表格操作', 'Table actions')}
        >
          {[
            [
              L('加一行', 'Add row'),
              () => editor.chain().focus().addRowAfter().run(),
            ],
            [
              L('加一列', 'Add column'),
              () => editor.chain().focus().addColumnAfter().run(),
            ],
            [
              L('删除行', 'Delete row'),
              () => editor.chain().focus().deleteRow().run(),
            ],
            [
              L('删除列', 'Delete column'),
              () => editor.chain().focus().deleteColumn().run(),
            ],
            [
              L('合并 / 拆分', 'Merge / split'),
              () => editor.chain().focus().mergeOrSplit().run(),
            ],
            [
              L('删除表格', 'Delete table'),
              () => editor.chain().focus().deleteTable().run(),
            ],
          ].map(([label, fn]) => (
            <Button
              key={String(label)}
              size="sm"
              variant="ghost"
              type="button"
              onClick={fn as () => void}
            >
              {label as string}
            </Button>
          ))}
        </fieldset>
      )}
      {findOpen && (
        <div className="writing-insert-panel">
          <Input
            aria-label={L('查找文稿文字', 'Find in draft')}
            placeholder={L('查找文字', 'Find text')}
            value={find}
            onChange={(e) => setFind(e.target.value)}
            maxLength={500}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!find}
            onClick={() => {
              const matches: { from: number; to: number }[] = [];
              editor.state.doc.descendants((node, pos) => {
                if (!node.isTextblock) return true;
                const text = node.textBetween(
                  0,
                  node.content.size,
                  '\n',
                  '\uFFFC',
                );
                let at = text.indexOf(find);
                while (at !== -1) {
                  matches.push({
                    from: pos + 1 + at,
                    to: pos + 1 + at + find.length,
                  });
                  at = text.indexOf(find, at + find.length);
                }
                return false;
              });
              const next =
                matches.find((m) => m.from >= editor.state.selection.to) ||
                matches[0];
              if (next) {
                editor
                  .chain()
                  .focus()
                  .setTextSelection(next)
                  .scrollIntoView()
                  .run();
                setError('');
              } else
                setError(
                  L(
                    '文稿中没有找到这段文字。',
                    'This text was not found in the draft.',
                  ),
                );
            }}
          >
            {L('查找下一处', 'Find next')}
          </Button>
          <Input
            aria-label={L('替换为', 'Replace with')}
            placeholder={L('替换为', 'Replace with')}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            maxLength={2000}
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              readOnly ||
              !find ||
              editor.state.doc.textBetween(
                editor.state.selection.from,
                editor.state.selection.to,
              ) !== find
            }
            onClick={() => {
              editor
                .chain()
                .focus()
                .command(({ tr }) => {
                  tr.insertText(
                    replacement,
                    editor.state.selection.from,
                    editor.state.selection.to,
                  );
                  return true;
                })
                .run();
            }}
          >
            {L('替换所选文字', 'Replace selected')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFindOpen(false);
              setError('');
            }}
          >
            {L('关闭查找', 'Close find')}
          </Button>
        </div>
      )}
      {link !== null && !readOnly && (
        <div className="writing-insert-panel">
          <label>
            {L('链接地址', 'Link address')}
            <Input
              value={link}
              maxLength={2000}
              placeholder="https://"
              onChange={(e) => setLink(e.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={!/^(https?:\/\/|mailto:|\/\?)/i.test(link.trim())}
            onClick={() => {
              editor
                .chain()
                .focus()
                .extendMarkRange('link')
                .setLink({ href: link.trim() })
                .run();
              setLink(null);
            }}
          >
            {L('应用链接', 'Apply link')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              setLink(null);
            }}
          >
            {L('移除链接', 'Remove link')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setLink(null)}>
            {L('取消', 'Cancel')}
          </Button>
        </div>
      )}
      {formula && !readOnly && (
        <div className="writing-insert-panel">
          <label>
            {L('LaTeX 公式', 'LaTeX formula')}
            <Input
              value={formula.latex}
              maxLength={2000}
              onChange={(e) =>
                setFormula({ ...formula, latex: e.target.value })
              }
              placeholder="P(H | E) = \\frac{P(E | H)P(H)}{P(E)}"
            />
          </label>
          <select
            aria-label={L('公式位置', 'Formula layout')}
            value={formula.type}
            disabled={formula.pos !== undefined}
            onChange={(e) =>
              setFormula({
                ...formula,
                type: e.target.value as 'inlineMath' | 'blockMath',
              })
            }
          >
            <option value="blockMath">
              {L('独立公式', 'Display equation')}
            </option>
            <option value="inlineMath">
              {L('行内公式', 'Inline equation')}
            </option>
          </select>
          <Button
            type="button"
            disabled={!formula.latex.trim()}
            onClick={() => {
              if (formula.pos !== undefined)
                editor
                  .chain()
                  .focus()
                  .setNodeSelection(formula.pos)
                  .updateAttributes(formula.type, { latex: formula.latex })
                  .run();
              else
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: formula.type,
                    attrs: { latex: formula.latex },
                  })
                  .run();
              setFormula(null);
            }}
          >
            {L('应用公式', 'Apply formula')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setFormula(null)}
          >
            {L('取消', 'Cancel')}
          </Button>
        </div>
      )}
      <EditorContent editor={editor} />
      {error && (
        <p role="alert" className="writing-error">
          {error}
        </p>
      )}
      {!readOnly && (
        <details className="writing-import">
          <summary>
            <Upload size={14} aria-hidden="true" />
            {L('导入参伍文稿', 'Import a Canwoo document')}
          </summary>
          <div className="writing-import-content">
            <FilePicker
              label={L('选择文稿', 'Choose document')}
              description={L(
                '选择从参伍导出的 .canwoo.json 文件。将替换当前正文，可撤销；保存到项目后才会同步。',
                'Choose a .canwoo.json file exported from Canwoo. It replaces the current text and can be undone. Save to the project to sync it.',
              )}
              accept=".json,application/json"
              onSelect={async (file) => {
                setError('');
                try {
                  if (file.size > 750000) throw new Error();
                  const value = JSON.parse(await file.text());
                  if (value.format !== 'canwoo-writing' || value.version !== 1)
                    throw new Error();
                  const doc = parseRichDocument(JSON.stringify(value.document));
                  editor
                    .chain()
                    .focus()
                    .selectAll()
                    .insertContent(doc.content || [])
                    .run();
                } catch {
                  setError(
                    L(
                      '这不是有效的参伍完整文稿文件。',
                      'This is not a valid Canwoo writing document.',
                    ),
                  );
                }
              }}
            />
          </div>
        </details>
      )}
      <div className="writing-status">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={findOpen}
          onClick={() => setFindOpen(!findOpen)}
        >
          <Search size={14} />
          {L('查找与替换', 'Find / replace')}
        </Button>
        <span>
          {L(
            `${editor.state.doc.textContent.length.toLocaleString()} 字符${editor.state.selection.empty ? '' : ` · 已选 ${editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to).length} 字符`}`,
            `${editor.state.doc.textContent.length.toLocaleString()} characters${editor.state.selection.empty ? '' : ` · ${editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to).length} selected`}`,
          )}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      format: 'canwoo-writing',
                      version: 1,
                      title,
                      document: editor.getJSON(),
                    },
                    null,
                    2,
                  ),
                ],
                { type: 'application/json' },
              ),
            );
            const a = window.document.createElement('a');
            a.href = url;
            a.download =
              (title.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'canwoo-writing') +
              '.canwoo.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={14} />
          {L('导出完整文稿', 'Export complete document')}
        </Button>
      </div>
      {drawing && !readOnly && (
        <Suspense fallback={<p>{L('正在打开画布…', 'Opening canvas…')}</p>}>
          <DrawingCanvas
            initial={drawing}
            onClose={() => setDrawing(null)}
            onSave={(attrs) => {
              if (drawing.pos !== undefined)
                editor
                  .chain()
                  .focus()
                  .setNodeSelection(drawing.pos)
                  .updateAttributes('drawing', attrs)
                  .run();
              else
                editor
                  .chain()
                  .focus()
                  .insertContent({ type: 'drawing', attrs })
                  .run();
              setDrawing(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
