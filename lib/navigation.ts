const projectIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const projectNavigationGroups = [
  { id: 'sources', zh: '汇集与阅读', en: 'Gather & read', step: '01' },
  { id: 'analysis', zh: '证据与论证', en: 'Evidence & arguments', step: '02' },
  { id: 'research', zh: '研究与审读', en: 'Research & review', step: '03' },
  { id: 'writing', zh: '写作与导出', en: 'Write & export', step: '04' },
  { id: 'manage', zh: '项目工具', en: 'Project tools', step: '' },
] as const;
export const projectSections = [
  { id: 'overview', zh: '项目概览', en: 'Overview', group: 'overview' },
  {
    id: 'sources',
    zh: '资料与阅读',
    en: 'Sources & reading',
    group: 'sources',
  },
  {
    id: 'source-management',
    zh: '资料管理',
    en: 'Source management',
    group: 'sources',
  },
  { id: 'drive', zh: 'Google Drive', en: 'Google Drive', group: 'sources' },
  { id: 'search', zh: '检索材料', en: 'Search sources', group: 'sources' },
  { id: 'bibliography', zh: '书目', en: 'Bibliography', group: 'sources' },
  { id: 'evidence', zh: '证据摘录', en: 'Evidence', group: 'analysis' },
  {
    id: 'provenance',
    zh: '人物与材料脉络',
    en: 'People & source context',
    group: 'analysis',
  },
  {
    id: 'arguments',
    zh: '问题与论证',
    en: 'Questions & arguments',
    group: 'analysis',
  },
  { id: 'platform', zh: '研究计划', en: 'Research plans', group: 'research' },
  { id: 'findings', zh: '研究成果', en: 'Findings', group: 'research' },
  { id: 'notes', zh: '笔记与写作', en: 'Notes & writing', group: 'writing' },
  {
    id: 'team',
    zh: '成员与讨论',
    en: 'People & discussion',
    group: 'manage',
  },
  { id: 'runs', zh: '任务与关注', en: 'Tasks & watches', group: 'manage' },
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
export function sourcePath(
  projectId: string,
  versionId: string,
  page: number,
  span?: { start: number; end: number } | null,
) {
  return `${projectPath(projectId, 'sources')}&version=${encodeURIComponent(versionId)}&page=${page}${span ? `&start=${span.start}&end=${span.end}` : ''}`;
}
export function argumentPath(
  projectId: string,
  questionId: string,
  claimId?: string,
) {
  const params = new URLSearchParams({
    project: projectId,
    tab: 'arguments',
    question: questionId,
  });
  if (claimId) params.set('claim', claimId);
  return `/?${params}`;
}
// OAuth returns only to the workspace, never to a supplied host or arbitrary route.
export function safeWorkspaceReturn(value: string) {
  if (!URL.canParse(value, 'https://clioforge.invalid')) return '/';
  const parsed = new URL(value, 'https://clioforge.invalid');
  if (parsed.origin !== 'https://clioforge.invalid' || parsed.pathname !== '/')
    return '/';
  const project = parsed.searchParams.get('project');
  return project && projectIdPattern.test(project)
    ? projectPath(project, 'drive')
    : '/';
}
