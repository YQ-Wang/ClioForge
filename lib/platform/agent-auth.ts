import { sha256 } from './search';
import { MissionStore } from './missions';
import { HttpError } from '../errors';
export async function agentAuth(db: D1Database, request: Request) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (cw_[a-f0-9]{64})$/)?.[1];
  if (!token)
    throw new HttpError(401, 'A project agent credential is required.');
  const key = await db
    .prepare(
      'SELECT id,project_id,owner_id,scopes FROM agent_credentials WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',
    )
    .bind(await sha256(token), new Date().toISOString())
    .first<{
      id: string;
      project_id: string;
      owner_id: string;
      scopes: string;
    }>();
  if (!key) throw new HttpError(401, 'Agent credential expired or revoked.');
  const store = new MissionStore(db, key.owner_id);
  await store.project(key.project_id, 'write');
  await db
    .prepare('UPDATE agent_credentials SET last_used_at=? WHERE id=?')
    .bind(new Date().toISOString(), key.id)
    .run();
  return {
    store,
    key,
    actor: `agent:${key.id}`,
    scopes: JSON.parse(key.scopes) as string[],
  };
}
