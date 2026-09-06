import { z } from 'zod';
import type { Provider } from './types';
export const DEFAULT_RESEARCH_MODEL = 'z-ai/glm-5.3-flash';
export const thinkingEffort = z.enum(['low', 'high', 'max']);
export type ThinkingEffort = z.infer<typeof thinkingEffort>;
// Standard listed rates, not the temporary launch discount. OpenRouter routes only at or below these ceilings.
export const GLM_PRICE_CEILING = { input: 0.15, output: 0.5 };
export function taskEffort(kind: string): ThinkingEffort {
  if (['ocr', 'extract', 'search', 'format', 'metadata'].includes(kind))
    return 'low';
  if (['plan', 'synthesis'].includes(kind)) return 'max';
  return 'high';
}
export function resolveEffort(
  provider: Provider,
  model: string,
  kind = 'analysis',
  requested?: ThinkingEffort,
) {
  if (provider !== 'openrouter') return undefined;
  if (requested) return requested;
  return model === DEFAULT_RESEARCH_MODEL ? taskEffort(kind) : undefined;
}
