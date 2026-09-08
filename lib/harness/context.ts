import type { MissionTask } from '../platform/types';

// A bounded, deterministic handoff. It selects existing text; it does not turn
// a model-authored summary into verified memory or overwrite the full record.
export function researchHandoff(
  task: MissionTask,
  question: string,
  omitResult = false,
) {
  const terms = question.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const rank = (value: string) =>
    terms.reduce(
      (n, t) => n + Number(value.toLocaleLowerCase().includes(t)),
      0,
    );
  const paragraphs = (task.result?.summary || '')
    .split(/\n\s*\n/)
    .filter(Boolean);
  const relevant = paragraphs
    .map((text, index) => ({ text, index, score: rank(text) }))
    .sort((a, b) => b.score - a.score || b.index - a.index);
  let remaining = 1200;
  const selected: { text: string; index: number }[] = [];
  for (const paragraph of relevant) {
    if (!remaining) break;
    const text = paragraph.text.slice(0, remaining);
    remaining -= text.length;
    selected.push({ ...paragraph, text });
  }
  const summary = selected
    .sort((a, b) => a.index - b.index)
    .map((p) => p.text)
    .join('\n\n');
  const allCitations = task.result?.citations || [];
  const citations = allCitations
    .map((c, index) => ({ c, index }))
    .sort((a, b) => rank(b.c.quote) - rank(a.c.quote) || a.index - b.index)
    .slice(0, 3)
    .map(({ c }) => ({ ...c, quote: c.quote.slice(0, 240) }));
  const data =
    task.result?.data && typeof task.result.data === 'object'
      ? (task.result.data as Record<string, unknown>)
      : {};
  const strings = (key: string) =>
    Array.isArray(data[key])
      ? data[key]
          .filter((v): v is string => typeof v === 'string')
          .slice(0, 3)
          .map((v) => v.slice(0, 160))
      : [];
  return {
    id: task.id,
    title: task.title,
    revision: task.revision,
    status: task.status,
    question: (task.input.query || task.input.prompt).slice(0, 350),
    summary: omitResult ? null : summary,
    summary_shortened: !omitResult && summary !== (task.result?.summary || ''),
    citations: omitResult ? [] : citations,
    omitted_citations: omitResult
      ? allCitations.length
      : allCitations.length - citations.length,
    quotation_excerpts_shortened:
      !omitResult && allCitations.some((c) => c.quote.length > 240),
    limitations: omitResult ? [] : strings('limitations'),
    next_steps: omitResult ? [] : strings('next_steps'),
    prior_answer_omitted_for_selected_scope: omitResult,
    interpretation_status:
      'Prior prose remains a proposal. Task completion and exact-quotation checks do not verify its historical interpretation.',
    full_record_retained: true,
  };
}
