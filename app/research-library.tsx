'use client';
import { useState } from 'react';
import { FileCheck2, GitBranch, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';

export type FindingSummary = {
  id: string;
  title: string;
  research_title?: string | null;
  mission_id?: string | null;
  summary_excerpt?: string | null;
  kind: string;
  outdated?: number;
  created_at: string;
};
const category = (item: FindingSummary) =>
  item.kind === 'publish'
    ? 'reports'
    : ['review', 'manual'].includes(item.kind)
      ? 'reviews'
      : 'steps';
const excerpt = (text: string) =>
  text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export default function ResearchLibrary({
  artifacts,
  busy,
  onRead,
  onPlan,
}: {
  artifacts: FindingSummary[];
  busy: boolean;
  onRead: (id: string) => void;
  onPlan: (id: string) => void;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [filter, setFilter] = useState(() =>
    artifacts.some((item) => category(item) === 'reports')
      ? 'reports'
      : artifacts.some((item) => category(item) === 'reviews')
        ? 'reviews'
        : 'steps',
  );
  const [query, setQuery] = useState('');
  const groups = [
    { id: 'reports', label: L('研究稿', 'Research reports') },
    { id: 'reviews', label: L('审读意见', 'Review notes') },
    { id: 'steps', label: L('过程记录', 'Supporting steps') },
  ];
  const shown = artifacts.filter(
    (item) =>
      category(item) === filter &&
      `${item.research_title || ''} ${item.title} ${item.summary_excerpt || ''}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <section aria-label={L('研究成果库', 'Research findings library')}>
      <div className="platform-heading">
        <div>
          <h2>{L('已经留下的研究成果', 'Your retained research findings')}</h2>
          <p>
            {L(
              '研究稿、审读意见和过程记录分别整理。每项都保留原文出处，并可返回研究计划。',
              'Reports, review notes and supporting steps are kept separately, with their sources and a path back to the research plan.',
            )}
          </p>
        </div>
      </div>
      <div className="finding-library-tools">
        <fieldset
          className="flow-actions"
          aria-label={L('成果类型', 'Finding type')}
        >
          {groups.map((group) => (
            <Button
              key={group.id}
              variant={filter === group.id ? 'secondary' : 'ghost'}
              aria-pressed={filter === group.id}
              onClick={() => setFilter(group.id)}
            >
              {group.label}{' '}
              <span>
                {artifacts.filter((item) => category(item) === group.id).length}
              </span>
            </Button>
          ))}
        </fieldset>
        <div className="finding-library-search">
          <Search size={16} aria-hidden="true" />
          <Input
            aria-label={L('搜索研究成果', 'Search research findings')}
            placeholder={L('搜索标题或内容…', 'Search titles or contents…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="mission-grid">
        {shown.map((artifact) => (
          <article className="artifact-card" key={artifact.id}>
            <FileCheck2 aria-hidden="true" />
            <h3
              className="line-clamp-2"
              title={artifact.research_title || artifact.title}
            >
              {artifact.research_title || artifact.title}
            </h3>
            {artifact.research_title && <small>{artifact.title}</small>}
            {artifact.summary_excerpt && (
              <p className="line-clamp-3">
                {excerpt(artifact.summary_excerpt)}
              </p>
            )}
            <p>
              {artifact.outdated
                ? L('有后续修改，请重新审读', 'Later changes; review again')
                : L('已采纳', 'Accepted')}{' '}
              · {new Date(artifact.created_at).toLocaleDateString(locale)}
            </p>
            <div className="flow-actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onRead(artifact.id)}
              >
                <FileCheck2 size={15} />
                {L('打开阅读', 'Open to read')}
              </Button>
              {artifact.mission_id && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onPlan(artifact.mission_id!)}
                >
                  <GitBranch size={15} />
                  {L('回到研究计划', 'Research plan')}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <div className="platform-empty">
          <FileCheck2 />
          {query
            ? L(
                '没有匹配的结果。试试其他关键词，或切换成果类型。',
                'No matching results. Try another term or finding type.',
              )
            : L(
                '这里暂时没有记录。审读通过后，会保留在对应分类中。',
                'No records here yet. Accepted work is retained in its corresponding category.',
              )}
        </div>
      )}
    </section>
  );
}
