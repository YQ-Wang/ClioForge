import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { ResearchStore } from '../lib/store';
import { WorkbenchStore } from '../lib/workbench-store';
import { LiteratureStore } from '../lib/literature-store';
import {
  literatureQueries,
  parseCatalog,
  mergeCandidates,
  rankCandidates,
  searchCatalog,
  safeLiteratureUrl,
} from '../lib/literature-catalogs';
import { searchSourceCandidates } from '../lib/platform/discovery';
import { candidateSchema } from '../lib/literature-types';
import { exportBibliography } from '../lib/bibliography';

const crossref = {
  message: {
    items: [
      {
        DOI: '10.1234/ADAMS',
        title: ['Abigail Adams: Remember the Ladies'],
        type: 'book-chapter',
        author: [{ given: 'Test', family: 'Historian' }],
        issued: { 'date-parts': [[2020]] },
        publisher: 'Synthetic publisher',
      },
    ],
  },
};
const openalex = {
  results: [
    {
      doi: 'https://doi.org/10.1234/adams',
      title: 'Abigail Adams: Remember the Ladies',
      type: 'book-chapter',
      publication_year: 2020,
      best_oa_location: {
        pdf_url: 'https://example.org/open.pdf',
        license: 'cc-by',
      },
    },
  ],
};
const exa = {
  results: [
    { title: 'An archive finding aid', url: 'https://example.org/catalog' },
  ],
};
let mf: Miniflare, db: D1Database;
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch(){return new Response("ok")} }',
      d1Databases: ['DB'],
      compatibilityDate: '2026-09-04',
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const name of (await fs.readdir(new URL('../drizzle/', import.meta.url)))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const sql = await fs.readFile(
      new URL('../drizzle/' + name, import.meta.url),
      'utf8',
    );
    for (const statement of sql.split(
      name.startsWith('0000') ? '--> statement-breakpoint' : '\n',
    ))
      if (statement.trim() && !statement.trim().startsWith('--'))
        await db.prepare(statement).run();
  }
});
after(async () => {
  await mf?.dispose();
});
async function fixture() {
  const owner = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)',
    )
    .bind(owner, 'Researcher', `${owner}@example.test`, Date.now(), Date.now())
    .run();
  const store = new ResearchStore(db, owner);
  const project = await store.createProject(
    'Adams research',
    'Remember the ladies',
  );
  return {
    store,
    project: project.id,
    literature: new LiteratureStore(store, btoa('a'.repeat(32))),
  };
}
void test('Chinese queries retain originals and expand simplified/traditional forms within a hard bound', () => {
  assert.deepEqual(
    literatureQueries(['晚清 女学', 'late Qing women education']),
    ['晚清 女学', 'late Qing women education', '晚清 女學'],
  );
  assert.deepEqual(literatureQueries(['張之洞 女學']), [
    '張之洞 女學',
    '张之洞 女学',
  ]);
  assert.deepEqual(literatureQueries(['晚清 女学'], false), ['晚清 女学']);
  assert.equal(literatureQueries(['a', 'b', 'c', 'd']).length, 3);
});
void test('DOI dedup preserves open-access leads and all matching queries without merging editions by title', () => {
  const items = mergeCandidates([
    ...parseCatalog('crossref', crossref, 'Adams'),
    ...parseCatalog('openalex', openalex, 'women rights'),
  ]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].catalogs, ['crossref', 'openalex']);
  assert.deepEqual(items[0].matched_queries, ['Adams', 'women rights']);
  assert.equal(items[0].csl?.type, 'chapter');
  assert.equal(items[0].fulltext_url, 'https://example.org/open.pdf');
  assert.equal(items[0].access, 'catalog_only');
  assert.equal(candidateSchema.safeParse(items[0]).success, true);
  assert.equal(
    mergeCandidates([...items, { ...items[0], id: 'doi:10.1234/edition2' }])
      .length,
    2,
  );
  assert.equal(safeLiteratureUrl('javascript:alert(1)'), undefined);
  assert.equal(
    safeLiteratureUrl('https://private:secret@example.org'),
    undefined,
  );
  assert.deepEqual(
    parseCatalog(
      'crossref',
      { message: { items: [{ title: ['No identifier'] }] } },
      'test',
    ),
    [],
  );
});
void test('catalog adapters never follow redirects, expose keys in URLs, retry uncertain paid calls, or infer absence from failure', async () => {
  let calls = 0;
  const request: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(
      new URL(input instanceof Request ? input.url : input.toString()).hostname,
      'api.exa.ai',
    );
    assert.equal(
      (input instanceof Request ? input.url : input.toString()).includes(
        'test-key',
      ),
      false,
    );
    assert.equal(init?.redirect, 'manual');
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'test-key');
    assert.deepEqual(
      JSON.parse(typeof init?.body === 'string' ? init.body : '{}'),
      { query: 'letters', type: 'auto', numResults: 5 },
    );
    throw new DOMException('Timeout', 'TimeoutError');
  };
  assert.equal(
    (await searchCatalog('exa', 'letters', request, 'test-key')).status,
    'uncertain',
  );
  assert.equal(calls, 1);
  assert.equal(
    (
      await searchCatalog(
        'crossref',
        'letters',
        async () => new Response('', { status: 429 }),
      )
    ).status,
    'rate_limited',
  );
});
void test('research workflow searches, persists, resumes and imports a verified candidate into existing bibliography without duplicates', async () => {
  const { store, project, literature } = await fixture();
  let calls = 0;
  const request: typeof fetch = async (url) => {
    calls++;
    return Response.json(
      (url instanceof Request ? url.url : url.toString()).includes('crossref')
        ? crossref
        : (url instanceof Request ? url.url : url.toString()).includes(
              'openalex',
            )
          ? openalex
          : { results: [] },
    );
  };
  const id = crypto.randomUUID();
  assert.equal(await literature.begin(project, id, 'Adams'), null);
  const result = await searchSourceCandidates(store, {
    project_id: project,
    version_ids: [],
    queries: ['Adams'],
    external: true,
    locale: 'en',
    catalog_search: (catalog, query) =>
      literature.search(project, catalog, query, request),
  });
  await literature.finish(project, id, result);
  assert.equal((result.data as { candidates: unknown[] }).candidates.length, 1);
  assert.deepEqual(result.citations, []);
  assert.deepEqual(
    await literature.begin(project, id, 'Adams'),
    JSON.parse(JSON.stringify(result)),
  );
  await literature.finish(project, id, null);
  assert.equal((await literature.session(project, id))?.status, 'completed');
  assert.equal(
    (await literature.search(project, 'crossref', 'Adams', request)).cached,
    true,
  );
  assert.equal(calls, 3);
  assert.deepEqual(
    await literature.saveCandidate(project, id, 'doi:10.1234/adams'),
    { imported: 1, skipped: 0 },
  );
  assert.deepEqual(
    await literature.saveCandidate(project, id, 'doi:10.1234/adams'),
    { imported: 0, skipped: 1 },
  );
  assert.equal(
    JSON.parse((await literature.session(project, id))!.result!).data
      .candidates[0].saved_to_bibliography,
    true,
  );
  const bibliography = (
    await new WorkbenchStore(db, store.owner).workbench(project)
  ).bibliography;
  assert.match(exportBibliography(bibliography, 'bibtex'), /Adams/);
  assert.match(String(bibliography[0].csl.note), /full text has not been read/);
  await assert.rejects(
    literature.saveCandidate(project, id, 'invented-candidate'),
  );
  const other = await fixture();
  await assert.rejects(other.literature.session(project, id));
  await assert.rejects(
    other.literature.saveCandidate(project, id, 'doi:10.1234/adams'),
  );
  assert.equal(await other.literature.session(other.project, id), null);
});
void test('Exa reservations enforce a concurrent monthly cap, survive key changes and do not consume quota on cached hits', async () => {
  const { store, project, literature } = await fixture();
  await literature.configure('exa', 'fixture-exa-key', 1);
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return Response.json(exa);
  };
  const results = await Promise.all(
    ['query one', 'query two'].map((query) =>
      literature.search(project, 'exa', query, request),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(
    results.filter((r) => r.status === 'budget_exhausted').length,
    1,
  );
  const successful =
    results[0].status === 'completed' ? 'query one' : 'query two';
  assert.equal(
    (await literature.search(project, 'exa', successful, request)).cached,
    true,
  );
  assert.equal(calls, 1);
  await literature.configure('exa', 'new-fixture-key', 1);
  assert.equal(
    (await literature.search(project, 'exa', 'another query', request)).status,
    'budget_exhausted',
  );
  const publicConfig = JSON.stringify(await literature.connections());
  assert.equal(publicConfig.includes('key'), false);
  const stored = await db
    .prepare('SELECT encrypted_key FROM search_connections WHERE owner_id=?')
    .bind(store.owner)
    .first<{ encrypted_key: string }>();
  assert.equal(stored!.encrypted_key.includes('fixture'), false);
  await literature.configure('exa', undefined, 0);
  assert.equal((await literature.connections())[0].monthly_limit, 0);
  assert.equal(
    (await literature.search(project, 'exa', 'paused search', request)).status,
    'budget_exhausted',
  );
  await literature.remove('exa');
  assert.equal((await literature.connections()).length, 0);
});

void test('Chinese ranking demotes medical noise while preserving it for inspection', () => {
  const base = {
    id: 'x',
    url: 'https://example.org',
    access: 'catalog_only' as const,
    detail: '',
    matched_queries: ['晚清 女学'],
  };
  const ranked = rankCandidates([
    { ...base, title: '血清 AFP 阳性晚期胃癌患者的临床分析' },
    { ...base, id: 'y', title: '走出学堂——晚清女學生的社會音樂活動' },
  ]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 'y');
  assert.equal(ranked[0].match_score, 1);
  assert.equal(ranked[1].match_score, 0);
});
