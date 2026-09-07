'use client';
import { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  ArrowDownWideNarrow,
  Download,
  FilePenLine,
  MoreHorizontal,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/i18n/provider';
import { useProjectDrafts } from '@/hooks/use-project-drafts';
import { api } from '@/lib/client-api';
import { downloadNote, noteExcerpt, noteHeads } from '@/lib/notes';
import type { DraftRecord } from '@/lib/drafts';
import type { Note } from '@/lib/types';

export default function NoteLibrary({
  notes,
  userId,
  projectId,
  canWrite,
  loading,
  onOpen,
  onSaved,
}: {
  notes: Note[];
  userId: string;
  projectId: string;
  canWrite: boolean;
  loading: boolean;
  onOpen: (note: Note | null, draft?: DraftRecord) => void;
  onSaved: () => Promise<unknown>;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [sort, setSort] = useState('recent');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{
    note: Note;
    archived: boolean;
  } | null>(null);
  const drafts = useProjectDrafts(userId, projectId).filter((draft) => {
    if (draft.value.kind !== 'note') return false;
    const saved = notes.find((n) => n.id === draft.value.entityId);
    return (
      !saved ||
      !!draft.value.question ||
      saved.title !== draft.value.title ||
      saved.body !== draft.value.text ||
      (saved.document || null) !== (draft.value.document || null)
    );
  });
  const heads = useMemo(() => noteHeads(notes), [notes]);
  const matches = (title: string, body: string) =>
    `${title}\n${body}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  const shown = heads
    .filter((note) =>
      filter === 'archived'
        ? note.archived
        : !note.archived && (filter !== 'pinned' || note.pinned),
    )
    .filter((note) => filter !== 'drafts' && matches(note.title, note.body))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (sort === 'title'
          ? a.title.localeCompare(b.title, locale)
          : sort === 'oldest'
            ? a.created_at.localeCompare(b.created_at)
            : b.created_at.localeCompare(a.created_at)),
    );
  const shownDrafts = ['active', 'drafts'].includes(filter)
    ? drafts.filter((draft) => matches(draft.value.title, draft.value.text))
    : [];
  async function organize(
    note: Note,
    state: { pinned?: boolean; archived?: boolean },
  ) {
    setBusy(note.id);
    setError('');
    setNotice(null);
    try {
      await api('/api/workspace', {
        action: 'set_note_state',
        p_project: projectId,
        p_note: note.id,
        ...state,
      });
      await onSaved();
      if (state.archived !== undefined)
        setNotice({
          note,
          archived: state.archived,
        });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : L(
              '整理失败，请重试。',
              'Could not update this note. Please retry.',
            ),
      );
    } finally {
      setBusy('');
    }
  }
  const filters = [
    {
      id: 'active',
      label: L('全部笔记', 'All notes'),
      count: heads.filter((note) => !note.archived).length,
    },
    {
      id: 'pinned',
      label: L('置顶', 'Pinned'),
      count: heads.filter((note) => note.pinned && !note.archived).length,
    },
    {
      id: 'drafts',
      label: L('待保存草稿', 'Unsaved drafts'),
      count: drafts.length,
    },
    {
      id: 'archived',
      label: L('已归档', 'Archived'),
      count: heads.filter((note) => note.archived).length,
    },
  ];
  return (
    <section
      className="note-library"
      aria-label={L('项目笔记', 'Project notes')}
    >
      <header className="notes-heading">
        <div>
          <p>
            {L(
              '把阅读所得、待核查的想法和文稿放在一起。',
              'Keep reading notes, questions and writing together.',
            )}
          </p>
        </div>
        <Button disabled={!canWrite || loading} onClick={() => onOpen(null)}>
          <Plus size={16} />
          {L('新建笔记', 'New note')}
        </Button>
      </header>
      <div className="notes-controls">
        <div className="notes-search">
          <Search size={17} aria-hidden="true" />
          <Input
            aria-label={L(
              '搜索笔记标题与内容',
              'Search note titles and content',
            )}
            placeholder={L('搜索标题或内容…', 'Search titles or content…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <ArrowDownWideNarrow size={15} />
            {sort === 'title'
              ? L('按标题', 'By title')
              : sort === 'oldest'
                ? L('最早更新', 'Oldest updated')
                : L('最近更新', 'Recently updated')}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(String(value))}
            >
              <DropdownMenuRadioItem value="recent" closeOnClick>
                {L('最近更新', 'Recently updated')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="oldest" closeOnClick>
                {L('最早更新', 'Oldest updated')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="title" closeOnClick>
                {L('按标题', 'By title')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <fieldset
        className="notes-filters"
        aria-label={L('笔记分类', 'Filter notes')}
      >
        {filters.map((item) => (
          <button
            key={item.id}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <span>{item.count}</span>
          </button>
        ))}
      </fieldset>
      {error && (
        <p className="notes-feedback" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <output className="notes-feedback">
          {notice.archived
            ? L(
                '已归档，版本和内容都保留。',
                'Archived. Content and versions are preserved.',
              )
            : L('已移回全部笔记。', 'Returned to all notes.')}
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busy}
            onClick={() =>
              void organize(notice.note, { archived: !notice.archived })
            }
          >
            {L('撤销', 'Undo')}
          </Button>
        </output>
      )}
      {loading ? (
        <output className="notes-empty">
          {L('正在读取笔记…', 'Loading notes…')}
        </output>
      ) : (
        <>
          {shownDrafts.length > 0 && (
            <div className="notes-draft-section">
              <div className="notes-section-label">
                <FilePenLine size={15} />
                <h3>{L('继续未完成的草稿', 'Continue a draft')}</h3>
                <span>{L('仅此浏览器', 'This browser only')}</span>
              </div>
              {shownDrafts.map((draft) => (
                <button
                  className="note-draft-row"
                  key={draft.key}
                  onClick={() =>
                    onOpen(
                      notes.find((note) => note.id === draft.value.entityId) ||
                        null,
                      draft,
                    )
                  }
                >
                  <div>
                    <strong>
                      {draft.value.title || L('未命名笔记', 'Untitled note')}
                    </strong>
                    <p>
                      {noteExcerpt(draft.value.text, draft.value.document) ||
                        L('继续写下你的想法', 'Continue your writing')}
                    </p>
                    <small>
                      {notes.some((n) => n.id === draft.value.entityId)
                        ? L('修改尚未同步', 'Changes not yet synced')
                        : L(
                            '尚未保存到项目',
                            'Not yet saved to the project',
                          )}{' '}
                      · {new Date(draft.updatedAt).toLocaleString(locale)}
                    </small>
                  </div>
                  <span>{L('继续写作', 'Continue')} →</span>
                </button>
              ))}
            </div>
          )}
          {shown.length > 0 && (
            <div className="notes-list">
              {shown.map((note) => (
                <article className="note-list-row" key={note.id}>
                  <button className="note-open" onClick={() => onOpen(note)}>
                    <span className="note-item-icon">
                      {note.pinned ? (
                        <Pin size={19} />
                      ) : (
                        <NotebookPen size={19} />
                      )}
                    </span>
                    <div>
                      <h3>{note.title}</h3>
                      <p>
                        {noteExcerpt(note.body, note.document) ||
                          L(
                            '还没有正文，打开继续写作。',
                            'No text yet. Open to start writing.',
                          )}
                      </p>
                      <div className="note-meta">
                        <time dateTime={note.created_at}>
                          {new Date(note.created_at).toLocaleString(locale)}
                        </time>
                        <span>v{note.revision}</span>
                        <span>{L('已保存到项目', 'Saved to project')}</span>
                      </div>
                      <span className="note-open-action">
                        {canWrite
                          ? L('打开与编辑', 'Open & edit')
                          : L('阅读笔记', 'Read note')}
                        <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                      disabled={busy === note.id}
                      aria-label={L(
                        `管理笔记：${note.title}`,
                        `Manage note: ${note.title}`,
                      )}
                    >
                      <MoreHorizontal size={18} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpen(note)}>
                        <FilePenLine />
                        {L(
                          canWrite ? '打开与编辑' : '阅读笔记',
                          canWrite ? 'Open & edit' : 'Read note',
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!canWrite}
                        onClick={() =>
                          void organize(note, { pinned: !note.pinned })
                        }
                      >
                        {note.pinned ? <PinOff /> : <Pin />}
                        {note.pinned
                          ? L('取消置顶', 'Unpin')
                          : L('置顶', 'Pin')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadNote(note)}>
                        <Download />
                        {L('导出 Markdown', 'Export Markdown')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!canWrite}
                        onClick={() =>
                          void organize(note, { archived: !note.archived })
                        }
                      >
                        {note.archived ? <ArchiveRestore /> : <Archive />}
                        {note.archived
                          ? L('移回全部笔记', 'Restore note')
                          : L('归档笔记', 'Archive note')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </article>
              ))}
            </div>
          )}
          {!shown.length && !shownDrafts.length && (
            <div className="notes-empty">
              <NotebookPen size={32} strokeWidth={1.4} />
              <h3>
                {query
                  ? L('没有找到匹配的笔记', 'No matching notes')
                  : filter === 'archived'
                    ? L('还没有归档笔记', 'No archived notes')
                    : filter === 'pinned'
                      ? L('把常用笔记放在手边', 'Keep useful notes close')
                      : filter === 'drafts'
                        ? L('没有待保存的草稿', 'No unsaved drafts')
                        : L('从一段阅读所得开始', 'Start with a reading note')}
              </h3>
              <p>
                {query
                  ? L(
                      '可以搜索标题或正文中的词句。',
                      'Try a word from the title or text.',
                    )
                  : filter === 'pinned'
                    ? L(
                        '在笔记右侧菜单选择“置顶”。',
                        'Choose Pin from a note’s menu.',
                      )
                    : filter === 'active'
                      ? L(
                          '记录一个问题、摘下一段原文，或把研究助手的结果整理成笔记。保存后会出现在这里。',
                          'Record a question, keep a quotation or develop an assistant’s findings. Saved notes appear here.',
                        )
                      : L(
                          '笔记保存到项目后，可在其他设备和合作者之间继续使用。',
                          'Notes saved to the project are available across devices and to collaborators.',
                        )}
              </p>
              {query && (
                <Button variant="outline" onClick={() => setQuery('')}>
                  {L('清除搜索', 'Clear search')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
