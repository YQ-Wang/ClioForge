import { authenticate, failure, jsonBody } from '@/lib/server';
import { accountInput, AccountSettingsStore } from '@/lib/account-settings';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { store, session } = await authenticate(request);
    return Response.json(
      await new AccountSettingsStore(store.db, store.owner, session.id).read(),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { store, session } = await authenticate(request);
    await new AccountSettingsStore(store.db, store.owner, session.id).mutate(
      accountInput.parse(await jsonBody(request)),
    );
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
