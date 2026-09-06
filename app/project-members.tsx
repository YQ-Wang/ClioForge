'use client';
import { useCallback, useEffect, useState } from 'react';
import { Users, Copy, UserPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/provider';
import { api } from '@/lib/client-api';
import { formText } from '@/lib/form-values';
import type { ProjectTeam } from '@/lib/project-team';
export default function ProjectMembers({ projectId }: { projectId: string }) {
  const { locale, t } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [open, setOpen] = useState(false),
    [team, setTeam] = useState<ProjectTeam | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [removing, setRemoving] = useState<
    ProjectTeam['members'][number] | null
  >(null);
  const [link, setLink] = useState('');
  const refresh = useCallback(
    async () =>
      setTeam(await api<ProjectTeam>(`/api/team?project_id=${projectId}`)),
    [projectId],
  );
  useEffect(() => {
    if (open)
      void refresh().catch((error) =>
        setMessage(
          error instanceof Error ? t(error.message) : 'Could not load members.',
        ),
      );
  }, [open, refresh, t]);
  const labels: Record<string, string> = {
    owner: L('项目负责人', 'Project owner'),
    viewer: L('仅阅读', 'Read only'),
    editor: L('协作编辑', 'Can contribute'),
    reviewer: L('协作并复核', 'Can contribute and review'),
  };
  async function act(body: object) {
    setBusy(true);
    setMessage('');
    try {
      const data = await api<{ result: unknown }>('/api/team', {
        ...body,
        project_id: projectId,
      });
      await refresh();
      return data.result;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? t(error.message)
          : L('操作未完成，请重试。', 'Please try again.'),
      );
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  async function copy(id: string) {
    const url = `${window.location.origin}/?invitation=${encodeURIComponent(id)}`;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setMessage(
        L(
          '邀请链接已复制，请发给受邀者。链接仅能由该邮箱接受。',
          'Invitation link copied. Share it with the invitee; only their email can accept it.',
        ),
      );
    } catch {
      setMessage(
        L(
          '请复制下方链接，发给受邀者。',
          'Copy the link below and share it with the invitee.',
        ),
      );
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Users size={16} />
        {L('成员与邀请', 'Members & invitations')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="members-dialog">
          <DialogHeader>
            <DialogTitle>
              {L('一起做这项研究', 'Work on this research together')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '共享材料、笔记和研究发现。只有项目负责人可以管理成员。',
                'Share sources, notes and findings. Only the project owner manages membership.',
              )}
            </DialogDescription>
          </DialogHeader>
          {message && <output className="platform-notice">{message}</output>}
          {!team ? (
            <p>{L('正在读取成员…', 'Loading members…')}</p>
          ) : (
            <>
              <div className="member-help">
                <p>
                  <strong>{labels.viewer}</strong> ·{' '}
                  {L(
                    '阅读和下载项目材料。',
                    'Read and download project materials.',
                  )}
                </p>
                <p>
                  <strong>{labels.editor}</strong> ·{' '}
                  {L(
                    '还可添加材料、编辑笔记、摘录和开展分析。',
                    'Also add sources, edit notes, collect excerpts and run analyses.',
                  )}
                </p>
                <p>
                  <strong>{labels.reviewer}</strong> ·{' '}
                  {L(
                    '还可复核并采纳研究发现。',
                    'Also review and accept findings.',
                  )}
                </p>
              </div>
              <section aria-label={L('当前成员', 'Current members')}>
                {team.members.map((member) => (
                  <div className="team-person" key={member.user_id}>
                    <div>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </div>
                    {team.role === 'owner' && member.role !== 'owner' ? (
                      <div className="team-person-actions">
                        <select
                          value={member.role}
                          disabled={busy}
                          aria-label={L(
                            `${member.name} 的权限`,
                            `Permissions for ${member.name}`,
                          )}
                          onChange={(event) =>
                            void act({
                              action: 'change_role',
                              user_id: member.user_id,
                              role: event.target.value,
                            })
                          }
                        >
                          {['viewer', 'editor', 'reviewer'].map((role) => (
                            <option key={role} value={role}>
                              {labels[role]}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          aria-label={L(
                            `移除 ${member.name}`,
                            `Remove ${member.name}`,
                          )}
                          onClick={() => {
                            setMessage('');
                            setRemoving(member);
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ) : (
                      <span className="member-role">{labels[member.role]}</span>
                    )}
                  </div>
                ))}
              </section>
              {team.role === 'owner' && (
                <>
                  <form
                    className="invite-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget,
                        data = new FormData(form);
                      void act({
                        action: 'invite',
                        email: formText(data, 'email'),
                        role: formText(data, 'role'),
                      }).then((id) => {
                        if (typeof id === 'string') {
                          form.reset();
                          setLink(`${location.origin}/?invitation=${id}`);
                          setMessage(
                            L(
                              '邀请已创建。请将链接发给对方；她登录后也会在「我的研究」看到邀请。',
                              'Invitation created. Share the link; the invitee will also see it in My research after signing in.',
                            ),
                          );
                        }
                      });
                    }}
                  >
                    <h3>
                      <UserPlus size={18} />
                      {L('邀请合作者', 'Invite a collaborator')}
                    </h3>
                    <label>
                      {L('对方的邮箱', 'Their email')}
                      <Input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                        placeholder="colleague@university.edu"
                      />
                    </label>
                    <label>
                      {L('允许她做什么', 'What can they do?')}
                      <select name="role" defaultValue="editor">
                        {['viewer', 'editor', 'reviewer'].map((role) => (
                          <option key={role} value={role}>
                            {labels[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {L(
                        '无需提前注册。邀请 7 天有效，接受后才获得项目权限。创建后可选择发送邀请邮件或复制链接。',
                        'No existing account needed. Invitations last 7 days and grant access only after acceptance. After creating the invitation, choose to send email or copy its link.',
                      )}
                    </p>
                    <Button type="submit" disabled={busy}>
                      {L('创建邀请', 'Create invitation')}
                    </Button>
                  </form>
                  {link && (
                    <label className="invite-link">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            action: 'send_invitation',
                            id: new URL(link).searchParams.get('invitation'),
                            locale,
                          }).then((result) => {
                            if (result)
                              setMessage(
                                L(
                                  '已提交邮件服务；实际投递可能需要几分钟。',
                                  'Submitted to the mail service; delivery may take a few minutes.',
                                ),
                              );
                          })
                        }
                      >
                        {L('发送邀请邮件', 'Send invitation email')}
                      </Button>
                      {L('邀请链接', 'Invitation link')}
                      <Input
                        readOnly
                        value={link}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <Button
                        variant="outline"
                        onClick={() =>
                          void copy(
                            new URL(link).searchParams.get('invitation')!,
                          )
                        }
                      >
                        <Copy size={14} />
                        {L('复制链接', 'Copy link')}
                      </Button>
                    </label>
                  )}
                  {team.invitations.some(
                    (invite) => invite.status === 'pending',
                  ) && (
                    <section className="pending-invites">
                      <h3>{L('等待加入', 'Waiting to join')}</h3>
                      {team.invitations
                        .filter((invite) => invite.status === 'pending')
                        .map((invite) => (
                          <div key={invite.id} className="team-person">
                            <div>
                              <strong>{invite.email}</strong>
                              <small>
                                {labels[invite.role]} ·{' '}
                                {new Date(invite.expires_at).getTime() <=
                                Date.now()
                                  ? L(
                                      '已过期，请重新邀请',
                                      'Expired; invite again',
                                    )
                                  : L(
                                      `有效至 ${new Date(invite.expires_at).toLocaleDateString(locale)}`,
                                      `Expires ${new Date(invite.expires_at).toLocaleDateString(locale)}`,
                                    )}
                              </small>
                            </div>
                            <div className="team-person-actions">
                              <Button
                                variant="ghost"
                                disabled={
                                  busy ||
                                  new Date(invite.expires_at).getTime() <=
                                    Date.now()
                                }
                                onClick={() => void copy(invite.id)}
                              >
                                {L('复制链接', 'Copy link')}
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  void act({
                                    action: 'revoke_invitation',
                                    id: invite.id,
                                  }).then((result) => {
                                    if (result) setLink('');
                                  })
                                }
                              >
                                {L('撤销', 'Revoke')}
                              </Button>
                            </div>
                          </div>
                        ))}
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(value) => {
          if (!value) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {L(
                `移除 ${removing?.name || ''}？`,
                `Remove ${removing?.name || ''}?`,
              )}
            </DialogTitle>
            <DialogDescription>
              {L(
                '她将失去该项目的访问权限。她已经添加的材料、笔记和复核记录会保留；已下载的副本无法收回。',
                'They will lose project access. Their sources, notes and reviews remain; downloaded copies cannot be recalled.',
              )}
            </DialogDescription>
          </DialogHeader>
          {message && <output className="platform-notice">{message}</output>}
          <div className="team-person-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              {L('取消', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void act({
                  action: 'remove_member',
                  user_id: removing?.user_id,
                }).then((result) => {
                  if (result) setRemoving(null);
                })
              }
            >
              {L('移除成员', 'Remove member')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
