'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Square, CheckCircle2, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { selectedPages } from '@/lib/page-selection';
import type { Run, SourceVersion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Field } from './workspace';
type Checkpoint = {
  page: number;
  status: 'waiting' | 'running' | 'review' | 'failed';
  detail?: string;
};
export default function BatchTranscription({
  version,
  currentPage,
  runs,
  onRequest,
  onClose,
  onPage,
}: {
  version: SourceVersion;
  currentPage: number;
  runs: Run[];
  onRequest: (page: number) => Promise<Run>;
  onClose: () => void;
  onPage: (page: number) => void;
}) {
  const { locale, t } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const blank = version.pages
    .filter((page) => !page.text.trim())
    .slice(0, 10)
    .map((page) => page.page);
  const [selection, setSelection] = useState(
      (blank.length ? blank : [currentPage]).join(', '),
    ),
    [busy, setBusy] = useState(false),
    [stopping, setStopping] = useState(false),
    [error, setError] = useState(''),
    [rows, setRows] = useState<Checkpoint[]>([]);
  const stop = useRef(false),
    alive = useRef(true);
  const completed = useRef(new Map<number, Run>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current = true;
    };
  }, []);
  async function start() {
    let pages: number[];
    try {
      pages = selectedPages(
        selection,
        version.pages.map((page) => page.page),
      );
    } catch (e) {
      setError(
        e instanceof Error ? t(e.message) : L('页码无效。', 'Invalid pages.'),
      );
      return;
    }
    stop.current = false;
    setStopping(false);
    setBusy(true);
    setError('');
    setRows(pages.map((page) => ({ page, status: 'waiting' })));
    try {
      for (const page of pages) {
        if (stop.current || !alive.current) break;
        setRows((current) =>
          current.map((row) =>
            row.page === page ? { ...row, status: 'running' } : row,
          ),
        );
        try {
          const saved =
            completed.current.get(page) ||
            runs.find(
              (run) =>
                run.kind === 'ocr' &&
                run.status === 'succeeded' &&
                run.result &&
                run.model_snapshot.page === page &&
                run.source_version_ids.includes(version.id),
            );
          const run = saved || (await onRequest(page));
          if (!alive.current) break;
          if (run.status !== 'succeeded' || !run.result)
            throw new Error(
              run.error || L('结果尚未完成。', 'The result is not complete.'),
            );
          completed.current.set(page, run);
          setRows((current) =>
            current.map((row) =>
              row.page === page
                ? {
                    page,
                    status: 'review',
                    detail:
                      run.error ||
                      (saved
                        ? L(
                            '已复用候选，没有再次调用模型。',
                            'Reused the saved candidate without another model call.',
                          )
                        : undefined),
                  }
                : row,
            ),
          );
        } catch (e) {
          if (!alive.current) break;
          const message =
            e instanceof Error
              ? e.message
              : L('本页转录未完成。', 'This page could not be transcribed.');
          setRows((current) =>
            current.map((row) =>
              row.page === page
                ? { page, status: 'failed', detail: t(message) }
                : row,
            ),
          );
          setError(
            L(
              '处理已停止。已完成页面保留，后续页没有调用模型。',
              'Processing stopped. Completed pages are preserved; later pages were not sent to the model.',
            ),
          );
          break;
        }
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          stop.current = true;
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {L('批量转录与核查', 'Batch transcription and review')}
          </DialogTitle>
          <DialogDescription>
            {L(
              '每次最多 10 页，按项目预算逐页处理。候选不会覆盖原文；已有候选会复用。请保持页面打开，关闭会停止后续页。',
              'Process up to 10 pages sequentially within the project budget. Candidates never replace source text; saved candidates are reused. Keep this page open. Closing stops subsequent pages.',
            )}
          </DialogDescription>
        </DialogHeader>
        <Field label={L('要处理的页码', 'Pages to process')}>
          <Input
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            placeholder="1-3, 8"
            disabled={busy}
          />
        </Field>
        <p className="settings-hint">
          {L(
            '优先选择没有文字的页。如需重新转录已有候选，请使用阅读页的单页转录。重试失败页可能再次产生费用，请先核对记录。',
            'Pages without text are preselected. Use single-page transcription to replace an existing candidate. Retrying failed pages may incur another charge; check their records first.',
          )}
        </p>
        {error && <p role="alert">{error}</p>}
        <ol className="transcription-checkpoints">
          {rows.map((row) => (
            <li key={row.page}>
              <span>
                {row.status === 'running' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : row.status === 'review' ? (
                  <CheckCircle2 size={16} />
                ) : null}
                {L('第 ' + row.page + ' 页', 'Page ' + row.page)}
              </span>
              <span>
                {row.status === 'waiting'
                  ? L('尚未开始', 'Not started')
                  : row.status === 'running'
                    ? L('正在转录', 'Transcribing')
                    : row.status === 'review'
                      ? L(
                          '候选已保存 · 待核查',
                          'Candidate saved · review required',
                        )
                      : L('需要处理', 'Needs attention')}
              </span>
              {row.detail && <p>{row.detail}</p>}
              {row.status === 'review' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    onPage(row.page);
                  }}
                >
                  {L('去核查', 'Review page')}
                </Button>
              )}
            </li>
          ))}
        </ol>
        <div className="form-actions">
          <Button
            variant="ghost"
            onClick={() => {
              stop.current = true;
              onClose();
            }}
          >
            {L('关闭', 'Close')}
          </Button>
          {busy ? (
            <Button
              variant="outline"
              disabled={stopping}
              onClick={() => {
                stop.current = true;
                setStopping(true);
              }}
            >
              <Square size={14} />
              {stopping
                ? L('当前页结束后停止…', 'Stopping after this page…')
                : L('本页结束后停止', 'Stop after this page')}
            </Button>
          ) : (
            <Button onClick={() => void start()}>
              <Play size={14} />
              {rows.length
                ? L('处理尚未完成的页', 'Process unfinished pages')
                : L('开始逐页转录', 'Start transcription')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
