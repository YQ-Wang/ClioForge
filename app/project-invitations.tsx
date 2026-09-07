'use client';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client-api';
import type { IncomingInvitation } from '@/lib/project-team';
import type { Project } from '@/lib/types';
export default function ProjectInvitations({
  onOpen,
}: {
  onOpen: (project: Project) => void;
}) {
  const { locale, t } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [invitations, setInvitations] = useState<IncomingInvitation[]>([]),
    [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false),
    [invitationLink, setInvitationLink] = useState(false);
  const refresh = useCallback(async () => {
    const data = await api<{ invitations: IncomingInvitation[] }>(
      '/api/invitations',
    );
    setInvitations(data.invitations);
    setMessage('');
  }, []);
  useEffect(() => {
    setInvitationLink(new URLSearchParams(location.search).has('invitation'));
    const update = () =>
      void refresh().catch((error) =>
        setMessage(
          error instanceof Error
            ? t(error.message)
            : 'Could not load invitations.',
        ),
      );
    update();
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, [refresh, t]);
  async function respond(id: string, action: 'accept' | 'decline') {
    setBusy(true);
    setMessage('');
    try {
      const { projectId } = await api<{ projectId: string | null }>(
        '/api/invitations',
        { id, action },
      );
      await refresh();
      if (projectId) {
        const { project } = await api<{ project: Project }>(
          `/api/workspace?project_id=${projectId}&access=1`,
        );
        onOpen(project);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? t(error.message)
          : L('操作未完成。', 'Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }
  if (!invitations.length && !message && !invitationLink) return null;
  if (!invitations.length && message && !invitationLink)
    return <output className="invitation-feedback">{message}</output>;
  return (
    <section className="invitation-inbox">
      <h2>{L('邀请你一起研究', 'You are invited to collaborate')}</h2>
      {message && <output className="platform-notice">{message}</output>}
      {!invitations.length && !message && (
        <p>
          {L(
            '当前邮箱没有待接受的邀请。请确认使用的是受邀邮箱；过期或撤销的邀请需要负责人重新创建。',
            'There are no pending invitations for this email. Use the invited email; ask the owner to renew an expired or revoked invitation.',
          )}
        </p>
      )}
      {invitations.map((invite) => (
        <article key={invite.id} className="team-person">
          <div>
            <h3>{invite.title}</h3>
            <p>
              {L(
                `${invite.owner_name} 邀请你加入`,
                `${invite.owner_name} invited you`,
              )}
            </p>
            <small>
              {invite.role === 'viewer'
                ? L('可阅读和下载', 'Read and download')
                : invite.role === 'editor'
                  ? L('可共同整理材料与笔记', 'Contribute sources and notes')
                  : L('可协作编辑并复核成果', 'Contribute and review findings')}
            </small>
          </div>
          <div className="team-person-actions">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void respond(invite.id, 'decline')}
            >
              {L('婉拒', 'Decline')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void respond(invite.id, 'accept')}
            >
              {L('接受并打开项目', 'Accept & open project')}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
