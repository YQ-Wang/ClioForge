'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Loader2,
  Search,
  Sparkles,
  History,
  Settings2,
} from 'lucide-react';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { TaskResult } from '@/lib/platform/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ResearchCandidates from './research-candidates';
import AgentSourceDiscovery from './agent-source-discovery';

type Connection = {
  provider: 'exa' | 'openalex';
  monthly_limit: number;
  attempts: number;
};
type Session = {
  id: string;
  query: string;
  status: string;
  created_at: string;
};
export default function SourceDiscovery({
  projectId,
  disabled = false,
  variant = 'secondary',
  initialQuery = '',
  onSourcesChanged,
}: {
  projectId: string;
  disabled?: boolean;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  initialQuery?: string;
  onSourcesChanged?: () => Promise<unknown> | void;
}) {
  const { locale, t } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [ai, setAi] = useState(false);
  const [expand, setExpand] = useState(true);
  const [exa, setExa] = useState(false);
  const [operation, setOperation] = useState<
    'search' | 'restore' | 'settings' | null
  >(null);
  const busy = operation !== null;
  const [view, setView] = useState<'search' | 'results'>('search');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const noticeRef = useRef<HTMLOutputElement>(null);
  const fieldId = useId();
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<TaskResult | null>(null);
  const [resultQuery, setResultQuery] = useState('');
  const [savedCandidates, setSavedCandidates] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [provider, setProvider] = useState<'exa' | 'openalex'>('exa');
  const [key, setKey] = useState('');
  const [limit, setLimit] = useState(100);
  const queryLines = query
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const queryError =
    !ai &&
    (queryLines.length > 3 || queryLines.some((line) => line.length > 200))
      ? L(
          '请使用最多 3 行、每行不超过 200 字的关键词，或启用 AI 整理。',
          'Use up to 3 lines of at most 200 characters, or enable AI query planning.',
        )
      : '';
  useEffect(() => {
    if (open) {
      if (dialogRef.current) dialogRef.current.scrollTop = 0;
      if (view === 'results') titleRef.current?.focus({ preventScroll: true });
      else queryRef.current?.focus({ preventScroll: true });
    }
  }, [view, open, sessionId]);
  useEffect(() => {
    if (open && message)
      noticeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, message]);
  async function refresh() {
    const [history, config] = await Promise.all([
      api<{ sessions: Session[] }>(
        `/api/source-discovery?project_id=${projectId}`,
      ),
      api<{ connections: Connection[] }>('/api/search-connections'),
    ]);
    setSessions(history.sessions);
    setConnections(config.connections);
    setLimit(
      config.connections.find((c) => c.provider === provider)?.monthly_limit ??
        100,
    );
  }
  async function show() {
    setMessage('');
    setOpen(true);
    try {
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? t(e.message)
          : L('无法载入检索记录。', 'Could not load search history.'),
      );
    }
  }
  async function search() {
    if (!query.trim() || queryError || busy) return;
    setOperation('search');
    setMessage('');
    setResult(null);
    const id = crypto.randomUUID();
    setSessionId(id);
    try {
      const response = await api<{ result: TaskResult }>(
        '/api/source-discovery',
        {
          id,
          project_id: projectId,
          query,
          mode: ai ? 'ai' : 'catalog',
          use_exa: exa,
          expand_chinese: expand,
          locale,
        },
      );
      setResult(response.result);
      setResultQuery(query);
      setView('results');
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? t(e.message)
          : L(
              '搜索未完成。请查看历史记录后再决定是否重试。',
              'Search did not finish. Check history before retrying.',
            ),
      );
    } finally {
      setOperation(null);
    }
  }
  async function restore(id: string) {
    setOperation('restore');
    setMessage('');
    try {
      const response = await api<{ result: TaskResult | null; query: string }>(
        `/api/source-discovery?project_id=${projectId}&id=${id}`,
      );
      setResult(response.result);
      setQuery(response.query);
      setResultQuery(response.query);
      setSessionId(id);
      if (response.result) setView('results');
      if (!response.result)
        setMessage(
          L(
            '此检索尚无完成的结果。不会自动重试产生费用的请求。',
            'No completed result yet. Cost-bearing requests are not retried automatically.',
          ),
        );
    } catch (e) {
      setMessage(e instanceof Error ? t(e.message) : 'Error');
    } finally {
      setOperation(null);
    }
  }
  async function configure(remove = false) {
    setOperation('settings');
    setMessage('');
    try {
      await api(
        '/api/search-connections',
        remove
          ? { provider }
          : { provider, key: key.trim() || undefined, monthly_limit: limit },
        remove ? 'DELETE' : 'POST',
      );
      setKey('');
      if (remove && provider === 'exa') setExa(false);
      await refresh();
      setMessage(L('搜索服务设置已更新。', 'Search settings updated.'));
    } catch (e) {
      setMessage(e instanceof Error ? t(e.message) : 'Error');
    } finally {
      setOperation(null);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        onClick={() => void show()}
      >
        <Search size={16} />
        {L('补充资料', 'Find more sources')}
      </Button>
      <AgentSourceDiscovery
        projectId={projectId}
        disabled={disabled}
        variant={variant}
        initialQuery={initialQuery}
        onSourcesChanged={onSourcesChanged}
      />
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            if (!value) setKey('');
          }
        }}
      >
        <DialogContent
          ref={dialogRef}
          className="mission-dialog literature-dialog"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle ref={titleRef} tabIndex={-1}>
              {view === 'results'
                ? L('找到的阅读线索', 'Sources to explore')
                : L('为研究补充资料', 'Find sources for your research')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '从研究问题出发，查找文献，核对书目，再阅读原文。',
                'Start with a question. Find relevant literature, check the reference, then read the original.',
              )}
            </DialogDescription>
          </DialogHeader>
          <ol className="literature-path">
            <li data-current={view === 'search'}>
              <span>1</span>
              {L('查找线索', 'Discover')}
            </li>
            <li data-current={view === 'results'}>
              <span>2</span>
              {L('保存书目', 'Save references')}
            </li>
            <li>
              <span>3</span>
              {L('阅读与核查', 'Read and verify')}
            </li>
          </ol>
          {view === 'search' && (
            <>
              <form
                className="platform-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <label>
                  {L('研究问题或关键词', 'Research question or keywords')}
                  <Textarea
                    ref={queryRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={ai ? 2000 : 602}
                    rows={3}
                    required
                    disabled={busy}
                    aria-invalid={!!queryError}
                    aria-describedby={`${fieldId}-query-hint`}
                    placeholder={L(
                      '例如：晚清 女学\n清末 女子教育\nlate Qing women education',
                      'For example: Abigail Adams Remember the Ladies',
                    )}
                  />
                </label>
                <p
                  id={`${fieldId}-query-hint`}
                  className={queryError ? 'literature-query-error' : 'muted'}
                >
                  {queryError ||
                    L(
                      '每行一组关键词，最多 3 行、每行 200 字；也可让 AI 整理较长的问题。',
                      'Up to 3 queries, one per line, 200 characters each. AI can help with longer questions.',
                    )}
                </p>
                <div className="literature-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={expand}
                      onChange={(e) => setExpand(e.target.checked)}
                      disabled={busy}
                    />
                    {L(
                      '同时搜索简体与繁体',
                      'Include simplified and traditional Chinese',
                    )}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={ai}
                      onChange={(e) => setAi(e.target.checked)}
                      disabled={busy}
                    />
                    <Sparkles size={14} />
                    {L(
                      'AI 整理中英文检索词（使用我的模型额度）',
                      'Plan queries with AI (uses my model credits)',
                    )}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={exa}
                      onChange={(e) => setExa(e.target.checked)}
                      disabled={
                        busy || !connections.some((c) => c.provider === 'exa')
                      }
                    />
                    {L(
                      '补充 Exa 网页搜索（需配置自己的 key）',
                      'Include Exa web search (requires your own key)',
                    )}
                  </label>
                </div>
                <details className="literature-search-details">
                  <summary>
                    {L('检索范围与隐私', 'Search coverage and privacy')}
                  </summary>
                  <p className="muted">
                    {L(
                      '检索词会发送给 OpenAlex、Crossref 和美国国会图书馆；启用 Exa 时也发送给 Exa。不会发送项目的其他材料。最多 6 个检索词，每个来源各取 5 条；24 小时内同项目同词复用缓存。',
                      'Queries go to OpenAlex, Crossref and the Library of Congress, plus Exa when selected. Other project materials are not sent. Up to 6 queries, 5 results per catalog, with a 24-hour cache for identical queries in this project.',
                    )}
                  </p>
                </details>
                <Button
                  type="submit"
                  disabled={busy || !query.trim() || !!queryError}
                >
                  {operation === 'search' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                  {operation === 'search'
                    ? L('正在查找资料…', 'Finding sources…')
                    : ai
                      ? L('用 AI 规划并查找', 'Plan with AI and search')
                      : L('查找资料', 'Find sources')}
                </Button>
                <p className="literature-cost-note">
                  {ai
                    ? L(
                        '使用你自己的模型连接；检索不会读取项目原件。',
                        'Uses your model connection; project originals are not sent.',
                      )
                    : L(
                        '默认搜索无需模型或付费密钥。',
                        'Default search needs no model or paid key.',
                      )}
                </p>
              </form>
              {result && (
                <Button variant="outline" onClick={() => setView('results')}>
                  <ArrowRight size={16} />
                  {L('返回上次结果', 'Return to results')}
                </Button>
              )}
              <details className="literature-settings">
                <summary>
                  <History size={15} />
                  {L('最近检索记录', 'Recent searches')} ({sessions.length})
                </summary>
                {sessions.length === 0 ? (
                  <p className="muted">
                    {L(
                      '检索完成后会保存在这里，关闭窗口也不会丢失。',
                      'Searches are saved here so you can return after closing this window.',
                    )}
                  </p>
                ) : (
                  sessions.map((s) => (
                    <Button
                      type="button"
                      className="literature-history"
                      variant="ghost"
                      key={s.id}
                      disabled={busy}
                      onClick={() => void restore(s.id)}
                    >
                      <span>{s.query}</span>
                      <small>
                        {new Date(s.created_at).toLocaleDateString(
                          locale === 'en' ? 'en-US' : 'zh-CN',
                        )}{' '}
                        ·{' '}
                        {s.status === 'completed'
                          ? L('已完成', 'Completed')
                          : s.status === 'failed'
                            ? L('未完成', 'Failed')
                            : L('处理中或已中断', 'Running or interrupted')}
                      </small>
                    </Button>
                  ))
                )}
              </details>
              <details className="literature-settings">
                <summary>
                  <Settings2 size={15} />
                  {L(
                    '可选搜索服务与用量',
                    'Optional search services and usage',
                  )}
                </summary>
                <p className="muted">
                  {L(
                    '默认无需购买服务。密钥按账号加密保存；调用上限仅限制 ClioForge 发起的请求，不是服务商账单上限。失败和超时也保留一次调用额度。',
                    'No subscription is needed by default. Keys are encrypted per account. Limits apply to ClioForge requests, not the provider bill. Failed and uncertain requests also count.',
                  )}
                </p>
                {connections.map((c) => (
                  <p key={c.provider}>
                    {c.provider}: {c.attempts} / {c.monthly_limit}{' '}
                    {L('次／本月', 'attempts this month')}
                  </p>
                ))}
                <div className="grid gap-3">
                  <label htmlFor={`${fieldId}-provider`}>
                    {L('服务', 'Service')}
                    <NativeSelect
                      id={`${fieldId}-provider`}
                      value={provider}
                      onChange={(e) => {
                        setProvider(e.target.value as typeof provider);
                        setLimit(
                          connections.find((c) => c.provider === e.target.value)
                            ?.monthly_limit ?? 100,
                        );
                        setKey('');
                      }}
                      disabled={busy}
                    >
                      <NativeSelectOption value="exa">Exa</NativeSelectOption>
                      <NativeSelectOption value="openalex">
                        OpenAlex
                      </NativeSelectOption>
                    </NativeSelect>
                  </label>
                  <label htmlFor={`${fieldId}-key`}>
                    API key
                    <Input
                      id={`${fieldId}-key`}
                      type="password"
                      autoComplete="off"
                      placeholder={L(
                        '已连接时留空可保留原 key',
                        'Leave blank to keep a saved key',
                      )}
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    {L(
                      '每月最多调用次数（0 表示暂停）',
                      'Monthly request limit (0 pauses requests)',
                    )}
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      disabled={busy}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        busy ||
                        (!key.trim() &&
                          !connections.some((c) => c.provider === provider)) ||
                        !Number.isInteger(limit) ||
                        limit < 0 ||
                        limit > 10000
                      }
                      onClick={() => void configure()}
                    >
                      {L('保存连接', 'Save connection')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        busy ||
                        !connections.some((c) => c.provider === provider)
                      }
                      onClick={() => void configure(true)}
                    >
                      {L('移除连接', 'Remove connection')}
                    </Button>
                  </div>
                </div>
              </details>
            </>
          )}
          {operation === 'restore' && (
            <output className="literature-progress">
              <Loader2 size={16} className="animate-spin" />
              {L('正在打开检索记录…', 'Opening saved search…')}
            </output>
          )}
          {message && (
            <output ref={noticeRef} className="platform-notice">
              {message}
            </output>
          )}
          {view === 'results' && result && (
            <section className="literature-results">
              <div className="literature-results-toolbar">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMessage('');
                    setView('search');
                  }}
                >
                  <ArrowLeft size={16} />
                  {L('调整检索', 'Edit search')}
                </Button>
                <Link
                  className={buttonVariants({ variant: 'secondary' })}
                  href={`/?project=${projectId}&tab=bibliography`}
                >
                  <BookOpen size={16} />
                  {L('项目书目', 'Project bibliography')}
                </Link>
              </div>
              <p className="literature-query">{resultQuery}</p>
              <ResearchCandidates
                key={sessionId}
                result={result}
                projectId={projectId}
                sessionId={sessionId}
                savedCandidates={savedCandidates}
                onSaved={(id) =>
                  setSavedCandidates((previous) => [...previous, id])
                }
              />
              <div className="literature-next-step">
                <strong>{L('保存书目之后', 'After saving a reference')}</strong>
                <p>
                  {L(
                    '取得可用的全文后，导入项目，开始阅读、批注与摘录证据。',
                    'Obtain an accessible copy, import it, then read, annotate and collect evidence.',
                  )}
                </p>
                <Link
                  className={buttonVariants({ variant: 'outline' })}
                  href={`/?project=${projectId}&tab=sources`}
                >
                  {L('前往资料与阅读', 'Go to sources & reading')}
                  <ArrowRight size={16} />
                </Link>
              </div>
            </section>
          )}
          <details className="literature-settings">
            <summary>
              {L('中文专业库与古籍', 'Chinese scholarship and classical texts')}
            </summary>
            <p className="muted">
              {L(
                '通用目录对中文资料覆盖有限。下列入口需要另行检索，尚未自动接入；取得书目后可在项目书目中导入 BibTeX 或 RIS。',
                'General catalogs have limited Chinese coverage. Search these specialist portals separately; they are not queried automatically. Import exported BibTeX or RIS through the project bibliography.',
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="https://www.ncpssd.cn/" target="_blank" rel="noreferrer">
                {L('国家哲学社会科学文献中心', 'NCPSSD')}
              </a>
              <a
                href="https://ndltd.ncl.edu.tw/"
                target="_blank"
                rel="noreferrer"
              >
                {L('台湾博硕士论文', 'Taiwan theses')}
              </a>
              <a href="https://ctext.org/zh" target="_blank" rel="noreferrer">
                {L('中国哲学书电子化计划', 'Chinese Text Project')}
              </a>
              <a
                href={`https://scholar.google.com/scholar?q=${encodeURIComponent(query.slice(0, 200))}`}
                target="_blank"
                rel="noreferrer"
              >
                Google Scholar
              </a>
            </div>
          </details>
        </DialogContent>
      </Dialog>
    </>
  );
}
