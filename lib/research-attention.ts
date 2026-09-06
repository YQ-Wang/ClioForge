import { z } from 'zod';
import { ResearchStore } from './store';
import { TeamStore } from './project-team';
import { discussionTarget } from './platform/discussions';
import { HttpError } from './errors';
import { humanBoardStage } from './platform/task-board';
export const discussionInput = z.object({
  target_id: z.uuid(),
  body: z.string().trim().min(1).max(10000),
  mentions: z.array(z.string().min(1).max(200)).max(5).default([]),
});
export async function postDiscussion(
  store: ResearchStore,
  project: string,
  raw: unknown,
) {
  await store.project(project, 'write');
  const value = discussionInput.parse(raw);
  await discussionTarget(store, project, value.target_id);
  const members = (await new TeamStore(store.db, store.owner).team(project))
    .members;
  if (value.mentions.some((id) => !members.some((m) => m.user_id === id)))
    throw new HttpError(400, '提醒对象必须是当前项目成员。');
  const id = crypto.randomUUID();
  await store.db.batch([
    store.db
      .prepare(
        'INSERT INTO project_comments(id,project_id,target_id,author,body,created_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(
        id,
        project,
        value.target_id,
        store.owner,
        value.body,
        new Date().toISOString(),
      ),
    ...[...new Set(value.mentions)].map((user) =>
      store.db
        .prepare(
          'INSERT INTO discussion_mentions(comment_id,user_id) VALUES(?,?)',
        )
        .bind(id, user),
    ),
  ]);
  return id;
}
export async function researchAttention(store: ResearchStore) {
  const preferences = (await store.db
    .prepare(
      'SELECT tasks,mentions FROM attention_preferences WHERE owner_id=?',
    )
    .bind(store.owner)
    .first<{ tasks: number; mentions: number }>()) || { tasks: 1, mentions: 1 };
  // Every request recalculates access; removal immediately hides a project's reminders.
  const projects = await store.listProjects(),
    ids = JSON.stringify(projects.map((p) => p.id));
  const tasks = preferences.tasks
    ? (
        await store.db
          .prepare(
            "SELECT t.id,t.title,t.project_id,t.mission_id,t.status,t.revision,b.body board_body FROM mission_tasks t JOIN missions m ON m.id=t.mission_id LEFT JOIN mission_boards b ON b.mission_id=m.id WHERE t.assignee=? AND t.executor='human' AND t.status IN ('ready','review') AND m.status='active' AND t.project_id IN (SELECT value FROM json_each(?)) ORDER BY t.updated_at DESC LIMIT 40",
          )
          .bind(store.owner, ids)
          .all<{
            id: string;
            title: string;
            project_id: string;
            mission_id: string;
            status: string;
            revision: number;
            board_body: string | null;
          }>()
      ).results.map((row) => {
        const { board_body, ...task } = row;
        return {
          ...task,
          board_stage: humanBoardStage({ ...task, board_body }),
        };
      })
    : [];
  const mentions = preferences.mentions
    ? (
        await store.db
          .prepare(
            'SELECT c.id,c.body,c.project_id,c.target_id,c.created_at,u.name author_name FROM discussion_mentions n JOIN project_comments c ON c.id=n.comment_id JOIN user u ON u.id=c.author WHERE n.user_id=? AND c.resolved=0 AND c.project_id IN (SELECT value FROM json_each(?)) ORDER BY c.created_at DESC LIMIT 40',
          )
          .bind(store.owner, ids)
          .all<{
            id: string;
            body: string;
            project_id: string;
            target_id: string;
            author_name: string;
            created_at: string;
          }>()
      ).results
    : [];
  return { preferences, tasks, mentions };
}
