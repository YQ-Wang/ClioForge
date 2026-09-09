import Link from 'next/link';
import { requestLocale } from '@/lib/i18n/request';
import { SUPPORT_URL } from '@/lib/platform-contact';
export default async function AccountClosed() {
  const locale = await requestLocale(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  return (
    <main className="privacy-page">
      <h1>{L('账号删除请求已处理', 'Account deletion requested')}</h1>
      <p>
        {L(
          '登录与服务授权已停用。本人项目正在清理；若文件存储暂时不可用，系统会自动重试。保留在合作者项目中的历史研究贡献将匿名显示。',
          'Sign-in and service credentials are disabled. Owned projects are being removed; cleanup automatically retries if storage is temporarily unavailable. Historical contributions retained in collaborators’ projects are anonymized.',
        )}
      </p>
      <p>
        {L('如需核对清理进度，请联系', 'For cleanup status, contact')}{' '}
        <a href={SUPPORT_URL}>
          {L('联系本实例管理员', 'Contact this installation’s administrator')}
        </a>
        。
      </p>
      <Link href="/">{L('回到 ClioForge', 'Back to ClioForge')}</Link>
    </main>
  );
}
