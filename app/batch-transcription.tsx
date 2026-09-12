'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, RefreshCw, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { selectedPages } from '@/lib/page-selection';
import { api } from '@/lib/client-api';
import { OCR_BATCH_PAGES, type OcrBatchView } from '@/lib/ocr-batch-types';
import type { SourceVersion } from '@/lib/types';
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
export default function BatchTranscription({
  version,
  currentPage,
  modelId,
  imageForPage,
  onClose,
  onPage,
}: {
  version: SourceVersion;
  currentPage: number;
  modelId: string;
  imageForPage: (page: number) => Promise<string>;
  onClose: () => void;
  onPage: (page: number) => void;
}) {
  const { locale, t } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [view, setView] = useState<OcrBatchView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState(
    version.pages
      .filter((p) => !p.text.trim())
      .slice(0, OCR_BATCH_PAGES)
      .map((p) => p.page)
      .join(', ') || String(currentPage),
  );
  const [budget, setBudget] = useState('1'),
    [uploading, setUploading] = useState(0);
  const alive = useRef(true),
    requestId = useRef(crypto.randomUUID());
  const state = view?.batch?.status;
  useEffect(() => {
    alive.current = true;
    let inFlight = false;
    async function read() {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await api<OcrBatchView>(
          `/api/ocr-batches?project_id=${version.project_id}&version_id=${version.id}`,
        );
        if (alive.current) setView(next);
      } catch (e) {
        if (alive.current)
          setError(
            e instanceof Error ? e.message : 'Unable to load transcription',
          );
      } finally {
        inFlight = false;
      }
    }
    void read();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void read();
    }, 6000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [version.id, version.project_id]);
  async function control(action: 'pause' | 'resume' | 'cancel') {
    if (!view?.batch) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'cancel') requestId.current = crypto.randomUUID();
      setView(
        await api<OcrBatchView>('/api/ocr-batches', {
          id: view.batch.id,
          action,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : 'Unable to update batch');
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError('');
    try {
      let next = view;
      if (
        !next?.batch ||
        ['completed', 'cancelled', 'stale'].includes(next.batch.status)
      ) {
        next = await api<OcrBatchView>('/api/ocr-batches', {
          action: 'create',
          id: requestId.current,
          project_id: version.project_id,
          version_id: version.id,
          connection_id: modelId,
          pages: selectedPages(
            selection,
            version.pages.map((p) => p.page),
            OCR_BATCH_PAGES,
          ),
          budget_usd: Number(budget),
          locale,
        });
        if (alive.current) setView(next);
      }
      if (!next.batch) throw new Error('Batch unavailable');
      for (const row of next.pages) {
        if (!alive.current) return;
        if (row.status !== 'pending') continue;
        setUploading(row.page);
        const image = await imageForPage(row.page);
        if (!alive.current) return;
        await api('/api/ocr-batches', {
          action: 'stage',
          id: next.batch.id,
          page: row.page,
          image,
        });
      }
      if (!alive.current) return;
      const queued = await api<OcrBatchView>('/api/ocr-batches', {
        action: 'start',
        id: next.batch.id,
      });
      setView(queued);
      requestId.current = crypto.randomUUID();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? t(e.message) : 'Unable to prepare batch');
    } finally {
      if (alive.current) {
        setBusy(false);
        setUploading(0);
      }
    }
  }
  const newBatch =
    !state || ['completed', 'cancelled', 'stale'].includes(state);
  const labels: Record<string, [string, string]> = {
    staging: ['等待上传', 'Waiting for page images'],
    queued: ['已排队，可关闭页面', 'Queued; safe to close'],
    running: ['后台转录中，可关闭页面', 'Transcribing in background'],
    paused: ['已暂停', 'Paused'],
    cancelled: ['已取消', 'Cancelled'],
    completed: ['候选已就绪，等待人工核查', 'Candidates ready for review'],
    attention: ['需要处理', 'Needs attention'],
    stale: ['材料版本已变化', 'Source version changed'],
    pending: ['未上传', 'Not uploaded'],
    staged: ['已上传', 'Uploaded'],
    review: ['查看候选', 'Review candidate'],
  };
  const label = (s: string) => (labels[s] ? L(...labels[s]) : s);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {L('批量转录与核查', 'Batch transcription and review')}
          </DialogTitle>
          <DialogDescription>
            {L(
              '先上传选定页图像，之后可关闭浏览器。后台按本批与项目预算逐页处理，已有候选会复用；原文不会被自动覆盖。',
              'Upload selected page images first, then close your browser. Background processing respects batch and project budgets and reuses saved candidates. Source text is never replaced automatically.',
            )}
          </DialogDescription>
        </DialogHeader>
        {newBatch && (
          <>
            <Field label={L('页码（最多 100 页）', 'Pages (up to 100)')}>
              <Input
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field
              label={L('本批费用上限（美元）', 'Batch spending limit (USD)')}
            >
              <Input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                disabled={busy}
              />
            </Field>
          </>
        )}
        {view?.batch && (
          <output className="settings-feedback">
            <strong>{label(view.batch.status)}</strong>
            <p>
              {view.pages.filter((p) => p.status === 'review').length} /{' '}
              {view.pages.length}{' '}
              {L(
                '页候选已保存；仍需对照原件核查。',
                'page candidates saved; check them against the originals.',
              )}
            </p>
            <p>
              {L('已计入／预留', 'Committed / reserved')}: $
              {(view.committed_units / 1e6).toFixed(4)} / $
              {(view.batch.budget_units / 1e6).toFixed(2)}
            </p>
            {view.batch.detail && <p>{t(view.batch.detail)}</p>}
          </output>
        )}
        {uploading > 0 && (
          <output>
            <Loader2 className="inline animate-spin" size={16} />{' '}
            {L(
              `正在上传第 ${uploading} 页，请暂时保持页面打开。`,
              `Uploading page ${uploading}; keep this page open for now.`,
            )}
          </output>
        )}
        {error && (
          <p className="settings-feedback" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(newBatch || (state === 'staging' && view?.controllable)) && (
            <Button
              disabled={busy || !modelId || !view}
              onClick={() => void start()}
            >
              <Play size={16} />
              {state === 'staging'
                ? L('继续上传并开始', 'Continue upload and start')
                : L('准备并开始', 'Prepare and start')}
            </Button>
          )}
          {view?.controllable && (
            <>
              {['queued', 'running'].includes(state || '') && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void control('pause')}
                >
                  <Pause size={16} />
                  {L('处理本页后暂停', 'Pause after this page')}
                </Button>
              )}
              {['paused', 'attention'].includes(state || '') && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void control('resume')}
                >
                  <RefreshCw size={16} />
                  {L('核对后继续', 'Continue after checking')}
                </Button>
              )}
              {!newBatch && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void control('cancel')}
                >
                  <Square size={16} />
                  {L('取消后续页', 'Cancel remaining pages')}
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" onClick={onClose}>
            {L('关闭', 'Close')}
          </Button>
        </div>
        {!!view?.pages.length && (
          <div
            className="max-h-64 overflow-y-auto divide-y"
            aria-label={L('逐页进度', 'Page progress')}
          >
            {view.pages.map((row) => (
              <div
                key={row.page}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div>
                  <span>
                    {L(`第 ${row.page} 页`, `Page ${row.page}`)} ·{' '}
                    {label(row.status)}
                  </span>
                  {row.detail && (
                    <p className="text-sm text-muted-foreground">
                      {t(row.detail)}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onPage(row.page);
                    onClose();
                  }}
                >
                  {L('查看原页', 'Open page')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
