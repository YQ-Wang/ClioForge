import { z } from 'zod';
import { authenticate, failure, jsonBody } from '@/lib/server';
const input = z.object({
  model_id: z.uuid(),
  input_rate: z.number().positive().max(10000),
  output_rate: z.number().positive().max(10000),
  max_output: z.number().int().min(128),
});
export async function GET(request: Request) {
  try {
    const { store } = await authenticate(request);
    const rows = await store.db
      .prepare(
        "SELECT model_id,input_rate,output_rate,max_output FROM model_policies WHERE owner_id=? AND task_kind='ocr'",
      )
      .bind(store.owner)
      .all();
    return Response.json(
      { prices: rows.results },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { store } = await authenticate(request);
    const value = input.parse(await jsonBody(request));
    await store.model(value.model_id);
    await store.db.batch(
      ['ocr', 'analysis'].map((kind) =>
        store.db
          .prepare(
            'INSERT INTO model_policies(id,owner_id,task_kind,model_id,input_rate,output_rate,max_output,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,task_kind) DO UPDATE SET model_id=excluded.model_id,input_rate=excluded.input_rate,output_rate=excluded.output_rate,max_output=excluded.max_output',
          )
          .bind(
            crypto.randomUUID(),
            store.owner,
            kind,
            value.model_id,
            value.input_rate,
            value.output_rate,
            value.max_output,
            new Date().toISOString(),
          ),
      ),
    );
    return Response.json({ saved: true });
  } catch (error) {
    return failure(error);
  }
}
