import { z } from 'zod';
import { authenticate, failure } from '@/lib/server';
import {
  cloudProvider,
  readGoogleFile,
  type ConnectionEnv,
} from '@/lib/platform/connections';
export async function GET(request: Request) {
  try {
    const auth = await authenticate(request),
      params = new URL(request.url).searchParams;
    cloudProvider.parse(params.get('provider'));
    const { bytes, mimeType, file } = await readGoogleFile(
      auth.settings as ConnectionEnv,
      auth.user.id,
      z.string().min(1).max(500).parse(params.get('id')),
      z.string().min(1).max(300).parse(params.get('revision')),
    );
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'attachment',
        'X-Content-Type-Options': 'nosniff',
        'X-Drive-Revision': file.revision,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
