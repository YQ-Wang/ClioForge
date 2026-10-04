'use client';
import { z } from 'zod';
import { useState } from 'react';
import { api } from '@/lib/client-api';
import { Button } from '@/components/ui/button';
import { BookmarkPlus, ExternalLink, Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { candidateSchema } from '@/lib/literature-types';
import type { TaskResult } from '@/lib/platform/types';
export default function ResearchCandidates({
  result,
  projectId,
  sessionId,
  savedCandidates = [],
  onSaved,
}: {
  result: TaskResult;
  projectId?: string;
  sessionId?: string;
  savedCandidates?: string[];
  onSaved?: (id: string) => void;
}) {
  const [showWeak, setShowWeak] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [feedbackId, setFeedbackId] = useState('');
  async function save(id: string) {
    setBusy(id);
    setFeedbackId(id);
    setMessage('');
    try {
      const response = await api<{ result: { imported: number } }>(
        '/api/source-discovery/save',
        { project_id: projectId, session_id: sessionId, candidate_id: id },
      );
      setSaved((old) => [...old, id]);
      onSaved?.(id);
      setMessage(
        response.result.imported
          ? L(
              '已加入项目书目。下一步：取得全文、导入资料并阅读核查。',
              'Saved to project bibliography. Next: obtain the text, import it and verify what it says.',
            )
          : L(
              '项目书目中已存在，未重复添加。',
              'Already in project bibliography; no duplicate added.',
            ),
      );
    } catch (e) {
      setMessage(e instanceof Error ? t(e.message) : 'Error');
    } finally {
      setBusy('');
    }
  }
  const { locale, t } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const parsed = z
    .object({
      candidates: z.array(candidateSchema),
      searches: z.array(
        z.object({
          query: z.string(),
          catalog: z.string(),
          returned: z.number(),
          filtered: z.number().optional().default(0),
          cap: z.number(),
          status: z.string(),
          cached: z.boolean().optional(),
        }),
      ),
    })
    .safeParse(result.data);
  if (!parsed.success) return null;
  const weak = parsed.data.candidates.filter(
    (c) => c.match_score !== undefined && c.match_score < 0.5,
  );
  const visible = showWeak
    ? parsed.data.candidates
    : parsed.data.candidates.filter(
        (c) => c.match_score === undefined || c.match_score >= 0.5,
      );
  return (
    <section className="research-candidates">
      <div className="literature-result-heading">
        <h3>
          {L('候选阅读材料', 'Reading candidates')}{' '}
          <span>
            {visible.length === parsed.data.candidates.length
              ? visible.length
              : `${visible.length} / ${parsed.data.candidates.length}`}
          </span>
        </h3>
        <p>
          {L(
            '目录信息尚未经过全文核查。保存后，可在项目书目中继续整理。',
            'Catalog records, not yet verified against full text. Save references to organize them in your project.',
          )}
        </p>
        {parsed.data.searches.some((s) => s.status !== 'completed') && (
          <p className="literature-partial-notice">
            {L(
              '部分来源未完成检索，请查看下方检索记录。',
              'Some catalogs could not be searched. See the search log below.',
            )}
          </p>
        )}
      </div>
      {!parsed.data.candidates.length && (
        <p>
          {L(
            '尚未找到候选材料。试试更短的关键词、人物异名或下方中文专业库；这不代表不存在相关研究。',
            'No candidates found. Try shorter queries, name variants or specialist catalogs. This does not establish that research is absent.',
          )}
        </p>
      )}
      {visible.map((c) => (
        <article key={c.id}>
          <h4 className="literature-candidate-title">
            <a href={c.url} target="_blank" rel="noreferrer">
              {c.title}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          </h4>
          <p>{c.detail}</p>
          <div className="literature-candidate-tags">
            <span>
              {c.access === 'catalog_only'
                ? L('全文待核读', 'Full text unread')
                : L('项目内原文', 'Project text')}
            </span>
            {c.csl && (
              <span>
                {(
                  {
                    book: L('专著', 'Book'),
                    chapter: L('书中章节', 'Book chapter'),
                    'article-journal': L('期刊论文', 'Journal article'),
                    'review-book': L('书评', 'Book review'),
                    review: L('评论', 'Review'),
                    thesis: L('学位论文', 'Thesis'),
                    webpage: L('网页', 'Web page'),
                    document: L('文献', 'Document'),
                    'paper-conference': L('会议论文', 'Conference paper'),
                  } as Record<string, string>
                )[c.csl.type] || c.csl.type}
              </span>
            )}
          </div>
          <details className="literature-candidate-details">
            <summary>{L('出处与检索详情', 'Source & search details')}</summary>
            {c.csl?.DOI && <small>DOI: {c.csl.DOI}</small>}
            {!!c.matched_terms?.length && (
              <small>
                {L('标题包含：', 'Title contains: ')}
                {c.matched_terms.join(' · ')}
              </small>
            )}
            {c.matched_queries?.length ? (
              <small>
                {L('检索命中：', 'Found for: ')}
                {c.matched_queries.join(' / ')}
              </small>
            ) : null}
            {c.catalogs?.length ? (
              <small>
                {L('出处：', 'Catalogs: ')}
                {c.catalogs.join(' · ')}
              </small>
            ) : null}
          </details>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {projectId && sessionId && c.csl && (
              <Button
                type="button"
                variant="secondary"
                disabled={
                  !!busy ||
                  saved.includes(c.id) ||
                  savedCandidates.includes(c.id) ||
                  c.saved_to_bibliography === true
                }
                onClick={() => void save(c.id)}
              >
                {saved.includes(c.id) ||
                savedCandidates.includes(c.id) ||
                c.saved_to_bibliography === true ? (
                  <Check size={15} />
                ) : (
                  <BookmarkPlus size={15} />
                )}
                {saved.includes(c.id) ||
                savedCandidates.includes(c.id) ||
                c.saved_to_bibliography === true
                  ? L('已在书目中', 'In bibliography')
                  : busy === c.id
                    ? L('正在保存…', 'Saving…')
                    : L('加入项目书目', 'Save to bibliography')}
              </Button>
            )}
            {c.fulltext_url && /^https:\/\//i.test(c.fulltext_url) && (
              <a
                href={c.fulltext_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1"
              >
                <ExternalLink size={14} />
                {L('查看开放版本线索', 'Open access lead')}
              </a>
            )}
          </div>
          {feedbackId === c.id && message && (
            <output className="platform-notice literature-save-feedback">
              {message}
            </output>
          )}
          {c.fulltext_url && (
            <small>
              {L(
                '目录标注的开放版本，尚未验证全文或再利用许可。',
                'Catalog-listed open version; full text and reuse rights not verified.',
              )}
              {c.license ? ` ${c.license}` : ''}
            </small>
          )}
        </article>
      ))}
      {weak.length > 0 && (
        <div className="literature-weak-matches">
          <p>
            {L(
              `另有 ${weak.length} 条标题匹配较弱的结果。匹配只用于排序，不代表学术质量或全文相关性。`,
              `${weak.length} additional results have weaker title matches. Matching is a sorting aid, not a judgment of scholarly quality or full-text relevance.`,
            )}
          </p>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={showWeak}
            onClick={() => setShowWeak(!showWeak)}
          >
            {showWeak
              ? L('折叠弱匹配结果', 'Hide weaker matches')
              : L('展开弱匹配结果', 'Show weaker matches')}
          </Button>
        </div>
      )}
      <details className="literature-settings">
        <summary>
          {L('检索范围与失败记录', 'Search coverage and failures')}
        </summary>
        {parsed.data.searches.map((s, i) => (
          <p key={i}>
            <strong>
              {s.catalog} · {s.query}{' '}
              {s.cached ? L('（缓存）', '(cached)') : ''}
            </strong>
            <br />
            {s.status === 'completed'
              ? L(
                  `返回 ${s.returned} 条，上限 ${s.cap} 条；不是全部结果。`,
                  `Returned ${s.returned}, capped at ${s.cap}; not exhaustive.`,
                )
              : s.status === 'budget_exhausted'
                ? L(
                    '已达到你设置的调用上限。',
                    'Your request limit has been reached.',
                  )
                : s.status === 'uncertain'
                  ? L(
                      '请求结果不确定；未自动重试，请核对服务商用量。',
                      'Request outcome uncertain; not retried. Check provider usage.',
                    )
                  : L(
                      '本次检索失败，不能据此判断没有材料。',
                      'Search unavailable; no inference of absence.',
                    )}
          </p>
        ))}
      </details>
    </section>
  );
}
