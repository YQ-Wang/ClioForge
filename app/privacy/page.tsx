import Link from 'next/link';
import { requestLocale } from '@/lib/i18n/request';
import { ClioForgeBrand } from '@/components/clioforge-brand';
import { env } from 'cloudflare:workers';
import type { AppEnv } from '@/lib/auth';
import { LanguageSwitcher } from '../language-switcher';
import { ThemeSwitcher } from '../theme-switcher';
export default async function Privacy() {
  const locale = await requestLocale();
  const configuredContact = (
    env as unknown as AppEnv
  ).INSTANCE_CONTACT_EMAIL?.trim();
  const contact =
    configuredContact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredContact)
      ? configuredContact
      : null;
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const sections = [
    [
      L('这是独立的自托管实例', 'This is an independently hosted installation'),
      L(
        'ClioForge 是开源软件，不提供统一的在线研究服务。以下说明描述软件的数据处理方式；本实例的部署者管理账号、存储、服务商配置和数据保留。开源项目维护者不会因你使用本实例而自动收到研究资料或模型密钥。使用前请向实例管理员确认运营主体、联系渠道及适用的隐私条款。',
        'ClioForge is open-source software, with no central hosted research service. This page describes how the software handles data; this installation’s operator manages accounts, storage, providers and retention. Using this installation does not automatically send research or model keys to the upstream maintainers. Confirm the operator, contact details and applicable privacy terms with your administrator before use.',
      ),
    ],
    [
      L('你带入 ClioForge 的信息', 'Information you bring to ClioForge'),
      L(
        '注册时，本实例保存姓名、邮箱和登录所需的信息。使用 Google 登录时，我们获取你授权的基本身份信息。项目中保存你导入的原件、文字、笔记、引文、研究任务与版本记录。创建协作邀请时，我们保存受邀邮箱、项目权限和邀请处理状态。登录会话和基础运行日志也可能包含 IP 地址、浏览器信息与访问时间，用于维持登录和排查故障。',
        'This installation stores your name, email and information needed to sign in. Google sign-in supplies the basic identity information you authorize. Projects store imported originals, text, notes, excerpts, research tasks and revision history. Collaboration invitations store the invited email, project permissions and response status. Sessions and operational logs may include IP address, browser information and access times to maintain sign-in and diagnose failures.',
      ),
    ],
    [
      L('Google Drive：由你选择文件', 'Google Drive: you choose the files'),
      L(
        '连接 Drive 时，ClioForge 请求访问你通过文件选择器选择的文件。Google 将该权限描述为读取和修改所选文件；ClioForge 当前只读取和导入，不修改云端原件。本实例保存文件副本、名称、来源链接及版本信息，用于阅读、引用和研究复现。Google 文档、表格和演示文稿会导出为 PDF。',
        'When you connect Drive, ClioForge requests access to files you select through the file picker. Google describes this permission as reading and modifying selected files; ClioForge currently reads and imports them without editing cloud originals. This installation saves a copy, its name, source link and version information for reading, citation and reproducibility. Google documents, spreadsheets and presentations are exported as PDFs.',
      ),
    ],
    [
      L(
        '研究助手与第三方处理',
        'Research assistance and third-party processing',
      ),
      L(
        '当你明确启动智能转录或分析时，所选材料和研究问题会发送给你选择的模型服务商。通过 OpenRouter 调用时，内容还会由其路由到模型服务商。请先了解所选服务商的数据政策。ClioForge 不将你的研究资料用于广告、出售或训练自有通用模型。部署到 Cloudflare 时，应用、数据库、文件和账号邮件由部署者的 Cloudflare 资源处理；本机模式使用本地模拟存储。',
        'When you start assisted transcription or analysis, your selected sources and question are sent to the model provider you choose. OpenRouter requests are also routed to its model providers. Review your chosen provider’s data policy before use. ClioForge does not use your research sources for advertising, sale or training its own general-purpose models. Cloudflare deployments use the operator’s Cloudflare resources for hosting, databases, files and account email; local mode uses emulated storage on your computer.',
      ),
    ],
    [
      L('权限与保护', 'Access and protection'),
      L(
        '项目默认只对你可见。你添加的协作者按分配的角色访问项目；共享成果时，获授权的项目可以读取该成果。模型密钥和 Google 授权令牌在服务器加密保存。浏览器文件选择器会短暂使用 Google 访问令牌，但不会收到客户端密钥或长期刷新令牌。',
        'Projects are private by default. Collaborators you add receive access according to their assigned role; an authorized project can read a finding you share with it. Model keys and Google authorization tokens are encrypted on the server. The browser file picker briefly uses a Google access token, but does not receive the client secret or long-lived refresh token.',
      ),
    ],
    [
      L('保留、导出与撤销', 'Retention, export and revocation'),
      L(
        '材料与研究历史会保存以支持后续研究和引用复核。你可以下载原件、导出项目记录和研究报告。断开 Google Drive 会删除 ClioForge 保存的该连接令牌；已导入资料仍保留在项目中。你也可以在 Google 账号的第三方连接页面撤销授权。你可以在「账号设置 → 用量与数据」自助删除账号。登录与服务授权立即停用，本人负责的项目及原件永久清理，失败时后台重试；他人项目中的历史研究贡献匿名保留，资料正文不会自动改写。云服务备份可能按服务商保留周期延后移除。',
        'Sources and research history are retained to support ongoing work and citation review. You can download originals, project records and research reports. Disconnecting Google Drive deletes ClioForge’s stored connection tokens; imported sources remain in the project. You can also revoke permission in your Google account’s third-party connections. You can delete your account under Account settings → Usage & data. Sign-in and service credentials are disabled immediately. Owned projects and originals are permanently removed, with background retries on failure; historical contributions to other projects are anonymized and research content is not automatically rewritten. Cloud service backups may remain according to provider retention periods.',
      ),
    ],
  ];
  return (
    <div className="public-shell">
      <header className="public-header">
        <Link href="/" className="brand public-brand">
          <ClioForgeBrand />
        </Link>
        <div className="appearance-actions">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="privacy-page">
        <p className="eyebrow">
          CLIOFORGE · {L('你的材料，由你掌握', 'YOUR SOURCES, YOUR CHOICES')}
        </p>
        <h1>{L('隐私与研究资料', 'Privacy and research data')}</h1>
        <p className="muted">
          {L('更新于 2026 年 9 月 9 日', 'Updated September 9, 2026')}
        </p>
        {sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
        <section id="contact">
          <h2>{L('本实例管理员', 'Installation administrator')}</h2>
          <p>
            {contact ? (
              <a href={`mailto:${contact}`}>{contact}</a>
            ) : (
              L(
                '本实例尚未配置管理员邮箱。请联系提供此网站的人；个人本地部署由你自己管理。不要把研究资料、账号或密钥提交到公开的 GitHub issue。',
                'This installation has not configured an administrator email. Contact whoever provided this site; for a personal local installation, you are the administrator. Do not post research data, account details or keys in public GitHub issues.',
              )
            )}
          </p>
          <p>
            <a
              href="https://myaccount.google.com/connections"
              target="_blank"
              rel="noreferrer"
            >
              {L(
                '管理 Google 第三方连接',
                'Manage Google third-party connections',
              )}
            </a>
          </p>
        </section>
        <Link href="/">← {L('回到 ClioForge', 'Back to ClioForge')}</Link>
      </main>
    </div>
  );
}
