import { modelInput, deleteModelInput } from '@/lib/inputs';
import {
  authenticate,
  failure,
  HttpError,
  jsonBody,
  textField,
} from '@/lib/server';
import type { Provider } from '@/lib/types';
import { encrypt } from '@/lib/crypto';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const { user, store, settings } = await authenticate(request);
    const input = modelInput.parse(await jsonBody(request));
    const provider = textField(input.provider, '厂商', 30);
    if (!['openai', 'anthropic', 'google', 'openrouter'].includes(provider))
      throw new HttpError(400, '不支持的厂商。');
    const model = textField(input.model_id, '模型名称', 150);
    if (!/^[a-zA-Z0-9._:/-]+$/.test(model))
      throw new HttpError(400, '模型名称格式无效。');
    const label = textField(input.label, '连接名称', 100);
    const apiKey = textField(input.key, 'API key', 4000);
    const secret = settings.FOLIOTRACE_ENCRYPTION_KEY;
    if (!secret) throw new HttpError(503, '尚未配置服务端密钥加密。');
    const id = crypto.randomUUID();
    const encrypted_key = await encrypt(apiKey, secret, `${user.id}:${id}`);
    await store.saveModel({
      id,
      label,
      provider: provider as Provider,
      model_id: model,
      vision: input.vision === true,
      key_hint: `••••${apiKey.slice(-4)}`,
      encrypted_key,
    });
    return Response.json({ id });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const { store } = await authenticate(request);
    const { id } = deleteModelInput.parse(await jsonBody(request));
    await store.removeModel(textField(id, '连接 ID', 36));
    return Response.json({ removed: true });
  } catch (error) {
    return failure(error);
  }
}
