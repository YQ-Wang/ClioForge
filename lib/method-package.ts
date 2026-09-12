import { z } from 'zod';
import { methodSchema, type ResearchMethod } from './platform/research-recipes';
const schema = z
  .object({
    format: z.literal('clioforge-method'),
    version: z.literal(1),
    method: methodSchema,
    exported_at: z.iso.datetime(),
  })
  .strict();
export function exportMethodPackage(method: ResearchMethod) {
  const clean = methodSchema.parse(method);
  // Project-specific IDs and credentials are never part of the portable method.
  delete clean.parent_id;
  return schema.parse({
    format: 'clioforge-method',
    version: 1,
    method: clean,
    exported_at: new Date().toISOString(),
  });
}
export function readMethodPackage(text: string) {
  if (text.length > 100000) throw new Error('Method package exceeds 100 KB.');
  const value = schema.parse(JSON.parse(text));
  delete value.method.parent_id;
  return value.method;
}
