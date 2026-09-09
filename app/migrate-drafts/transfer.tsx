'use client';
import { useCallback, useEffect, useState } from 'react';
import { ClioForgeBrand } from '@/components/clioforge-brand';
import { Button, buttonVariants } from '@/components/ui/button';
import { FilePicker } from '@/components/ui/file-picker';
import { useI18n } from '@/lib/i18n/provider';
import {
  collectBrowserDrafts,
  importBrowserDrafts,
  LEGACY_HOST,
  PRIMARY_ORIGIN,
  DRAFT_TRANSFER_LIMIT,
  migratedURL,
} from '@/lib/domain-migration';

export default function DomainMove() {
  const { locale } = useI18n();
  const L = useCallback(
    (zh: string, en: string) => (locale === 'en' ? en : zh),
    [locale],
  );
  const [old, setOld] = useState(false);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState(PRIMARY_ORIGIN);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const legacy = [LEGACY_HOST, 'www.canwoo.com'].includes(location.hostname);
    setOld(legacy);
    setTarget(
      location.pathname === '/migrate-drafts'
        ? PRIMARY_ORIGIN
        : migratedURL(location.href),
    );
    try {
      const drafts = collectBrowserDrafts(localStorage);
      setCount(drafts.entries.length);
      if (
        legacy &&
        !drafts.entries.length &&
        location.pathname !== '/migrate-drafts'
      )
        location.replace(migratedURL(location.href));
    } catch {
      setError(
        L(
          '无法读取本机草稿。请保留当前浏览器数据，稍后再试。',
          'Local drafts could not be read. Keep this browser’s data and try again.',
        ),
      );
    }
    setReady(true);
  }, [L]);
  function download() {
    try {
      const data = JSON.stringify(collectBrowserDrafts(localStorage), null, 2);
      const url = URL.createObjectURL(
        new Blob([data], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'clioforge-browser-drafts.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(
        L(
          '草稿副本已准备下载。请在新站导入；旧浏览器中的原稿仍保留。',
          'Draft backup prepared. Import it on the new site; originals remain in this browser.',
        ),
      );
    } catch {
      setError(
        L(
          '无法导出草稿，请保留浏览器数据并联系支持。',
          'Unable to export drafts. Keep browser data and contact support.',
        ),
      );
    }
  }
  return (
    <main className="privacy-page space-y-6">
      <ClioForgeBrand />
      <h1>{L('参伍的新地址', 'A new home for ClioForge')}</h1>
      <p>
        {L(
          'ClioForge 现已迁至 clioforge.com。项目、资料与已保存的笔记都在；请在新站重新登录。',
          'ClioForge now lives at clioforge.com. Your projects, sources and saved notes remain available. Sign in again on the new site.',
        )}
      </p>
      {!ready ? (
        <output>{L('正在检查本机草稿…', 'Checking local drafts…')}</output>
      ) : old ? (
        <>
          <p>
            {L(
              `此浏览器中有 ${count} 份本机草稿。请先下载副本，再到新站导入；不会自动删除或覆盖原稿。`,
              `${count} local drafts in this browser. Download a backup, then import it on the new site. Originals are never removed or overwritten.`,
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={download} disabled={!count}>
              {L('下载本机草稿', 'Download local drafts')}
            </Button>
            <a
              className={buttonVariants({ variant: 'outline' })}
              href={`${PRIMARY_ORIGIN}/migrate-drafts`}
            >
              {L('到新站导入草稿', 'Import on the new site')}
            </a>
          </div>
        </>
      ) : (
        <FilePicker
          label={L('导入旧站草稿副本', 'Import old-site draft backup')}
          accept=".json,application/json"
          description={L(
            '选择旧站导出的 clioforge-browser-drafts.json。仅保存在当前浏览器；登录原账号后，可在对应项目中继续编辑。已有草稿会保留，不被覆盖。',
            'Choose clioforge-browser-drafts.json from the old site. Drafts stay in this browser; sign in with the same account to continue in their projects. Existing drafts are kept.',
          )}
          onSelect={async (file) => {
            setError('');
            setStatus('');
            try {
              if (file.size > DRAFT_TRANSFER_LIMIT)
                throw new Error('File too large');
              const result = importBrowserDrafts(
                localStorage,
                await file.text(),
              );
              setStatus(
                L(
                  `已导入 ${result.imported} 份，保留 ${result.skipped} 份已有草稿。`,
                  `${result.imported} imported; ${result.skipped} existing drafts kept.`,
                ),
              );
            } catch {
              setError(
                L(
                  '无法完整导入。请保留备份文件，确认是旧站草稿副本且浏览器存储空间足够后重试。',
                  'Import could not complete. Keep the backup, check that it is an old-site draft export and browser storage has room, then retry.',
                ),
              );
            }
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {status && <output className="block">{status}</output>}
      <p>
        <a className={buttonVariants()} href={target}>
          {L('前往研究工作台', 'Continue to your research')}
        </a>
      </p>
      {!old && (
        <p>
          <a href="https://canwoo.com/migrate-drafts">
            {L('回旧站下载草稿', 'Download drafts from the old site')}
          </a>
        </p>
      )}
    </main>
  );
}
