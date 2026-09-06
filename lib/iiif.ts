import { z } from 'zod';
const object = z.record(z.string(), z.unknown());
const objects = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? (v.filter((x) => object.safeParse(x).success) as Record<
        string,
        unknown
      >[])
    : [];
export function iiifLabel(value: unknown): string {
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '');
  if (Array.isArray(value)) return value.map(iiifLabel).join(' ');
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return iiifLabel(
      v['@value'] || v.value || v.en || v.none || Object.values(v)[0],
    );
  }
  return '';
}
export function publicHttps(raw: unknown) {
  const url = new URL(z.string().max(4000).parse(raw));
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname.startsWith('[') ||
    !url.hostname.replace(/\.$/, '').includes('.') ||
    /^[\d.[\]:]+$/.test(url.hostname) ||
    /\.(localhost|local|internal)$/i.test(url.hostname)
  )
    throw new Error('请使用公开 HTTPS 资源。');
  return url.href;
}
export function parseIiif(raw: unknown) {
  const m = object.parse(raw),
    type = m.type || m['@type'];
  if (!['Manifest', 'sc:Manifest'].includes(String(type)))
    throw new Error('请选择 IIIF Presentation 2 或 3 的 Manifest。');
  const id = publicHttps(m.id || m['@id']);
  const canvases = objects(m.items || objects(m.sequences)[0]?.canvases);
  if (canvases.length > 5000) throw new Error('清单超过 5,000 页，请拆分。');
  const pages = canvases.flatMap((c, index) => {
    const annotations = objects(c.images).concat(
      objects(c.items).flatMap((p) => objects(p.items)),
    );
    const image = annotations
      .flatMap((a) =>
        objects(Array.isArray(a.body) ? a.body : [a.body || a.resource]),
      )
      .find((b) =>
        ['Image', 'dctypes:Image'].includes(String(b.type || b['@type'])),
      );
    if (!image) return [];
    let url: string;
    try {
      url = publicHttps(image.id || image['@id']);
    } catch {
      return [];
    }
    return [
      {
        id: publicHttps(c.id || c['@id']),
        order: index + 1,
        label: iiifLabel(c.label) || String(index + 1),
        image: url,
        type: typeof image.format === 'string' ? image.format : 'image/jpeg',
      },
    ];
  });
  if (!pages.length) throw new Error('清单没有可导入的公开图像页。');
  return {
    id,
    title: iiifLabel(m.label) || 'IIIF',
    rights: iiifLabel(m.rights || m.license),
    attribution: iiifLabel(m.requiredStatement || m.attribution),
    pages,
  };
}
