import type { TaskResult } from './platform/types';

/** Read the versioned report section without rewriting the saved result. */
export function researchNextSteps(
  result: TaskResult | null | undefined,
): string[] {
  if (!result) return [];
  const section = result.summary.match(
    /(?:^|\n)\*\*(?:Next evidence to seek|下一步优先查证的材料)\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n#{1,4}\s|$)/,
  )?.[1];
  if (!section) return [];
  return [
    ...new Set(
      section
        .split('\n')
        .filter((line) => /^\s*\d+\.\s+/.test(line))
        .map((line) => line.replace(/^\s*\d+\.\s+/, '').trim())
        .filter((line) => line.length > 0 && line.length <= 1000),
    ),
  ].slice(0, 3);
}

/** A suggestion prepares a question; it does not assert that missing sources were searched. */
export function nextStepQuestion(step: string, locale: 'zh-CN' | 'en') {
  // Reference numbers belong to the original report, not the next answer's basis.
  const topic = step
    .replace(/\[\d+\]/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?。，；：！？])/g, '$1')
    .trim();
  return locale === 'en'
    ? `${topic}\n\nInvestigate this proposed next check using only the sources selected for this follow-up. Identify supporting and conflicting evidence, and the material still missing. Do not claim to have searched or read sources that were not supplied.`
    : `${topic}\n\n围绕上述待查证事项，仅根据本次选择的材料，核查支持与反证，并说明还缺少哪些资料。不要声称已经检索或阅读未提供的资料。`;
}
