import { zipSync, strToU8 } from 'fflate';
import { parseRichDocument, type RichNode } from './rich-document';
export type WritingCitation = {
  id: string;
  label: string;
  text: string;
  href: string;
  stale: boolean;
};
export function writingCitationKey(
  href: string,
  base = 'https://clioforge.com',
) {
  let url: URL;
  try {
    url = new URL(href, base);
    const baseURL = new URL(base);
    if (url.origin !== baseURL.origin || url.pathname !== '/') return null;
  } catch {
    return null;
  }
  const evidence = url.searchParams.get('evidence');
  if (evidence) return `evidence:${url.origin}${url.pathname}:${evidence}`;
  const project = url.searchParams.get('project'),
    version = url.searchParams.get('version'),
    page = url.searchParams.get('page');
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (
    url.searchParams.get('tab') !== 'sources' ||
    !project ||
    !version ||
    !uuid.test(project) ||
    !uuid.test(version) ||
    !page ||
    !/^[1-9]\d*$/.test(page)
  )
    return null;
  return `page:${url.origin}:${project}:${version}:${page}`;
}
export function writingCitationLink(citation: WritingCitation) {
  if (citation.id.startsWith('page:')) return citation.href;
  const url = new URL(citation.href);
  url.searchParams.set('evidence', citation.id);
  return url.href;
}
export function writingCitationMap(citations: WritingCitation[]) {
  return new Map(
    citations.map((citation) => [
      writingCitationKey(writingCitationLink(citation), citation.href)!,
      citation,
    ]),
  );
}
export function writingPageReferences(
  body: string,
  document: string | null | undefined,
  origin: string,
) {
  const keys = new Set<string>();
  const add = (href: unknown) => {
    if (typeof href !== 'string') return;
    const key = writingCitationKey(href, origin);
    if (key?.startsWith('page:')) keys.add(key);
  };
  for (const match of body.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) add(match[1]);
  if (document) {
    const visit = (node: RichNode) => {
      for (const mark of node.marks || [])
        if (mark.type === 'link') add(mark.attrs?.href);
      for (const child of node.content || []) visit(child);
    };
    visit(parseRichDocument(document));
  }
  return keys;
}
export function citedEvidence(
  body: string,
  citations: WritingCitation[],
  origin = citations[0]?.href || 'https://clioforge.com',
) {
  const byId = writingCitationMap(citations);
  const used: WritingCitation[] = [],
    missing: string[] = [];
  const text = body
    .replaceAll('\uE000', '')
    .replaceAll('\uE001', '')
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_whole, label, href) => {
      const id = writingCitationKey(href, origin);
      if (!id) return `${label} (${href})`;
      const citation = byId.get(id);
      if (!citation) {
        missing.push(id);
        return `${label} [unresolved citation]`;
      }
      used.push(citation);
      return `\uE000${used.length}\uE001`;
    });
  return { text, used, missing };
}
const xml = (s: string) =>
  Array.from(s)
    .filter((c) => {
      const n = c.codePointAt(0)!;
      return (
        n === 9 ||
        n === 10 ||
        n === 13 ||
        (n >= 32 && n <= 0xd7ff) ||
        (n >= 0xe000 && n <= 0xfffd) ||
        (n >= 0x10000 && n <= 0x10ffff)
      );
    })
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const run = (s: string) =>
  `<w:r><w:t xml:space="preserve">${xml(s)}</w:t></w:r>`;
export function writingDocx(
  title: string,
  body: string,
  citations: WritingCitation[],
  origin = citations[0]?.href || 'https://clioforge.com',
) {
  const { text, used, missing } = citedEvidence(body, citations, origin);
  if (missing.length)
    throw new Error('笔记包含找不到的证据引用，请重新选择出处。');
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => {
      const heading = line.match(/^(#{1,3})\s+(.*)$/),
        content = heading ? heading[2] : line;
      const chunks = content
        .split(/(\uE000\d+\uE001)/)
        .map((part) =>
          /^\uE000\d+\uE001$/.test(part)
            ? `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${Number(part.slice(1, -1))}"/></w:r>`
            : run(part),
        );
      return `<w:p>${heading ? `<w:pPr><w:pStyle w:val="Heading${heading[1].length}"/></w:pPr>` : ''}${chunks.join('')}</w:p>`;
    })
    .join('');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const files: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml': `<w:styles xmlns:w="${ns}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${[1, 2, 3].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${36 - n * 4}"/></w:rPr></w:style>`).join('')}</w:styles>`,
    'word/document.xml': `<w:document xmlns:w="${ns}"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run(title)}</w:p>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
    'word/footnotes.xml': `<w:footnotes xmlns:w="${ns}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${used.map((c, i) => `<w:footnote w:id="${i + 1}"><w:p><w:r><w:footnoteRef/></w:r>${run(' ' + c.text + ' ' + c.href + (c.stale ? ' [Source has a newer version; review required.]' : ''))}</w:p></w:footnote>`).join('')}</w:footnotes>`,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, value]) => [name, strToU8(value)]),
    ),
  );
}
