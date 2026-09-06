'use client';
import { useI18n } from '@/lib/i18n/provider';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Crop, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pageImage } from '@/lib/documents';
import type { Region } from '@/lib/workbench-types';
export type ReaderLocation = {
  sourceId: string;
  versionId: string;
  page: number;
  start?: number | null;
  end?: number | null;
  region?: Region | null;
  annotationId?: string;
  nonce: string;
};
export default function SourcePreview({
  blob,
  url,
  type,
  page,
  title,
  region,
  onRegion,
  highlights = [],
  activeHighlight,
  onHighlight,
  allowSelection = true,
}: {
  blob: Blob | null;
  url: string;
  type: string;
  page: number;
  title: string;
  region: Region | null;
  onRegion: (region: Region | null) => void;
  highlights?: { id: string; region: Region | null; label: string }[];
  activeHighlight?: string;
  onHighlight?: (id: string) => void;
  allowSelection?: boolean;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(''),
    [error, setError] = useState(''),
    [selecting, setSelecting] = useState(false),
    [drag, setDrag] = useState<Region | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let active = true;
    setPreview('');
    setError('');
    setDrag(null);
    start.current = null;
    if (type === 'application/pdf' && blob)
      void pageImage(blob, type, page)
        .then((image) => {
          if (active) setPreview(image);
        })
        .catch(() => {
          if (active) setError('原件预览失败，可下载原件后核查。');
        });
    return () => {
      active = false;
    };
  }, [blob, type, page]);
  const image = type === 'application/pdf' ? preview : url;
  const area = drag || region;
  const point = (event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const box = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  });
  return (
    <>
      {allowSelection && (
        <div className="region-toolbar">
          <Button
            variant="ghost"
            size="sm"
            disabled={!image}
            aria-pressed={selecting}
            onClick={() => setSelecting((value) => !value)}
          >
            <Crop size={14} />
            {selecting ? t('拖动框选；键盘可选整页') : t('框选原件区域')}
          </Button>
          {region && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('清除原件框选')}
              onClick={() => onRegion(null)}
            >
              <X size={14} />
            </Button>
          )}
        </div>
      )}
      <div className="original-preview">
        {error ? (
          <p className="p-4">{t(error)}</p>
        ) : !image ? (
          <p className="p-4 text-muted-foreground">{t('正在渲染原件页…')}</p>
        ) : (
          <div className="region-stage" style={{ position: 'relative' }}>
            <button
              type="button"
              className={`region-canvas ${selecting ? 'selecting' : ''}`}
              aria-label={t('原件预览：{0}，文件第 {1} 页{2}', {
                0: title,
                1: page,
                2: selecting ? t('；按回车选择整页') : '',
              })}
              onKeyDown={(event) => {
                if (selecting && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onRegion({ x: 0, y: 0, width: 1, height: 1 });
                  setSelecting(false);
                }
              }}
              onPointerDown={(event) => {
                if (!selecting) return;
                event.preventDefault();
                start.current = point(event);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (start.current) setDrag(box(start.current, point(event)));
              }}
              onPointerUp={(event) => {
                if (!start.current) return;
                const region = box(start.current, point(event));
                start.current = null;
                setDrag(null);
                if (region.width > 0.005 && region.height > 0.005) {
                  onRegion(region);
                  setSelecting(false);
                }
              }}
              onPointerCancel={() => {
                start.current = null;
                setDrag(null);
              }}
            >
              <Image
                src={image}
                alt={t('{0} 原件第 {1} 页', { 0: title, 1: page })}
                width={1600}
                height={2200}
                unoptimized
                draggable={false}
                className="region-image"
              />
              {area && (
                <span
                  aria-hidden="true"
                  className="region-box"
                  style={{
                    left: `${area.x * 100}%`,
                    top: `${area.y * 100}%`,
                    width: `${area.width * 100}%`,
                    height: `${area.height * 100}%`,
                  }}
                />
              )}
            </button>
            <div
              className="region-saved-highlights"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              {highlights
                .slice()
                .sort(
                  (a, b) =>
                    (b.region ? b.region.width * b.region.height : 0) -
                    (a.region ? a.region.width * a.region.height : 0),
                )
                .map((highlight) => {
                  const saved = highlight.region;
                  if (
                    !saved ||
                    ![saved.x, saved.y, saved.width, saved.height].every(
                      Number.isFinite,
                    ) ||
                    saved.x < 0 ||
                    saved.y < 0 ||
                    saved.width <= 0 ||
                    saved.height <= 0 ||
                    saved.x + saved.width > 1.000001 ||
                    saved.y + saved.height > 1.000001
                  )
                    return null;
                  return (
                    <button
                      key={highlight.id}
                      type="button"
                      className="region-saved-highlight"
                      aria-label={highlight.label}
                      title={highlight.label}
                      aria-pressed={activeHighlight === highlight.id}
                      data-active={activeHighlight === highlight.id}
                      disabled={selecting || !onHighlight}
                      onClick={() => onHighlight?.(highlight.id)}
                      style={{
                        position: 'absolute',
                        left: `${saved.x * 100}%`,
                        top: `${saved.y * 100}%`,
                        width: `${saved.width * 100}%`,
                        height: `${saved.height * 100}%`,
                        pointerEvents: selecting ? 'none' : 'auto',
                      }}
                    />
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
