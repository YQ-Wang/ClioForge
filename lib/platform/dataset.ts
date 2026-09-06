import { saveOriginalUpload } from '../original-upload';
import dataset from '../../fixtures/led-sample.json';
import { MissionStore } from './missions';
import { sha256 } from './search';
export { dataset };
export async function importLedSample(
  store: MissionStore,
  files: R2Bucket,
  projectId: string,
) {
  await store.project(projectId, 'write');
  let imported = 0,
    skipped = 0;
  for (const record of dataset.records) {
    const externalId = record.record_number;
    const digest = await sha256(record.text);
    const existing = await store.db
      .prepare(
        'SELECT o.source_id FROM source_origins o JOIN sources s ON s.id=o.source_id WHERE s.project_id=? AND o.provider=? AND o.external_id=? AND o.content_hash=?',
      )
      .bind(projectId, 'aeneas-led', externalId, digest)
      .first();
    if (existing) {
      skipped++;
      continue;
    }
    const id = crypto.randomUUID(),
      path = `${store.owner}/${projectId}/${id}/original.txt`,
      bytes = new TextEncoder().encode(record.text);
    await store.reserveUpload(id, projectId, bytes.length);
    await saveOriginalUpload(
      store,
      files,
      id,
      projectId,
      path,
      bytes,
      'text/plain',
    );
    const version = await store.importSource({
      p_id: id,
      p_project: projectId,
      p_title: `${externalId} · ${record.region_main || record.region_sub || 'Unknown provenance'}`,
      p_path: path,
      p_type: 'text/plain',
      p_pages: [{ page: 1, text: record.text }],
    });
    await store.db
      .prepare('INSERT INTO source_origins VALUES(?,?,?,?,?,?,?,?)')
      .bind(
        id,
        'aeneas-led',
        externalId,
        `https://edh.ub.uni-heidelberg.de/edh/inschrift/${externalId}`,
        dataset.license,
        new Date().toISOString(),
        digest,
        JSON.stringify({
          dataset: dataset.name,
          dataset_url: dataset.source,
          attribution: dataset.attribution,
          ...record,
        }),
      )
      .run();
    await store.db
      .prepare(
        'UPDATE source_pages SET language=?,year_start=?,year_end=? WHERE version_id=?',
      )
      .bind('la', record.date_min, record.date_max, version)
      .run();
    await store.db
      .prepare('INSERT INTO bibliography_entries VALUES(?,?,?,?,1,?,?)')
      .bind(
        crypto.randomUUID(),
        projectId,
        id,
        JSON.stringify({
          type: 'manuscript',
          title: externalId,
          archive: 'Epigraphic Database Heidelberg',
          archive_location: externalId,
          language: 'la',
          rights: dataset.license,
          URL: `https://edh.ub.uni-heidelberg.de/edh/inschrift/${externalId}`,
          note: dataset.attribution,
        }),
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
    imported++;
  }
  return {
    imported,
    skipped,
    source: dataset.source,
    license: dataset.license,
    limitations: dataset.selection,
  };
}
