'use client';
import { useState } from 'react';
import { NotebookPen, ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { sourcePath } from '@/lib/navigation';
import { draftPrefix } from '@/lib/drafts';
import { useLocalDraft } from '@/hooks/use-local-draft';
import type { Source, SourceVersion } from '@/lib/types';
import { Button } from '@/components/ui/button';
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
import { Field } from './workspace';
type Passage = {
  source: Source;
  version: SourceVersion;
  page: number;
  quote: string;
};
export default function SourceComparison({
  sources,
  versions,
  initialSource,
  userId,
  canWrite,
  onClose,
  onCompose,
}: {
  sources: Source[];
  versions: SourceVersion[];
  initialSource: string;
  userId: string;
  canWrite: boolean;
  onClose: () => void;
  onCompose: (title: string, text: string) => void;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [left, setLeft] = useState<Passage | null>(null),
    [right, setRight] = useState<Passage | null>(null),
    [reflection, setReflection] = useState('');
  const [draftId] = useState(() => crypto.randomUUID());
  const localDraft = useLocalDraft(
    `${draftPrefix(userId, sources[0].project_id)}note:${draftId}`,
    {
      kind: 'note',
      entityId: draftId,
      title: L('对读笔记草稿', 'Comparison note draft'),
      text: '',
    },
  );
  const excerpt = (passage: Passage) =>
    `### ${passage.source.title}\n\n${passage.quote
      .split('\n')
      .map((line) => '> ' + line)
      .join(
        '\n',
      )}\n\n[${L('查看原文', 'View source')} · v${passage.version.revision} · p.${passage.page}](${sourcePath(passage.source.project_id, passage.version.id, passage.page)})`;
  function draftText(
    a: Passage | null,
    b: Passage | null,
    observation: string,
  ) {
    return `${[a, b]
      .filter((item): item is Passage => !!item?.quote)
      .map(excerpt)
      .join(
        '\n\n',
      )}\n\n## ${L('我的观察与待核查问题', 'My observations and questions to verify')}\n\n${observation}\n`;
  }
  function preserve(a: Passage | null, b: Passage | null, observation: string) {
    if (observation || (a?.quote && b?.quote))
      localDraft.update({
        ...localDraft.value,
        text: draftText(a, b, observation),
      });
  }
  function compose() {
    if (!left || !right || left.source.id === right.source.id) return;
    const title =
      L('材料对读', 'Source comparison') +
      ' · ' +
      left.source.title +
      ' / ' +
      right.source.title;
    const excerpt = (passage: Passage) =>
      `### ${passage.source.title}\n\n${passage.quote
        .split('\n')
        .map((line) => '> ' + line)
        .join(
          '\n',
        )}\n\n[${L('查看原文', 'View source')} · v${passage.version.revision} · p.${passage.page}](${sourcePath(passage.source.project_id, passage.version.id, passage.page)})`;
    onCompose(
      title.slice(0, 200),
      `${excerpt(left)}\n\n${excerpt(right)}\n\n## ${L('我的观察与待核查问题', 'My observations and questions to verify')}\n\n${reflection}\n`,
    );
    localDraft.clear();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="comparison-dialog">
        <DialogHeader>
          <DialogTitle>
            {L('材料对读', 'Read sources side by side')}
          </DialogTitle>
          <DialogDescription>
            {L(
              '选择两份材料，划选要比较的原文。可以整理成带出处的笔记；不会调用模型。',
              'Choose two sources and highlight the passages to compare. Create a note with source links; no model call is made.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="comparison-columns">
          <ComparisonPage
            label={L('左侧材料', 'Left source')}
            sources={sources}
            versions={versions}
            initialSource={initialSource || sources[0].id}
            onPassage={(value) => {
              setLeft(value);
              preserve(value, right, reflection);
            }}
          />
          <ComparisonPage
            label={L('右侧材料', 'Right source')}
            sources={sources}
            versions={versions}
            initialSource={
              sources.find(
                (source) => source.id !== (initialSource || sources[0].id),
              )?.id || sources[0].id
            }
            onPassage={(value) => {
              setRight(value);
              preserve(left, value, reflection);
            }}
          />
        </div>
        <Field
          label={L(
            '观察、差异与下一步检证',
            'Observations, differences and next checks',
          )}
        >
          <Textarea
            value={reflection}
            onChange={(event) => {
              setReflection(event.target.value);
              preserve(left, right, event.target.value);
            }}
            rows={3}
            maxLength={10000}
            placeholder={L(
              '例如：同一个地名在两份材料中的写法是否相同？差异可能来自什么？',
              'For example: Is a place named the same way in both sources? What might explain a difference?',
            )}
          />
        </Field>
        {left && right && left.source.id === right.source.id && (
          <p role="alert">
            {L('请选择两份不同的材料。', 'Choose two different sources.')}
          </p>
        )}
        {localDraft.value.text && (
          <p className="settings-hint">
            {L(
              '观察与引句已暂存为笔记草稿。关闭后可在「笔记与写作」继续。',
              'Your observations and passages are saved as a note draft. Continue from Notes & writing after closing.',
            )}
          </p>
        )}
        {localDraft.error && <p role="alert">{localDraft.error}</p>}
        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>
            {L('关闭对读', 'Close comparison')}
          </Button>
          <Button
            disabled={
              !canWrite ||
              !left?.quote ||
              !right?.quote ||
              left.source.id === right.source.id
            }
            onClick={compose}
          >
            <NotebookPen size={16} />
            {L('整理成笔记', 'Create a comparison note')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function ComparisonPage({
  label,
  sources,
  versions,
  initialSource,
  onPassage,
}: {
  label: string;
  sources: Source[];
  versions: SourceVersion[];
  initialSource: string;
  onPassage: (passage: Passage | null) => void;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const newest = (id: string) =>
    versions
      .filter((version) => version.source_id === id)
      .sort((a, b) => b.revision - a.revision)[0];
  const [sourceId, setSourceId] = useState(initialSource),
    [versionId, setVersionId] = useState(newest(initialSource).id),
    [page, setPage] = useState(1),
    [quote, setQuote] = useState('');
  const source = sources.find((item) => item.id === sourceId)!,
    version = versions.find((item) => item.id === versionId)!,
    text = version.pages.find((item) => item.page === page)?.text || '';
  function clear() {
    setQuote('');
    onPassage(null);
  }
  return (
    <section className="comparison-page" aria-label={label}>
      <Field label={label}>
        <NativeSelect
          value={sourceId}
          onChange={(event) => {
            setSourceId(event.target.value);
            setVersionId(newest(event.target.value).id);
            setPage(1);
            clear();
          }}
        >
          {sources.map((item) => (
            <NativeSelectOption key={item.id} value={item.id}>
              {item.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <div className="comparison-page-controls">
        <NativeSelect
          aria-label={`${label} · ${L('版本', 'Version')}`}
          value={versionId}
          onChange={(event) => {
            setVersionId(event.target.value);
            setPage(1);
            clear();
          }}
        >
          {versions
            .filter((item) => item.source_id === sourceId)
            .map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                v{item.revision}
              </NativeSelectOption>
            ))}
        </NativeSelect>
        <NativeSelect
          aria-label={`${label} · ${L('页码', 'Page')}`}
          value={page}
          onChange={(event) => {
            setPage(Number(event.target.value));
            clear();
          }}
        >
          {version.pages.map((item) => (
            <NativeSelectOption key={item.page} value={item.page}>
              {L('第 ' + item.page + ' 页', 'Page ' + item.page)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <a
          href={sourcePath(source.project_id, version.id, page)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${label} · ${L('查看原件', 'View original')}`}
        >
          <ExternalLink size={16} />
        </a>
      </div>
      <Textarea
        className="comparison-transcript"
        aria-label={`${label} · ${L('原文（划选引句）', 'Text (highlight a passage)')}`}
        value={text}
        readOnly
        placeholder={L(
          '本页还没有转录文字，请先在阅读页校订或转录。',
          'This page has no transcription. Transcribe or edit it in the reader first.',
        )}
        onSelect={(event) => {
          const element = event.currentTarget;
          const selected = text.slice(
            element.selectionStart,
            element.selectionEnd,
          );
          if (selected && selected.length <= 2000) {
            setQuote(selected);
            onPassage({ source, version, page, quote: selected });
          }
        }}
      />
      <p className="settings-hint">
        {quote
          ? L('已选引句：', 'Selected passage: ') +
            quote.slice(0, 180) +
            (quote.length > 180 ? '…' : '')
          : L(
              '在上方文字中划选引句（最多 2,000 字）。',
              'Highlight a passage above (up to 2,000 characters).',
            )}
      </p>
    </section>
  );
}
