import { z } from 'zod';
import { authenticate, failure, HttpError } from '@/lib/server';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request),
      url = new URL(request.url),
      project = z.uuid().parse(url.searchParams.get('project_id')),
      note = z.uuid().parse(url.searchParams.get('note_id'));
    await store.project(project);
    if (
      !(await store.db
        .prepare('SELECT id FROM notes WHERE id=? AND project_id=?')
        .bind(note, project)
        .first())
    )
      throw new HttpError(404, '笔记不存在。');
    const rows = (
      await store.db
        .prepare(
          "SELECT m.id,m.title,m.status,m.updated_at,SUM(CASE WHEN t.status IN ('review','ready') AND t.executor='human' THEN 1 ELSE 0 END) needs_input FROM missions m JOIN mission_tasks t ON t.mission_id=m.id WHERE m.project_id=? AND EXISTS(SELECT 1 FROM mission_tasks n WHERE n.mission_id=m.id AND json_extract(n.input,'$.parameters.note_root_id')=?) GROUP BY m.id ORDER BY m.created_at DESC LIMIT 20",
        )
        .bind(project, note)
        .all()
    ).results;
    return Response.json(
      { threads: rows },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
