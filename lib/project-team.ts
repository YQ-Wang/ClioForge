import { z } from 'zod';
import { ResearchStore } from './store';
import { HttpError } from './errors';
export const memberRole = z.enum(['viewer', 'editor', 'reviewer']);
export type MemberRole = z.infer<typeof memberRole>;
export type Invitation = {
  id: string;
  project_id: string;
  email: string;
  role: MemberRole;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  created_at: string;
  expires_at: string;
};
export type IncomingInvitation = Invitation & {
  title: string;
  owner_name: string;
};
export type ProjectTeam = {
  role: string;
  members: { user_id: string; name: string; email: string; role: string }[];
  invitations: Invitation[];
};
export class TeamStore extends ResearchStore {
  async team(projectId: string): Promise<ProjectTeam> {
    const project = await this.project(projectId);
    const members = await this.db
      .prepare(
        "SELECT u.id AS user_id,u.name,u.email,'owner' AS role FROM projects p JOIN user u ON u.id=p.owner_id WHERE p.id=? UNION ALL SELECT u.id,u.name,u.email,m.role FROM project_members m JOIN user u ON u.id=m.user_id WHERE m.project_id=? AND u.id<>?",
      )
      .bind(projectId, projectId, project.owner_id)
      .all<ProjectTeam['members'][number]>();
    const invitations =
      project.role === 'owner'
        ? (
            await this.db
              .prepare(
                'SELECT id,project_id,email,role,status,created_at,expires_at FROM project_invitations WHERE project_id=? ORDER BY created_at DESC LIMIT 100',
              )
              .bind(projectId)
              .all<Invitation>()
          ).results
        : [];
    return { role: project.role, members: members.results, invitations };
  }
  async invite(projectId: string, input: unknown) {
    const project = await this.project(projectId, 'admin');
    const value = z
      .object({
        email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
        role: memberRole,
      })
      .parse(input);
    const existing = await this.db
      .prepare(
        'SELECT u.id FROM user u WHERE lower(u.email)=? AND (u.id=? OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=? AND m.user_id=u.id))',
      )
      .bind(value.email, project.owner_id, projectId)
      .first();
    if (existing)
      throw new HttpError(409, '该成员已在项目中，请直接调整她的权限。');
    const id = crypto.randomUUID(),
      created = new Date().toISOString(),
      expires = new Date(Date.now() + 7 * 86400_000).toISOString();
    // Renewing an invitation replaces its id, so an earlier invitation cannot grant an old role.
    await this.db
      .prepare(
        "INSERT INTO project_invitations(id,project_id,email,role,invited_by,status,created_at,expires_at) VALUES(?,?,?,?,?,'pending',?,?) ON CONFLICT(project_id,email) DO UPDATE SET id=excluded.id,role=excluded.role,invited_by=excluded.invited_by,status='pending',created_at=excluded.created_at,expires_at=excluded.expires_at,responded_at=NULL",
      )
      .bind(
        id,
        projectId,
        value.email,
        value.role,
        this.owner,
        created,
        expires,
      )
      .run();
    return id;
  }
  async revokeInvitation(projectId: string, id: string) {
    await this.project(projectId, 'admin');
    const result = await this.db
      .prepare(
        "UPDATE project_invitations SET status='revoked',responded_at=? WHERE project_id=? AND id=? AND status='pending'",
      )
      .bind(new Date().toISOString(), projectId, id)
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, '邀请已被处理，请刷新成员列表。');
  }
  private async verifiedEmail() {
    // Use current identity from the database, never a caller-provided email or a stale session claim.
    const user = await this.db
      .prepare(
        'SELECT lower(email) AS email FROM user WHERE id=? AND email_verified=1',
      )
      .bind(this.owner)
      .first<{ email: string }>();
    if (!user) throw new HttpError(403, '请先验证受邀邮箱，再查看或接受邀请。');
    return user.email;
  }
  async inbox() {
    const email = await this.verifiedEmail();
    return (
      await this.db
        .prepare(
          "SELECT i.id,i.project_id,i.email,i.role,i.status,i.created_at,i.expires_at,p.title,u.name AS owner_name FROM project_invitations i JOIN projects p ON p.id=i.project_id JOIN user u ON u.id=p.owner_id WHERE i.email=? AND i.status='pending' AND i.expires_at>? ORDER BY i.created_at DESC LIMIT 100",
        )
        .bind(email, new Date().toISOString())
        .all<IncomingInvitation>()
    ).results;
  }
  async respond(id: string, accept: boolean) {
    const email = await this.verifiedEmail(),
      now = new Date().toISOString();
    if (!accept) {
      const result = await this.db
        .prepare(
          "UPDATE project_invitations SET status='declined',responded_at=? WHERE id=? AND email=? AND status='pending' AND expires_at>?",
        )
        .bind(now, id, email, now)
        .run();
      if (!result.meta.changes)
        throw new HttpError(409, '邀请已失效或不属于此邮箱。');
      return null;
    }
    // D1 batch is a transaction: revocation and acceptance cannot interleave these two writes.
    const results = await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO project_members(project_id,user_id,role,added_by,created_at) SELECT i.project_id,?,i.role,i.invited_by,? FROM project_invitations i JOIN projects p ON p.id=i.project_id WHERE i.id=? AND i.email=? AND i.status='pending' AND i.expires_at>? AND p.owner_id<>? ON CONFLICT(project_id,user_id) DO NOTHING",
        )
        .bind(this.owner, now, id, email, now, this.owner),
      this.db
        .prepare(
          "UPDATE project_invitations SET status='accepted',responded_at=? WHERE id=? AND email=? AND status='pending' AND expires_at>? AND EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=project_invitations.project_id AND m.user_id=?) RETURNING project_id",
        )
        .bind(now, id, email, now, this.owner),
    ]);
    const row = results[1].results[0] as { project_id: string } | undefined;
    if (!row) throw new HttpError(409, '邀请已失效或不属于此邮箱。');
    return row.project_id;
  }
  async setMemberRole(projectId: string, userId: string, rawRole: unknown) {
    const project = await this.project(projectId, 'admin'),
      role = memberRole.parse(rawRole);
    if (userId === project.owner_id)
      throw new HttpError(400, '项目负责人保留管理权限。');
    const result = await this.db
      .prepare(
        'UPDATE project_members SET role=? WHERE project_id=? AND user_id=?',
      )
      .bind(role, projectId, userId)
      .run();
    if (!result.meta.changes) throw new HttpError(404, '该成员已不在项目中。');
    if (role === 'viewer') await this.revokeAgentAccess(projectId, userId);
  }
  private async revokeAgentAccess(projectId: string, userId: string) {
    await this.db
      .prepare(
        'UPDATE agent_credentials SET revoked_at=? WHERE project_id=? AND owner_id=? AND revoked_at IS NULL',
      )
      .bind(new Date().toISOString(), projectId, userId)
      .run();
  }
  async removeMember(projectId: string, userId: string) {
    const project = await this.project(projectId, 'admin');
    if (userId === project.owner_id)
      throw new HttpError(400, '不能移除项目负责人。');
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?')
        .bind(projectId, userId),
      this.db
        .prepare(
          "UPDATE project_invitations SET status='revoked',responded_at=? WHERE project_id=? AND email=(SELECT lower(email) FROM user WHERE id=?) AND status='pending'",
        )
        .bind(now, projectId, userId),
      this.db
        .prepare(
          'UPDATE agent_credentials SET revoked_at=? WHERE project_id=? AND owner_id=? AND revoked_at IS NULL',
        )
        .bind(now, projectId, userId),
    ]);
  }
}
