import { z } from 'zod';
import { HttpError } from './errors';
import { USER_STORAGE_BYTES } from './files';
export const accountInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('profile'),
    name: z.string().trim().min(1).max(100),
    locale: z.enum(['zh-CN', 'en']),
  }),
  z.object({
    action: z.literal('revoke_session'),
    id: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal('revoke_other_sessions') }),
]);
export type AccountOverview = Awaited<ReturnType<AccountSettingsStore['read']>>;
export class AccountSettingsStore {
  constructor(
    readonly db: D1Database,
    readonly owner: string,
    readonly currentSession: string,
  ) {}
  async read() {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const [
      preferences,
      sessions,
      accounts,
      storage,
      projects,
      calls,
      background,
    ] = await Promise.all([
      this.db
        .prepare('SELECT locale FROM account_preferences WHERE owner_id=?')
        .bind(this.owner)
        .first<{ locale: 'zh-CN' | 'en' }>(),
      this.db
        .prepare(
          'SELECT id,user_agent,created_at,updated_at,expires_at FROM session WHERE user_id=? AND expires_at>? ORDER BY created_at DESC',
        )
        .bind(this.owner, Date.now())
        .all<{
          id: string;
          user_agent: string | null;
          created_at: number;
          updated_at: number;
          expires_at: number;
        }>(),
      this.db
        .prepare('SELECT DISTINCT provider_id FROM account WHERE user_id=?')
        .bind(this.owner)
        .all<{ provider_id: string }>(),
      this.db
        .prepare(
          'SELECT COALESCE(SUM(bytes),0) AS bytes FROM upload_reservations WHERE owner_id=?',
        )
        .bind(this.owner)
        .first<{ bytes: number }>(),
      this.db
        .prepare('SELECT COUNT(*) AS n FROM projects WHERE owner_id=?')
        .bind(this.owner)
        .first<{ n: number }>(),
      this.db
        .prepare(
          "SELECT COUNT(*) AS attempts,COALESCE(SUM(r.input_tokens),0) AS input_tokens,COALESCE(SUM(r.output_tokens),0) AS output_tokens,COALESCE(SUM(CASE WHEN c.phase='settled' THEN c.reserved_units ELSE 0 END),0) AS estimated_units,COALESCE(SUM(CASE WHEN c.phase IN ('calling','uncertain','reserved') THEN c.reserved_units ELSE 0 END),0) AS reserved_units FROM research_runs r LEFT JOIN direct_run_costs c ON c.run_id=r.id WHERE r.owner_id=? AND r.created_at>=?",
        )
        .bind(this.owner, since.toISOString())
        .first<{
          attempts: number;
          input_tokens: number;
          output_tokens: number;
          estimated_units: number;
          reserved_units: number;
        }>(),
      this.db
        .prepare(
          "SELECT COUNT(*) AS attempts,COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens,COALESCE(SUM(CASE WHEN status='succeeded' AND input_tokens>0 AND output_tokens>0 THEN reserved_units ELSE 0 END),0) AS estimated_units,COALESCE(SUM(CASE WHEN NOT(status='succeeded' AND input_tokens>0 AND output_tokens>0) THEN reserved_units ELSE 0 END),0) AS reserved_units FROM research_jobs WHERE owner_id=? AND created_at>=?",
        )
        .bind(this.owner, since.toISOString())
        .first<{
          attempts: number;
          input_tokens: number;
          output_tokens: number;
          estimated_units: number;
          reserved_units: number;
        }>(),
    ]);
    return {
      locale: preferences?.locale || null,
      sessions: sessions.results.map((item) => ({
        ...item,
        current: item.id === this.currentSession,
      })),
      providers: accounts.results.map((item) => item.provider_id),
      storage: { used: storage?.bytes || 0, limit: USER_STORAGE_BYTES },
      owned_projects: projects?.n || 0,
      usage: {
        since: since.toISOString(),
        direct: calls!,
        background: background!,
      },
    };
  }
  async mutate(input: z.infer<typeof accountInput>) {
    if (input.action === 'profile') {
      await this.db.batch([
        this.db
          .prepare('UPDATE user SET name=?,updated_at=? WHERE id=?')
          .bind(input.name, Date.now(), this.owner),
        this.db
          .prepare(
            'INSERT INTO account_preferences VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET locale=excluded.locale,updated_at=excluded.updated_at',
          )
          .bind(this.owner, input.locale, new Date().toISOString()),
      ]);
    } else if (input.action === 'revoke_session') {
      if (input.id === this.currentSession)
        throw new HttpError(409, '请使用退出登录来结束当前会话。');
      const result = await this.db
        .prepare('DELETE FROM session WHERE id=? AND user_id=?')
        .bind(input.id, this.owner)
        .run();
      if (!result.meta.changes)
        throw new HttpError(404, '该登录会话已结束或不存在。');
    } else {
      await this.db
        .prepare('DELETE FROM session WHERE user_id=? AND id<>?')
        .bind(this.owner, this.currentSession)
        .run();
    }
  }
}
