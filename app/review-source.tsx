'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import SourcePreview from './source-preview';
import type { TaskResult } from '@/lib/platform/types';
export type ReviewPage = {
  version_id: string;
  page: number;
  text: string;
  source_id?: string;
  title?: string;
  media_type?: string;
};
export default function ReviewSource({
  page,
  citation,
  onOpen,
}: {
  page: ReviewPage;
  citation?: TaskResult['citations'][number];
  onOpen: () => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [original, setOriginal] = useState(false),
    [blob, setBlob] = useState<Blob | null>(null),
    [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (!original || !page.source_id) return;
    const controller = new AbortController();
    let objectUrl = '';
    setError('');
    setBlob(null);
    setUrl('');
    void fetch(`/api/files?source_id=${encodeURIComponent(page.source_id)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            locale === 'en'
              ? 'Could not load the original. Please retry.'
              : '原件未能载入，请重试。',
          );
        return r.blob();
      })
      .then((b) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [original, page.source_id, locale]);
  const start =
    citation &&
    citation.version_id === page.version_id &&
    citation.page === page.page
      ? (citation.start ?? page.text.indexOf(citation.quote))
      : -1;
  const matches =
    start >= 0 &&
    !!citation &&
    page.text.slice(start, start + citation.quote.length) === citation.quote;
  return (
    <aside className="review-original">
      <header>
        <strong>
          {page.title || L('固定版本原文', 'Fixed source text')} ·{' '}
          {L('页', 'p.')} {page.page}
        </strong>
        <Button variant="ghost" size="sm" onClick={onOpen}>
          {L('打开阅读器', 'Open reader')}
        </Button>
      </header>
      {page.source_id &&
        (page.media_type === 'application/pdf' ||
          page.media_type?.startsWith('image/')) && (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={original}
            onClick={() => setOriginal((v) => !v)}
          >
            {original
              ? L('收起原件', 'Hide original')
              : L('对照原件图像', 'Compare original image')}
          </Button>
        )}
      {error && <p role="alert">{error}</p>}
      {original && !error && (
        <SourcePreview
          blob={blob}
          url={url}
          type={page.media_type || ''}
          page={page.page}
          title={page.title || ''}
          region={null}
          onRegion={() => {}}
          allowSelection={false}
        />
      )}
      <p className="review-transcription">
        {matches ? (
          <>
            {page.text.slice(0, start)}
            <mark
              key={`${start}:${citation.quote}`}
              ref={(el) => el?.scrollIntoView({ block: 'nearest' })}
            >
              {citation.quote}
            </mark>
            {page.text.slice(start + citation.quote.length)}
          </>
        ) : (
          page.text
        )}
      </p>
      <small>
        {L(
          '点击右侧引文，在这里定位。转录可能仍有误，请对照原件。',
          'Select a quotation to locate it here. Check the original for transcription errors.',
        )}
      </small>
    </aside>
  );
}
