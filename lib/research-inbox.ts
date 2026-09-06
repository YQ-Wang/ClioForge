import { z } from 'zod';
import { ResearchStore } from './store';
import { researchAttention } from './research-attention';
import { sha256 } from './platform/search';
import { HttpError } from './errors';
import { humanBoardStage } from './platform/task-board';
export type InboxItem = {
  key: string;
  project_id: string;
  project_title: string;
  kind: 'review' | 'attention' | 'source' | 'mention';
  title: string;
  detail: string;
  href: string;
  fingerprint: string;
  seen: boolean;
  updated_at: string;
};
export async function researchInbox(store: ResearchStore) {
  const projects = await store.listProjects(),
    ids = JSON.stringify(projects.map((p) => p.id)),
    reviewProjectIds = JSON.stringify(
      projects
        .filter((p) => ['owner', 'reviewer'].includes(p.role || ''))
        .map((p) => p.id),
    ),
    attention = await researchAttention(store),
    rows: Omit<InboxItem, 'fingerprint' | 'seen' | 'project_title'>[] = [];
  if (attention.preferences.tasks) {
    const tasks = (
      await store.db
        .prepare(
          "SELECT t.id,t.project_id,t.mission_id,t.title,t.status,t.updated_at,t.revision,t.assignee,m.created_by,m.status mission_status,b.body board_body FROM mission_tasks t JOIN missions m ON m.id=t.mission_id LEFT JOIN mission_boards b ON b.mission_id=m.id WHERE t.project_id IN (SELECT value FROM json_each(?)) AND m.status<>'cancelled' AND (t.assignee=? OR m.created_by=? OR t.project_id IN (SELECT value FROM json_each(?))) AND (t.status IN ('review','uncertain','failed','stale','rejected') OR (t.executor='human' AND t.status='ready')) ORDER BY t.updated_at DESC LIMIT 200",
        )
        .bind(ids, store.owner, store.owner, reviewProjectIds)
        .all<{
          id: string;
          project_id: string;
          mission_id: string;
          title: string;
          status: string;
          updated_at: string;
          revision: number;
          assignee: string;
          created_by: string;
          mission_status: string;
          board_body: string | null;
        }>()
    ).results;
    for (const t of tasks) {
      const stage =
        t.mission_status === 'active' ? humanBoardStage(t) : undefined;
      rows.push({
        key: `task:${t.id}:${t.revision}`,
        project_id: t.project_id,
        kind:
          !stage && ['review', 'ready'].includes(t.status)
            ? 'review'
            : 'attention',
        title: t.title,
        detail: stage ? `human_${stage}` : t.status,
        href: `/?project=${t.project_id}&tab=platform&mission=${t.mission_id}&task=${t.id}`,
        updated_at: t.updated_at,
      });
    }
    const changed = (
      await store.db
        .prepare(
          'SELECT s.id,s.project_id,s.title,v.id version_id,v.created_at, (SELECT COUNT(*) FROM evidence e JOIN source_versions old ON old.id=e.version_id WHERE e.source_id=s.id AND old.revision<v.revision) evidence_count FROM sources s JOIN source_versions v ON v.source_id=s.id WHERE s.project_id IN (SELECT value FROM json_each(?)) AND v.revision=(SELECT MAX(revision) FROM source_versions WHERE source_id=s.id) AND EXISTS(SELECT 1 FROM evidence e JOIN source_versions old ON old.id=e.version_id WHERE e.source_id=s.id AND old.revision<v.revision) ORDER BY v.created_at DESC LIMIT 60',
        )
        .bind(ids)
        .all<{
          id: string;
          project_id: string;
          title: string;
          version_id: string;
          created_at: string;
          evidence_count: number;
        }>()
    ).results;
    for (const s of changed)
      rows.push({
        key: `source:${s.id}:${s.version_id}`,
        project_id: s.project_id,
        kind: 'source',
        title: s.title,
        detail: String(s.evidence_count),
        href: `/?project=${s.project_id}&tab=sources&version=${s.version_id}&page=1`,
        updated_at: s.created_at,
      });
  }
  for (const m of attention.mentions)
    rows.push({
      key: `mention:${m.id}`,
      project_id: m.project_id,
      kind: 'mention',
      title: m.author_name,
      detail: m.body,
      href: `/?project=${m.project_id}&tab=team&discussion=${m.target_id}`,
      updated_at: m.created_at,
    });
  const receipts = (
    await store.db
      .prepare(
        'SELECT item_key,fingerprint FROM attention_receipts WHERE owner_id=? AND project_id IN (SELECT value FROM json_each(?))',
      )
      .bind(store.owner, ids)
      .all<{ item_key: string; fingerprint: string }>()
  ).results;
  const items = await Promise.all(
    rows.map(async (row) => {
      // Timestamps added for display must not resurface existing mention receipts.
      const fingerprint = await sha256(
        JSON.stringify(
          row.kind === 'mention' ? { ...row, updated_at: '' } : row,
        ),
      );
      return {
        ...row,
        project_title:
          projects.find((p) => p.id === row.project_id)?.title || '',
        fingerprint,
        seen: receipts.some(
          (r) => r.item_key === row.key && r.fingerprint === fingerprint,
        ),
      };
    }),
  );
  items.sort(
    (a, b) =>
      b.updated_at.localeCompare(a.updated_at) || a.key.localeCompare(b.key),
  );
  return { items, preferences: attention.preferences };
}
export async function seeInboxItem(store: ResearchStore, raw: unknown) {
  const v = z
      .object({
        key: z.string().max(200),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        seen: z.boolean(),
      })
      .parse(raw),
    item = (await researchInbox(store)).items.find(
      (i) => i.key === v.key && i.fingerprint === v.fingerprint,
    );
  if (!item)
    throw new HttpError(409, '此事项已有变化或你不再有权限，请刷新收件箱。');
  if (!v.seen) {
    await store.db
      .prepare('DELETE FROM attention_receipts WHERE owner_id=? AND item_key=?')
      .bind(store.owner, v.key)
      .run();
    return;
  }
  await store.db
    .prepare(
      'INSERT INTO attention_receipts(owner_id,project_id,item_key,fingerprint,seen_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,item_key) DO UPDATE SET fingerprint=excluded.fingerprint,seen_at=excluded.seen_at',
    )
    .bind(
      store.owner,
      item.project_id,
      v.key,
      v.fingerprint,
      new Date().toISOString(),
    )
    .run();
}
