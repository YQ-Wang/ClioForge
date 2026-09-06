'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import { projectPath, sourcePath } from '@/lib/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
type Brief = {
  review: { id: string; mission_id: string; title: string }[];
  changed: { id: string; body: string }[];
  sources: {
    id: string;
    title: string;
    version_id: string;
    revision: number;
    created_at: string;
  }[];
  reading: {
    id: string;
    title: string;
    question: string;
    version_id: string;
    page: number;
    updated_at: string;
  }[];
};
export default function ResearchBrief({ projectId }: { projectId: string }) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [state, setState] = useState<{
      projectId: string;
      data?: Brief;
      status: 'loading' | 'ready' | 'error';
    }>({ projectId, status: 'loading' }),
    [retry, setRetry] = useState(0);
  const current = state.projectId === projectId ? state : null,
    data = current?.data,
    status = current?.status || 'loading';
  useEffect(() => {
    let active = true,
      inFlight = false;
    const refresh = () => {
      if (document.visibilityState === 'hidden' || inFlight) return;
      inFlight = true;
      setState((previous) => ({
        projectId,
        data: previous.projectId === projectId ? previous.data : undefined,
        status: 'loading',
      }));
      void api<Brief>(`/api/research-brief?project_id=${projectId}`)
        .then((data) => {
          if (active) setState({ projectId, data, status: 'ready' });
        })
        .catch(() => {
          if (active)
            setState((previous) => ({ ...previous, status: 'error' }));
        })
        .finally(() => {
          inFlight = false;
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [projectId, retry]);
  if (
    status === 'ready' &&
    data &&
    !data.sources.length &&
    !data.review.length &&
    !data.changed.length &&
    !data.reading.length
  )
    return null;
  return (
    <section className="research-brief">
      <h3>{L('接着上次的研究', 'Pick up your research')}</h3>
      {status === 'loading' && !data && (
        <p>
          <output>
            {L('正在读取研究进度…', 'Loading research progress…')}
          </output>
        </p>
      )}
      {status === 'error' && (
        <p>
          <output>
            {data
              ? L(
                  '暂时无法更新，以下为上次读取的进度。',
                  'Unable to refresh. Showing the last loaded progress.',
                )
              : L(
                  '暂时无法读取研究进度，请重试。',
                  'Unable to load research progress. Please retry.',
                )}
          </output>{' '}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            {L('重试', 'Retry')}
          </Button>
        </p>
      )}
      {data && (
        <div className="research-brief-grid">
          <article>
            <h4>{L('未解决的阅读批注', 'Open reading discussions')}</h4>
            {data.reading.map((item) => (
              <a
                key={item.id}
                href={`${sourcePath(projectId, item.version_id, item.page)}&annotation=${encodeURIComponent(item.id)}`}
              >
                {item.question || item.title}
                <small>
                  {item.title} · {L('第', 'p.')} {item.page}
                  {locale === 'en' ? '' : ' 页'} ·{' '}
                  {new Date(item.updated_at).toLocaleDateString(locale)}
                </small>
              </a>
            ))}
            {!data.reading.length && (
              <p>
                {L(
                  '当前没有未解决的阅读批注。',
                  'No open reading discussions.',
                )}
              </p>
            )}
          </article>
          <article>
            <h4>{L('等你核查', 'Ready for review')}</h4>
            {data.review.map((t) => (
              <Link
                key={t.id}
                href={`${projectPath(projectId, 'platform')}&mission=${t.mission_id}&task=${t.id}`}
              >
                {t.title} →
              </Link>
            ))}
            {!data.review.length && (
              <p>{L('当前没有待核查步骤。', 'No steps awaiting review.')}</p>
            )}
          </article>
          <article>
            <h4>{L('依据有变化的论点', 'Claims with updated sources')}</h4>
            {data.changed.map((c) => (
              <Link key={c.id} href={projectPath(projectId, 'arguments')}>
                {c.body}
              </Link>
            ))}
            {!data.changed.length && (
              <p>
                {L(
                  '已关联的依据没有新版本提醒。',
                  'No version-change alerts for linked evidence.',
                )}
              </p>
            )}
          </article>
          <article>
            <h4>{L('最近更新的材料', 'Recently updated sources')}</h4>
            {data.sources.map((s) => (
              <Link key={s.id} href={sourcePath(projectId, s.version_id, 1)}>
                {s.title}
                <small>
                  v{s.revision} ·{' '}
                  {new Date(s.created_at).toLocaleDateString(locale)}
                </small>
              </Link>
            ))}
          </article>
        </div>
      )}
    </section>
  );
}
