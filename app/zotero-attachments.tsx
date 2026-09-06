'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, uploadOriginal } from '@/lib/client-api';
import { extractPages } from '@/lib/documents';
import { useI18n } from '@/lib/i18n/provider';
type Attachments = {
  items: { id: string; title: string; type: string; filename?: string }[];
  next: number | null;
};
export default function ZoteroAttachments({
  projectId,
  library,
  libraryType,
  apiKey,
  onImported,
}: {
  projectId: string;
  library: string;
  libraryType: string;
  apiKey: string;
  onImported: () => Promise<unknown>;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<Attachments | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [imported, setImported] = useState<string[]>([]);
  const base = {
    project_id: projectId,
    library,
    library_type: libraryType,
    key: apiKey,
  };
  async function list(start: number) {
    setBusy(true);
    setMessage('');
    try {
      setData(
        await api<Attachments>('/api/zotero', {
          ...base,
          action: 'list',
          start,
        }),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Read failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>
        {L(
          '选择文献库中的 PDF 与照片',
          'Choose PDFs and images from this library',
        )}
      </summary>
      <p>
        {L(
          '仅导入你选择的已同步附件。每份最多 20 MB；扫描 PDF 导入后需要转录。',
          'Import only selected synced attachments, up to 20 MB each. Scanned PDFs need transcription after import.',
        )}
      </p>
      <Button
        type="button"
        disabled={busy || !library || !apiKey}
        variant="outline"
        onClick={() => void list(0)}
      >
        {L('读取附件列表', 'Read attachment list')}
      </Button>
      {message && <output>{message}</output>}
      {data?.items.map((item) => (
        <article key={item.id}>
          <strong>{item.title}</strong>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || imported.includes(item.id)}
            onClick={async () => {
              setBusy(true);
              setMessage('');
              try {
                const r = await fetch('/api/zotero', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...base,
                    action: 'download',
                    item: item.id,
                  }),
                });
                if (!r.ok)
                  throw new Error(
                    ((await r.json()) as { error: string }).error,
                  );
                const file = new File(
                    [await r.blob()],
                    item.filename || item.title,
                    { type: item.type },
                  ),
                  pages = await extractPages(file, item.type),
                  uploaded = await uploadOriginal(projectId, file, item.type);
                await api('/api/workspace', {
                  action: 'import_source',
                  p_id: uploaded.id,
                  p_project: projectId,
                  p_title: `${item.title} · Zotero ${library}/${item.id}`.slice(
                    0,
                    200,
                  ),
                  p_path: uploaded.path,
                  p_type: item.type,
                  p_pages: pages,
                });
                setImported((v) => [...v, item.id]);
                await onImported();
              } catch (e) {
                setMessage(e instanceof Error ? e.message : 'Import failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            {imported.includes(item.id)
              ? L('已导入', 'Imported')
              : L('导入附件', 'Import attachment')}
          </Button>
        </article>
      ))}
      {data && !data.items.length && (
        <p>
          {L(
            '此页没有支持的已同步附件，可继续查看下一页。',
            'No supported synced attachments on this page; try the next page.',
          )}
        </p>
      )}
      {data?.next !== null && data?.next !== undefined && (
        <Button
          type="button"
          disabled={busy}
          variant="ghost"
          onClick={() => void list(data.next!)}
        >
          {L('下一页附件', 'Next attachment page')}
        </Button>
      )}
    </details>
  );
}
