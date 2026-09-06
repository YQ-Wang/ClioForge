import { z } from 'zod';
import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import {
  cloudProvider,
  cloudConfig,
  callbackUrl,
  startOAuth,
  googleFile,
  cloudToken,
  importCloudText,
  type ConnectionEnv,
} from '@/lib/platform/connections';
import { MissionStore } from '@/lib/platform/missions';
import { projectPath } from '@/lib/navigation';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  try {
    const auth = await authenticate(request),
      settings = auth.settings as ConnectionEnv,
      params = new URL(request.url).searchParams;
    if (params.has('provider')) cloudProvider.parse(params.get('provider'));
    if (params.has('id'))
      return Response.json(
        {
          file: await googleFile(
            settings,
            auth.user.id,
            z.string().min(1).max(500).parse(params.get('id')),
          ),
        },
        { headers },
      );
    const connected = await settings.DB.prepare(
      "SELECT id FROM cloud_connections WHERE owner_id=? AND provider='google'",
    )
      .bind(auth.user.id)
      .first();
    const config = cloudConfig(settings, 'google');
    return Response.json(
      {
        connections: [
          {
            provider: 'google',
            configured: !!(
              config.id &&
              config.secret &&
              settings.GOOGLE_PICKER_API_KEY &&
              settings.GOOGLE_CLOUD_PROJECT_NUMBER
            ),
            callback: callbackUrl(settings, 'google'),
            connected: !!connected,
            scope: config.scope,
          },
        ],
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticate(request),
      settings = auth.settings as ConnectionEnv;
    const input = z
      .object({
        action: z.enum(['connect', 'disconnect', 'picker', 'import']),
        provider: cloudProvider,
        project_id: z.uuid().optional(),
        pages: z
          .array(
            z.object({
              page: z.number().int().positive(),
              text: z.string().max(100000),
            }),
          )
          .max(500)
          .optional(),
        file: z
          .object({
            id: z.string().min(1).max(500),
            revision: z.string().min(1).max(300),
          })
          .optional(),
      })
      .parse(await jsonBody(request, 2_000_000));
    let result: unknown;
    if (input.action === 'connect') {
      if (input.project_id) await auth.store.project(input.project_id, 'write');
      result = {
        url: await startOAuth(
          settings,
          auth.user.id,
          input.provider,
          input.project_id ? projectPath(input.project_id, 'drive') : '/',
        ),
      };
    } else if (input.action === 'disconnect') {
      await settings.DB.batch([
        settings.DB.prepare(
          'DELETE FROM cloud_connections WHERE owner_id=? AND provider=?',
        ).bind(auth.user.id, input.provider),
        settings.DB.prepare(
          'DELETE FROM oauth_states WHERE owner_id=? AND provider=?',
        ).bind(auth.user.id, input.provider),
      ]);
      result = true;
    } else if (input.action === 'picker') {
      if (
        !settings.GOOGLE_PICKER_API_KEY ||
        !settings.GOOGLE_CLOUD_PROJECT_NUMBER
      )
        throw new HttpError(503, 'Google Picker 尚未配置。');
      // Picker needs a short-lived access token. Refresh tokens and the client secret remain server-side.
      result = {
        apiKey: settings.GOOGLE_PICKER_API_KEY,
        appId: settings.GOOGLE_CLOUD_PROJECT_NUMBER,
        accessToken: await cloudToken(settings, auth.user.id, 'google'),
      };
    } else {
      result = await importCloudText(
        settings,
        new MissionStore(auth.store.db, auth.user.id),
        z.uuid().parse(input.project_id),
        input.provider,
        z
          .object({ id: z.string(), revision: z.string().min(1) })
          .parse(input.file),
        fetch,
        input.pages,
      );
    }
    return Response.json({ result }, { headers });
  } catch (error) {
    return failure(error);
  }
}
