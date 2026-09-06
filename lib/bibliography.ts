import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-csl';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-ris';
import chicago from './citation-style.json';
import { cslInput } from './workbench-inputs';
import type { BibliographyEntry, CSL } from './workbench-types';
plugins.config.get('@csl').styles.add('foliotrace-chicago', chicago.style);
// Preserve non-Latin titles and stable entry IDs in exported BibTeX.
Object.assign(plugins.config.get('@bibtex').format, {
  asciiOnly: false,
  useIdAsLabel: true,
});
export function parseBibliography(
  text: string,
  format: 'csl' | 'bibtex' | 'ris',
): CSL[] {
  if (new TextEncoder().encode(text).length > 1_500_000)
    throw new Error('书目文件最多 1.5 MB。');
  // Do not load DOI/URL resolver plugins or infer remote input formats.
  const raw: unknown =
    format === 'csl'
      ? JSON.parse(text)
      : new Cite(text, {
          forceType: format === 'bibtex' ? '@bibtex/text' : '@ris/file',
          generateGraph: false,
        }).data;
  if (!Array.isArray(raw) || !raw.length || raw.length > 100)
    throw new Error('每次请选择 1–100 条书目。');
  return raw.map((item) => cslInput.parse(item));
}
export function exportBibliography(
  entries: BibliographyEntry[],
  format: 'csl' | 'bibtex' | 'ris' | 'chicago' | 'apa',
) {
  const data = entries.map((entry) => ({ ...entry.csl, id: entry.id }));
  if (format === 'csl') return JSON.stringify(data, null, 2);
  if (!data.length) return '';
  const cite = new Cite(data);
  return format === 'chicago' || format === 'apa'
    ? cite.format('bibliography', {
        format: 'text',
        style: format === 'chicago' ? 'foliotrace-chicago' : 'apa',
        lang: 'en-US',
      })
    : cite.format(format);
}
export function footnote(entry: BibliographyEntry, locator: string) {
  return new Cite([{ ...entry.csl, id: entry.id }]).format('citation', {
    format: 'text',
    style: 'foliotrace-chicago',
    lang: 'en-US',
    entry: [{ id: entry.id, locator, label: 'page' }],
  });
}
