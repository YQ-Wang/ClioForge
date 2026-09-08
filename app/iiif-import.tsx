'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilePicker } from '@/components/ui/file-picker';
import { useI18n } from '@/lib/i18n/provider';
import { parseIiif, publicHttps } from '@/lib/iiif';
import { boundedBytes } from '@/lib/files';
import { api, uploadOriginal } from '@/lib/client-api';
export default function IiifImport({
  projectId,
  onImported,
}: {
  projectId: string;
  onImported: () => Promise<unknown>;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [raw, setRaw] = useState<unknown>(null),
    [manifest, setManifest] = useState<ReturnType<typeof parseIiif> | null>(
      null,
    ),
    [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState<string[]>([]),
    [limit, setLimit] = useState(20);
  function read(raw: unknown) {
    setManifest(parseIiif(raw));
    setRaw(raw);
    setDone([]);
    setLimit(20);
  }
  return (
    <details className="iiif-import">
      <summary>
        {L('从数字档案馆导入（IIIF）', 'Import from a digital archive (IIIF)')}
      </summary>
      <p>
        {L(
          '粘贴公开清单链接，或选择下载的 Manifest JSON。按页导入原图，保留档案页序、出处与使用许可；导入后可转录。',
          'Paste a public manifest URL or choose its downloaded JSON file. Import original images by page, preserving order, provenance and rights; transcribe after import.',
        )}
      </p>
      <Input
        aria-label="IIIF Manifest URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…/manifest.json"
      />
      <div className="iiif-import-actions">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !url}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const r = await fetch(publicHttps(url), {
                credentials: 'omit',
                redirect: 'follow',
                signal: AbortSignal.timeout(20000),
              });
              if (!r.ok) throw new Error('Manifest unavailable');
              publicHttps(r.url);
              read(
                JSON.parse(
                  new TextDecoder().decode(await boundedBytes(r, 1_500_000)),
                ),
              );
            } catch {
              setError(
                L(
                  '无法直接读取。档案馆可能不允许跨站读取，请下载清单后选择文件。',
                  'Cannot read directly. The archive may block cross-site reads; download the manifest and choose the file.',
                ),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {L('读取清单', 'Read manifest')}
        </Button>
        <FilePicker
          label={L('选择清单文件', 'Choose manifest file')}
          accept=".json,application/json"
          disabled={busy}
          onSelect={async (file) => {
            try {
              if (file.size > 1_500_000) throw new Error('Manifest too large');
              read(JSON.parse(await file.text()));
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Invalid manifest');
            }
          }}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      {manifest && (
        <>
          <h4>{manifest.title}</h4>
          <p>
            {manifest.pages.length} {L('页', 'pages')} ·{' '}
            {manifest.rights ||
              L(
                '许可未注明，请向馆藏方确认',
                'Rights unspecified; check with the archive',
              )}
          </p>
          <p>{manifest.attribution}</p>
          <div className="iiif-pages">
            {manifest.pages.slice(0, limit).map((p) => (
              <div key={p.id}>
                <span>
                  {p.order}. {p.label}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || done.includes(p.id)}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const r = await fetch(p.image, {
                        credentials: 'omit',
                        redirect: 'follow',
                        signal: AbortSignal.timeout(30000),
                      });
                      if (!r.ok) throw new Error('Image unavailable');
                      publicHttps(r.url);
                      const type =
                        r.headers.get('Content-Type')?.split(';')[0] || p.type;
                      if (
                        !['image/jpeg', 'image/png', 'image/webp'].includes(
                          type,
                        )
                      )
                        throw new Error('Unsupported image format');
                      const bytes = await boundedBytes(r, 20 * 1024 * 1024),
                        file = new File(
                          [new Uint8Array(bytes)],
                          'archive.' +
                            (type === 'image/png'
                              ? 'png'
                              : type === 'image/webp'
                                ? 'webp'
                                : 'jpg'),
                          { type },
                        );
                      const uploaded = await uploadOriginal(
                        projectId,
                        file,
                        type,
                      );
                      await api('/api/iiif', {
                        project_id: projectId,
                        source_id: uploaded.id,
                        canvas: p.id,
                        manifest: raw,
                      });
                      setDone((v) => [...v, p.id]);
                      await onImported();
                    } catch (e) {
                      setError(
                        L('该页导入未完成：', 'Page import did not finish: ') +
                          (e instanceof Error ? e.message : ''),
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {done.includes(p.id)
                    ? L('已导入', 'Imported')
                    : L('导入此页', 'Import page')}
                </Button>
              </div>
            ))}
          </div>
          {manifest.pages.length > limit && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLimit((n) => n + 20)}
            >
              {L('再显示 20 页', 'Show 20 more pages')}
            </Button>
          )}
        </>
      )}
    </details>
  );
}
