/* eslint-disable typescript/no-explicit-any -- The fixed-host OpenAlex response is narrowed to the normalized sourceCandidate contract below. */
import { mediaExtensions } from '../files';
import { removeTemporaryObject } from '../object-cleanup';
import { saveOriginalUpload } from '../original-upload';
import type { MissionStore } from '../platform/missions';
import { sha256 } from '../platform/search';
import {
  runConnectorSearch,
  type SearchCredentials,
} from '../search/connectors';
import { fixedJson, safeDownload } from '../search/safe-fetch';
import type { MissionTask, TaskResult } from '../platform/types';
import {
  priorSourceSearch,
  sourceCandidate,
  sourceCandidates,
  sourceSearchAction,
  type SourceCandidate,
  type SourceSearchMemory,
} from './source-search-tools';

export type SourceSearchRuntime = {
  files?: R2Bucket;
  credentials?: SearchCredentials;
  request?: typeof fetch;
};

const now = () => new Date().toISOString();

async function saveCandidate(
  store: MissionStore,
  task: MissionTask,
  candidate: SourceCandidate,
) {
  const date = now();
  await store.db.batch([
    store.db
      .prepare(
        `INSERT INTO library_records(id,provider,external_id,title,creators,issued_date,material_type,languages,institution,collection_name,doi,handle,ark,oclc,landing_url,manifest_url,download_url,rights,license,access_status,metadata,harvested_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title,creators=excluded.creators,issued_date=excluded.issued_date,material_type=excluded.material_type,languages=excluded.languages,institution=excluded.institution,collection_name=excluded.collection_name,doi=excluded.doi,handle=excluded.handle,ark=excluded.ark,oclc=excluded.oclc,landing_url=excluded.landing_url,manifest_url=excluded.manifest_url,download_url=excluded.download_url,rights=excluded.rights,license=excluded.license,access_status=excluded.access_status,metadata=excluded.metadata,harvested_at=excluded.harvested_at`,
      )
      .bind(
        candidate.id,
        candidate.provider,
        candidate.external_id,
        candidate.title,
        JSON.stringify(candidate.creators),
        candidate.issued_date,
        candidate.material_type,
        JSON.stringify(candidate.languages),
        candidate.institution,
        candidate.collection,
        candidate.doi,
        candidate.handle,
        candidate.ark,
        candidate.oclc,
        candidate.landing_url,
        candidate.manifest_url,
        candidate.download_url,
        candidate.rights,
        candidate.license,
        candidate.access_status,
        JSON.stringify(candidate),
        date,
      ),
    store.db
      .prepare(
        `INSERT INTO source_search_candidates(run_id,project_id,record_id,verification_level,decision,updated_at)
         SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM source_search_runs WHERE id=? AND project_id=?)
         ON CONFLICT(run_id,record_id) DO UPDATE SET verification_level=excluded.verification_level,updated_at=excluded.updated_at`,
      )
      .bind(
        task.mission_id,
        task.project_id,
        candidate.id,
        candidate.verification_level,
        'unreviewed',
        date,
        task.mission_id,
        task.project_id,
      ),
  ]);
}

async function markCandidate(
  store: MissionStore,
  task: MissionTask,
  candidate: SourceCandidate,
  decision: string,
  reason = '',
) {
  await saveCandidate(store, task, candidate);
  await store.db
    .prepare(
      `UPDATE source_search_candidates SET decision=?,relevance_reason=CASE WHEN ?='rejected' THEN relevance_reason ELSE ? END,rejection_reason=CASE WHEN ?='rejected' THEN ? ELSE rejection_reason END,inspected_at=CASE WHEN ? IN ('verified','downloadable','needs_file','imported','rejected') THEN ? ELSE inspected_at END,updated_at=? WHERE run_id=? AND record_id=?`,
    )
    .bind(
      decision,
      decision,
      reason,
      decision,
      reason,
      decision,
      now(),
      now(),
      task.mission_id,
      candidate.id,
    )
    .run();
}

