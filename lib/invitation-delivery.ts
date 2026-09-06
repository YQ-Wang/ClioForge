import { TeamStore, type Invitation } from './project-team';
import type { AppEnv } from './auth';
import { HttpError } from './errors';
import { escapeXML } from './rich-writing-export';
export async function sendInvitation(
  store: TeamStore,
  env: AppEnv,
  projectId: string,
  id: string,
  locale: 'zh-CN' | 'en',
) {
  const project = await store.project(projectId, 'admin');
  if (!env.EMAIL || !env.EMAIL_FROM || !env.BETTER_AUTH_URL)
    throw new HttpError(503, '邮件服务尚未配置。');
  const invite = await store.db
    .prepare(
      "SELECT * FROM project_invitations WHERE id=? AND project_id=? AND status='pending' AND expires_at>?",
    )
    .bind(id, projectId, new Date().toISOString())
    .first<Invitation>();
  if (!invite) throw new HttpError(409, '邀请已失效，请刷新成员列表。');
  // One explicit send per invitation. A lost response never silently resends.
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const result = await store.db
    .prepare(
      "INSERT INTO invitation_deliveries(invitation_id,owner_id,status,attempted_at) SELECT ?,?,'sending',? WHERE (SELECT COUNT(*) FROM invitation_deliveries WHERE owner_id=? AND attempted_at>?)<20 ON CONFLICT(invitation_id) DO NOTHING",
    )
    .bind(id, store.owner, new Date().toISOString(), store.owner, cutoff)
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      '该邀请已提交邮件服务，或已达到每日 20 封上限；可以复制邀请链接。',
    );
  const en = locale === 'en',
    url = new URL('/?invitation=' + id, env.BETTER_AUTH_URL).href;
  const heading = en
    ? 'You are invited to a research project'
    : '你收到一份研究项目邀请';
  const body = en
    ? `Join “${project.title}” on Canwoo. Sign in with this email address to review and accept the invitation. Your role: ${invite.role}. Expires: ${invite.expires_at.slice(0, 10)}. Accepting is optional.`
    : `邀请你加入 Canwoo 的「${project.title}」。使用收到这封邮件的邮箱登录后，可查看并接受邀请。权限：${{ viewer: '阅读', editor: '编辑', reviewer: '复核' }[invite.role]}。有效期至 ${invite.expires_at.slice(0, 10)}。你可以选择不接受。`;
  try {
    await env.EMAIL.send({
      from: { email: env.EMAIL_FROM, name: 'Canwoo 参伍' },
      to: invite.email,
      subject: 'Canwoo · ' + heading,
      text: heading + '\n\n' + body + '\n\n' + url,
      html: `<h1>${heading}</h1><p>${escapeXML(body)}</p><p><a href="${escapeXML(url)}">${en ? 'Review invitation' : '查看邀请'}</a></p>`,
    });
    await store.db
      .prepare(
        "UPDATE invitation_deliveries SET status='sent' WHERE invitation_id=?",
      )
      .bind(id)
      .run();
  } catch {
    await store.db
      .prepare(
        "UPDATE invitation_deliveries SET status='uncertain' WHERE invitation_id=?",
      )
      .bind(id)
      .run();
    throw new HttpError(
      502,
      '无法确认邮件服务是否接收，请勿重复发送。仍可复制邀请链接。',
    );
  }
}
