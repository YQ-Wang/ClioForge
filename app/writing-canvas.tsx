'use client';
import {
  Excalidraw,
  exportToBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import '@excalidraw/excalidraw/index.css';
// Font assets are served by Canwoo, so opening a private drawing makes no CDN request.
if (typeof window !== 'undefined')
  (
    window as unknown as Window & { EXCALIDRAW_ASSET_PATH: string }
  ).EXCALIDRAW_ASSET_PATH = '/excalidraw/';
export default function WritingCanvas({
  initial,
  onClose,
  onSave,
}: {
  initial: { scene?: string; caption?: string };
  onClose: () => void;
  onSave: (attrs: { scene: string; preview: string; caption: string }) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const api = useRef<ExcalidrawImperativeAPI | null>(null),
    [caption, setCaption] = useState(initial.caption || ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="writing-canvas-dialog">
        <DialogTitle>{L('研究画布', 'Research canvas')}</DialogTitle>
        <DialogDescription>
          {L(
            '绘制关系、时间线或论证结构；完成后插入笔记，仍可再次编辑。',
            'Draw relationships, timelines or arguments. Insert into your note and edit it again later.',
          )}
        </DialogDescription>
        <div className="writing-canvas">
          <Excalidraw
            excalidrawAPI={(value) => {
              api.current = value;
            }}
            initialData={
              initial.scene
                ? JSON.parse(initial.scene)
                : { appState: { currentItemFontFamily: 2 } }
            }
            langCode={locale === 'en' ? 'en' : 'zh-CN'}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                saveAsImage: false,
              },
              tools: { image: false },
            }}
            validateEmbeddable={() => false}
          />
        </div>
        <Input
          aria-label={L('图画说明', 'Drawing caption')}
          placeholder={L(
            '为图画加一句说明，便于查找和讨论',
            'Describe the drawing for search and discussion',
          )}
          maxLength={1000}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            {L('取消', 'Cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!api.current) return;
              setBusy(true);
              setError('');
              try {
                const elements = api.current.getSceneElements();
                if (!elements.length)
                  throw new Error(
                    L('请先画一些内容。', 'Draw something first.'),
                  );
                if (
                  elements.length > 500 ||
                  elements.some((e) =>
                    ['image', 'iframe', 'embeddable'].includes(e.type),
                  )
                )
                  throw new Error(
                    L(
                      '支持最多 500 个图形，不支持嵌入网页或图片。',
                      'Use up to 500 shapes; embedded sites and images are not supported.',
                    ),
                  );
                const state = api.current.getAppState();
                const scene = serializeAsJSON(
                  elements,
                  { ...state, collaborators: new Map() },
                  {},
                  'local',
                );
                if (scene.length > 200000)
                  throw new Error(
                    L(
                      '图画太复杂，请拆成几张。',
                      'Please split this large drawing.',
                    ),
                  );
                const blob = await exportToBlob({
                  elements,
                  appState: {
                    ...state,
                    exportWithDarkMode: false,
                    exportBackground: true,
                    viewBackgroundColor: '#ffffff',
                  },
                  files: {},
                  maxWidthOrHeight: 1200,
                  mimeType: 'image/png',
                });
                const preview = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    typeof reader.result === 'string'
                      ? resolve(reader.result)
                      : reject(new Error('Preview unavailable'));
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
                if (preview.length + scene.length > 600000)
                  throw new Error(
                    L(
                      '图画太大，请减少内容。',
                      'This drawing is too large; simplify it.',
                    ),
                  );
                onSave({ scene, preview, caption });
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : L(
                        '图画保存失败，请重试。',
                        'Could not save this drawing.',
                      ),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? L('正在插入…', 'Inserting…')
              : L('插入笔记', 'Insert into note')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
