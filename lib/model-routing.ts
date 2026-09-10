import { z } from 'zod';
import type { Provider } from './types';
export const DEFAULT_RESEARCH_MODEL = 'z-ai/glm-5.3-flash';
export const FIREWORKS_KIMI_K3_MODEL = 'accounts/fireworks/models/kimi-k3';
export const thinkingEffort = z.enum(['low', 'high', 'max']);
export type ThinkingEffort = z.infer<typeof thinkingEffort>;
// Standard listed rates, not the temporary launch discount. OpenRouter routes only at or below these ceilings.
export const GLM_PRICE_CEILING = { input: 0.15, output: 0.5 };
export const FIREWORKS_KIMI_K3_RATES = { input: 3, output: 15 };
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
  if (provider === 'openrouter') {
    if (requested) return requested;
    return model === DEFAULT_RESEARCH_MODEL ? taskEffort(kind) : undefined;
  }
  if (provider === 'fireworks') {
    if (requested) return requested;
    return model === FIREWORKS_KIMI_K3_MODEL ? taskEffort(kind) : undefined;
  }
  return undefined;
}
