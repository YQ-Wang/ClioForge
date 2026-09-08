import type { TaskResult, MissionTask } from './platform/types';

const citationKey = (c: TaskResult['citations'][number]) =>
  JSON.stringify([c.version_id, c.page, c.quote, c.start ?? null]);

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
  const mapping = inherited.map((citation) => {
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
