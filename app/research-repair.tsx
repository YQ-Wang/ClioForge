'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import type { MissionTask, TaskResult } from '@/lib/platform/types';
import type { SourceVersion } from '@/lib/types';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function ResearchRepair({
  task,
  versions,
  sourceLabel,
  busy,
  onSave,
}: {
  task: MissionTask;
  versions: SourceVersion[];
  sourceLabel: (id: string) => string;
  busy: boolean;
  onSave: (value: unknown) => Promise<unknown>;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const errorText = (message: string) =>
    locale === 'en'
      ? (
          {
            '引文与固定版本不一致。':
              'A quotation does not match its fixed source page. Compare the quotation with the source text below.',
            '阅读回答的引文编号缺失或与原文列表不一致，请先核查。':
              'Citation numbers are missing or do not match the quotation list. Update the numbered references in your text.',
            '阅读回答未符合约定格式，请检查原始返回后再决定是否重试。':
              'This reading task needs a concise account and a bounded quotation list. Shorten the text or remove extra quotations.',
            '引文超出了本步骤实际阅读的页码。':
              'The quotation is outside the source pages selected for this task.',
            '引文不在任务固定材料或依赖产物范围内。':
              'Choose a fixed source version used by this task or its dependencies.',
            '稿件已有更新，请重新检查。':
              'The text has changed. Reopen the latest version before saving.',
            '稿件已有更新或当前步骤不能修订，请刷新。':
              'This task has changed or is not editable. Refresh before continuing.',
            '前置材料尚未通过核查，请先处理前置步骤。':
              'Resolve the unfinished prerequisite steps before revising this text.',
          } as Record<string, string>
        )[message] || message
      : message;
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [citations, setCitations] = useState<TaskResult['citations']>([]);
  const [revision, setRevision] = useState(task.revision);
  const [error, setError] = useState('');
  const outdated = revision !== task.revision;
  function start() {
    setSummary(task.result?.summary || '');
    setCitations(task.result?.citations.map((c) => ({ ...c })) || []);
    setReason('');
    setError('');
    setRevision(task.revision);
    setOpen(true);
  }
  return (
    <>
      <Button variant="outline" onClick={start}>
        {L('修订稿件与引文', 'Revise text and citations')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {L('修订稿件与引文', 'Revise text and citations')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '不调用模型。原始回答与修订记录都会保留；保存后仍需审读采纳。',
                'No model call. The original answer and correction history are retained; the revision still needs acceptance.',
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError('');
              try {
                if (
                  (await onSave({
                    summary,
                    citations,
                    reason,
                    expected: revision,
                  })) === true
                )
                  setOpen(false);
                else
                  setError(
                    L(
                      '尚未保存。请查看页面提示，修改仍留在此窗口。',
                      'Not saved. Check the page message; your edits remain in this window.',
                    ),
                  );
              } catch (error) {
                setError(
                  error instanceof Error
                    ? errorText(error.message)
                    : L(
                        '保存失败，修改仍保留。',
                        'Save failed; your edits remain.',
                      ),
                );
              }
            }}
          >
            <label>
              {L(
                '研究稿（用 [1]、[2] 对应下方引文）',
                'Research text (use [1], [2] for the quotations below)',
              )}
              <Textarea
                required
                maxLength={30000}
                rows={7}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                disabled={busy}
              />
            </label>
            {citations.map((citation, index) => (
              <fieldset
                className="rounded-xl border p-4 grid gap-3"
                key={index}
              >
                <legend className="px-2">[{index + 1}]</legend>
                <label>
                  {L('固定资料版本', 'Fixed source version')}
                  <NativeSelect
                    className="w-full"
                    value={citation.version_id}
                    disabled={busy}
                    onChange={(e) =>
                      setCitations((cs) =>
                        cs.map((c, i) =>
                          i === index
                            ? {
                                ...c,
                                version_id: e.target.value,
                                page: 1,
                                start: undefined,
                              }
                            : c,
                        ),
                      )
                    }
                  >
                    {!versions.some((v) => v.id === citation.version_id) && (
                      <option value={citation.version_id}>
                        {L(
                          '请选择有效的资料版本',
                          'Choose a valid source version',
                        )}
                      </option>
                    )}
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {sourceLabel(v.id)} · v{v.revision}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label>
                  {L('页码', 'Page')}
                  <NativeSelect
                    className="w-full"
                    value={citation.page}
                    disabled={busy}
                    onChange={(e) =>
                      setCitations((cs) =>
                        cs.map((c, i) =>
                          i === index
                            ? {
                                ...c,
                                page: Number(e.target.value),
                                start: undefined,
                              }
                            : c,
                        ),
                      )
                    }
                  >
                    {(
                      versions.find((v) => v.id === citation.version_id)
                        ?.pages || [{ page: citation.page }]
                    ).map((p) => (
                      <option key={p.page} value={p.page}>
                        {p.page}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label>
                  {L('原文引句', 'Exact quotation')}
                  <Textarea
                    required
                    value={citation.quote}
                    disabled={busy}
                    maxLength={10000}
                    onChange={(e) =>
                      setCitations((cs) =>
                        cs.map((c, i) =>
                          i === index
                            ? { ...c, quote: e.target.value, start: undefined }
                            : c,
                        ),
                      )
                    }
                  />
                </label>
                <details>
                  <summary>
                    {L('查看这一页原文', 'Read the source page')}
                  </summary>
                  <p className="whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {
                      versions
                        .find((v) => v.id === citation.version_id)
                        ?.pages.find((p) => p.page === citation.page)?.text
                    }
                  </p>
                </details>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    setCitations((cs) => cs.filter((_, i) => i !== index))
                  }
                >
                  {L(
                    '移除此条（请同步调整正文编号）',
                    'Remove quotation (also update text references)',
                  )}
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={busy || !versions.length || citations.length >= 100}
              onClick={() =>
                setCitations((cs) => [
                  ...cs,
                  {
                    version_id: versions[0].id,
                    page: versions[0].pages[0]?.page || 1,
                    quote: '',
                  },
                ])
              }
            >
              {L('添加引文', 'Add quotation')}
            </Button>
            <label>
              {L('修订依据', 'Reason for correction')}
              <Textarea
                required
                maxLength={10000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
            </label>
            {(outdated || error) && (
              <p role="alert">
                {outdated
                  ? L(
                      '任务已更新，请关闭窗口后重新核查。',
                      'The task changed. Close this window and review the latest version.',
                    )
                  : error}
              </p>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                outdated ||
                !summary.trim() ||
                !reason.trim() ||
                !citations.length
              }
            >
              {L('保存修订，等待审读', 'Save revision for review')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
