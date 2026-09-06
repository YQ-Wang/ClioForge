'use client';
import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Pause,
  Play,
  RotateCw,
  Square,
  FileText,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { Preparation } from '@/lib/material-preparation';
import { sourcePath } from '@/lib/navigation';
type Status = {
  indexed: number;
  writable: boolean;
  preparation: (Preparation & { controllable: boolean }) | null;
  sources: {
    id: string;
    title: string;
    version_id: string;
    pages: number;
    readable: number;
  }[];
};
export default function MaterialPreparation({
  projectId,
  connection,
  onIndexed,
}: {
  projectId: string;
  connection: string;
  onIndexed: (count: number) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const preparationState = status?.preparation?.status;
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const result = await api<Status>(
          `/api/preparation?project_id=${projectId}`,
        );
        if (active) {
          setStatus(result);
          onIndexed(result.indexed);
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Preparation unavailable');
      }
    }
    void read();
    const timer = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        preparationState &&
        ['queued', 'running', 'pause_requested', 'cancel_requested'].includes(
          preparationState,
        )
      )
        void read();
    }, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId, onIndexed, preparationState]);
  async function action(name: 'start' | 'pause' | 'resume' | 'cancel') {
    setBusy(true);
    setError('');
    try {
      const result = await api<Status>(
        '/api/preparation',
        name === 'start'
          ? {
              action: name,
              id: crypto.randomUUID(),
              project_id: projectId,
              connection_id: connection,
            }
          : { action: name, id: status?.preparation?.id },
      );
      setStatus(result);
      onIndexed(result.indexed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preparation failed');
    } finally {
      setBusy(false);
    }
  }
  const task = status?.preparation,
    active =
      task &&
      ['queued', 'running', 'pause_requested', 'cancel_requested'].includes(
        task.status,
      );
  const labels: Record<string, string> = {
    queued: L('等待处理', 'Queued'),
    running: L('正在准备', 'Preparing'),
    pause_requested: L('当前批次完成后暂停', 'Pausing after this batch'),
    cancel_requested: L('正在停止', 'Stopping'),
    paused: L('已暂停', 'Paused'),
    completed: L('已准备完成', 'Ready'),
    cancelled: L('已停止', 'Stopped'),
    uncertain: L('需要你确认', 'Needs attention'),
    stale: L('资料已更新', 'Sources updated'),
  };
  const unreadable =
    status?.sources.reduce((sum, s) => sum + s.pages - s.readable, 0) || 0;
  return (
    <section
      className="material-preparation"
      aria-label={L('材料准备进度', 'Source preparation')}
    >
      <div className="preparation-heading">
        <FileText size={17} />
        <strong>{L('材料准备', 'Source preparation')}</strong>
        {task && (
          <output className="preparation-state">
            {active ? (
              <Loader2 className="animate-spin" size={14} />
            ) : task.status === 'completed' ? (
              <CheckCircle2 size={14} />
            ) : null}
            {labels[task.status]}
          </output>
        )}
      </div>
      <p>
        {L(
          `已准备 ${status?.indexed || 0} 段供按意思查找${unreadable ? `；${unreadable} 页尚无可读文字，请先识别或校订` : ''}。`,
          `Prepared ${status?.indexed || 0} passages for search by meaning${unreadable ? `; ${unreadable} pages need transcription or correction` : ''}.`,
        )}
      </p>
      {task && task.total > 0 && (
        <progress
          aria-label={L('准备进度', 'Preparation progress')}
          max={task.total}
          value={task.indexed}
        />
      )}
      {task?.detail && (
        <p className="settings-feedback">
          {task.status === 'uncertain'
            ? L(
                '本批结果尚未确认，请先检查模型用量。继续会使用新的请求，可能再次产生费用。',
                'This batch could not be confirmed. Check model usage before resuming; a new request may incur another charge.',
              )
            : L(
                '资料版本已变化，请重新准备。',
                'Sources changed; start a new preparation.',
              )}
        </p>
      )}
      {status?.writable && (
        <div className="flow-actions">
          {(!task ||
            ['completed', 'cancelled', 'stale'].includes(task.status)) && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !connection}
              onClick={() => void action('start')}
            >
              <Play size={14} />
              {L('后台准备／更新', 'Prepare / update in background')}
            </Button>
          )}
          {task?.controllable &&
            ['queued', 'running'].includes(task.status) && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void action('pause')}
              >
                <Pause size={14} />
                {L('暂停', 'Pause')}
              </Button>
            )}
          {task?.controllable &&
            ['paused', 'uncertain'].includes(task.status) && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void action('resume')}
              >
                <RotateCw size={14} />
                {task.status === 'uncertain'
                  ? L('已检查用量，继续', 'Usage checked — resume')
                  : L('继续准备', 'Resume preparation')}
              </Button>
            )}
          {task?.controllable &&
            !['completed', 'cancelled', 'stale', 'cancel_requested'].includes(
              task.status,
            ) && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void action('cancel')}
              >
                <Square size={14} />
                {L('停止', 'Stop')}
              </Button>
            )}
        </div>
      )}
      <small>
        {L(
          '开始后可关闭网页。只处理已提取的文字；模型费用计入项目预算。已完成的段落会保留。',
          'You can close this page after starting. Only extracted text is processed, using the project allowance. Completed passages are retained.',
        )}
      </small>
      {!!status?.sources.length && (
        <details>
          <summary>{L('查看各份材料', 'View source readiness')}</summary>
          <ul className="preparation-sources">
            {status.sources.map((s) => (
              <li key={s.id}>
                <a href={sourcePath(projectId, s.version_id, 1)}>{s.title}</a>
                <span>
                  {L(
                    `${s.readable}/${s.pages} 页有文字`,
                    `${s.readable}/${s.pages} pages have text`,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
