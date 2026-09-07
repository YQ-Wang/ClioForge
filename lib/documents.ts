import type { PageText } from './types';
import type { Region } from './workbench-types';
import { cropBounds } from './ocr-region';
let pdfModule: Promise<typeof import('pdfjs-dist')> | undefined;
async function pdfjs() {
  pdfModule ??= import('pdfjs-dist').then(async (module) => {
    module.GlobalWorkerOptions.workerSrc = (
      await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ).default;
    return module;
  });
  return pdfModule;
}
export function documentType(file: File) {
  if (file.name.length > 300) throw new Error('文件名过长，请缩短后导入。');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  const type = types[extension || ''];
  if (!type) throw new Error('支持 PDF、TXT、Markdown、PNG、JPEG 和 WebP。');
  if (file.size > 20 * 1024 * 1024) throw new Error('单个文件最多 20 MB。');
  return type;
}
export async function extractPages(
  file: File,
  type: string,
): Promise<PageText[]> {
  let pages: PageText[];
  if (type === 'application/pdf') {
    const pdf = await (
      await pdfjs()
    ).getDocument({ data: await file.arrayBuffer(), isEvalSupported: false })
      .promise;
    try {
      if (pdf.numPages > 500)
        throw new Error('请将超过 500 页的 PDF 拆分后导入。');
      pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const text = await page.getTextContent();
        pages.push({
          page: n,
          text: text.items
            .map((item) =>
              'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '',
            )
            .join(''),
        });
        page.cleanup();
      }
    } finally {
      await pdf.destroy();
    }
  } else
    pages = [
      { page: 1, text: type.startsWith('text/') ? await file.text() : '' },
    ];
  if (
    pages.some((p) => p.text.length > 100000) ||
    new TextEncoder().encode(JSON.stringify(pages)).length > 1800000
  )
    throw new Error('提取文本过长，请拆分材料后导入。');
  return pages;
}
export async function pageImage(
  blob: Blob,
  type: string,
  page: number,
  region?: Region | null,
) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理图像。');
  if (type === 'application/pdf') {
    const pdf = await (
      await pdfjs()
    ).getDocument({ data: await blob.arrayBuffer(), isEvalSupported: false })
      .promise;
    try {
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const selected = cropBounds(base.width, base.height, region);
      const viewport = p.getViewport({
        scale: Math.min(
          region ? 4 : 2,
          2000 / Math.max(selected.width, selected.height),
        ),
      });
      const bounds = cropBounds(viewport.width, viewport.height, region);
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      await p.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: [1, 0, 0, 1, -bounds.x, -bounds.y],
      }).promise;
    } finally {
      await pdf.destroy();
    }
  } else {
    const bitmap = await createImageBitmap(blob);
    try {
      const bounds = cropBounds(bitmap.width, bitmap.height, region);
      const scale = Math.min(1, 2000 / Math.max(bounds.width, bounds.height));
      canvas.width = Math.max(1, Math.round(bounds.width * scale));
      canvas.height = Math.max(1, Math.round(bounds.height * scale));
      context.drawImage(
        bitmap,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    } finally {
      bitmap.close();
    }
  }
  return canvas.toDataURL('image/jpeg', 0.9);
}
