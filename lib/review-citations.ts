import type { TaskResult, MissionTask } from './platform/types';
import { HttpError } from './errors';

export const citationKey = (c: TaskResult['citations'][number]) =>
  JSON.stringify([c.version_id, c.page, c.quote, c.start ?? null]);

export function unresolvedReviewCitations(
  summary: string,
  citations: TaskResult['citations'],
) {
  return [
    ...new Set(
      [...summary.matchAll(/\[(\d+)\]/g)]
        .filter((match) => !citations[Number(match[1]) - 1])
        .map((match) => `[${match[1]}]`),
    ),
  ];
}

export function reviewDraftSource<
  T extends Pick<
    MissionTask,
    'id' | 'executor' | 'created_at' | 'input' | 'result'
  >,
>(parents: T[]) {
  return parents
    .filter((parent) => parent.executor === 'model' && parent.result)
    .sort(
      (a, b) =>
        Number(b.input.parameters.dossier_stage === 'synthesis') -
          Number(a.input.parameters.dossier_stage === 'synthesis') ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    )[0];
}

// Display legacy findings without changing their immutable citation numbers.
export function groupedCitations(citations: TaskResult['citations']) {
  const groups = new Map<
    string,
    { citation: TaskResult['citations'][number]; numbers: number[] }
  >();
  citations.forEach((citation, index) => {
    const key = citationKey(citation),
      group = groups.get(key);
    if (group) group.numbers.push(index + 1);
    else groups.set(key, { citation, numbers: [index + 1] });
  });
  return [...groups.values()];
}

// Used only for human prose. Other structured results can contain citation
// indices in data and must keep their original numbering.
export function compactReviewCitations(
  summary: string,
  inherited: TaskResult['citations'],
) {
  const citations: TaskResult['citations'] = [];
  const indices = new Map<string, number>();
  const referenced = new Set(
    [...summary.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]) - 1),
  );
  const mapping = inherited.map((citation, index) => {
    // Keep uncited context for legacy free-form reviews. Once the researcher
    // cites specific passages, discarded draft citations must not follow them.
    if (referenced.size && !referenced.has(index)) return undefined;
    const key = citationKey(citation);
    let number = indices.get(key);
    if (number === undefined) {
      citations.push(citation);
      number = citations.length;
      indices.set(key, number);
    }
    return number;
  });
  return {
    summary: summary.replace(/\[(\d+)\]/g, (marker, number: string) =>
      mapping[Number(number) - 1] ? `[${mapping[Number(number) - 1]}]` : marker,
    ),
    citations,
  };
}

// Each dependency owns its numbering. Remap before combining their prose.
export function mergeResearchTexts(
  results: Pick<TaskResult, 'summary' | 'citations'>[],
) {
  const citations: TaskResult['citations'] = [];
  const indices = new Map<string, number>();
  const summaries = results.map((result) => {
    if (unresolvedReviewCitations(result.summary, result.citations).length)
      throw new HttpError(400, '成果的引文编号没有对应出处，请先纠正原步骤。');
    const mapping = result.citations.map((citation) => {
      const key = citationKey(citation);
      if (!indices.has(key)) {
        citations.push(citation);
        indices.set(key, citations.length);
      }
      return indices.get(key)!;
    });
    return result.summary.replace(/\[(\d+)\]/g, (marker, number: string) =>
      mapping[Number(number) - 1] ? `[${mapping[Number(number) - 1]}]` : marker,
    );
  });
  return { summary: summaries.join('\n\n'), citations };
}

export function canRepairProse(task: MissionTask) {
  return (
    ['human', 'model'].includes(task.executor) &&
    ['review', 'succeeded', 'uncertain', 'failed'].includes(task.status) &&
    task.input.parameters.extraction !== true &&
    task.input.parameters.manuscript_stage !== 'section' &&
    !['audit', 'update'].includes(String(task.input.parameters.recipe)) &&
    (task.executor === 'human' ||
      task.kind === 'compare' ||
      typeof task.input.parameters.conversation_root_id === 'string' ||
      typeof task.input.parameters.output_schema === 'string') &&
    [
      'dossier_answer_v1',
      'comparison_answer_v1',
      'reading_answer_v1',
      'research_discussion_v1',
      undefined,
    ].includes(task.input.parameters.output_schema as string | undefined)
  );
}
