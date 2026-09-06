'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  HardDrive,
  Laptop,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  Smartphone,
  Unplug,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api, downloadJson } from '@/lib/client-api';
import { authClient } from '@/lib/auth-client';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/platform-contact';
import { useI18n } from '@/lib/i18n/provider';
import { accountSections } from '@/lib/navigation';
import type { AccountOverview } from '@/lib/account-settings';
import type { Project } from '@/lib/types';
import { Field } from './workspace';
import { formText } from '@/lib/form-values';
import ResearchAttention from './research-attention';
import ModelSettings from './model-settings';
import DeleteAccount from './delete-account';
function device(agent: string | null) {
  if (!agent) return 'Browser';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\//.test(agent)
      ? 'Firefox'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Browser';
  const os = /iPhone|iPad/.test(agent)
    ? 'iOS'
    : /Android/.test(agent)
      ? 'Android'
      : /Mac/.test(agent)
        ? 'macOS'
        : /Windows/.test(agent)
          ? 'Windows'
          : /Linux/.test(agent)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ');
}
export default function AccountSettings({
  section,
  user,
  project,
  onReturn,
  onProjectSection,
  onUpdated,
}: {
  section: string;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
  };
  project: Project | null;
  onReturn: () => void;
  onProjectSection: (section: string) => void;
  onUpdated: () => Promise<unknown>;
}) {
  const { locale, setLocale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<AccountOverview | null>(null);
  const [name, setName] = useState(user.name);
  const [language, setLanguage] = useState(locale);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [disconnect, setDisconnect] = useState(false);
  const [connection, setConnection] = useState<{
    connected: boolean;
    configured: boolean;
  } | null>(null);
  useEffect(() => {
    setError('');
    setMessage('');
  }, [section]);
  const refresh = useCallback(async () => {
    const overview = await api<AccountOverview>('/api/account');
    setData(overview);
    if (overview.locale) setLanguage(overview.locale);
  }, []);
  useEffect(() => {
    void refresh().catch(() =>
      setError(
        locale === 'en'
          ? 'Could not load settings. Please retry.'
          : '设置读取失败，请重试。',
      ),
    );
  }, [refresh, locale]);
  useEffect(() => {
    if (section === 'connections')
      void api<{ connections: { connected: boolean; configured: boolean }[] }>(
        '/api/connections',
      )
        .then((value) => setConnection(value.connections[0] || null))
        .catch(() =>
          setError(
            locale === 'en'
              ? 'Could not check Google Drive.'
              : '暂时无法读取 Google Drive 连接。',
          ),
        );
  }, [section, locale]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : L('操作未完成，请重试。', 'Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }
  const selected =
    accountSections.find((item) => item.id === section) || accountSections[0];
  const mb = (bytes: number) =>
    (bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 });
  const money = (units: number) => `$${(units / 1_000_000).toFixed(4)}`;
  return (
    <div className="account-settings">
      <div className="page-title">
        <div>
          <p className="eyebrow">{L('账号设置', 'ACCOUNT SETTINGS')}</p>
          <h1>{L(selected.zh, selected.en)}</h1>
          <p>
            {L(
              '管理你的个人资料、登录方式和研究服务。',
              'Manage your profile, sign-in and research services.',
            )}
          </p>
        </div>
      </div>
      {error && (
        <div className="settings-feedback error" role="alert">
          {error}
          <Button size="sm" variant="ghost" onClick={() => void act(refresh)}>
            {L('重试', 'Retry')}
          </Button>
        </div>
      )}
      {message && (
        <output className="settings-feedback">
          <CheckCircle2 size={17} />
          {message}
        </output>
      )}
      {section === 'models' ? (
        <ModelSettings embedded />
      ) : !data ? (
        <output className="settings-loading">
          <LoaderCircle className="animate-spin" size={19} />
          {L('正在读取账号…', 'Loading your account…')}
        </output>
      ) : (
        <>
          {section === 'profile' && (
            <form
              className="settings-card"
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  await api('/api/account', {
                    action: 'profile',
                    name,
                    locale: language,
                  });
                  setLocale(language);
                  await onUpdated();
                  setMessage(
                    L(
                      '个人资料与默认语言已保存。',
                      'Profile and default language saved.',
                    ),
                  );
                });
              }}
            >
              <div className="settings-card-heading">
                <UserRound size={21} />
                <div>
                  <h2>{L('你的个人资料', 'Your profile')}</h2>
                  <p>
                    {L(
                      '这个名字会显示在项目成员与讨论中。',
                      'This name appears in project membership and discussions.',
                    )}
                  </p>
                </div>
              </div>
              <Field label={L('显示名称', 'Display name')}>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </Field>
              <Field label={L('登录邮箱', 'Sign-in email')}>
                <Input value={user.email} readOnly type="email" />
              </Field>
              <p className="settings-hint">
                {user.emailVerified
                  ? L('邮箱已验证', 'Email verified')
                  : L('邮箱尚未验证', 'Email not verified')}
              </p>
              <Field label={L('默认界面语言', 'Default interface language')}>
                <NativeSelect
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as 'zh-CN' | 'en')
                  }
                >
                  <NativeSelectOption value="zh-CN">
                    简体中文
                  </NativeSelectOption>
                  <NativeSelectOption value="en">English</NativeSelectOption>
                </NativeSelect>
              </Field>
              <p className="settings-hint">
                {L(
                  '影响界面，不会翻译或改写你的原始材料。',
                  'Changes the interface; your source texts stay as written.',
                )}
              </p>
              <div className="settings-card-footer">
                <small>
                  {L('加入于', 'Joined')}{' '}
                  {new Date(user.createdAt).toLocaleDateString(locale)}
                </small>
                <Button type="submit" disabled={busy}>
                  {L('保存更改', 'Save changes')}
                </Button>
              </div>
            </form>
          )}
          {section === 'profile' && <ResearchAttention settings />}
          {section === 'security' && (
            <>
              <section className="settings-card">
                <div className="settings-card-heading">
                  <ShieldCheck size={21} />
                  <div>
                    <h2>{L('登录方式', 'Sign-in methods')}</h2>
                    <p>
                      {L(
                        '账号可用的登录方式。Google Drive 授权在关联服务中管理。',
                        'Available sign-in methods. Drive access is managed separately in Connected services.',
                      )}
                    </p>
                  </div>
                </div>
                {data.providers.map((provider) => (
                  <div className="settings-row" key={provider}>
                    <strong>
                      {provider === 'credential'
                        ? L('邮箱与密码', 'Email and password')
                        : provider === 'google'
                          ? 'Google'
                          : provider}
                    </strong>
                    <span className="status-tag">
                      {L('已关联', 'Connected')}
                    </span>
                  </div>
                ))}
                {data.providers.includes('credential') && (
                  <form
                    className="settings-password"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const values = new FormData(form);
                      void act(async () => {
                        if (values.get('new') !== values.get('confirm'))
                          throw new Error(
                            L(
                              '两次输入的新密码不一致。',
                              'The new passwords do not match.',
                            ),
                          );
                        const result = await authClient.changePassword({
                          currentPassword: formText(values, 'current'),
                          newPassword: formText(values, 'new'),
                          revokeOtherSessions: true,
                        });
                        if (result.error)
                          throw new Error(
                            L(
                              '密码修改失败，请检查当前密码后重试。',
                              'Could not change password. Check your current password and retry.',
                            ),
                          );
                        form.reset();
                        await refresh();
                        setMessage(
                          L(
                            '密码已更新，其他设备已退出登录。',
                            'Password updated; other sessions signed out.',
                          ),
                        );
                      });
                    }}
                  >
                    <h3>{L('修改密码', 'Change password')}</h3>
                    <Field label={L('当前密码', 'Current password')}>
                      <Input
                        name="current"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    </Field>
                    <Field
                      label={L(
                        '新密码（至少 10 位）',
                        'New password (at least 10 characters)',
                      )}
                    >
                      <Input
                        name="new"
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        maxLength={128}
                        required
                      />
                    </Field>
                    <Field label={L('再次输入新密码', 'Confirm new password')}>
                      <Input
                        name="confirm"
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        maxLength={128}
                        required
                      />
                    </Field>
                    <Button variant="outline" type="submit" disabled={busy}>
                      {L('更新密码', 'Update password')}
                    </Button>
                  </form>
                )}
                {!data.providers.includes('credential') && (
                  <p className="settings-hint">
                    {L(
                      '你使用 Google 登录，密码由 Google 管理。',
                      'You sign in with Google; your password is managed by Google.',
                    )}
                  </p>
                )}
              </section>
              <section className="settings-card">
                <div className="settings-card-heading">
                  <Laptop size={21} />
                  <div>
                    <h2>{L('登录设备', 'Active sessions')}</h2>
                    <p>
                      {L(
                        '结束不再使用的登录。不会删除研究资料。',
                        'Sign out devices you no longer use. Research data is retained.',
                      )}
                    </p>
                  </div>
                </div>
                {data.sessions.map((session) => (
                  <div className="settings-row session-row" key={session.id}>
                    {/Android|iPhone|iPad/.test(session.user_agent || '') ? (
                      <Smartphone size={21} />
                    ) : (
                      <Laptop size={21} />
                    )}
                    <div>
                      <strong>{device(session.user_agent)}</strong>
                      <small>
                        {L('最近活跃', 'Last active')} ·{' '}
                        {new Date(session.updated_at).toLocaleString(locale)}
                      </small>
                    </div>
                    {session.current ? (
                      <span className="status-tag">
                        {L('当前设备', 'This device')}
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api('/api/account', {
                              action: 'revoke_session',
                              id: session.id,
                            });
                            await refresh();
                            setMessage(
                              L('该设备已退出登录。', 'Device signed out.'),
                            );
                          })
                        }
                      >
                        {L('退出此设备', 'Sign out')}
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={busy || data.sessions.length < 2}
                  onClick={() =>
                    void act(async () => {
                      await api('/api/account', {
                        action: 'revoke_other_sessions',
                      });
                      await refresh();
                      setMessage(
                        L('其他设备已退出登录。', 'Other devices signed out.'),
                      );
                    })
                  }
                >
                  {L('退出其他所有设备', 'Sign out all other devices')}
                </Button>
              </section>
            </>
          )}
          {section === 'connections' && (
            <>
              <section className="settings-card">
                <div className="settings-card-heading">
                  <HardDrive size={21} />
                  <div>
                    <h2>Google Drive</h2>
                    <p>
                      {L(
                        '只导入你选定的资料。云端原件保持原样。',
                        'Import files you choose. Originals in Drive are unchanged.',
                      )}
                    </p>
                  </div>
                </div>
                <div className="settings-row">
                  <span>
                    {connection
                      ? connection.connected
                        ? L('已连接', 'Connected')
                        : L('尚未连接', 'Not connected')
                      : L('正在检查连接…', 'Checking connection…')}
                  </span>
                  {connection?.connected && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setDisconnect(true)}
                    >
                      <Unplug size={16} />
                      {L('断开连接', 'Disconnect')}
                    </Button>
                  )}
                </div>
                <Button
                  onClick={() =>
                    project ? onProjectSection('drive') : onReturn()
                  }
                >
                  {project
                    ? L('在当前项目中选择文件', 'Choose files for this project')
                    : L(
                        '选择研究项目后导入',
                        'Choose a project to import into',
                      )}
                </Button>
              </section>
              <section className="settings-card">
                <h2>Zotero</h2>
                <p>
                  {L(
                    '在项目的「书目」中预览导入文献。Canwoo 不保存你的 Zotero key。',
                    'Preview and import references from Bibliography in a project. Canwoo does not store your Zotero key.',
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    project ? onProjectSection('bibliography') : onReturn()
                  }
                >
                  {L('前往项目书目', 'Open project bibliography')}
                </Button>
              </section>
            </>
          )}
          {section === 'usage' && (
            <>
              <section className="settings-card">
                <div className="settings-card-heading">
                  <HardDrive size={21} />
                  <div>
                    <h2>{L('原件存储', 'Original file storage')}</h2>
                    <p>
                      {L(
                        '按本账号上传的原件计算，包含正在完成的上传预留。',
                        'Files uploaded by this account, including storage reserved for unfinished uploads.',
                      )}
                    </p>
                  </div>
                </div>
                <div className="usage-total">
                  {mb(data.storage.used)}{' '}
                  <small>/ {mb(data.storage.limit)} MiB</small>
                </div>
                <progress
                  className="storage-meter"
                  value={Math.min(data.storage.used, data.storage.limit)}
                  max={data.storage.limit}
                />
                <p className="settings-hint">
                  {L('你负责的项目', 'Projects you own')} ·{' '}
                  {data.owned_projects}
                </p>
              </section>
              <section className="settings-card">
                <h2>
                  {L('本月研究助手用量', 'Research assistance this month')}
                </h2>
                <p>
                  {L(
                    '从本月 1 日（UTC）起，按你的模型连接发起的任务统计。',
                    'Tasks using your model connections since the first day of this month (UTC).',
                  )}
                </p>
                <dl className="usage-grid">
                  <div>
                    <dt>{L('任务尝试', 'Task attempts')}</dt>
                    <dd>
                      {data.usage.direct.attempts +
                        data.usage.background.attempts}
                    </dd>
                  </div>
                  <div>
                    <dt>{L('输入 / 输出用量', 'Input / output tokens')}</dt>
                    <dd>
                      {(
                        data.usage.direct.input_tokens +
                        data.usage.background.input_tokens
                      ).toLocaleString()}{' '}
                      /{' '}
                      {(
                        data.usage.direct.output_tokens +
                        data.usage.background.output_tokens
                      ).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {L(
                        '研究助手估算费用',
                        'Estimated research assistance cost',
                      )}
                    </dt>
                    <dd>
                      {money(
                        data.usage.background.estimated_units +
                          data.usage.direct.estimated_units,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{L('未结算的预算预留', 'Unsettled reservations')}</dt>
                    <dd>
                      {money(
                        data.usage.background.reserved_units +
                          data.usage.direct.reserved_units,
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="settings-hint">
                  {L(
                    'OCR、即时分析和后台任务现在共同使用项目预算。金额按保存的费率估算，实际费用以模型厂商为准；升级前的调用只保留用量，未补算历史费用。',
                    'OCR, direct analysis and background tasks share the project budget. Costs are estimates at saved rates; your provider determines the actual charge. Calls before this upgrade retain usage without reconstructed historical costs.',
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    project ? onProjectSection('runs') : onReturn()
                  }
                >
                  {L('查看项目任务与预算', 'View project tasks and budget')}
                </Button>
              </section>
              <section className="settings-card">
                <h2>{L('你的数据', 'Your data')}</h2>
                <p>
                  {L(
                    '项目里的原件、笔记和研究记录可以带走。账号信息导出不含密码、模型密钥或登录凭据。',
                    'Keep copies of your sources, notes and research records. Account exports exclude passwords, model keys and sign-in credentials.',
                  )}
                </p>
                <div className="settings-actions">
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadJson(
                        {
                          exported_at: new Date().toISOString(),
                          profile: user,
                          locale: data.locale,
                          storage: data.storage,
                          usage: data.usage,
                        },
                        'canwoo-account.json',
                      )
                    }
                  >
                    <Download size={16} />
                    {L('导出账号信息', 'Export account information')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      project ? onProjectSection('data') : onReturn()
                    }
                  >
                    {L('导出研究项目', 'Export a research project')}
                  </Button>
                  <a href="/privacy" target="_blank" rel="noreferrer">
                    {L('隐私与资料', 'Privacy & data')}{' '}
                    <ExternalLink size={14} />
                  </a>
                </div>
              </section>
              <section className="settings-card">
                <h2>{L('需要帮助？', 'Need help?')}</h2>
                <p>
                  {L(
                    '备份恢复或资料清理遇到问题时，可以联系支持。删除账号请使用下方独立入口并核对项目清单。',
                    'Contact support if you need help with restoring a backup or cleaning up data. To delete your account, use the separate control below and review its project list.',
                  )}
                </p>
                <a className="settings-contact" href={SUPPORT_MAILTO}>
                  {SUPPORT_EMAIL} <ExternalLink size={14} />
                </a>
              </section>
              <DeleteAccount userId={user.id} />
            </>
          )}
        </>
      )}
      <Dialog open={disconnect} onOpenChange={setDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {L('断开 Google Drive？', 'Disconnect Google Drive?')}
            </DialogTitle>
            <DialogDescription>
              {L(
                'Canwoo 会移除此账号的云盘授权。已导入项目的原件仍保留，Google 登录也不受影响。',
                'Remove this account’s Drive authorization. Imported sources and Google sign-in are retained.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="settings-actions">
            <Button variant="outline" onClick={() => setDisconnect(false)}>
              {L('取消', 'Cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api('/api/connections', {
                    action: 'disconnect',
                    provider: 'google',
                  });
                  setConnection((current) =>
                    current ? { ...current, connected: false } : null,
                  );
                  setDisconnect(false);
                  setMessage(
                    L('Google Drive 已断开。', 'Google Drive disconnected.'),
                  );
                })
              }
            >
              {L('断开连接', 'Disconnect')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="settings-signout">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const result = await authClient.signOut();
              if (result.error)
                throw new Error(
                  L('退出失败，请重试。', 'Could not sign out. Please retry.'),
                );
            })
          }
        >
          <LogOut size={16} />
          {L('退出当前账号', 'Sign out')}
        </Button>
      </div>
    </div>
  );
}
