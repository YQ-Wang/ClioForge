import { Zip, ZipPassThrough, strToU8 } from 'fflate';
import { ResearchStore } from './store';
import { HttpError } from './errors';
import { sha256 } from './platform/search';
import { MAX_FILE_BYTES, mediaExtensions } from './files';
import type { Source } from './types';
const projectTables = [
  'sources',
  'source_groups',
  'source_organization',
  'source_versions',
  'source_pages',
  'notes',
  'note_state',
  'evidence',
  'bibliography_entries',
  'research_questions',
  'claims',
  'claim_evidence',
  'source_relations',
  'search_logs',
  'evidence_reviews',
  'research_runs',
  'source_derivations',
  'direct_run_costs',
  'research_jobs',
  'project_budgets',
  'research_watches',
  'research_inbox',
  'missions',
  'mission_tasks',
  'research_methods',
  'task_corrections',
  'claim_assessments',
  'project_comments',
  'project_members',
  'search_aliases',
  'artifacts',
  'project_snapshots',
  'research_branches',
  'entities',
  'entity_relations',
  'evaluation_runs',
  'ingestion_items',
] as const;
const relatedTables = [
  [
    'mission_boards',
    'mission_id IN (SELECT id FROM missions WHERE project_id=?)',
  ],
  [
    'artifact_lineage',
    'artifact_id IN (SELECT id FROM artifacts WHERE project_id=?)',
  ],
  [
    'source_origins',
    'source_id IN (SELECT id FROM sources WHERE project_id=?)',
  ],
  [
    'bibliography_history',
    'entry_id IN (SELECT id FROM bibliography_entries WHERE project_id=?)',
  ],
  [
    'task_dependencies',
    'mission_id IN (SELECT id FROM missions WHERE project_id=?)',
  ],
  [
    'task_inputs',
    'task_id IN (SELECT id FROM mission_tasks WHERE project_id=?)',
  ],
  ['task_events', 'mission_id IN (SELECT id FROM missions WHERE project_id=?)'],
  [
    'task_reviews',
    'task_id IN (SELECT id FROM mission_tasks WHERE project_id=?)',
  ],
  [
    'task_attempts',
    'task_id IN (SELECT id FROM mission_tasks WHERE project_id=?)',
  ],
  [
    'artifact_reviews',
    'artifact_id IN (SELECT id FROM artifacts WHERE project_id=?)',
  ],
  [
    'artifact_dependencies',
    'artifact_id IN (SELECT id FROM artifacts WHERE project_id=?)',
  ],
  [
    'branch_reviews',
    'branch_id IN (SELECT id FROM research_branches WHERE project_id=?)',
  ],
] as const;
export async function projectArchive(
  store: ResearchStore,
  files: R2Bucket,
  projectId: string,
) {
  const project = await store.project(projectId);
  const queries = [
    ...projectTables.map((table) => [table, 'project_id=?'] as const),
    ...relatedTables,
  ];
  // D1 batch gives the related records a consistent read. Runtime credentials,
  // login data, model keys, invitations and active lease tokens are excluded.
  const results = await store.db.batch<Record<string, unknown>>(
    queries.map(([table, where]) =>
      store.db.prepare(`SELECT * FROM ${table} WHERE ${where}`).bind(projectId),
    ),
  );
  await store.project(projectId);
  const records = Object.fromEntries(
    queries.map(([table], i) => [
      table,
      results[i].results.map((row) => {
        const record = { ...row };
        for (const key of [
          'lease_hash',
          'review_token',
          'merge_token',
          'mutation_token',
        ])
          delete record[key];
        return record;
      }),
    ]),
  );
  const sources = records.sources as unknown as Source[];
  const contributorIds = [
    ...new Set(
      Object.values(records).flatMap((rows) =>
        rows.flatMap((row) =>
          ['owner_id', 'created_by', 'author', 'reviewer', 'added_by'].flatMap(
            (key) => (typeof row[key] === 'string' ? [row[key] as string] : []),
          ),
        ),
      ),
    ),
  ];
  const people: { id: string; name: string }[] = [];
  for (let offset = 0; offset < contributorIds.length; offset += 90) {
    const ids = contributorIds.slice(offset, offset + 90);
    const rows = await store.db
      .prepare(
        `SELECT id,name FROM user WHERE id IN (${ids.map(() => '?').join(',')})`,
      )
      .bind(...ids)
      .all<{ id: string; name: string }>();
    people.push(...rows.results);
  }

  const metadata = strToU8(
    JSON.stringify(
      {
        format: 'clioforge-research-package',
        version: 1,
        exported_at: new Date().toISOString(),
        project,
        records,
        people,
      },
      null,
      2,
    ),
  );
  if (metadata.byteLength > 30 * 1024 * 1024)
    throw new HttpError(413, '项目记录超过单次打包限制，请联系支持协助导出。');
  const manifest: {
    path: string;
    bytes: number;
    sha256: string;
    source_id?: string;
    title?: string;
  }[] = [];
  let cancelled = false;
  async function* chunks() {
    let pending: Uint8Array[] = [];
    let zipError: Error | null = null;
    const zip = new Zip((error, chunk) => {
      if (error) zipError = error;
      else pending.push(chunk);
    });
    async function* add(path: string, bytes: Uint8Array, source?: Source) {
      manifest.push({
        path,
        bytes: bytes.byteLength,
        sha256: await sha256(bytes),
        ...(source ? { source_id: source.id, title: source.title } : {}),
      });
      const file = new ZipPassThrough(path);
      zip.add(file);
      for (
        let offset = 0;
        offset < bytes.byteLength || offset === 0;
        offset += 65536
      ) {
        if (cancelled) return;
        file.push(
          bytes.subarray(offset, offset + 65536),
          offset + 65536 >= bytes.byteLength,
        );
        if (zipError) throw zipError;
        const output = pending;
        pending = [];
        for (const chunk of output) yield chunk;
      }
    }
    try {
      yield* add('project.json', metadata);
      let total = metadata.byteLength;
      for (const source of sources) {
        if (cancelled) return;
        await store.source(source.id);
        const original = await files.get(source.object_path);
        if (!original)
          throw new Error('An original file is missing. Export incomplete.');
        if (
          original.size > MAX_FILE_BYTES ||
          (total += original.size) > 512 * 1024 * 1024
        ) {
          await original.body.cancel();
          throw new Error('Package exceeds the download size limit.');
        }
        const bytes = new Uint8Array(await original.arrayBuffer());
        yield* add(
          `originals/${source.id}.${mediaExtensions[source.media_type] || 'bin'}`,
          bytes,
          source,
        );
      }
      const index = new ZipPassThrough('manifest.json');
      zip.add(index);
      index.push(
        strToU8(
          JSON.stringify(
            {
              format: 'clioforge-research-package',
              version: 1,
              files: manifest,
              notes:
                'Read-only export. Original IDs and historical records are preserved; credentials are excluded. Restore creates an independent private project; access grants, credentials, active execution and spending allowances are not reactivated.',
            },
            null,
            2,
          ),
        ),
        true,
      );
      zip.end();
      if (zipError) throw zipError;
      for (const chunk of pending) yield chunk;
    } finally {
      zip.terminate();
    }
  }
  const iterator = chunks();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      await iterator.return();
    },
  });
}
