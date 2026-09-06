'use client';
import { z } from 'zod';
import { useI18n } from '@/lib/i18n/provider';
import { candidateSchema } from '@/lib/platform/discovery';
import type { TaskResult } from '@/lib/platform/types';
export default function ResearchCandidates({ result }: { result: TaskResult }) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const parsed = z
    .object({
      candidates: z.array(candidateSchema),
      searches: z.array(
        z.object({
          query: z.string(),
          catalog: z.string(),
          returned: z.number(),
          cap: z.number(),
          status: z.string(),
        }),
      ),
    })
    .safeParse(result.data);
  if (!parsed.success) return null;
  return (
    <section className="research-candidates">
      <h4>{L('检索记录', 'Search coverage')}</h4>
      {parsed.data.searches.map((s, i) => (
        <p key={i}>
          <strong>
            {s.catalog} · {s.query}
          </strong>
          <br />
          {s.status === 'completed'
            ? L(
                `返回 ${s.returned} 条，上限 ${s.cap} 条；不是全部结果。`,
                `Returned ${s.returned}, capped at ${s.cap}; not exhaustive.`,
              )
            : L(
                '本次检索失败，不能据此判断没有材料。',
                'Search unavailable; no inference of absence.',
              )}
        </p>
      ))}
      <h4>{L('候选阅读材料', 'Reading candidates')}</h4>
      {parsed.data.candidates.map((c) => (
        <article key={c.id}>
          <a href={c.url} target="_blank" rel="noreferrer">
            {c.title}
          </a>
          <small>
            {c.access === 'catalog_only'
              ? L(
                  '仅目录信息 · 尚未读取全文',
                  'Catalog only · full text unread',
                )
              : L('项目内原文', 'Text in this project')}
          </small>
          <p>{c.detail}</p>
        </article>
      ))}
    </section>
  );
}
