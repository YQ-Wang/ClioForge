// Pure calculations also used by offline benchmark reports. Zero denominators
// mean unavailable, never perfect quality or infinite acceleration.
export type Timing = {
  preparation_minutes: number | null;
  configuration_minutes: number | null;
  analysis_minutes: number | null;
  writing_minutes: number | null;
  waiting_minutes: number | null;
};
export function evaluationMetrics(value: {
  records: number;
  false_inclusions: number;
  missed: number;
  review_minutes: number;
  manual_minutes: number | null;
  scope_checked?: 'whole' | 'partial';
  timing?: Timing;
  chatgpt_minutes?: number | null;
}) {
  const relevant = Math.max(0, value.records - value.false_inclusions);
  const whole = value.scope_checked === 'whole';
  const time = value.timing;
  const completeTime =
    !!time &&
    [
      time.preparation_minutes,
      time.configuration_minutes,
      time.analysis_minutes,
      time.writing_minutes,
      time.waiting_minutes,
    ].every((v) => v !== null && Number.isFinite(v));
  const human = completeTime
    ? value.review_minutes +
      time!.preparation_minutes! +
      time!.configuration_minutes! +
      time!.analysis_minutes! +
      time!.writing_minutes!
    : null;
  return {
    precision: whole && value.records > 0 ? relevant / value.records : null,
    recall:
      whole && relevant + value.missed > 0
        ? relevant / (relevant + value.missed)
        : null,
    human_minutes: human,
    waiting_minutes: time?.waiting_minutes ?? null,
    manual_speedup:
      human !== null &&
      human > 0 &&
      value.manual_minutes !== null &&
      value.manual_minutes > 0
        ? value.manual_minutes / human
        : null,
    chatgpt_speedup:
      human !== null &&
      human > 0 &&
      value.chatgpt_minutes != null &&
      value.chatgpt_minutes > 0
        ? value.chatgpt_minutes / human
        : null,
  };
}
