import { test, expect } from '@playwright/test';

const projectId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const date = '2026-09-11T00:00:00.000Z';
const project = {
  id: projectId,
  title: '国本之争与东林党',
  description: '万历国本之争、癸巳京察与东林群体形成',
  role: 'owner',
  created_at: date,
};
const collections = [
  'sources',
  'source_versions',
  'notes',
  'note_state',
  'evidence',
  'research_runs',
  'bibliography_entries',
  'research_questions',
  'claims',
  'claim_evidence',
  'source_relations',
  'search_logs',
  'evidence_reviews',
  'research_jobs',
  'research_watches',
  'research_inbox',
];

function mission(status: 'active' | 'completed') {
  const done = status === 'completed';
  return {
    mission: {
      id: runId,
      project_id: projectId,
      title: 'AI 资料搜索',
      question: '万历国本之争与东林党',
      scope: 'institutional catalogs',
      acceptance: 'verified leads',
      status,
      created_by: 'test-user',
      revision: 1,
      created_at: date,
      updated_at: date,
    },
    tasks: [
      {
        id: 'task-init',
        status: 'succeeded',
        input: { parameters: { source_agent_stage: 'init' } },
        result: { summary: '资料检索记录已准备。', citations: [], checks: [] },
      },
      {
        id: 'task-tool',
        status: done ? 'succeeded' : 'running',
        input: { parameters: { source_agent_stage: 'tool' } },
        result: done
          ? {
              summary:
                '已核查 1 条相关研究；无法安全下载的记录已保存为待补资料。',
              citations: [],
              checks: [],
            }
          : null,
      },
    ],
    edges: [],
    events: [],
    artifacts: [],
    role: 'owner',
  };
}

test('AI source search remains available in source management and renders persisted progress, candidates, and leads', async ({
  page,
}, testInfo) => {
  let polls = 0;
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.context().addCookies([
    {
      name: 'clioforge_locale',
      value: 'zh-CN',
      url: 'http://127.0.0.1:8788',
    },
  ]);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/get-session') {
      await route.fulfill({
        json: {
          session: {
            id: 'session',
            userId: 'test-user',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
          user: {
            id: 'test-user',
            name: 'Researcher',
            email: 'test@example.test',
            emailVerified: true,
          },
        },
      });
      return;
    }
    if (url.pathname === '/api/account') {
      await route.fulfill({ json: { locale: 'zh-CN' } });
      return;
    }
    if (url.pathname === '/api/workbench') {
      await route.fulfill({ json: { budget: null } });
      return;
    }
    if (url.pathname === '/api/models/pricing') {
      await route.fulfill({ json: { prices: [] } });
      return;
    }
    if (
      url.pathname === '/api/source-discovery' &&
      request.method() === 'POST'
    ) {
      const body = request.postDataJSON();
      expect(body.effort).toBe('max');
      expect(body.query).toContain('癸巳京察');
      expect(body.selection_criteria).toContain('一手史料');
      await route.fulfill({
        status: 202,
        json: { id: runId, mission: mission('active') },
      });
      return;
    }
    if (url.pathname === '/api/source-discovery') {
      polls += 1;
      const complete = polls > 1;
      await route.fulfill({
        json: {
          run: { id: runId, reasoning_effort: 'max' },
          mission: mission(complete ? 'completed' : 'active'),
          candidates: complete
            ? [
                {
                  id: 'crossref:10.1000/donglin',
                  title:
                    'The Donglin Movement and the 1593 Metropolitan Evaluation',
                  creators: ['Test Historian'],
                  issued_date: '2001',
                  institution: 'University Press',
                  landing_url: 'https://doi.org/10.1000/donglin',
                  access_status: 'metadata',
                  verification_level: 'abstract',
                  decision: 'needs_file',
                  relevance_reason:
                    'Directly addresses the named event and period.',
                  rejection_reason: '',
                },
              ]
            : [],
          leads: complete
            ? [
                {
                  id: 'lead-1',
                  title:
                    'The Donglin Movement and the 1593 Metropolitan Evaluation',
                  creators: ['Test Historian'],
                  issued_date: '2001',
                  institution: 'University Press',
                  landing_url: 'https://doi.org/10.1000/donglin',
                  access_status: 'metadata',
                  verification_level: 'abstract',
                  decision: 'needs_file',
                  status: 'needs_file',
                  access_note:
                    'No safe public full-text download was resolved.',
                  relevance_reason:
                    'Directly addresses the named event and period.',
                  rejection_reason: '',
                },
              ]
            : [],
        },
      });
      return;
    }
    if (url.pathname === '/api/workspace') {
      if (url.searchParams.has('access')) {
        await route.fulfill({ json: { project } });
        return;
      }
      if (url.searchParams.has('source_management')) {
        await route.fulfill({
          json: {
            sources: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                project_id: projectId,
                title: 'Existing Ming source',
                object_path: 'synthetic/source.txt',
                media_type: 'text/plain',
                created_at: date,
              },
            ],
            groups: [],
            organization: [],
            leads: [],
          },
        });
        return;
      }
      if (url.searchParams.has('collection')) {
        await route.fulfill({ json: { rows: [], next: null } });
        return;
      }
      if (url.searchParams.has('project_id')) {
        await route.fulfill({
          json: {
            project,
            models: [],
            checkpoint: Object.fromEntries(
              collections.map((name) => [name, '1']),
            ),
          },
        });
        return;
      }
      await route.fulfill({ json: { projects: [project] } });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: `Unmocked ${url.pathname}` },
    });
  });

  await page.goto(`/?project=${projectId}&tab=source-management`);
  await expect(
    page.getByRole('heading', { name: '资料管理' }).first(),
  ).toBeVisible();
  await expect(page.getByText('Existing Ming source').first()).toBeVisible();
  await page
    .getByRole('button', { name: '通过 AI 搜索添加资料' })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'AI 资料搜索' }).first(),
  ).toBeVisible();
  await page
    .getByLabel('这次想找什么资料')
    .first()
    .fill('检索万历国本之争、癸巳京察与东林群体形成，排除古罗马材料。');
  await expect(page.getByLabel('推理强度').first()).toHaveValue('max');
  await page.getByRole('button', { name: '开始代理检索' }).first().click();
  await expect(page.getByText('已核查候选').first()).toBeVisible();
  await expect(page.getByText('待补资料').first()).toBeVisible();
  await expect(
    page
      .getByText('The Donglin Movement and the 1593 Metropolitan Evaluation')
      .first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('source-search-complete.png'),
    fullPage: true,
  });
  expect(consoleErrors).toEqual([]);
});
