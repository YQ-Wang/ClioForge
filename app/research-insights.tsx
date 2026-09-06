'use client';
import { z } from 'zod';
import { useI18n } from '@/lib/i18n/provider';
import type { TaskResult } from '@/lib/platform/types';
const schema = z.object({
  coverage: z.string().optional(),
  findings: z
    .array(
      z.object({
        claim: z.string(),
        support: z
          .enum(['direct', 'inference', 'insufficient', 'contradicted'])
          .optional(),
        assessment: z.string(),
        alternative: z.string(),
        next_step: z.string(),
        citations: z.array(z.number().int().positive()),
      }),
    )
    .optional(),
  pairs: z
    .array(
      z.object({
        left_citation: z.number().int().positive(),
        right_citation: z.number().int().positive(),
        reason: z.string(),
        limitation: z.string(),
      }),
    )
    .optional(),
  shortlist: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        url: z
          .string()
          .refine((v) => v.startsWith('/?project=') || /^https:\/\//i.test(v))
          .optional(),
        access: z.string().optional(),
        reason: z.string(),
        limitation: z.string(),
      }),
    )
    .optional(),
});
export default function ResearchInsights({
  result,
  onSource,
}: {
  result: TaskResult;
  onSource: (version: string, page: number) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) return null;
  const d = parsed.data;
  const citation = (n: number) => {
    const c = result.citations[n - 1];
    return c ? (
      <button
        className="record-citation"
        key={n}
        onClick={() => onSource(c.version_id, c.page)}
      >
        [{n}] {c.quote}
      </button>
    ) : null;
  };
  return (
    <>
      {d.coverage && (
        <p className="settings-feedback">
          {L('本次核查范围：', 'Review coverage: ')}
          {d.coverage}
        </p>
      )}
      {d.findings?.map((f, i) => (
        <article className="research-insight" key={i}>
          <strong>{f.claim}</strong>
          {f.support && (
            <p className="claim-support" data-support={f.support}>
              {L('助手初步意见 · ', 'Assistant assessment · ')}
              {
                {
                  direct: L('原文直接陈述', 'Directly stated'),
                  inference: L('包含推断', 'Inference'),
                  insufficient: L('依据不足', 'Insufficient evidence'),
                  contradicted: L('存在反证', 'Counterevidence'),
                }[f.support]
              }
            </p>
          )}
          <p>{f.assessment}</p>
          <p>
            {L('另一种解释：', 'Alternative: ')}
            {f.alternative}
          </p>
          <p>
            {L('下一步：', 'Next step: ')}
            {f.next_step}
          </p>
          {f.citations.map(citation)}
        </article>
      ))}
      {d.pairs?.map((p, i) => (
        <article className="research-insight" key={i}>
          {citation(p.left_citation)}
          <p>↔</p>
          {citation(p.right_citation)}
          <p>{p.reason}</p>
          <p>
            {L('局限：', 'Limitation: ')}
            {p.limitation}
          </p>
        </article>
      ))}
      {d.shortlist?.map((s, i) => (
        <article className="research-insight" key={i}>
          {s.url && (
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title || s.id}
            </a>
          )}
          <strong>{s.reason}</strong>
          {s.access === 'catalog_only' && (
            <small>
              {L('仅目录信息，尚未读取全文', 'Catalog only; full text unread')}
            </small>
          )}
          <p>{s.limitation}</p>
          <small>{s.id}</small>
        </article>
      ))}
    </>
  );
}
