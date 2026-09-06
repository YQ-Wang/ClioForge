'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
type Discussion = {
  role: string;
  comments: {
    id: string;
    body: string;
    author_name: string;
    created_at: string;
    resolved: number;
  }[];
};
export default function EvidenceDiscussion({
  projectId,
  targetId,
  initiallyOpen = false,
}: {
  projectId: string;
  targetId: string;
  initiallyOpen?: boolean;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<Discussion | null>(null),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = () =>
    api<Discussion>(
      `/api/platform?project_id=${projectId}&comments=${targetId}`,
    ).then(setData);
  async function act(body?: unknown) {
    setBusy(true);
    setError('');
    try {
      if (body) await api('/api/platform', body);
      await load();
      if (body) setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="evidence-discussion"
      open={initiallyOpen || undefined}
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy) void act();
      }}
    >
      <summary>{L('讨论这条依据', 'Discuss this evidence')}</summary>
      {error && <p role="alert">{error}</p>}
      {data?.comments.map((c) => (
        <article key={c.id}>
          <strong>{c.author_name}</strong>
          <small> · {new Date(c.created_at).toLocaleString(locale)}</small>
          <p>{c.body}</p>
          {c.resolved ? (
            <small>{L('已解决', 'Resolved')}</small>
          ) : (
            ['owner', 'reviewer'].includes(data.role) && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void act({
                    action: 'resolve_comment',
                    project_id: projectId,
                    id: c.id,
                  })
                }
              >
                {L('标记已解决', 'Resolve')}
              </Button>
            )
          )}
        </article>
      ))}
      {data && data.role !== 'viewer' && (
        <>
          <Textarea
            aria-label={L(
              '核查问题或不同解释',
              'Review question or alternative interpretation',
            )}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={10000}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy || !text.trim()}
            onClick={() =>
              void act({
                action: 'comment',
                project_id: projectId,
                value: { target_id: targetId, body: text },
              })
            }
          >
            {L('保存讨论', 'Save discussion')}
          </Button>
        </>
      )}
    </details>
  );
}