async function resolveCandidate(
  candidate: SourceCandidate,
  request: typeof fetch,
) {
  let resolved = { ...candidate };
  if (!resolved.download_url && resolved.doi) {
    const url = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(resolved.doi)}`;
    try {
      const raw = (await fixedJson(url, ['api.openalex.org'], request)) as any;
      const location = raw?.best_oa_location || raw?.primary_location || {};
      const download = String(location?.pdf_url || '');
      if (download.startsWith('https://'))
        resolved = {
          ...resolved,
          download_url: download,
          license: String(location?.license || resolved.license),
          rights: String(location?.license || resolved.rights),
          access_status: 'open',
        };
    } catch {
      // A failed resolver is represented as a lead, never as evidence of absence.
    }
  }
  return sourceCandidate.parse(resolved);
}

function plainText(bytes: Uint8Array, mediaType: string) {
  if (mediaType !== 'text/plain' && mediaType !== 'text/html') return '';
  const value = new TextDecoder().decode(bytes);
  return mediaType === 'text/html'
    ? value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100000)
    : value.slice(0, 100000);
}

async function importCandidate(
  store: MissionStore,
  task: MissionTask,
  candidate: SourceCandidate,
  runtime: SourceSearchRuntime,
) {
  if (!runtime.files)
    throw new Error('Original-file storage is not configured');
  if (!candidate.download_url) throw new Error('No resolved download URL');
  if (!['open', 'public'].includes(candidate.access_status))
    throw new Error('The candidate is not marked for public/open access');
  const downloaded = await safeDownload(
    candidate.download_url,
    runtime.request || fetch,
  );
  const storedType =
    downloaded.mediaType === 'text/html' ? 'text/plain' : downloaded.mediaType;
  if (!mediaExtensions[storedType])
    throw new Error('Downloaded format cannot be imported');
  const bytes =
    downloaded.mediaType === 'text/html'
      ? new TextEncoder().encode(
          plainText(downloaded.bytes, downloaded.mediaType),
        )
      : downloaded.bytes;
  const id = crypto.randomUUID();
  const path = `${store.owner}/${task.project_id}/${id}/original.${mediaExtensions[storedType]}`;
  let version = '';
  try {
    await store.reserveUpload(id, task.project_id, bytes.byteLength);
    await saveOriginalUpload(
      store,
      runtime.files,
      id,
      task.project_id,
      path,
      bytes,
      storedType,
    );
    version = await store.importSource({
      p_id: id,
      p_project: task.project_id,
      p_title: candidate.title.slice(0, 300),
      p_path: path,
      p_type: storedType,
      p_pages: [{ page: 1, text: plainText(bytes, storedType) }],
    });
  } catch (error) {
    const committed = await store.db
      .prepare(
        'SELECT id FROM source_versions WHERE source_id=? AND project_id=? ORDER BY revision LIMIT 1',
      )
      .bind(id, task.project_id)
      .first<{ id: string }>();
    if (committed) version = committed.id;
    else {
      await removeTemporaryObject(store.db, runtime.files, path).catch(() => {
        /* The durable cleanup marker is retried by scheduled maintenance. */
      });
      await store.db.batch([
        store.db
          .prepare('DELETE FROM upload_receipts WHERE id=? AND owner_id=?')
          .bind(id, store.owner),
        store.db
          .prepare('DELETE FROM upload_reservations WHERE id=? AND owner_id=?')
          .bind(id, store.owner),
      ]);
      throw error;
    }
  }
  await store.db.batch([
    store.db
      .prepare('INSERT OR IGNORE INTO source_origins VALUES(?,?,?,?,?,?,?,?)')
      .bind(
        id,
        candidate.provider,
        candidate.external_id,
        candidate.landing_url,
        candidate.license,
        now(),
        await sha256(bytes),
        JSON.stringify(candidate),
      ),
    store.db
      .prepare(
        "UPDATE source_search_candidates SET decision='imported',updated_at=? WHERE run_id=? AND record_id=?",
      )
      .bind(now(), task.mission_id, candidate.id),
    store.db
      .prepare(
        "UPDATE source_leads SET status='imported',resolved_source_id=?,updated_at=? WHERE project_id=? AND record_id=?",
      )
      .bind(id, now(), task.project_id, candidate.id),
  ]);
  return { source_id: id, version_id: version, media_type: storedType };
}

async function saveLead(
  store: MissionStore,
  task: MissionTask,
  candidate: SourceCandidate,
  relevanceReason: string,
  accessNote: string,
) {
  await markCandidate(store, task, candidate, 'needs_file', relevanceReason);
  const id = crypto.randomUUID();
  await store.db
    .prepare(
      `INSERT INTO source_leads(id,project_id,record_id,run_id,status,access_note,relevance_reason,created_at,updated_at)
       SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM source_search_runs WHERE id=? AND project_id=?)
       ON CONFLICT(project_id,record_id) DO UPDATE SET status='needs_file',run_id=excluded.run_id,access_note=excluded.access_note,relevance_reason=excluded.relevance_reason,updated_at=excluded.updated_at`,
    )
    .bind(
      id,
      task.project_id,
      candidate.id,
      task.mission_id,
      'needs_file',
      accessNote,
      relevanceReason,
      now(),
      now(),
      task.mission_id,
      task.project_id,
    )
    .run();
}

export async function sourceSearchTool(
  store: MissionStore,
  task: MissionTask,
  deps: MissionTask[],
  runtime: SourceSearchRuntime = {},
): Promise<TaskResult> {
  const L = (zh: string, en: string) => (task.input.locale === 'en' ? en : zh);
  if (task.input.parameters.source_agent_stage === 'init')
    return {
      summary: L('资料检索记录已准备。', 'Source-search ledger initialized.'),
      citations: [],
      checks: [],
      data: { version: 1, stopped: false, stop_reason: '', steps: [] },
    };
  const memory: SourceSearchMemory = priorSourceSearch(deps);
  if (task.input.parameters.source_agent_stage === 'decision') {
    if (!memory.stopped) throw new Error('Source search is not finished');
    return {
      summary: L(
        '资料检索已停止，不再调用模型。',
        'Source search stopped; no model call.',
      ),
      citations: [],
      checks: [],
      data: { tool: 'finish', reason: memory.stop_reason },
    };
  }
  const decision = deps.find(
    (dep) => dep.input.parameters.source_agent_stage === 'decision',
  );
  const action = sourceSearchAction.parse(decision?.result?.data);
  if (memory.stopped)
    return {
      summary: memory.stop_reason,
      citations: [],
      checks: [],
      data: memory,
    };
  let candidates: SourceCandidate[] = [];
  let outcome = '';
  let status: 'completed' | 'unavailable' | 'blocked' = 'completed';
  const known = sourceCandidates(memory);
  if (action.tool === 'finish') {
    memory.stopped = true;
    memory.stop_reason = action.reason;
    outcome = action.reason;
  } else if (action.tool === 'search') {
    const response = await runConnectorSearch(
      action,
      runtime.credentials,
      runtime.request || fetch,
    );
    candidates = response.candidates.map((value) =>
      sourceCandidate.parse({
        ...value,
        snippet: value.snippet.slice(0, 1600),
      }),
    );
    for (const value of candidates) await saveCandidate(store, task, value);
    const unavailable = response.searches.filter(
      (item) => item.status === 'unavailable',
    );
    status =
      unavailable.length === response.searches.length
        ? 'unavailable'
        : 'completed';
    outcome = L(
      `返回 ${candidates.length} 条候选；${unavailable.length} 个连接器不可用。候选元数据尚不是史料证据。`,
      `${candidates.length} candidates returned; ${unavailable.length} connectors unavailable. Candidate metadata is not historical evidence.`,
    );
  } else {
    const current = known.get(action.result_id);
    if (!current)
      throw new Error('Candidate is not in the source-search ledger');
    if (action.tool === 'inspect_result') {
      const inspected = sourceCandidate.parse({
        ...current,
        verification_level:
          current.verification_level === 'metadata' && current.snippet
            ? 'abstract'
            : current.verification_level,
      });
      candidates = [inspected];
      await markCandidate(
        store,
        task,
        inspected,
        'verified',
        decision?.result?.summary || '',
      );
      outcome = L(
        '已核查书目元数据与可用摘要。',
        'Bibliographic metadata and available abstract inspected.',
      );
    } else if (action.tool === 'resolve_full_text') {
      const resolved = await resolveCandidate(
        current,
        runtime.request || fetch,
      );
      candidates = [resolved];
      const downloadable =
        !!resolved.download_url &&
        ['open', 'public'].includes(resolved.access_status);
      await markCandidate(
        store,
        task,
        resolved,
        downloadable ? 'downloadable' : 'needs_file',
        decision?.result?.summary || '',
      );
      outcome = downloadable
        ? L(
            '已找到公开全文链接；仍需下载时复核文件类型与大小。',
            'Public full-text URL resolved; file type and size are checked during download.',
          )
        : L(
            '未找到可安全自动下载的公开全文，应保存待补资料。',
            'No safely downloadable public full text was resolved; save an actionable lead.',
          );
    } else if (action.tool === 'reject_result') {
      await markCandidate(store, task, current, 'rejected', action.reason);
      outcome = action.reason;
    } else if (action.tool === 'save_source_lead') {
      await saveLead(
        store,
        task,
        current,
        action.reason,
        'Automatic public full-text resolution did not succeed.',
      );
      outcome = action.reason;
    } else {
      try {
        const imported = await importCandidate(store, task, current, runtime);
        outcome = L(
          `已导入资料 ${imported.source_id}。`,
          `Imported source ${imported.source_id}.`,
        );
      } catch (error) {
        const note =
          error instanceof Error
            ? `Automatic import was not safe or available: ${error.message.slice(0, 500)}`
            : 'Automatic import was not safe or available.';
        await saveLead(
          store,
          task,
          current,
          decision?.result?.summary ||
            L(
              '相关资料待用户补充原件。',
              'Relevant source needs a user-supplied file.',
            ),
          note,
        );
        status = 'blocked';
        outcome = L(
          '无法安全自动导入，已保存为待补资料。',
          'Safe automatic import was unavailable, so an actionable source lead was saved.',
        );
      }
    }
  }
  memory.steps.push({ action, outcome, candidates, status });
  if (
    action.tool === 'finish' ||
    task.input.parameters.source_agent_last === true
  ) {
    memory.stopped = true;
    memory.stop_reason ||=
      action.tool === 'finish'
        ? action.reason
        : L(
            '已达到本次资料检索步骤上限。',
            'Source-search operation limit reached.',
          );
  }
  return { summary: outcome, citations: [], checks: [], data: memory };
}
