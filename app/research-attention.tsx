'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ClipboardCheck,
  Inbox,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { researchAttention } from '@/lib/research-attention';
import type { Project } from '@/lib/types';
import './research-attention.css';
export default function ResearchAttention({
  settings = false,
  projects = [],
}: {
  settings?: boolean;
  projects?: Project[];
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<Awaited<
      ReturnType<typeof researchAttention>
    > | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const id = ++request;
      void api<NonNullable<typeof data>>('/api/attention')
        .then((r) => {
          if (active && id === request) {
            setData(r);
            setError('');
          }
        })
        .catch((e) => {
          if (active && id === request) setError(e.message);
        });
    };
    refresh();
    if (!settings) window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [reload, settings]);
  const loadError = error && (
    <div className="attention-feedback" role="alert">
      <span>
        {L(
          '提醒暂时无法更新，请重试。',
          'Reminders could not be updated. Please try again.',
        )}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setError('');
          setReload((n) => n + 1);
        }}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {L('重试', 'Retry')}
      </Button>
    </div>
  );
  if (!data) return loadError || null;
  if (settings)
    return (
      <section className="settings-card">
        <h2>{L('研究提醒', 'Research reminders')}</h2>
        <p>
          {L(
            '在「我的研究」显示等待你处理的工作，不发送自动通知邮件。',
            'Show work needing your attention in My research. These reminders do not send automated email.',
          )}
        </p>
        {(['tasks', 'mentions'] as const).map((key) => (
          <label key={key} className="attention-preference">
            <input
              type="checkbox"
              checked={!!data.preferences[key]}
              disabled={busy}
              onChange={async (e) => {
                const next = {
                  ...data.preferences,
                  [key]: e.target.checked ? 1 : 0,
                };
                setBusy(true);
                setError('');
                try {
                  await api('/api/attention', {
                    tasks: !!next.tasks,
                    mentions: !!next.mentions,
                  });
                  setData({ ...data, preferences: next });
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Save failed');
                } finally {
                  setBusy(false);
                }
              }}
            />
            {key === 'tasks'
              ? L('研究任务与材料更新', 'Research tasks and source updates')
              : L('同事在讨论中提醒我', 'Colleagues asking for my attention')}
          </label>
        ))}
        {error && <p role="alert">{error}</p>}
      </section>
    );
  if (!data.tasks.length && !data.mentions.length) return loadError || null;
  const projectTitle = (id: string) => projects.find((p) => p.id === id)?.title;
  const items = [
    ...data.tasks.map((t) => ({
      id: t.id,
      icon: ClipboardCheck,
      title: t.title,
      project: projectTitle(t.project_id),
      context:
        t.board_stage === 'active'
          ? L('分配给你 · 正在处理', 'Assigned to you · In progress')
          : t.board_stage === 'waiting'
            ? L('分配给你 · 暂缓处理', 'Assigned to you · On hold')
            : t.status === 'review'
              ? L('等待你审读', 'Awaiting your review')
              : L('分配给你 · 可以开始', 'Assigned to you · Ready to start'),
      action: L('查看任务', 'View task'),
      href: `/?project=${t.project_id}&tab=platform&mission=${t.mission_id}&task=${t.id}`,
    })),
    ...data.mentions.map((c) => ({
      id: c.id,
      icon: MessageSquare,
      title: L(
        `${c.author_name} 请你参与讨论`,
        `${c.author_name} asked for your input`,
      ),
      project: projectTitle(c.project_id),
      context: c.body.slice(0, 180),
      action: L('参与讨论', 'Join discussion'),
      href: `/?project=${c.project_id}&tab=team&discussion=${c.target_id}`,
    })),
  ];
  return (
    <section className="research-attention" aria-labelledby="attention-heading">
      <header className="attention-heading">
        <div>
          <h2 id="attention-heading">
            <Inbox size={19} aria-hidden="true" />
            {L('等待你处理', 'Needs your attention')}
          </h2>
          <p>
            {L(
              '查看分配给你的任务，或回应同事的讨论。',
              'Open an assigned task or respond to a colleague.',
            )}
          </p>
        </div>
        <Link
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          href="/?view=inbox"
        >
          {L('打开研究收件箱', 'Open research inbox')}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>
      {loadError}
      <ul className="attention-list">
        {items.slice(0, 5).map((item) => (
          <li key={item.id}>
            <Link className="attention-item" href={item.href}>
              <span className="attention-icon">
                <item.icon size={19} aria-hidden="true" />
              </span>
              <span className="attention-copy">
                {item.project && (
                  <span className="attention-project">{item.project}</span>
                )}
                <strong>{item.title}</strong>
                <span className="attention-context">{item.context}</span>
              </span>
              <span className="attention-action">
                {item.action}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 5 && (
        <p className="attention-more">
          {L(
            '这里只列出前 5 项，更多工作请打开研究收件箱。',
            'Showing the first 5 items. Open your research inbox for more work.',
          )}
        </p>
      )}
    </section>
  );
}
