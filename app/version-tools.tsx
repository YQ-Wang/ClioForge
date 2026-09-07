'use client';
import { useI18n } from '@/lib/i18n/provider';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useProjectDrafts } from '@/hooks/use-project-drafts';
import WritingTools from './writing-tools';
import { downloadNote } from '@/lib/notes';
import type { RichWritingHandle } from './rich-note-editor';
const RichNoteEditor = lazy(() => import('./rich-note-editor'));
import WritingSeminar from './writing-seminar';
import { diffLines } from 'diff';
import {
  Download,
  History,
  RotateCcw,
  Laptop,
  AlertCircle,
  CloudCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { discardDraft, draftPrefix, type DraftRecord } from '@/lib/drafts';
import { useLocalDraft } from '@/hooks/use-local-draft';
import type { Note } from '@/lib/types';
import { rpc } from '@/lib/client-api';
import { Field, Notice } from './workspace';
export function TextDiff({ before, after }: { before: string; after: string }) {
  const { t } = useI18n();
  const chunks = diffLines(before, after);
  return (
    <div className="text-diff" aria-label={t('文本版本差异')}>
      {chunks.every((c) => !c.added && !c.removed) ? (
        <p className="text-muted-foreground">{t('文字没有变化。')}</p>
      ) : (
        chunks.map((chunk, index) =>
          chunk.added ? (
            <ins key={index}>
              <span aria-hidden="true">＋ </span>
              {chunk.value}
            </ins>
          ) : chunk.removed ? (
            <del key={index}>
              <span aria-hidden="true">－ </span>
              {chunk.value}
            </del>
          ) : (
            <span key={index}>{chunk.value}</span>
          ),
        )
      )}
    </div>
  );
}
export function DraftShelf({
  userId,
  projectId,
  onResume,
}: {
  userId: string;
  projectId: string;
  onResume: (draft: DraftRecord) => void;
}) {
  const { t, locale } = useI18n();
  const drafts = useProjectDrafts(userId, projectId);
  const [open, setOpen] = useState(false);
  const [discarding, setDiscarding] = useState<DraftRecord | null>(null);
  const [discardError, setDiscardError] = useState('');
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <History size={16} />
        {t('本机草稿')}
        {drafts.length ? ` (${drafts.length})` : ''}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('恢复本机草稿')}</DialogTitle>
            <DialogDescription>
              {t('草稿保存在此浏览器并按账户隔离，尚未成为项目版本。')}
            </DialogDescription>
          </DialogHeader>
          {!drafts.length ? (
            <p>{t('没有未保存的草稿。')}</p>
          ) : (
            drafts.map((draft) => (
              <div className="flex items-center gap-2" key={draft.key}>
                <button
                  className="draft-row min-w-0 flex-1"
                  onClick={() => {
                    onResume(draft);
                    setOpen(false);
                  }}
                >
                  <strong>
                    {draft.value.title ||
                      (draft.value.kind === 'reading'
                        ? locale === 'en'
                          ? 'Reading annotation'
                          : '阅读批注'
                        : t('未命名笔记'))}
                  </strong>
                  <span>
                    {draft.value.kind === 'source'
                      ? t('校订 · 第 {0} 页', { 0: draft.value.page })
                      : draft.value.kind === 'reading'
                        ? locale === 'en'
                          ? `Reading annotation · Page ${draft.value.page}`
                          : `阅读批注 · 第 ${draft.value.page} 页`
                        : t('笔记')}{' '}
                    · {new Date(draft.updatedAt).toLocaleString(locale)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  aria-label={
                    L('丢弃草稿：', 'Discard draft: ') +
                    (draft.value.title || t('未命名笔记'))
                  }
                  onClick={() => {
                    setDiscarding(draft);
                    setDiscardError('');
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!discarding}
        onOpenChange={(value) => {
          if (!value) setDiscarding(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {L('丢弃这份本机草稿？', 'Discard this local draft?')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '仅删除此浏览器中尚未保存的内容。项目中已保存的笔记、原文和版本不受影响。此操作无法撤销。',
                'Only unsaved content in this browser will be removed. Saved project notes, sources and versions remain available. This cannot be undone.',
              )}
            </DialogDescription>
          </DialogHeader>
          <p>{discarding?.value.title}</p>
          {discardError && <p role="alert">{discardError}</p>}
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setDiscarding(null)}>
              {L('保留草稿', 'Keep draft')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!discarding) return;
                try {
                  if (
                    !discardDraft(
                      localStorage,
                      draftPrefix(userId, projectId),
                      discarding,
                    )
                  ) {
                    setDiscardError(
                      L(
                        '草稿已在别处更新。请关闭确认窗口，核对最新内容后再决定。',
                        'This draft changed elsewhere. Close this confirmation and review its latest contents first.',
                      ),
                    );
                    return;
                  }
                  window.dispatchEvent(new Event('foliotrace-drafts'));
                  setDiscarding(null);
                } catch {
                  setDiscardError(
                    L(
                      '无法删除本机草稿，请重试。',
                      'Could not discard the local draft. Try again.',
                    ),
                  );
                }
              }}
            >
              {L('丢弃本机草稿', 'Discard local draft')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function noteHead(note: Note, notes: Note[]): Note {
  let head = note;
  const seen = new Set<string>();
  while (!seen.has(head.id)) {
    seen.add(head.id);
    const child = notes.find((n) => n.parent_id === head.id);
    if (!child) break;
    head = child;
  }
  return head;
}
export function noteLineage(note: Note, notes: Note[]): Note[] {
  const ancestors: Note[] = [];
  let current: Note | undefined = noteHead(note, notes);
  while (current) {
    ancestors.push(current);
    current = notes.find((n) => n.id === current?.parent_id);
  }
  return ancestors;
}
export function NoteEditor({
  note,
  notes,
  userId,
  projectId,
  onClose,
  onSaved,
  readOnly = false,
  draftKey,
  initial,
}: {
  note: Note | null;
  notes: Note[];
  userId: string;
  projectId: string;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  readOnly?: boolean;
  draftKey?: string;
  initial?: { title: string; text: string };
}) {
  const { t, locale } = useI18n();
  const draft = useLocalDraft(
    draftKey || `${draftPrefix(userId, projectId)}note:${note?.id || 'new'}`,
    {
      kind: 'note',
      entityId: note?.id || 'new',
      title: initial?.title || note?.title || '',
      text: initial?.text || note?.body || '',
      document: initial ? null : note?.document || null,
    },
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [compare, setCompare] = useState('');
  const writingHandle = useRef<RichWritingHandle | null>(null);
  const [preview, setPreview] = useState(readOnly);
  const [saveId] = useState(() => {
    const candidate = draftKey?.split(':').at(-1) || '';
    return !note && /^[a-f0-9-]{36}$/i.test(candidate)
      ? candidate
      : crypto.randomUUID();
  });
  const head = note ? noteHead(note, notes) : null,
    lineage = note ? noteLineage(note, notes) : [];
  const savedToProject =
    !!head &&
    head.title === draft.value.title &&
    head.body === draft.value.text &&
    (head.document || null) === (draft.value.document || null);
  const old = lineage.find((n) => n.id === compare);
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const seeded = useRef(false);
  useEffect(() => {
    if (!initial || !draft.loaded || seeded.current) return;
    seeded.current = true;
    if (!draft.restored) draft.update({ ...draft.value, ...initial });
  }, [draft, initial]);
  async function save(restore?: Note) {
    if (readOnly || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await rpc('save_note', {
        p_id: saveId,
        p_project: projectId,
        p_parent: restore ? head?.id || null : note?.id || null,
        p_title: restore?.title || draft.value.title,
        p_body: restore?.body ?? draft.value.text,
        p_document: restore
          ? restore.document || null
          : draft.value.document || null,
      });
      if (result.error) throw new Error(result.error.message);
      draft.clear();
      await onSaved();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
      await onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="note-editor-dialog sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {readOnly
              ? L('阅读笔记', 'Read note')
              : note
                ? t('编辑笔记')
                : t('新笔记')}
          </DialogTitle>
          <DialogDescription>
            {L(
              '输入时保留本机草稿。点击“保存到项目”后，笔记会出现在项目列表，可供合作者阅读。',
              'Typing keeps a draft in this browser. Save to project to add it to the note list and share it with collaborators.',
            )}
          </DialogDescription>
        </DialogHeader>
        {draft.error && <Notice text={draft.error} />}{' '}
        {draft.restored && (
          <Notice text={t('已恢复本机草稿，请核查后保存。')} />
        )}
        {note && head?.id !== note.id && (
          <Notice
            text={t(
              '该草稿基于 v{0}，项目已有 v{1}。请先导出这份草稿并比较最新版本；不会覆盖合作者的修改。',
              { 0: note.revision, 1: head?.revision },
            )}
          />
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="space-y-4"
        >
          <Field label={t('标题')}>
            <Input
              required
              maxLength={200}
              readOnly={readOnly}
              disabled={!draft.loaded || busy}
              value={draft.value.title}
              onChange={(e) =>
                draft.update({ ...draft.value, title: e.target.value })
              }
            />
          </Field>
          <div className="note-writing-mode">
            <Button
              type="button"
              size="sm"
              variant={!preview ? 'secondary' : 'ghost'}
              onClick={() => setPreview(false)}
            >
              {L('写作', 'Write')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={preview ? 'secondary' : 'ghost'}
              onClick={() => setPreview(true)}
            >
              {L('阅读预览', 'Reading preview')}
            </Button>
          </div>
          {draft.loaded && (
            <Suspense
              fallback={<p>{L('正在打开文稿…', 'Opening document…')}</p>}
            >
              <RichNoteEditor
                body={draft.value.text}
                title={draft.value.title}
                document={draft.value.document}
                readOnly={readOnly || preview || busy}
                handle={writingHandle}
                onChange={(value) => draft.update({ ...draft.value, ...value })}
              />
            </Suspense>
          )}
          <WritingTools
            projectId={projectId}
            title={draft.value.title}
            body={draft.value.text}
            document={draft.value.document}
            onInsert={
              readOnly
                ? undefined
                : (text) => {
                    setPreview(false);
                    writingHandle.current?.insertMarkdown(text);
                  }
            }
          />
          {!readOnly && (
            <WritingSeminar
              projectId={projectId}
              noteId={
                note?.root_id ||
                (note ? noteLineage(note, notes).at(-1)?.id : undefined)
              }
              title={draft.value.title}
              question={draft.value.question || ''}
              onQuestion={(question) =>
                draft.update({ ...draft.value, question })
              }
              passage={() =>
                writingHandle.current?.selectedText() || draft.value.text
              }
            />
          )}
          {head && (
            <details>
              <summary>{t('与当前已保存版本比较')}</summary>
              <TextDiff before={head.body} after={draft.value.text} />
              {(head.document || null) !== (draft.value.document || null) && (
                <p>
                  {L(
                    '排版或图画也有变化；保存和恢复会保留完整文稿。下方比较显示文字变化。',
                    'Formatting or drawings also changed. Saving and restoring preserves the complete document; this comparison shows text changes.',
                  )}
                </p>
              )}
            </details>
          )}
          {!!lineage.length && (
            <div className="version-compare">
              <NativeSelect
                aria-label={t('比较笔记版本')}
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
              >
                <NativeSelectOption value="">
                  {t('选择历史版本比较 / 恢复')}
                </NativeSelectOption>
                {lineage.map((n) => (
                  <NativeSelectOption key={n.id} value={n.id}>
                    v{n.revision} ·{' '}
                    {new Date(n.created_at).toLocaleString(locale)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {old && (
                <>
                  <TextDiff before={old.body} after={head?.body || ''} />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || readOnly}
                    onClick={() => void save(old)}
                  >
                    <RotateCcw size={15} />
                    {t('恢复 v')}
                    {old.revision}
                    {t('为新版本')}
                  </Button>
                </>
              )}
            </div>
          )}
          {message && <Notice text={message} />}
          <div className="note-editor-footer">
            <output
              className="draft-save-status"
              data-error={!!draft.error}
              title={L(
                '本机草稿仅保存在当前浏览器。点击“保存到项目”后，合作者与其他设备才能看到。',
                'Local drafts stay in this browser. Save to project to make changes available to collaborators and other devices.',
              )}
            >
              {draft.error ? (
                <AlertCircle size={15} />
              ) : busy || savedToProject ? (
                <CloudCheck size={15} />
              ) : (
                <Laptop size={15} />
              )}
              {readOnly
                ? L('仅阅读', 'Read only')
                : busy
                  ? L('正在保存到项目…', 'Saving to project…')
                  : draft.error
                    ? L(
                        '本机草稿未保存，请及时保存到项目',
                        'Local draft unavailable; save to project',
                      )
                    : !draft.loaded
                      ? L('正在恢复草稿…', 'Loading draft…')
                      : savedToProject
                        ? L('已保存到项目', 'Saved to project')
                        : L(
                            '本机草稿 · 保存后同步到项目',
                            'Local draft · save to sync with project',
                          )}
            </output>
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  downloadNote({
                    title:
                      draft.value.title || L('未命名笔记', 'Untitled note'),
                    body: draft.value.text,
                  })
                }
                aria-label={L('导出当前笔记', 'Export current note')}
              >
                <Download size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={onClose}
              >
                {readOnly
                  ? L('关闭', 'Close')
                  : L('稍后继续', 'Continue later')}
              </Button>
              {!readOnly && (
                <Button
                  disabled={
                    busy ||
                    !draft.loaded ||
                    !draft.value.title.trim() ||
                    !!(note && head?.id !== note.id)
                  }
                  type="submit"
                >
                  {busy ? t('正在保存…') : L('保存到项目', 'Save to project')}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
