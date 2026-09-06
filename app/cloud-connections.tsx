'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  FileText,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GoogleMark } from '@/components/canwoo-brand';
import { useI18n } from '@/lib/i18n/provider';
import { api } from '@/lib/client-api';
import { extractPages, documentType } from '@/lib/documents';
import { pickGoogleFiles } from '@/lib/platform/google-picker';
import type { CloudFile } from '@/lib/platform/connections';
type Connection = {
  provider: 'google';
  configured: boolean;
  connected: boolean;
};
export default function CloudConnections({
  projectId,
  onImported,
  onRead,
}: {
  projectId: string;
  onImported: () => Promise<unknown>;
  onRead?: (sourceId: string) => void;
}) {
  const { locale } = useI18n();
  const L = useCallback(
    (zh: string, en: string) => (locale === 'en' ? en : zh),
    [locale],
  );
  const [connection, setConnection] = useState<Connection | null>(null);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    name: string;
  } | null>(null);
  const [imported, setImported] = useState(0);
  const [importedSourceId, setImportedSourceId] = useState('');
  const returned = useRef(false);
  const refresh = useCallback(async () => {
    const data = await api<{ connections: Connection[] }>('/api/connections');
    setConnection(
      data.connections.find((item) => item.provider === 'google') || null,
    );
  }, []);
  useEffect(() => {
    void refresh().catch(() =>
      setMessage(
        L(
          '暂时无法读取 Google 连接，请刷新重试。',
          'Could not check your Google connection. Please refresh and try again.',
        ),
      ),
    );
    const status = new URLSearchParams(location.search).get('drive');
    if (status === 'cancelled')
      setMessage(
        L(
          '已取消连接，没有导入任何文件。你可以重新选择 Google 账号。',
          'Connection cancelled. No files were imported. You can choose a Google account again.',
        ),
      );
  }, [L, refresh]);
  const action = useCallback(
    async (work: () => Promise<unknown>) => {
      setBusy(true);
      setMessage('');
      try {
        await work();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : L(
                '操作没有完成，请重试。',
                'That did not finish. Please try again.',
              ),
        );
      } finally {
        setBusy(false);
      }
    },
    [L],
  );
  async function connect() {
    const data = await api<{ result: { url: string } }>('/api/connections', {
      action: 'connect',
      provider: 'google',
      project_id: projectId,
    });
    location.assign(data.result.url);
  }
  const selectFiles = useCallback(async () => {
    const config = await api<{
      result: { apiKey: string; appId: string; accessToken: string };
    }>('/api/connections', { action: 'picker', provider: 'google' });
    const ids = await pickGoogleFiles(config.result, locale);
    const selected: CloudFile[] = [];
    for (const id of ids)
      selected.push(
        (
          await api<{ file: CloudFile }>(
            `/api/connections?provider=google&id=${encodeURIComponent(id)}`,
          )
        ).file,
      );
    if (ids.length) {
      setFiles(selected);
      setErrors({});
      setProgress(null);
    }
  }, [locale]);
  useEffect(() => {
    if (
      returned.current ||
      !connection?.connected ||
      new URLSearchParams(location.search).get('drive') !== 'connected'
    )
      return;
    returned.current = true;
    const url = new URL(location.href);
    url.searchParams.delete('drive');
    history.replaceState(null, '', url.pathname + url.search);
    void action(selectFiles);
  }, [connection?.connected, action, selectFiles]);
  async function importOne(file: CloudFile) {
    const response = await fetch(
      `/api/connections/file?provider=google&id=${encodeURIComponent(file.id)}&revision=${encodeURIComponent(file.revision)}`,
    );
    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(
        error.error ||
          L(
            '无法读取文件，请重新选择。',
            'Could not read this file. Please select it again.',
          ),
      );
    }
    const blob = await response.blob();
    const name = file.mimeType.startsWith('application/vnd.google-apps.')
      ? `${file.name}.pdf`
      : file.name;
    const original = new File([blob], name, {
      type: blob.type || file.mimeType,
    });
    const pages = await extractPages(original, documentType(original));
    const imported = await api<{
      result: { source_id: string | null; skipped: boolean };
    }>('/api/connections', {
      action: 'import',
      provider: 'google',
      project_id: projectId,
      file: { id: file.id, revision: file.revision },
      pages,
    });
    setFiles((current) => current.filter((item) => item.id !== file.id));
    setErrors((current) => {
      const next = { ...current };
      delete next[file.id];
      return next;
    });
    return imported.result;
  }
  async function importFiles(selected: CloudFile[]) {
    let succeeded = 0;
    let reused = 0;
    let firstSourceId = '';
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      setProgress({ done: i, total: selected.length, name: file.name });
      try {
        const result = await importOne(file);
        if (!firstSourceId && result.source_id)
          firstSourceId = result.source_id;
        if (result.skipped) reused++;
        succeeded++;
      } catch (error) {
        setErrors((current) => ({
          ...current,
          [file.id]:
            error instanceof Error
              ? error.message
              : L(
                  '导入未完成，可以重试。',
                  'Import did not finish. You can retry.',
                ),
        }));
      }
      setProgress({ done: i + 1, total: selected.length, name: '' });
    }
    if (succeeded) {
      setImported((current) => current + succeeded);
      await onImported();
      setImportedSourceId(firstSourceId);
    }
    setMessage(
      L(
        `${reused ? `新增 ${succeeded - reused} 份，${reused} 份已在项目中，未重复保存。` : `${succeeded} 份资料已就绪。`}${succeeded < selected.length ? '未完成的文件保留在下方，可以分别重试。' : '可以开始阅读了。'}`,
        `${reused ? `${succeeded - reused} added; ${reused} already in this project, without duplicates. ` : `${succeeded} sources are ready. `}${succeeded < selected.length ? 'Files that did not finish remain below for retry.' : 'You can start reading.'}`,
      ),
    );
  }
  function typeName(mime: string) {
    if (mime === 'application/pdf') return 'PDF';
    if (mime.includes('google-apps.document')) return 'Google Docs';
    if (mime.includes('google-apps.spreadsheet')) return 'Google Sheets';
    if (mime.includes('google-apps.presentation')) return 'Google Slides';
    return mime.startsWith('image/')
      ? L('照片或图像', 'Photograph or image')
      : L('文本', 'Text');
  }
  return (
    <div className="drive-import">
      <div className="platform-heading">
        <div>
          <h2>{L('从 Google Drive 导入', 'Import from Google Drive')}</h2>
          <p>
            {L(
              '选择你要研究的资料，带着原件与出处一起开始阅读。',
              'Choose the sources you want to study. Bring their originals and provenance with you.',
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void action(refresh)}
        >
          <RefreshCw size={15} />
          {L('刷新', 'Refresh')}
        </Button>
      </div>
      {message && (
        <output className="platform-notice" aria-live="polite">
          {message}
        </output>
      )}
      <section className="drive-card">
        <header>
          <GoogleMark />
          <h3>Google Drive</h3>
          {connection?.connected && (
            <span className="drive-status">
              <CheckCircle2 size={15} />
              {L('已连接', 'Connected')}
            </span>
          )}
        </header>
        <p>
          {L(
            '你选择哪些文件，Canwoo 才能导入哪些文件。原件会保存在这个研究项目中，你的云端文件保持原样。',
            'You choose which files Canwoo can import. A copy of the original is saved in this research project; the file in your Drive stays as it is.',
          )}
        </p>
        <div className="flow-actions">
          {!connection ? (
            <p>{L('正在检查连接…', 'Checking connection…')}</p>
          ) : !connection.configured ? (
            <p>
              {L(
                'Google 导入正在准备中。你可以先从电脑导入，稍后再回来连接。',
                'Google import is being prepared. You can upload from your computer and connect here later.',
              )}
            </p>
          ) : (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void action(connection.connected ? selectFiles : connect)
                }
              >
                {connection.connected ? (
                  <FilePlus2 size={17} />
                ) : (
                  <GoogleMark />
                )}
                {busy
                  ? L('正在准备…', 'Preparing…')
                  : connection.connected
                    ? L('选择文件', 'Choose files')
                    : L('使用 Google 连接', 'Connect with Google')}
              </Button>
              {connection.connected && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void action(connect)}
                >
                  {L('切换账号或重新连接', 'Switch account or reconnect')}
                </Button>
              )}
            </>
          )}
        </div>
        <details>
          <summary>{L('文件与隐私', 'Files and privacy')}</summary>
          <p>
            {L(
              '每次最多选择 20 份文件，每份最大 20 MB。Google 文档、表格和演示文稿会保存为 PDF；照片和扫描件可以在阅读时识别文字。',
              'Choose up to 20 files at a time, up to 20 MB each. Google documents, spreadsheets and presentations are saved as PDFs. You can transcribe photographs and scans while reading.',
            )}
          </p>
          <p>
            {L(
              'Google 的授权说明包含读取和修改所选文件；Canwoo 只读取和导入，不修改云端原件。断开连接后，已导入的材料仍保留在项目内。',
              'Google describes this permission as reading and modifying selected files. Canwoo reads and imports them; it does not edit your cloud originals. Disconnecting leaves imported sources in this project.',
            )}
          </p>
          {connection?.connected && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api('/api/connections', {
                    action: 'disconnect',
                    provider: 'google',
                  });
                  setFiles([]);
                  await refresh();
                })
              }
            >
              <Unplug size={14} />
              {L('断开 Google Drive', 'Disconnect Google Drive')}
            </Button>
          )}
        </details>
      </section>
      {progress && (
        <div className="import-progress" aria-live="polite">
          <progress value={progress.done} max={progress.total} />
          <p>
            {progress.done} / {progress.total} ·{' '}
            {progress.name || L('本轮导入已结束', 'Import finished')}
          </p>
        </div>
      )}
      {!!files.length && (
        <section className="platform-form">
          <div className="platform-heading">
            <h3>
              {L('确认要带入项目的资料', 'Sources to bring into this project')}
            </h3>
            <Button
              disabled={busy}
              onClick={() => void action(() => importFiles(files))}
            >
              {L('导入所选资料', 'Import selected sources')}
            </Button>
          </div>
          {files.map((file) => (
            <div className="member-row" key={file.id}>
              <FileText size={18} />
              <div>
                <strong>{file.name}</strong>
                <small>{typeName(file.mimeType)}</small>
                {errors[file.id] && <output>{errors[file.id]}</output>}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void action(() => importFiles([file]))}
              >
                {errors[file.id] ? L('重试', 'Retry') : L('导入', 'Import')}
              </Button>
            </div>
          ))}
        </section>
      )}
      {imported > 0 && importedSourceId && onRead && (
        <Button className="mt-5" onClick={() => onRead(importedSourceId)}>
          {L('开始阅读导入的材料', 'Read your imported sources')}
          <ArrowRight size={16} />
        </Button>
      )}
    </div>
  );
}
