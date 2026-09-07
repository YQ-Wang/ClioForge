'use client';
import ZoteroAttachments from './zotero-attachments';
import { useI18n } from '@/lib/i18n/provider';
import { useRef, useState } from 'react';
import { BookMarked, Download, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Field, Notice } from './workspace';
import { api } from '@/lib/client-api';
import { formText, textValue } from '@/lib/form-values';
import { dateLabel, editDate } from '@/lib/csl-values';
import type { Source } from '@/lib/types';
import type { BibliographyEntry, CSL } from '@/lib/workbench-types';
export function downloadText(
  text: string,
  name: string,
  type = 'text/plain;charset=utf-8',
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const types = {
  manuscript: '档案 / 手稿',
  book: '专著',
  chapter: '书中章节',
  'article-journal': '期刊论文',
  'article-newspaper': '报刊文章',
  letter: '书信',
  personal_communication: '书信',
  map: '地图',
  interview: '访谈',
  dataset: '数据集',
  webpage: '网页',
  report: '报告',
  document: '文献',
  thesis: '学位论文',
};
export default function BibliographyPanel({
  projectId,
  sources,
  entries,
  onSaved,
  initialSource,
}: {
  projectId: string;
  sources: Source[];
  entries: BibliographyEntry[];
  onSaved: () => Promise<unknown>;
  initialSource?: string;
}) {
  const { t, locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [libraryType, setLibraryType] = useState('users');
  const [editing, setEditing] = useState<BibliographyEntry | null | undefined>(
      undefined,
    ),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [format, setFormat] = useState('chicago');
  const [preview, setPreview] = useState<CSL[] | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [zotero, setZotero] = useState(false),
    [library, setLibrary] = useState(''),
    [key, setKey] = useState(''),
    [start, setStart] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [citation, setCitation] = useState<BibliographyEntry | null>(null),
    [locator, setLocator] = useState(''),
    [citationText, setCitationText] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const scope = initialSource
    ? sources.find((source) => source.id === initialSource)
    : null;
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await work(async () => {
      const existing = editing?.csl || {};
      const authors = formText(form, 'author')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((literal) => ({ literal }));
      const originalAuthors =
        editing?.csl.author
          ?.map(
            (a) => a.literal || [a.given, a.family].filter(Boolean).join(' '),
          )
          .join('\n') || '';
      const csl: CSL = {
        ...existing,
        type: formText(form, 'type'),
        title: formText(form, 'title'),
        author:
          formText(form, 'author') === originalAuthors
            ? editing?.csl.author
            : authors,
        issued: editDate(formText(form, 'date'), editing?.csl.issued),
      };
      for (const field of [
        'archive',
        'archive_location',
        'archive-place',
        'publisher',
        'publisher-place',
        'container-title',
        'edition',
        'volume',
        'issue',
        'page',
        'URL',
        'DOI',
        'language',
        'rights',
        'abstract',
      ] as const)
        csl[field] = formText(form, field);
      await api('/api/workbench', {
        action: 'bibliography',
        project_id: projectId,
        id: editing?.id,
        source_id: form.get('source_id') || null,
        expected: editing?.revision,
        csl,
      });
      setEditing(undefined);
      await onSaved();
      setMessage('书目信息已保存，历史修改仍保留。');
    });
  }
  async function parse(file: File) {
    await work(async () => {
      const format = file.name.toLowerCase().endsWith('.bib')
        ? 'bibtex'
        : file.name.toLowerCase().endsWith('.ris')
          ? 'ris'
          : 'csl';
      const data = await api<{ entries: CSL[] }>('/api/bibliography', {
        action: 'parse',
        project_id: projectId,
        format,
        text: await file.text(),
      });
      setPreview(data.entries);
      setSelected(data.entries.map((_, i) => i));
    });
  }
  return (
    <>
      <div className="section-toolbar">
        <div>
          <h2 className="tool-heading">{t('书目与正式引注')}</h2>
          <p>
            {t(
              '原件与书目分别保存，支持 Chicago、APA、CSL JSON、BibTeX 与 RIS。',
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => upload.current?.click()}>
            <Upload size={15} />
            {t('导入书目')}
          </Button>
          <Button variant="outline" onClick={() => setZotero(true)}>
            {t('从 Zotero 读取')}
          </Button>
          <Button onClick={() => setEditing(null)}>
            <Plus size={15} />
            {t('新建书目')}
          </Button>
        </div>
      </div>
      <input
        ref={upload}
        hidden
        type="file"
        accept=".json,.bib,.ris"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            if (file.size > 1500000) setMessage('书目文件最多 1.5 MB。');
            else void parse(file);
          }
        }}
      />
      {scope && (
        <Notice
          text={t('当前资料：{0}。可新建书目关联这份原件，或编辑已有条目。', {
            0: scope.title,
          })}
        />
      )}
      {message && <Notice text={message} />}
      <div className="bibliography-export">
        <NativeSelect
          aria-label={t('书目导出格式')}
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {[
            ['chicago', t('Chicago 参考书目')],
            ['apa', t('APA 参考书目')],
            ['csl', t('CSL JSON（Zotero 兼容）')],
            ['bibtex', 'BibTeX'],
            ['ris', 'RIS'],
          ].map(([value, label]) => (
            <NativeSelectOption value={value} key={value}>
              {t(label)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          disabled={busy || !entries.length}
          onClick={() =>
            void work(async () => {
              const data = await api<{ text: string }>('/api/bibliography', {
                action: 'export',
                project_id: projectId,
                format,
              });
              downloadText(
                data.text,
                `bibliography.${format === 'csl' ? 'json' : format === 'bibtex' ? 'bib' : format === 'ris' ? 'ris' : 'txt'}`,
              );
            })
          }
        >
          <Download size={15} />
          {t('导出 {0} 条', { 0: entries.length })}
        </Button>
      </div>
      {!entries.length && (
        <section className="empty-project">
          <BookMarked size={34} />
          <h2>{t('先为材料留下完整出处')}</h2>
          <p>{t('添加作者、成文时间、馆藏和档号，生成可核查的引注。')}</p>
        </section>
      )}
      <div className="project-grid">
        {entries.map((entry) => (
          <article className="project-card" key={entry.id}>
            <span className="status-tag">
              {t(types[entry.csl.type as keyof typeof types] || entry.csl.type)}
            </span>
            <h2 className="mt-3">{entry.csl.title}</h2>
            <p>
              {entry.csl.author
                ?.map(
                  (a) =>
                    a.literal || [a.given, a.family].filter(Boolean).join(' '),
                )
                .join('；') || t('作者未填写')}{' '}
              · {dateLabel(entry.csl.issued) || t('年代待定')}
            </p>
            <p>
              {[entry.csl.archive, entry.csl.archive_location]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-xs">
              {entry.source_id
                ? t('关联原件：{0}', {
                    0: sources.find((s) => s.id === entry.source_id)?.title,
                  })
                : t('尚未关联原件')}
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" onClick={() => setEditing(entry)}>
                {t('编辑')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCitation(entry);
                  setCitationText('');
                  setLocator('');
                }}
              >
                {t('生成脚注')}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? t('编辑书目') : t('新建书目')}</DialogTitle>
            <DialogDescription>
              {t('成文日期可以保留约年或原始纪年。未知信息留空，不作推断。')}
            </DialogDescription>
          </DialogHeader>
          <form
            key={editing?.id || 'new'}
            onSubmit={(event) => void save(event)}
            className="space-y-4"
          >
            <div className="form-grid">
              <Field label={t('关联原件')}>
                <NativeSelect
                  name="source_id"
                  className="w-full"
                  defaultValue={editing?.source_id || initialSource || ''}
                >
                  <NativeSelectOption value="">
                    {t('仅保存书目')}
                  </NativeSelectOption>
                  {sources.map((source) => (
                    <NativeSelectOption value={source.id} key={source.id}>
                      {source.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t('文献类型')}>
                <NativeSelect
                  className="w-full"
                  name="type"
                  defaultValue={
                    editing?.csl.type === 'letter'
                      ? 'personal_communication'
                      : editing?.csl.type || 'manuscript'
                  }
                >
                  {Object.entries(types)
                    .filter(([value]) => value !== 'letter')
                    .map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {t(label)}
                      </NativeSelectOption>
                    ))}
                  {editing?.csl.type && !(editing.csl.type in types) && (
                    <NativeSelectOption value={editing.csl.type}>
                      {editing.csl.type}
                    </NativeSelectOption>
                  )}
                </NativeSelect>
              </Field>
            </div>
            <Field label={t('标题')}>
              <Input
                name="title"
                required
                maxLength={1000}
                defaultValue={editing?.csl.title || scope?.title}
              />
            </Field>
            <div className="form-grid">
              <Field label={t('作者（每行一位，机构作者也可）')}>
                <Textarea
                  name="author"
                  defaultValue={editing?.csl.author
                    ?.map(
                      (a) =>
                        a.literal ||
                        [a.given, a.family].filter(Boolean).join(' '),
                    )
                    .join('\n')}
                />
              </Field>
              <Field label={t('成文日期 / 原始纪年')}>
                <Input
                  name="date"
                  defaultValue={dateLabel(editing?.csl.issued)}
                  placeholder={t('例如：约 1890 年 / 光绪十六年')}
                />
              </Field>
            </div>
            <Field label={t('来源链接')}>
              <Input
                name="URL"
                maxLength={2000}
                defaultValue={editing?.csl.URL}
              />
            </Field>
            <details className="rounded-lg border p-4" open={!!editing}>
              <summary className="cursor-pointer font-medium">
                {L(
                  '馆藏、出版与其他信息（选填）',
                  'Archive, publication and other details (optional)',
                )}
              </summary>
              <p className="text-sm text-muted-foreground my-3">
                {L(
                  '先保存标题、作者、日期与出处；其余信息可以稍后补充。',
                  'Start with a title, author, date and source link. You can add the remaining details later.',
                )}
              </p>
              <div className="form-grid">
                {[
                  ['archive', t('馆藏机构')],
                  ['archive_location', t('档号 / 索书号')],
                  ['archive-place', t('馆藏地点')],
                  ['publisher', t('出版社')],
                  ['publisher-place', t('出版地')],
                  ['container-title', t('期刊 / 所属文集')],
                  ['edition', t('版本 / 版次')],
                  ['volume', t('卷')],
                  ['issue', t('期')],
                  ['page', t('原书页码范围')],
                  ['DOI', 'DOI'],
                  ['language', t('语言')],
                  ['rights', t('使用权限 / 版权')],
                ].map(([field, label]) => (
                  <Field label={t(label)} key={field}>
                    <Input
                      name={field}
                      maxLength={2000}
                      defaultValue={textValue(editing?.csl[field as keyof CSL])}
                    />
                  </Field>
                ))}
              </div>
              <Field label={t('摘要 / 内容说明')}>
                <Textarea
                  name="abstract"
                  maxLength={10000}
                  defaultValue={editing?.csl.abstract}
                />
              </Field>
            </details>
            <div className="form-actions">
              <Button type="submit" disabled={busy}>
                {t('保存书目')}
              </Button>
            </div>
            {message && <Notice text={message} />}
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={zotero}
        onOpenChange={(open) => {
          setZotero(open);
          if (!open) setKey('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('从 Zotero 读取书目')}</DialogTitle>
            <DialogDescription>
              {L(
                '读取个人或团队文献库，每页 50 条。密钥仅用于此次读取，不保存。',
                'Read a personal or group library, 50 items per page. The key is used for this read and is not stored.',
              )}
            </DialogDescription>
          </DialogHeader>
          <Field label={L('文献库类型', 'Library type')}>
            <NativeSelect
              value={libraryType}
              onChange={(e) => {
                setLibraryType(e.target.value);
                setStart(0);
                setNext(null);
              }}
            >
              <NativeSelectOption value="users">
                {L('个人文献库', 'Personal library')}
              </NativeSelectOption>
              <NativeSelectOption value="groups">
                {L('团队文献库', 'Group library')}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label={L('文献库 ID', 'Library ID')}>
            <Input
              value={library}
              onChange={(e) => setLibrary(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label={t('Zotero 只读 API key')}>
            <Input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <ZoteroAttachments
            key={`${libraryType}:${library}`}
            projectId={projectId}
            library={library}
            libraryType={libraryType}
            apiKey={key}
            onImported={onSaved}
          />
          <p className="text-xs text-muted-foreground">
            {t('当前读取位置：第 {0} 条', { 0: start + 1 })}
          </p>
          <Button
            disabled={busy || !library || !key}
            onClick={() =>
              void work(async () => {
                const data = await api<{ entries: CSL[]; next: number | null }>(
                  '/api/bibliography',
                  {
                    action: 'zotero',
                    project_id: projectId,
                    library,
                    library_type: libraryType,
                    key,
                    start,
                  },
                );
                setNext(data.next);
                setPreview(data.entries);
                setSelected(data.entries.map((_, i) => i));
              })
            }
          >
            {t('读取这一页')}
          </Button>
          {next !== null && (
            <Button
              variant="outline"
              onClick={() => {
                setStart(next);
                setNext(null);
              }}
            >
              {t('准备读取下一页')}
            </Button>
          )}
          {message && <Notice text={message} />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('选择要导入的书目')}</DialogTitle>
            <DialogDescription>
              {t('共 {0} 条。相同 DOI 或相同标题、作者与日期会跳过。', {
                0: preview?.length || 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="import-preview">
            {preview?.map((entry, index) => (
              <label key={index}>
                <input
                  type="checkbox"
                  checked={selected.includes(index)}
                  onChange={(event) =>
                    setSelected((ids) =>
                      event.target.checked
                        ? [...ids, index]
                        : ids.filter((id) => id !== index),
                    )
                  }
                />
                <span>{entry.title}</span>
              </label>
            ))}
          </div>
          <Button
            disabled={busy || !selected.length}
            onClick={() =>
              void work(async () => {
                const result = await api<{
                  result: { imported: number; skipped: number };
                }>('/api/workbench', {
                  action: 'import_bibliography',
                  project_id: projectId,
                  entries: selected.map((i) => preview![i]),
                });
                setPreview(null);
                await onSaved();
                setMessage(
                  t('已导入 {0} 条，跳过 {1} 条重复书目。', {
                    0: result.result.imported,
                    1: result.result.skipped,
                  }),
                );
              })
            }
          >
            {t('导入选中的 {0} 条', { 0: selected.length })}
          </Button>
          {message && <Notice text={message} />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!citation}
        onOpenChange={(open) => {
          if (!open) setCitation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('生成 Chicago 脚注')}</DialogTitle>
            <DialogDescription>
              {citation?.csl.title}
              {t('。按原书或档案实际页码填写，文件页序未必相同。')}
            </DialogDescription>
          </DialogHeader>
          <Field label={t('引用页码（可留空）')}>
            <Input
              value={locator}
              onChange={(e) => setLocator(e.target.value)}
              placeholder={t('例如：23–25')}
            />
          </Field>
          <Button
            disabled={busy}
            onClick={() =>
              void work(async () => {
                const data = await api<{ text: string }>('/api/bibliography', {
                  action: 'footnote',
                  project_id: projectId,
                  entry_id: citation?.id,
                  locator,
                });
                setCitationText(data.text);
              })
            }
          >
            {t('生成脚注')}
          </Button>
          {citationText && (
            <>
              <Textarea
                aria-label={t('生成的脚注')}
                readOnly
                value={citationText}
              />
              <Button
                variant="outline"
                onClick={() => downloadText(citationText, 'footnote.txt')}
              >
                {t('下载脚注')}
              </Button>
            </>
          )}
          {message && <Notice text={message} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
