'use client';
import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilePicker } from '@/components/ui/file-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/provider';
import { api } from '@/lib/client-api';
import { readBackup } from '@/lib/read-backup';
import { Field } from './workspace';
type Session = {
  id: string;
  project_id: string;
  status: string;
  cursor: number;
  total: number;
  files: { source_id: string; original_id: string; uploaded?: number }[];
};
export default function RestoreProject({
  onComplete,
  onClose,
}: {
  onComplete: (id: string) => void;
  onClose: () => void;
}) {
  const { locale, t } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [backup, setBackup] = useState<Awaited<
      ReturnType<typeof readBackup>
    > | null>(null),
    [title, setTitle] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState<Session | null>(null),
    [stage, setStage] = useState(0);
  const stop = useRef(false);
  useEffect(() => {
    void api<{ restores: Session[] }>('/api/project-restore')
      .then((r) => setPending(r.restores[0] || null))
      .catch((e) => setError(e.message));
    return () => {
      stop.current = true;
    };
  }, []);
  async function select(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setBackup(null);
    setStage(0);
    setMessage(L('正在读取并校验备份…', 'Reading and verifying the backup…'));
    try {
      const data = await readBackup(file);
      setBackup(data);
      setTitle(
        `${data.metadata.project.title} · ${L('恢复副本', 'Restored copy')}`.slice(
          0,
          200,
        ),
      );
      setMessage(L('文件校验通过。', 'File checks passed.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!backup) return;
    stop.current = false;
    setBusy(true);
    setError('');
    try {
      const session = await api<Session>('/api/project-restore', {
        action: pending ? 'resume' : 'start',
        id: pending?.id,
        metadata: backup.metadataText,
        manifest: backup.manifest,
        title,
      });
      setPending(session);
      setStage(1);
      for (const [index, item] of session.files.entries()) {
        if (stop.current) break;
        if (item.uploaded || session.status === 'records') continue;
        setMessage(
          L(
            `保存原件 ${index + 1}/${session.files.length}…`,
            `Saving original ${index + 1}/${session.files.length}…`,
          ),
        );
        const original = backup.manifest.files.find(
          (f) => f.source_id === item.original_id,
        );
        if (!original)
          throw new Error(L('原件映射缺失。', 'Missing original mapping.'));
        const response = await fetch(
          `/api/project-restore?id=${session.id}&source=${item.source_id}`,
          { method: 'PUT', body: backup.entries.get(original.path) },
        );
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Upload failed');
      }
      setStage(2);
      while (!stop.current) {
        const result = await api<{
          complete: boolean;
          project_id: string;
          cursor: number;
          total: number;
        }>('/api/project-restore', { action: 'step', id: session.id });
        if (result.complete) {
          onComplete(result.project_id);
          return;
        }
        setMessage(
          L(
            `恢复研究记录 ${result.cursor}/${result.total}…`,
            `Restoring research records ${result.cursor}/${result.total}…`,
          ),
        );
      }
      setMessage(
        L(
          '已暂停。重新选择同一备份即可继续。',
          'Paused. Select this same backup to continue.',
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
            {L('从备份恢复项目', 'Restore a project backup')}
          </DialogTitle>
          <DialogDescription>
            {L(
              '创建独立的新项目，保留原件、版本与引用。原成员不会自动获得权限，模型密钥不导入，任务和关注保持暂停。',
              'Create an independent project with originals, versions and citations. Membership and keys are not imported; tasks and alerts remain inactive.',
            )}
          </DialogDescription>
        </DialogHeader>
        <ol className="restore-stages">
          {[
            L('校验备份', 'Verify backup'),
            L('保存原件', 'Save originals'),
            L('恢复研究记录', 'Restore records'),
          ].map((label, index) => (
            <li key={label} aria-current={stage === index ? 'step' : undefined}>
              {index < stage ? '✓' : index + 1} · {label}
            </li>
          ))}
        </ol>
        {pending && (
          <div className="settings-card">
            <p>
              {L(
                pending.status === 'cancelled'
                  ? '上次取消后的清理尚未完成，请点击重试清理。'
                  : '发现未完成的恢复。请选择同一 ZIP 文件继续，或取消并清理这份未完成副本。',
                pending.status === 'cancelled'
                  ? 'Cleanup is still pending. Retry removing the cancelled copy.'
                  : 'An unfinished restore was found. Select the same ZIP to continue, or cancel and remove the unfinished copy.',
              )}
            </p>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void api('/api/project-restore', {
                  action: 'cancel',
                  id: pending.id,
                })
                  .then(() => {
                    setPending(null);
                    setMessage(
                      L('未完成副本已清理。', 'Unfinished copy removed.'),
                    );
                  })
                  .catch((e) => {
                    setError(e.message);
                    setPending({ ...pending, status: 'cancelled' });
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {pending.status === 'cancelled'
                ? L('重试清理', 'Retry cleanup')
                : L('取消这次恢复', 'Cancel this restore')}
            </Button>
          </div>
        )}
        <FilePicker
          label={L('选择参伍备份（ZIP）', 'Choose ClioForge backup (ZIP)')}
          accept=".zip"
          disabled={busy}
          onSelect={select}
        />
        <p className="settings-hint">
          {L(
            '最多 512 MB、500 份原件；单份原件 20 MB、研究记录 8 MB。请保持页面打开，关闭后可继续。',
            'Up to 512 MB and 500 originals; 20 MB per original and 8 MB of research records. Keep this page open; interrupted restores can resume.',
          )}
        </p>
        {backup && (
          <>
            <p>
              {L(
                `${backup.metadata.records.sources?.length || 0} 份材料 · ${backup.metadata.records.notes?.length || 0} 个笔记版本`,
                `${backup.metadata.records.sources?.length || 0} sources · ${backup.metadata.records.notes?.length || 0} note versions`,
              )}
            </p>
            <Field label={L('恢复后的项目名称', 'Restored project name')}>
              <Input
                value={title}
                maxLength={200}
                disabled={busy || !!pending}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
          </>
        )}
        {message && <output>{message}</output>}
        {error && <p role="alert">{t(error)}</p>}
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
          <Button
            disabled={
              busy ||
              !backup ||
              !title.trim() ||
              pending?.status === 'cancelled'
            }
            onClick={() => void restore()}
          >
            {busy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <ArchiveRestore size={16} />
            )}{' '}
            {pending
              ? L('继续恢复', 'Resume restore')
              : L('创建恢复副本', 'Create restored copy')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
