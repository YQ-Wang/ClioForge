import {
  readCollection,
  collectionCheckpoint,
} from '@/lib/project-collections';
import { workspaceInput } from '@/lib/inputs';
import { authenticate, failure, HttpError, jsonBody } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    const params = new URL(request.url).searchParams;
    if (params.get('models') === '1')
      return Response.json(
        { models: await store.models() },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    const id = params.get('project_id');
    if (id && params.get('access') === '1')
      return Response.json(
        { project: await store.project(id) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    if (id && params.get('overview') === '1')
      return Response.json(await store.overview(id), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    if (id && params.get('source_management') === '1')
      return Response.json(await store.sourceManagement(id), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    if (id && params.has('collection'))
      return Response.json(
        await readCollection(
          store,
          id,
          params.get('collection')!,
          params.get('before'),
        ),
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    return Response.json(
      id
        ? {
            project: await store.project(id),
            models: await store.models(),
            checkpoint: await collectionCheckpoint(store, id),
          }
        : { projects: await store.listProjects() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request);
    const input = workspaceInput.parse(await jsonBody(request, 2100000));
    let result;
    switch (input.action) {
      case 'dismiss_source_lead':
        result = await store.dismissSourceLead(input.project_id, input.id);
        break;
      case 'update_project':
        result = await store.updateProject(input);
        break;
      case 'create_project':
        result = await store.createProject(input.title, input.description);
        break;
      case 'create_source_group':
        result = await store.createSourceGroup(input.project_id, input.name);
        break;
      case 'move_sources':
        result = await store.moveSources(
          input.project_id,
          input.source_ids,
          input.group_id,
        );
        break;
      case 'delete_source_group':
        result = await store.deleteSourceGroup(
          input.project_id,
          input.group_id,
        );
        break;
      case 'trash_sources':
        result = await store.trashSources(input.project_id, input.source_ids);
        break;
      case 'restore_sources':
        result = await store.restoreSources(input.project_id, input.source_ids);
        break;
      case 'import_source':
        result = await store.importSource(input);
        break;
      case 'revise_source':
        result = await store.reviseSource(input);
        break;
      case 'save_note':
        result = await store.saveNote(input);
        break;
      case 'set_note_state':
        result = await store.setNoteState(input);
        break;
      case 'add_evidence':
        result = await store.addEvidence(input);
        break;
      default:
        throw new HttpError(400, '未知操作。');
    }
    return Response.json({ result });
  } catch (e) {
    return failure(e);
  }
}
