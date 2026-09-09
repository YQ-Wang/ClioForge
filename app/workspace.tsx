'use client';
import RestoreProject from './restore-project';
import { useI18n } from '@/lib/i18n/provider';
import { LOCALE_COOKIE } from '@/lib/i18n/core';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type MouseEvent,
} from 'react';
import { authClient } from '@/lib/auth-client';
import { authReturnPath } from '@/lib/auth-return';
import { api } from '@/lib/client-api';
import {
  ClioForgeBrand,
  ClioForgeMark,
  GoogleMark,
} from '@/components/clioforge-brand';
import ResearchGuide from './research-guide';
import ResearchAttention from './research-attention';
import ResearchInbox from './research-inbox';
import ProjectInvitations from './project-invitations';
import { projectPath, projectSections } from '@/lib/navigation';
import {
  useWorkspaceRoute,
  navigateWorkspace,
} from '@/hooks/use-workspace-route';
import WorkspaceNavigation from './workspace-navigation';
import AccountSettings from './account-settings';
import type { AccountOverview } from '@/lib/account-settings';
import {
  BookOpen,
  GitBranch,
  Plus,
  ShieldCheck,
  LoaderCircle,
  ArrowUpRight,
  ChevronRight,
  FolderOpen,
  LayoutGrid,
  List,
  Quote,
  Search,
  Sparkles,
  Settings2,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import type { Project } from '@/lib/types';
import ProjectDesk from './project-desk';
import { LanguageSwitcher } from './language-switcher';
import { ThemeSwitcher } from './theme-switcher';
import Link from 'next/link';
import { SOURCE_CODE_URL } from '@/lib/platform-contact';
function ResponsiveSidebar({ routeKey }: { routeKey: string }) {
  const { setOpen, setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(false), [routeKey, setOpenMobile]);
  const applyWidth = useEffectEvent((wide: boolean) => setOpen(wide));
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const update = () => applyWidth(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return null;
}
export default function Workspace({
  configured,
  googleAvailable = false,
}: {
  configured: boolean;
  googleAvailable?: boolean;
}) {
  const { t, locale, setLocale } = useI18n();
  useEffect(() => {
    document.title =
      locale === 'en'
        ? 'ClioForge: Research Workspace'
        : 'ClioForge 参伍: 研究工作台';
  }, [locale]);
  const {
    data: session,
    isPending,
    refetch: refetchSession,
  } = authClient.useSession();
  const ready = !isPending;
  const route = useWorkspaceRoute();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const view = route.settings
    ? 'settings'
    : route.guide
      ? 'guide'
      : route.inbox
        ? 'inbox'
        : 'projects';
  const [project, setProject] = useState<Project | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [authError, setAuthError] = useState('');
  const [invited, setInvited] = useState(false);
  useEffect(() => {
    setProject((current) => (current?.id === route.projectId ? current : null));
    setAuthError('');
    const params = new URLSearchParams(window.location.search);
    setInvited(params.has('invitation'));
    if (params.has('error'))
      setAuthError('Google 登录未完成。可以重试，或使用邮箱登录。');
    if (params.get('drive') === 'error')
      setAuthError('Google 连接没有完成，请回到项目中重试。已有资料不受影响。');
    if (!session?.user.id) return;
    const id = route.projectId;
    let active = true;
    if (id && /^[a-f0-9-]{36}$/i.test(id))
      void api<{ project: Project }>(
        `/api/workspace?project_id=${encodeURIComponent(id)}&access=1`,
      )
        .then((data) => {
          if (active) setProject(data.project);
        })
        .catch(() => {
          if (active)
            setAuthError('无法打开这个项目，请从你的研究列表重新选择。');
        });
    if (params.get('drive') === 'error')
      setAuthError('Google 连接没有完成，请回到项目中重试。已有资料不受影响。');
    if (params.has('error'))
      setAuthError('Google 登录未完成。可以重试，或使用邮箱登录。');
    return () => {
      active = false;
    };
  }, [session?.user.id, route.projectId]);
  useEffect(() => {
    if (!session?.user.id) return;
    let live = true;
    void api<AccountOverview>('/api/account')
      .then((data) => {
        // An explicit language choice in this browser takes priority over the
        // account default, including when this response arrives after a click.
        const hasChoice = document.cookie
          .split(';')
          .some((cookie) => cookie.trim().startsWith(`${LOCALE_COOKIE}=`));
        if (live && data.locale && !hasChoice) setLocale(data.locale);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [session?.user.id, setLocale]);
  function followBreadcrumb(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigateWorkspace(event.currentTarget.getAttribute('href') || '/');
  }
  function openProject(value: Project | null) {
    setProject(value);
    setCounts({});
    navigateWorkspace(value ? projectPath(value.id) : '/');
  }
  function openSettings(section = 'profile') {
    const params = new URLSearchParams(
      project ? projectPath(project.id, route.tab).split('?')[1] : '',
    );
    params.set('settings', section);
    navigateWorkspace(`/?${params}`);
  }
  function openSection(section: string) {
    if (project) navigateWorkspace(projectPath(project.id, section));
  }
  function returnToResearch() {
    navigateWorkspace(project ? projectPath(project.id, route.tab) : '/');
  }
  useEffect(() => {
    setRecovery(new URLSearchParams(window.location.search).has('token'));
  }, []);
  if (!configured || !ready || !session || recovery) {
    return (
      <div className="public-shell">
        <a className="skip-link" href="#main-content">
          {t('跳到主要内容')}
        </a>
        <header className="public-header">
          <Link
            href="/"
            className="brand public-brand"
            aria-label={t('ClioForge 参伍')}
          >
            <ClioForgeBrand tagline={t('人文研究工作台')} />
          </Link>
          <div className="appearance-actions">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </header>
        <main id="main-content" className="public-main" tabIndex={-1}>
          {authError && <Notice text={authError} />}
          {invited && (
            <Notice
              text={t('请使用受邀邮箱登录或注册，登录后可查看并接受项目邀请。')}
            />
          )}
          {!configured ? (
            <SetupState />
          ) : !ready ? (
            <output className="session-loading" aria-live="polite">
              <LoaderCircle className="animate-spin" size={22} />
              {t('正在连接…')}
            </output>
          ) : (
            <AuthForm
              googleAvailable={googleAvailable}
              recovery={recovery}
              onRecovered={() => {
                setRecovery(false);
                window.history.replaceState(null, '', window.location.pathname);
              }}
            />
          )}
        </main>
        <footer className="public-footer">
          {t('参伍 · 让材料彼此参照，让判断有所依据。')}
          <Link href="/privacy">{t('隐私与资料')}</Link>
          <a href={SOURCE_CODE_URL}>
            {locale === 'en' ? 'Source code' : '源代码'}
          </a>
        </footer>
      </div>
    );
  }
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '17rem' } as React.CSSProperties}
    >
      <ResponsiveSidebar
        routeKey={`${route.projectId}:${route.tab}:${route.settings}:${route.guide}:${route.inbox}`}
      />
      <a className="skip-link" href="#main-content">
        {t('跳到主要内容')}
      </a>
      <Sidebar>
        <SidebarHeader className="brand">
          <ClioForgeBrand tagline={t('人文研究工作台')} />
        </SidebarHeader>
        <SidebarContent className="workspace-sidebar-content">
          <WorkspaceNavigation
            project={project}
            active={route.tab}
            settings={route.settings}
            counts={counts}
            onProject={openProject}
            onSection={openSection}
            onSettings={openSettings}
            onProjects={() => openProject(null)}
            onInbox={() => navigateWorkspace('/?view=inbox')}
            inbox={route.inbox}
            onBack={returnToResearch}
          />
        </SidebarContent>
        <SidebarFooter className="sidebar-footer">
          <Button
            className="workspace-help-link"
            variant="ghost"
            onClick={() =>
              navigateWorkspace(
                `/?view=guide${project ? `&project=${project.id}&tab=${route.tab}` : ''}`,
              )
            }
          >
            <BookOpen size={17} />
            {t('使用指南')}
          </Button>
          <button
            className="account-row account-settings-trigger"
            onClick={() => openSettings()}
            aria-label={
              locale === 'en' ? 'Open account settings' : '打开账号设置'
            }
          >
            <span className="user-avatar" aria-hidden="true">
              {(session.user.name || session.user.email)
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <span className="account-detail">
              <strong>{session.user.name}</strong>
              <span>{locale === 'en' ? 'Account settings' : '账号设置'}</span>
            </span>
            <Settings2 size={18} />
          </button>
          <a className="workspace-source-link" href={SOURCE_CODE_URL}>
            {locale === 'en' ? 'Open source · AGPL v3' : '开源代码 · AGPL v3'}
          </a>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="workspace-main">
        <header className="workspace-bar">
          <div className="workspace-breadcrumb">
            <SidebarTrigger
              aria-label={t('展开或收起导航')}
              title={t('展开或收起导航（⌘/Ctrl B）')}
            />
            <nav
              aria-label={locale === 'en' ? 'Breadcrumb' : '当前位置'}
              className="workspace-path"
            >
              <ol>
                <li className="breadcrumb-root">
                  <Link prefetch={false} href="/" onClick={followBreadcrumb}>
                    {t('工作台')}
                  </Link>
                </li>
                <li aria-hidden="true" className="breadcrumb-separator">
                  <ChevronRight size={14} />
                </li>
                {project && view === 'projects' && (
                  <>
                    <li className="breadcrumb-project">
                      <Link
                        prefetch={false}
                        href={projectPath(project.id)}
                        onClick={followBreadcrumb}
                        title={project.title}
                      >
                        {project.title}
                      </Link>
                    </li>
                    <li aria-hidden="true" className="breadcrumb-separator">
                      <ChevronRight size={14} />
                    </li>
                  </>
                )}
                <li className="breadcrumb-current" aria-current="page">
                  {view === 'settings'
                    ? locale === 'en'
                      ? 'Account settings'
                      : '账号设置'
                    : view === 'inbox'
                      ? locale === 'en'
                        ? 'Research inbox'
                        : '研究收件箱'
                      : view === 'guide'
                        ? locale === 'en'
                          ? 'Research guide'
                          : '使用指南'
                        : project
                          ? projectSections.find(
                              (item) => item.id === route.tab,
                            )?.[locale === 'en' ? 'en' : 'zh']
                          : locale === 'en'
                            ? 'My research'
                            : '我的研究'}
                </li>
              </ol>
            </nav>
          </div>
          <div className="workspace-bar-actions">
            <ThemeSwitcher />
            <LanguageSwitcher />
            <span className="edition">
              <span /> Alpha
            </span>
          </div>
        </header>
        <main className="workspace-body" id="main-content" tabIndex={-1}>
          {authError && <Notice text={authError} />}
          {view === 'guide' ? (
            <ResearchGuide onStart={returnToResearch} />
          ) : view === 'settings' ? (
            <AccountSettings
              section={route.settings}
              user={session.user}
              project={project}
              onReturn={returnToResearch}
              onProjectSection={openSection}
              onUpdated={refetchSession}
            />
          ) : view === 'inbox' ? (
            <ResearchInbox />
          ) : route.projectId && !project && !authError ? (
            <output className="settings-loading">
              <LoaderCircle className="animate-spin" size={20} />
              {locale === 'en' ? 'Opening your project…' : '正在打开研究项目…'}
            </output>
          ) : project ? (
            <ProjectDesk
              key={project.id}
              project={project}
              userId={session.user.id}
              tab={route.tab}
              onNavigate={openSection}
              onCounts={setCounts}
              onProjectUpdated={setProject}
              onAssistantSettings={() => openSettings('models')}
            />
          ) : (
            <Projects
              key={session.user.id}
              userId={session.user.id}
              onOpen={openProject}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
export function Notice({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <output className="notice" aria-live="polite">
      {t(text)}
    </output>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="form-field">
      <Label className="block">
        <span className="field-label">{t(label)}</span>
        {children}
      </Label>
    </div>
  );
}
function SetupState() {
  const { t } = useI18n();
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">{t('连接你的研究')}</p>
          <h1>{t('让每一次发现，都有来处')}</h1>
          <p className="text-muted-foreground mt-3">
            {t('从原始材料走向可以核查的研究判断。')}
          </p>
        </div>
      </div>
      <section className="empty-project">
        <div className="folio-mark">
          <BookOpen size={36} strokeWidth={1.2} />
        </div>
        <h2>{t('你的研究工作区正在准备中')}</h2>
        <p>{t('连接账户服务后，即可创建私人项目并导入第一份材料。')}</p>
        <div className="workflow-line">
          <span>{t('保存原件')}</span>
          <span>→</span>
          <span>{t('阅读与校订')}</span>
          <span>→</span>
          <span>{t('关联证据')}</span>
          <span>→</span>
          <span>{t('继续追问')}</span>
        </div>
      </section>
      <Notice
        text={t(
          '开发配置：请按项目 README 配置 Cloudflare D1、R2 和认证密钥，并应用数据库迁移。当前没有加载演示资料。',
        )}
      />
    </>
  );
}
function AuthForm({
  recovery,
  onRecovered,
  googleAvailable,
}: {
  recovery: boolean;
  onRecovered: () => void;
  googleAvailable: boolean;
}) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function googleSignIn() {
    setBusy(true);
    setMessage('');
    try {
      const callbackURL = authReturnPath(
        window.location.pathname + window.location.search,
      );
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL: `${callbackURL}${callbackURL.includes('?') ? '&' : '?'}error=google`,
      });
      if (result.error)
        throw new Error(t('Google 登录暂不可用，请重试或使用邮箱。'));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('Google 登录未完成。'),
      );
      setBusy(false);
    }
  }
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const email = form.get('email') as string;
      const password = form.get('password') as string;
      const callbackURL = authReturnPath(
        window.location.pathname + window.location.search,
      );
      const result = recovery
        ? await authClient.resetPassword({
            newPassword: password,
            token:
              new URLSearchParams(window.location.search).get('token') || '',
          })
        : mode === 'signup'
          ? await authClient.signUp.email({
              email,
              password,
              name: email.split('@')[0],
              callbackURL,
            })
          : mode === 'reset'
            ? await authClient.requestPasswordReset({
                email,
                redirectTo: window.location.origin,
              })
            : await authClient.signIn.email({ email, password, callbackURL });
      if (result.error) {
        const errors: Record<string, string> = {
          INVALID_EMAIL_OR_PASSWORD: '邮箱或密码不正确。',
          INVALID_PASSWORD: '邮箱或密码不正确。',
          EMAIL_NOT_VERIFIED: '请先验证邮箱。',
          USER_ALREADY_EXISTS: '此邮箱已有账户，请登录。',
          USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '此邮箱已有账户，请登录。',
          PASSWORD_TOO_SHORT: '密码至少需要 10 个字符。',
          TOO_MANY_REQUESTS: '请求过于频繁，请稍后重试。',
          INVALID_TOKEN: '验证链接无效或已过期。',
          TOKEN_EXPIRED: '验证链接无效或已过期。',
        };
        throw new Error(
          errors[result.error.code || ''] ||
            result.error.message ||
            '账户操作失败。',
        );
      }
      if (recovery) onRecovered();
      else if (mode === 'signup')
        setMessage('注册请求已提交。需要验证邮箱时，请点击邮件中的确认链接。');
      else if (mode === 'reset')
        setMessage('如该邮箱可接收重置邮件，请按邮件中的链接继续。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout">
      <div className="auth-intro">
        <div className="auth-fan-study">
          <ClioForgeMark className="auth-fan" compact />
          <span className="auth-study-caption">
            {locale === 'en'
              ? 'Many sources. A clearer view.'
              : '参照众说，求得新知。'}
          </span>
        </div>
        <h2>
          {t('让每一次发现，')}
          <br />
          {locale === 'en' && ' '}
          {t('都有来处。')}
        </h2>
        <p className="intro-description">
          {t('从一份史料、一个疑问开始。')}
          <br />
          {locale === 'en' && ' '}
          {t('把阅读、证据与思考，放回同一张书桌。')}
        </p>
        <div className="auth-history-space" aria-hidden="true" />
        <p className="auth-research-promise">
          {locale === 'en'
            ? 'Read with AI. Follow every citation. Keep the final judgment yours.'
            : '与 AI 一起阅读与追问。每条引用可回溯，每个判断由你审读。'}
        </p>
      </div>
      <div className="auth-panel">
        <span className="auth-space-label">
          <ShieldCheck size={14} />
          {t('私人研究空间')}
        </span>
        <h1>
          {recovery
            ? t('设置新密码')
            : mode === 'signup'
              ? t('创建研究账户')
              : mode === 'reset'
                ? t('找回密码')
                : t('回到你的研究')}
        </h1>
        <p className="text-muted-foreground mb-7">
          {t('材料、笔记和研究判断，保存在你的私人空间。')}
        </p>
        {!recovery && mode !== 'reset' && googleAvailable && (
          <div className="social-signin">
            <Button
              type="button"
              className="google-signin"
              variant="outline"
              disabled={busy}
              onClick={() => void googleSignIn()}
            >
              <GoogleMark />
              {t('使用 Google 继续')}
            </Button>
            <p>{t('首次使用会为你创建私人研究账户。')}</p>
            <div className="auth-divider">
              <span>{t('或使用邮箱')}</span>
            </div>
          </div>
        )}
        <form onSubmit={submit} className="space-y-5">
          {!recovery && (
            <Field label={t('邮箱')}>
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
          )}
          {(recovery || mode !== 'reset') && (
            <div className="form-field auth-password-field">
              <Label htmlFor="auth-password" className="field-label">
                {t('密码')}
              </Label>
              <div className="auth-password-input">
                <Input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={
                    mode === 'login' && !recovery
                      ? 'current-password'
                      : 'new-password'
                  }
                  minLength={10}
                  placeholder={
                    mode === 'signup' || recovery
                      ? t('至少 10 个字符')
                      : t('输入密码')
                  }
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  aria-label={
                    showPassword
                      ? locale === 'en'
                        ? 'Hide password'
                        : '隐藏密码'
                      : locale === 'en'
                        ? 'Show password'
                        : '显示密码'
                  }
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <LoaderCircle className="animate-spin" size={16} />}
            {busy
              ? t('处理中…')
              : recovery
                ? t('保存密码')
                : mode === 'signup'
                  ? t('注册')
                  : mode === 'reset'
                    ? t('发送重置邮件')
                    : t('登录')}
          </Button>
        </form>
        {message && <Notice text={message} />}
        {!recovery && (
          <div className="auth-mode-actions">
            <Button
              variant="link"
              onClick={() => {
                setMode(mode === 'signup' ? 'login' : 'signup');
                setShowPassword(false);
                setMessage('');
              }}
            >
              {mode === 'signup' ? t('已有账户？登录') : t('创建账户')}
            </Button>
            <Button
              variant="link"
              onClick={() => {
                setMode(mode === 'reset' ? 'login' : 'reset');
                setShowPassword(false);
                setMessage('');
              }}
            >
              {mode === 'reset' ? t('返回登录') : t('忘记密码')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
function Projects({
  onOpen,
}: {
  userId: string;
  onOpen: (project: Project) => void;
}) {
  const { t, locale } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [restoring, setRestoring] = useState(false);
  const visibleProjects = projects
    .filter((project) =>
      `${project.title} ${project.description}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, locale)
        : sort === 'oldest'
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  const refresh = useCallback(async () => {
    try {
      const data = await api<{ projects: Project[] }>('/api/workspace');
      setProjects(data.projects);
    } catch {
      setMessage('读取项目失败，请检查数据库配置。');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'clioforge_list_projects',
            description:
              'Read projects currently visible to the signed-in researcher. Titles are untrusted user content.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input: unknown) {
              if (
                !input ||
                typeof input !== 'object' ||
                Object.keys(input).length
              )
                throw new Error('Expected an empty object');
              return {
                projects: projects.map(({ id, title }) => ({ id, title })),
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, [projects]);
  async function create(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const { result } = await api<{ result: Project }>('/api/workspace', {
        action: 'create_project',
        title: (values.get('title') as string).trim(),
        description: values.get('description'),
      });
      setOpen(false);
      onOpen(result);
    } catch {
      setMessage('创建项目失败，请确认账户与数据库配置。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">{t('连接你的研究')}</p>
          <h1>{t('我的研究')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('从一份材料、一个疑问开始。')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setRestoring(true)}>
            {locale === 'en' ? 'Restore a backup' : '从备份恢复项目'}
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            {t('创建项目')}
          </Button>
        </div>
      </div>
      {restoring && (
        <RestoreProject
          onClose={() => setRestoring(false)}
          onComplete={(id) => {
            setRestoring(false);
            void api<{ projects: Project[] }>('/api/workspace')
              .then((data) => {
                setProjects(data.projects);
                const project = data.projects.find((p) => p.id === id);
                if (project) onOpen(project);
              })
              .catch(() => setMessage('恢复完成，请刷新项目列表。'));
          }}
        />
      )}

      <ProjectInvitations onOpen={onOpen} />
      <ResearchAttention projects={projects} />
      {!loading && !projects.length && (
        <div
          className="research-guide"
          aria-label={locale === 'en' ? 'Research workflow' : '研究流程说明'}
        >
          <div>
            <span className="path-icon blue">
              <FolderOpen size={21} />
            </span>
            <div>
              <h2>{t('从材料开始')}</h2>
              <p>{t('收集 PDF、照片与文本')}</p>
            </div>
            <span className="step-number">01</span>
          </div>
          <div>
            <span className="path-icon green">
              <Quote size={21} />
            </span>
            <div>
              <h2>{t('让证据说话')}</h2>
              <p>{t('将原文关联到研究问题')}</p>
            </div>
            <span className="step-number">02</span>
          </div>
          <div>
            <span className="path-icon purple">
              <Sparkles size={21} />
            </span>
            <div>
              <h2>{t('继续追问')}</h2>
              <p>{t('用 AI 发现待核查的线索')}</p>
            </div>
            <span className="step-number">03</span>
          </div>
        </div>
      )}
      {message && <Notice text={message} />}
      <div className="collection-toolbar">
        <div className="search-field">
          <Search size={19} aria-hidden="true" />
          <Input
            aria-label={t('搜索研究项目')}
            placeholder={t('搜索项目名称或研究范围')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('清除项目搜索')}
              onClick={() => setSearch('')}
            >
              <X size={16} />
            </Button>
          )}
        </div>
        <NativeSelect
          aria-label={t('项目排序')}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <NativeSelectOption value="newest">
            {t('最近创建')}
          </NativeSelectOption>
          <NativeSelectOption value="oldest">
            {t('最早创建')}
          </NativeSelectOption>
          <NativeSelectOption value="title">
            {t('按名称排序')}
          </NativeSelectOption>
        </NativeSelect>
        <fieldset className="view-switch" aria-label={t('项目显示方式')}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('网格视图')}
            aria-pressed={layout === 'grid'}
            onClick={() => setLayout('grid')}
          >
            <LayoutGrid size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('列表视图')}
            aria-pressed={layout === 'list'}
            onClick={() => setLayout('list')}
          >
            <List size={19} />
          </Button>
        </fieldset>
      </div>
      <div className="collection-heading">
        <h2>{t('研究项目')}</h2>
        <span aria-live="polite">
          {loading
            ? t('正在读取…')
            : t('{0} 个项目{1}', {
                0: visibleProjects.length,
                1: search.trim() ? ` · 共 ${projects.length} 个` : '',
              })}
        </span>
      </div>
      {loading ? (
        <div
          className="project-grid"
          aria-label={t('正在读取项目')}
          aria-busy="true"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="project-skeleton" />
          ))}
        </div>
      ) : visibleProjects.length ? (
        <div className={layout === 'grid' ? 'project-grid' : 'project-list'}>
          {visibleProjects.map((p) => (
            <button
              key={p.id}
              className="project-card research-project-card text-left"
              aria-label={
                locale === 'en'
                  ? `Open project: ${p.title}`
                  : `打开项目：${p.title}`
              }
              onClick={() => onOpen(p)}
            >
              <div className="project-card-top">
                <span className="project-folder">
                  <FolderOpen size={24} strokeWidth={1.7} />
                </span>
                <span className="project-open-label">
                  {locale === 'en' ? 'Open project' : '打开项目'}
                  <ArrowUpRight
                    size={16}
                    className="card-open-arrow"
                    aria-hidden="true"
                  />
                </span>
              </div>
              <div className="project-card-copy">
                <h2>{p.title}</h2>
                <p>
                  {p.description || t('打开项目，继续整理材料与研究问题。')}
                </p>
              </div>
              <div className="project-card-meta">
                <span>
                  <ShieldCheck size={13} />
                  {t('私人项目')}
                </span>
                <time>
                  {t('创建于 {0}', {
                    0: new Date(p.created_at).toLocaleDateString(locale),
                  })}
                </time>
              </div>
            </button>
          ))}
        </div>
      ) : projects.length ? (
        <section className="empty-project search-empty">
          <Search size={32} />
          <h2>{t('没有匹配的项目')}</h2>
          <p>{t('试试更短的关键词，或清除搜索查看全部项目。')}</p>
          <Button variant="secondary" onClick={() => setSearch('')}>
            {t('清除搜索')}
          </Button>
        </section>
      ) : (
        <section className="empty-project">
          <div className="folio-mark">
            <BookOpen size={36} strokeWidth={1.2} />
          </div>
          <h2>{t('给下一项研究一个工作空间')}</h2>
          <p>{t('把原始材料、阅读笔记和证据放在同一个项目中。')}</p>
          <Button
            variant="outline"
            className="mt-7"
            onClick={() => setOpen(true)}
          >
            {t('创建第一个项目')}
          </Button>
        </section>
      )}
      <div className="workspace-note">
        <GitBranch size={18} />
        <p>{t('原件保留，校订另存版本，引用固定出处。')}</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('创建研究项目')}</DialogTitle>
            <DialogDescription>
              {t('一个主题、一组材料，或一个尚未回答的问题。')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-5">
            <Field label={t('项目名称')}>
              <Input
                name="title"
                required
                maxLength={200}
                placeholder={t('例如：近代港口城市中的迁徙网络')}
              />
            </Field>
            <Field label={t('研究范围')}>
              <Textarea
                name="description"
                maxLength={10000}
                placeholder={t('记录时期、地区和你关心的问题…')}
              />
            </Field>
            <div className="form-actions">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setOpen(false)}
              >
                {t('取消')}
              </Button>
              <Button disabled={busy} type="submit">
                {busy ? t('正在创建…') : t('创建项目')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
