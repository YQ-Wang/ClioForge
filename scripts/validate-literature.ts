import { mkdir, writeFile } from 'node:fs/promises';
import {
  literatureQueries,
  searchCatalog,
  mergeCandidates,
  rankCandidates,
} from '../lib/literature-catalogs';
import type { Catalog } from '../lib/literature-types';
// Opt-in live probe: public queries only, no model calls or paid credentials.
const topics = ['Abigail Adams Remember the Ladies', '晚清 女学'];
const output = [];
for (const topic of topics) {
  const searches = [];
  for (const query of literatureQueries([topic])) {
    for (const catalog of ['crossref', 'openalex', 'loc'] as Catalog[]) {
      const start = Date.now();
      const result = await searchCatalog(catalog, query);
      searches.push({
        query,
        catalog,
        status: result.status,
        elapsed_ms: Date.now() - start,
        candidates: result.candidates,
      });
    }
  }
  const candidates = rankCandidates(
    mergeCandidates(searches.flatMap((s) => s.candidates)),
  );
  output.push({ topic, searches, candidates });
  console.log(
    JSON.stringify({
      topic,
      searches: searches.map(({ query, catalog, status, candidates }) => ({
        query,
        catalog,
        status,
        returned: candidates.length,
      })),
      candidates: candidates.map((c) => ({
        title: c.title,
        type: c.csl?.type,
        url: c.url,
        open_access_lead: !!c.fulltext_url,
      })),
    }),
  );
}
await mkdir('work/literature', { recursive: true });
await writeFile(
  'work/literature/live-catalog-probe.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope:
        'Discovery smoke test, not a recall or productivity benchmark. No full texts fetched.',
      cases: output,
    },
    null,
    2,
  ),
);
