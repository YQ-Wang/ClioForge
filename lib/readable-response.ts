import { resultSchema } from './platform/types';

// A provider may supply readable findings inside a JSON envelope. Parsing does
// not verify its quotations, and provider-authored checks are never trusted.
export function readableResponse(text: string) {
  try {
    const candidate = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    );
    const parsed = resultSchema.safeParse({ ...candidate, checks: [] });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
