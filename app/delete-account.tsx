'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import { Field } from './workspace';
export default function DeleteAccount({ userId }: { userId: string }) {
  const { locale, t } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [preview, setPreview] = useState<{
      projects: { id: string; title: string }[];
      shared_projects: number;
      digest: string;
    } | null>(null),
    [email, setEmail] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      setPreview(await api('/api/account/delete'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/account/delete', {
        email,
        digest: preview.digest,
        confirm: confirmed,
      });
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (
            key?.startsWith(`foliotrace:draft:${encodeURIComponent(userId)}:`)
          )
            localStorage.removeItem(key);
        }
      } catch {
        /* Account deletion has succeeded even if browser storage is unavailable. */
      }
      window.location.assign('/account-closed');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <section className="settings-card account-danger">
      <h2>{L('删除账号', 'Delete account')}</h2>
      <p>
        {L(
          '停用登录、删除模型密钥与云盘授权，并永久清理你负责的项目。请先下载需要保留的备份。',
          'Disable sign-in, remove model keys and cloud credentials, and permanently delete projects you own. Download any backups you need first.',
        )}
      </p>
      <Button variant="destructive" disabled={busy} onClick={() => void load()}>
        {L('查看删除范围', 'Review deletion')}
      </Button>
      {error && !preview && <p role="alert">{t(error)}</p>}
      {preview && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setPreview(null);
          }}
        >
          <DialogContent className="sm:max-w-xl" showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>
                {L(
                  '确认删除账号与本人项目',
                  'Confirm account and project deletion',
                )}
              </DialogTitle>
              <DialogDescription>
                {L(
                  '此操作不可撤销。为确认身份，必须在最近 15 分钟内重新登录。',
                  'This cannot be undone. You must have signed in again within the last 15 minutes.',
                )}
              </DialogDescription>
            </DialogHeader>
            <p>
              {L(
                `以下 ${preview.projects.length} 个项目及原件将被永久删除，项目成员也会失去访问：`,
                `These ${preview.projects.length} projects and their originals will be permanently deleted, including access for collaborators:`,
              )}
            </p>
            <ul className="deletion-projects">
              {preview.projects.map((p) => (
                <li key={p.id}>{p.title}</li>
              ))}
            </ul>
            <p>
              {L(
                `你在他人项目中的 ${preview.shared_projects} 个成员身份将被移除。历史研究贡献会以“已删除的研究者”匿名保留；你写入材料正文的个人信息不会自动改写。`,
                `Your memberships in ${preview.shared_projects} other projects will be removed. Historical contributions remain attributed to a deleted researcher; personal information you wrote into research content is not automatically rewritten.`,
              )}
            </p>
            <p className="settings-hint">
              {L(
                '已开始的厂商调用可能仍产生费用；Canwoo 会停止后续调用。账号立即停用，文件清理失败会在后台重试。',
                'An already-started provider request may still incur charges. Subsequent calls stop. Access is disabled immediately; failed file cleanup retries in the background.',
              )}
            </p>
            <Field label={L('输入账号邮箱确认', 'Enter your account email')}>
              <Input
                type="email"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <label className="confirmation-check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {L(
                '我已保留所需备份，理解本人项目及成员访问将被删除。',
                'I have kept the backups I need and understand that my projects and member access will be deleted.',
              )}
            </label>
            {error && <p role="alert">{t(error)}</p>}
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                {L('取消', 'Cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={busy || !confirmed || !email.trim()}
                onClick={() => void remove()}
              >
                {busy
                  ? L('正在停用与清理…', 'Disabling access and cleaning up…')
                  : L('永久删除我的账号', 'Permanently delete my account')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
