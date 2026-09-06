import { writingColor } from './writing-color';
import { HttpError } from './errors';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import katex from 'katex';
import { XMLParser } from 'fast-xml-parser';
import { parseRichDocument, type RichNode } from './rich-document';
import {
  citedEvidence,
  writingDocx,
  type WritingCitation,
} from './writing-export';
// XML 1.0 cannot contain these control characters.
export const escapeXML = (value: unknown) =>
  (typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? value.toString()
      : ''
  )
    .split('')
    .filter((c) => {
      const n = c.charCodeAt(0);
      return n >= 32 || n === 9 || n === 10 || n === 13;
    })
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const textRun = (text: string, props = '') =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXML(text)}</w:t></w:r>`;
const color = (v: unknown) => writingColor(v)?.slice(1) || null;
const attributeText = (value: unknown) =>
  typeof value === 'string' ? value : '';
const align = (n: RichNode) =>
  ['left', 'center', 'right', 'justify'].includes(String(n.attrs?.textAlign))
    ? String(n.attrs?.textAlign)
    : 'left';
const span = (v: unknown) =>
  Math.min(32, Math.max(1, Number.isInteger(v) ? Number(v) : 1));
type MathNode = Record<string, unknown>;
export function equationOMML(latex: string) {
  const tree = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    parseTagValue: false,
  }).parse(
    katex.renderToString(latex, {
      output: 'mathml',
      trust: false,
      throwOnError: true,
      strict: 'ignore',
    }),
  ) as MathNode[];
  function walk(items: MathNode[]): string {
    return items
      .map((n) => {
        const tag = Object.keys(n).find((k) => k !== ':@') || '';
        const kids = Array.isArray(n[tag]) ? (n[tag] as MathNode[]) : [];
        const arg = (i: number) => walk(kids.slice(i, i + 1));
        if (tag === 'annotation') return '';
        if (tag === '#text')
          return `<m:r><m:t xml:space="preserve">${escapeXML(n[tag])}</m:t></m:r>`;
        if (tag === 'mfrac')
          return `<m:f><m:num>${arg(0)}</m:num><m:den>${arg(1)}</m:den></m:f>`;
        if (tag === 'msup')
          return `<m:sSup><m:e>${arg(0)}</m:e><m:sup>${arg(1)}</m:sup></m:sSup>`;
        if (tag === 'msub')
          return `<m:sSub><m:e>${arg(0)}</m:e><m:sub>${arg(1)}</m:sub></m:sSub>`;
        if (tag === 'msubsup')
          return `<m:sSubSup><m:e>${arg(0)}</m:e><m:sub>${arg(1)}</m:sub><m:sup>${arg(2)}</m:sup></m:sSubSup>`;
        if (tag === 'msqrt' || tag === 'mroot')
          return `<m:rad><m:radPr>${tag === 'msqrt' ? '<m:degHide m:val="1"/>' : ''}</m:radPr><m:deg>${tag === 'mroot' ? arg(1) : ''}</m:deg><m:e>${tag === 'mroot' ? arg(0) : walk(kids)}</m:e></m:rad>`;
        if (tag === 'munder')
          return `<m:limLow><m:e>${arg(0)}</m:e><m:lim>${arg(1)}</m:lim></m:limLow>`;
        if (tag === 'mover')
          return `<m:limUpp><m:e>${arg(0)}</m:e><m:lim>${arg(1)}</m:lim></m:limUpp>`;
        if (tag === 'munderover')
          return `<m:limUpp><m:e><m:limLow><m:e>${arg(0)}</m:e><m:lim>${arg(1)}</m:lim></m:limLow></m:e><m:lim>${arg(2)}</m:lim></m:limUpp>`;
        if (tag === 'mtable') return `<m:m>${walk(kids)}</m:m>`;
        if (tag === 'mtr') return `<m:mr>${walk(kids)}</m:mr>`;
        if (tag === 'mtd') return `<m:e>${walk(kids)}</m:e>`;
        if (tag === 'mspace')
          return '<m:r><m:t xml:space="preserve"> </m:t></m:r>';
        if (
          [
            'span',
            'math',
            'semantics',
            'mrow',
            'mi',
            'mn',
            'mo',
            'mtext',
            'mstyle',
            'mpadded',
          ].includes(tag)
        )
          return walk(kids);
        throw new HttpError(
          400,
          'This equation uses notation not yet supported by Word export. Use Print / PDF to preserve its appearance.',
        );
      })
      .join('');
  }
  return `<m:oMath>${walk(tree)}</m:oMath>`;
}
function citationFor(n: RichNode, byId: Map<string, WritingCitation>) {
  const href = n.marks?.find((m) => m.type === 'link')?.attrs?.href;
  if (typeof href !== 'string') return null;
  let url: URL;
  try {
    url = new URL(href, 'https://canwoo.com');
  } catch {
    return null;
  }
  const id = url.searchParams.get('evidence');
  if (!id) return null;
  const c = byId.get(id);
  if (!c)
    throw new HttpError(400, '笔记包含找不到的证据引用，请重新选择出处。');
  return c;
}
export function richWritingDocx(
  title: string,
  serialized: string,
  citations: WritingCitation[],
) {
  const doc = parseRichDocument(serialized),
    byId = new Map(citations.map((c) => [c.id, c])),
    used: WritingCitation[] = [],
    images: Uint8Array[] = [],
    links: string[] = [];
  function node(n: RichNode, prefix = ''): string {
    const children = () => (n.content || []).map((c) => node(c)).join('');
    if (n.type === 'text') {
      const citation = citationFor(n, byId);
      if (citation) {
        used.push(citation);
        return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${used.length}"/></w:r>`;
      }
      let props = '';
      for (const m of n.marks || []) {
        props +=
          (
            {
              bold: '<w:b/>',
              italic: '<w:i/>',
              underline: '<w:u w:val="single"/>',
              strike: '<w:strike/>',
              code: '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>',
            } as Record<string, string>
          )[m.type] || '';
        if (m.type === 'textStyle') {
          if (color(m.attrs?.color))
            props += `<w:color w:val="${color(m.attrs?.color)}"/>`;
          if (color(m.attrs?.backgroundColor))
            props += `<w:shd w:val="clear" w:fill="${color(m.attrs?.backgroundColor)}"/>`;
          const size = Number(
            attributeText(m.attrs?.fontSize).replace('px', ''),
          );
          if (size >= 8 && size <= 96)
            props += `<w:sz w:val="${Math.round(size * 1.5)}"/><w:szCs w:val="${Math.round(size * 1.5)}"/>`;
          const family = attributeText(m.attrs?.fontFamily).split(',')[0];
          if (['Arial', 'Georgia', 'monospace'].includes(family))
            props += `<w:rFonts w:ascii="${family === 'monospace' ? 'Consolas' : family}" w:hAnsi="${family === 'monospace' ? 'Consolas' : family}"/>`;
        }
      }
      const href = n.marks?.find((m) => m.type === 'link')?.attrs?.href;
      const text = textRun(n.text || '', props);
      if (typeof href === 'string' && /^(https?:\/\/|mailto:)/i.test(href)) {
        links.push(href);
        return `<w:hyperlink r:id="link${links.length}">${text}</w:hyperlink>`;
      }
      return text;
    }
    if (n.type === 'inlineMath')
      return equationOMML(attributeText(n.attrs?.latex));
    if (n.type === 'blockMath')
      return `<w:p><m:oMathPara>${equationOMML(attributeText(n.attrs?.latex))}</m:oMathPara></w:p>`;
    if (n.type === 'hardBreak') return '<w:r><w:br/></w:r>';
    if (n.type === 'paragraph' || n.type === 'heading')
      return `<w:p><w:pPr>${n.type === 'heading' ? `<w:pStyle w:val="Heading${Math.min(3, Number(n.attrs?.level) || 1)}"/>` : ''}<w:spacing w:before="${n.type === 'heading' ? 240 : 0}"/><w:jc w:val="${align(n)}"/></w:pPr>${prefix ? textRun(prefix) : ''}${children()}</w:p>`;
    if (n.type === 'blockquote')
      return `<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="16" w:color="9CA3AF"/></w:pBdr></w:pPr></w:p>${children()}`;
    if (n.type === 'bulletList' || n.type === 'orderedList')
      return (n.content || [])
        .map((item, i) =>
          (item.content || [])
            .map((c, j) =>
              node(
                c,
                j === 0
                  ? n.type === 'bulletList'
                    ? '• '
                    : `${i + (Number(n.attrs?.start) || 1)}. `
                  : '',
              ),
            )
            .join(''),
        )
        .join('');
    if (n.type === 'horizontalRule')
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:color="D1D5DB"/></w:pBdr></w:pPr></w:p>';
    if (n.type === 'codeBlock')
      return `<w:p>${textRun((n.content || []).map((c) => c.text || '').join(''), '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>')}</w:p>`;
    if (n.type === 'drawing') {
      const binary = Uint8Array.from(
        atob(String(n.attrs?.preview).split(',')[1]),
        (c) => c.charCodeAt(0),
      );
      if (
        binary.length < 24 ||
        ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => binary[i] === v)
      )
        throw new HttpError(400, 'Invalid drawing PNG.');
      const view = new DataView(binary.buffer),
        width = view.getUint32(16),
        height = view.getUint32(20);
      if (!width || !height || width > 20000 || height > 20000)
        throw new HttpError(400, 'Invalid drawing dimensions.');
      images.push(binary);
      const id = images.length,
        scale = Math.min(1, 600 / width, 660 / height),
        cx = Math.round(width * scale * 9525),
        cy = Math.round(height * scale * 9525);
      return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Research diagram ${id}" descr="${escapeXML(n.attrs?.caption)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="diagram${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p>${textRun(attributeText(n.attrs?.caption))}</w:p>`;
    }
    if (n.type === 'table') {
      const rows = n.content || [],
        columns = Math.max(
          1,
          ...rows.map((r) =>
            (r.content || []).reduce(
              (sum, c) => sum + span(c.attrs?.colspan),
              0,
            ),
          ),
        ),
        width = Math.floor(9026 / columns);
      const pending = new Map<number, { rows: number; cols: number }>();
      const rendered = rows
        .map((row) => {
          let col = 0;
          const cells: string[] = [];
          const continuations = () => {
            while (pending.has(col)) {
              const p = pending.get(col)!;
              cells.push(
                `<w:tc><w:tcPr><w:tcW w:w="${width * p.cols}" w:type="dxa"/>${p.cols > 1 ? `<w:gridSpan w:val="${p.cols}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`,
              );
              pending.delete(col);
              if (p.rows > 1) pending.set(col, { ...p, rows: p.rows - 1 });
              col += p.cols;
            }
          };
          for (const cell of row.content || []) {
            continuations();
            const cols = span(cell.attrs?.colspan),
              rs = span(cell.attrs?.rowspan);
            cells.push(
              `<w:tc><w:tcPr><w:tcW w:w="${width * cols}" w:type="dxa"/>${cols > 1 ? `<w:gridSpan w:val="${cols}"/>` : ''}${rs > 1 ? '<w:vMerge w:val="restart"/>' : ''}${cell.type === 'tableHeader' ? '<w:shd w:fill="EEF2F7"/>' : ''}</w:tcPr>${node(cell) || '<w:p/>'}${cell.content?.at(-1)?.type === 'table' ? '<w:p/>' : ''}</w:tc>`,
            );
            if (rs > 1) pending.set(col, { rows: rs - 1, cols });
            col += cols;
          }
          continuations();
          return `<w:tr>${row.content?.every((c) => c.type === 'tableHeader') ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.join('')}</w:tr>`;
        })
        .join('');
      return `<w:tbl><w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="CBD5E1"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rendered}</w:tbl>`;
    }
    return children();
  }
  const body = node(doc);
  const footnoteBody = used
    .map((c) => `[source](https://canwoo.com/?evidence=${c.id})`)
    .join('\n');
  const files = unzipSync(writingDocx(title, footnoteBody, citations));
  const decode = (path: string) => new TextDecoder().decode(files[path]);
  files['word/document.xml'] = strToU8(
    decode('word/document.xml')
      .replace(
        '<w:document xmlns:w=',
        '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:w=',
      )
      .replace(
        /(<\/w:p>)[\s\S]*?(<w:sectPr>)/,
        (_match, end: string, section: string) => end + body + section,
      ),
  );
  files['[Content_Types].xml'] = strToU8(
    decode('[Content_Types].xml').replace(
      '</Types>',
      '<Default Extension="png" ContentType="image/png"/></Types>',
    ),
  );
  files['word/_rels/document.xml.rels'] = strToU8(
    decode('word/_rels/document.xml.rels').replace(
      '</Relationships>',
      images
        .map(
          (_, i) =>
            `<Relationship Id="image${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram${i + 1}.png"/>`,
        )
        .join('') +
        links
          .map(
            (href, i) =>
              `<Relationship Id="link${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXML(href)}" TargetMode="External"/>`,
          )
          .join('') +
        '</Relationships>',
    ),
  );
  images.forEach(
    (image, i) =>
      (files[`word/media/diagram${i + 1}.png`] = new Uint8Array(image)),
  );
  return zipSync(files);
}
export function writingPrintHTML(
  title: string,
  body: string,
  serialized: string | null | undefined,
  citations: WritingCitation[],
) {
  const byId = new Map(citations.map((c) => [c.id, c])),
    used: WritingCitation[] = [];
  function node(n: RichNode): string {
    const children = () => (n.content || []).map(node).join('');
    if (n.type === 'text') {
      const c = citationFor(n, byId);
      if (c) {
        used.push(c);
        return `<sup><a href="#note-${used.length}">[${used.length}]</a></sup>`;
      }
      let text = escapeXML(n.text);
      for (const m of n.marks || []) {
        const tag = (
          {
            bold: 'strong',
            italic: 'em',
            underline: 'u',
            strike: 's',
            code: 'code',
          } as Record<string, string>
        )[m.type];
        if (tag) text = `<${tag}>${text}</${tag}>`;
        if (m.type === 'textStyle') {
          const a = m.attrs || {},
            styles: string[] = [];
          if (color(a.color)) styles.push(`color:#${color(a.color)}`);
          if (color(a.backgroundColor))
            styles.push(
              `background-color:#${color(a.backgroundColor)};color:#17202e`,
            );
          if (typeof a.fontSize === 'string' && /^\d{1,2}px$/.test(a.fontSize))
            styles.push(`font-size:${a.fontSize}`);
          if (
            ['Arial, sans-serif', 'Georgia, serif', 'monospace'].includes(
              String(a.fontFamily),
            )
          )
            styles.push(`font-family:${attributeText(a.fontFamily)}`);
          text = `<span style="${styles.join(';')}">${text}</span>`;
        }
        if (
          m.type === 'link' &&
          typeof m.attrs?.href === 'string' &&
          /^(https?:\/\/|mailto:)/i.test(m.attrs.href)
        )
          text = `<a href="${escapeXML(m.attrs.href)}">${text}</a>`;
      }
      return text;
    }
    if (n.type === 'inlineMath' || n.type === 'blockMath')
      return katex.renderToString(attributeText(n.attrs?.latex), {
        output: 'mathml',
        displayMode: n.type === 'blockMath',
        trust: false,
        throwOnError: true,
      });
    if (n.type === 'drawing')
      return `<figure><img src="${escapeXML(n.attrs?.preview)}" alt="${escapeXML(n.attrs?.caption)}"/><figcaption>${escapeXML(n.attrs?.caption)}</figcaption></figure>`;
    if (n.type === 'hardBreak') return '<br/>';
    if (n.type === 'horizontalRule') return '<hr/>';
    const tag = (
      {
        paragraph: 'p',
        heading: `h${Math.min(6, Number(n.attrs?.level) || 1)}`,
        bulletList: 'ul',
        orderedList: 'ol',
        listItem: 'li',
        blockquote: 'blockquote',
        table: 'table',
        tableRow: 'tr',
        tableCell: 'td',
        tableHeader: 'th',
        codeBlock: 'pre',
      } as Record<string, string>
    )[n.type];
    if (!tag) return children();
    const attrs = ['td', 'th'].includes(tag)
      ? ` colspan="${span(n.attrs?.colspan)}" rowspan="${span(n.attrs?.rowspan)}"`
      : tag === 'ol'
        ? ` start="${Number(n.attrs?.start) || 1}"`
        : '';
    return `<${tag}${attrs} style="text-align:${align(n)}">${children()}</${tag}>`;
  }
  let content: string;
  if (serialized) content = node(parseRichDocument(serialized));
  else {
    const legacy = citedEvidence(body, citations);
    if (legacy.missing.length)
      throw new HttpError(400, '笔记包含找不到的证据引用，请重新选择出处。');
    used.push(...legacy.used);
    content =
      '<pre>' +
      escapeXML(legacy.text).replace(
        /\uE000(\d+)\uE001/g,
        (_, id: string) => `<sup><a href="#note-${id}">[${id}]</a></sup>`,
      ) +
      '</pre>';
  }
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="referrer" content="no-referrer"><title>${escapeXML(title)}</title><style>@page{size:A4;margin:22mm}*{box-sizing:border-box}body{max-width:180mm;margin:24px auto;padding:0 12px;color:#202124;font-family:Arial,"Noto Sans",sans-serif;font-size:11pt;line-height:1.65}h1,h2,h3{break-after:avoid;line-height:1.3}h1{font-size:24pt}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #cbd5e1;padding:8px;vertical-align:top}th{background:#eef2f7}tr{break-inside:avoid}p{margin:0 0 .8em}img{max-width:100%;max-height:210mm;object-fit:contain}figure{margin:16px 0;break-inside:avoid}figcaption{font-size:10pt;color:#5f6368}blockquote{border-left:3px solid #9ca3af;padding-left:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#1d4ed8;overflow-wrap:anywhere}math[display=block]{margin:20px 0}.source-notes{border-top:1px solid #cbd5e1;margin-top:28px;padding-top:12px;font-size:9pt}@media print{body{margin:0;padding:0;max-width:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>${escapeXML(title)}</h1>${content}${used.length ? `<ol class="source-notes">${used.map((c, i) => `<li id="note-${i + 1}">${escapeXML(c.text)} <a href="${escapeXML(c.href)}">${escapeXML(c.href)}</a>${c.stale ? ' [New source version; review required.]' : ''}</li>`).join('')}</ol>` : ''}</body></html>`;
}
