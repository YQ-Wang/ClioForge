const projectIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const projectSections = [
  { id: 'overview', zh: '项目概览', en: 'Overview', group: 'overview' },
  {
    id: 'sources',
    zh: '资料与阅读',
    en: 'Sources & reading',
    group: 'sources',
  },
  { id: 'search', zh: '检索材料', en: 'Search sources', group: 'sources' },
  { id: 'bibliography', zh: '书目', en: 'Bibliography', group: 'sources' },
  { id: 'drive', zh: 'Google Drive', en: 'Google Drive', group: 'sources' },
  { id: 'notes', zh: '笔记与写作', en: 'Notes & writing', group: 'writing' },
  { id: 'evidence', zh: '证据摘录', en: 'Evidence', group: 'writing' },
  {
    id: 'arguments',
    zh: '问题与论证',
    en: 'Questions & arguments',
    group: 'writing',
  },
  { id: 'platform', zh: '研究计划', en: 'Research plans', group: 'research' },
  { id: 'findings', zh: '研究成果', en: 'Findings', group: 'research' },
  {
    id: 'team',
    zh: '成员与讨论',
    en: 'People & discussion',
    group: 'research',
  },
  { id: 'runs', zh: '任务与关注', en: 'Tasks & watches', group: 'manage' },
  {
    id: 'provenance',
    zh: '人物与材料脉络',
    en: 'People & source context',
    group: 'writing',
  },
  { id: 'history', zh: '修改记录', en: 'Revision history', group: 'manage' },
  {
    id: 'data',
    zh: '项目设置与导出',
    en: 'Project settings & export',
    group: 'manage',
  },
  {
    id: 'agents',
    zh: '外部研究助手',
    en: 'External research agents',
    group: 'manage',
  },
] as const;
export const accountSections = [
  { id: 'profile', zh: '个人资料与偏好', en: 'Profile & preferences' },
  { id: 'security', zh: '登录与安全', en: 'Sign-in & security' },
  { id: 'models', zh: '模型连接', en: 'Model connections' },
  { id: 'connections', zh: '关联服务', en: 'Connected services' },
  { id: 'usage', zh: '用量与数据', en: 'Usage & data' },
] as const;
export function workspaceRoute(search: string) {
  const params = new URLSearchParams(search);
  const id = params.get('project') || '';
  return {
    projectId: projectIdPattern.test(id) ? id : '',
    tab:
      projectSections.find((item) => item.id === params.get('tab'))?.id ||
      'overview',
    settings:
      accountSections.find((item) => item.id === params.get('settings'))?.id ||
      '',
    guide: params.get('view') === 'guide',
    inbox: params.get('view') === 'inbox',
  };
}
export function projectPath(projectId: string, tab = 'overview') {
  const params = new URLSearchParams({ project: projectId, tab });
  return `/?${params}`;
}
export function sourcePath(projectId: string, versionId: string, page: number) {
  return `${projectPath(projectId, 'sources')}&version=${encodeURIComponent(versionId)}&page=${page}`;
}
// OAuth returns only to the workspace, never to a supplied host or arbitrary route.
export function safeWorkspaceReturn(value: string) {
  if (!URL.canParse(value, 'https://canwoo.invalid')) return '/';
  const parsed = new URL(value, 'https://canwoo.invalid');
  if (parsed.origin !== 'https://canwoo.invalid' || parsed.pathname !== '/')
    return '/';
  const project = parsed.searchParams.get('project');
  return project && projectIdPattern.test(project)
    ? projectPath(project, 'drive')
    : '/';
}
