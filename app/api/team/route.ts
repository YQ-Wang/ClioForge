import { sendInvitation } from '@/lib/invitation-delivery';
import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
import { TeamStore, memberRole } from '@/lib/project-team';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    const id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get('project_id'));
    return Response.json(await new TeamStore(store.db, store.owner).team(id), {
      headers,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticate(request),
      store = new TeamStore(auth.store.db, auth.user.id);
    const input = z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('send_invitation'),
          project_id: z.uuid(),
          id: z.uuid(),
          locale: z.enum(['zh-CN', 'en']),
        }),
        z.object({
          action: z.literal('invite'),
          project_id: z.uuid(),
          email: z.string(),
          role: memberRole,
        }),
        z.object({
          action: z.literal('revoke_invitation'),
          project_id: z.uuid(),
          id: z.uuid(),
        }),
        z.object({
          action: z.literal('change_role'),
          project_id: z.uuid(),
          user_id: z.string().min(1).max(200),
          role: memberRole,
        }),
        z.object({
          action: z.literal('remove_member'),
          project_id: z.uuid(),
          user_id: z.string().min(1).max(200),
        }),
      ])
      .parse(await jsonBody(request));
    let result: unknown = true;
    switch (input.action) {
      case 'send_invitation':
        await sendInvitation(
          store,
          auth.settings,
          input.project_id,
          input.id,
          input.locale,
        );
        break;
      case 'invite':
        result = await store.invite(input.project_id, input);
        break;
      case 'revoke_invitation':
        await store.revokeInvitation(input.project_id, input.id);
        break;
      case 'change_role':
        await store.setMemberRole(input.project_id, input.user_id, input.role);
        break;
      case 'remove_member':
        await store.removeMember(input.project_id, input.user_id);
        break;
    }
    return Response.json({ result }, { headers });
  } catch (error) {
    return failure(error);
  }
}
