'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Inbox,
  RefreshCw,
  Check,
  Undo2,
  ArrowUpRight,
  Search,
  X,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { researchInbox, InboxItem } from '@/lib/research-inbox';
import { taskStatusLabels } from '@/lib/task-presentation';
import './research-inbox.css';

type InboxData = Awaited<ReturnType<typeof researchInbox>>;
export default function ResearchInbox() {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<InboxData | null>(null),
    [loadError, setLoadError] = useState(''),
    [actionError, setActionError] = useState(''),
    [refreshing, setRefreshing] = useState(true),
    [filter, setFilter] = useState('all'),
    [project, setProject] = useState('all'),
    [query, setQuery] = useState(''),
    [seen, setSeen] = useState(false),
    [busy, setBusy] = useState(''),
    [receipt, setReceipt] = useState<{ item: InboxItem; seen: boolean } | null>(
      null,
    );
  const requestId = useRef(0),
    mutationBusy = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setRefreshing(true);
    try {
      const next = await api<InboxData>('/api/inbox');
      if (id === requestId.current) {
        setData(next);
        setLoadError('');
      }
    } catch (e) {
      if (id === requestId.current)
        setLoadError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    const requests = requestId;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !mutationBusy.current)
        void refresh();
    }, 30000);
    return () => {
      clearInterval(timer);
      requests.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (
      data &&
      project !== 'all' &&
      !data.items.some((item) => item.project_id === project)
    )
      setProject('all');
  }, [data, project]);
  const labels = {
    review: L('待审读', 'To review'),
    attention: L('需要处理', 'Needs attention'),
    source: L('材料更新', 'Source updates'),
    mention: L('讨论提醒', 'Discussion'),
  };
  const allItems = data?.items || [],
    projects = [
      ...new Map(
        allItems.map((item) => [item.project_id, item.project_title]),
      ).entries(),
    ].sort((a, b) => a[1].localeCompare(b[1], locale)),
    search = query.trim().toLocaleLowerCase(locale),
    scoped = allItems.filter(
      (item) =>
        (project === 'all' || item.project_id === project) &&
        (!search ||
          `${item.title} ${item.project_title} ${item.detail}`
            .toLocaleLowerCase(locale)
            .includes(search)),
    ),
    items = scoped.filter(
      (item) =>
        item.seen === seen && (filter === 'all' || item.kind === filter),
    ),
    hasFilters = filter !== 'all' || project !== 'all' || !!query.trim();
  function clearFilters() {
    setFilter('all');
    setProject('all');
    setQuery('');
  }
  function title(item: InboxItem) {
    return item.kind === 'mention'
      ? L(`${item.title} 请你参与讨论`, `${item.title} asked for your input`)
      : item.title;
  }
  function detail(item: InboxItem) {
    if (item.kind === 'source')
      return L(
        `${item.detail} 条摘录仍引用旧版本。请对照更新；旧版本仍保留。`,
        `${item.detail} excerpts cite an earlier version. Compare the update; earlier versions remain available.`,
      );
    if (item.kind === 'mention') return item.detail.slice(0, 300);
    return (
      {
        human_active: L('研究者正在处理', 'Researcher working'),
        human_waiting: L('人工暂缓处理', 'Human work on hold'),
        human_planned: L('待开展的人工任务', 'Human work to do'),
      }[item.detail] ||
      taskStatusLabels[item.detail as keyof typeof taskStatusLabels]?.[
        locale === 'en' ? 1 : 0
      ] ||
      item.detail
    );
  }
  function dateLabel(value: string) {
    const date = new Date(value),
      now = Date.now();
    if (!Number.isFinite(date.getTime())) return null;
    const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    return {
      exact: date.toLocaleString(locale),
      short:
        minutes < 1
          ? L('刚刚', 'Just now')
          : minutes < 60
            ? relative.format(-minutes, 'minute')
            : minutes < 1440
              ? relative.format(-Math.floor(minutes / 60), 'hour')
              : date.toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                  ...(date.getFullYear() === new Date(now).getFullYear()
                    ? {}
                    : { year: 'numeric' }),
                }),
    };
  }
  async function updateReceipt(item: InboxItem, nextSeen: boolean) {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    requestId.current++;
    setBusy(item.key);
    setActionError('');
    setReceipt(null);
    try {
      await api('/api/inbox', {
        key: item.key,
        fingerprint: item.fingerprint,
        seen: nextSeen,
      });
      setData(
        (current) =>
          current && {
            ...current,
            items: current.items.map((row) =>
              row.key === item.key && row.fingerprint === item.fingerprint
                ? { ...row, seen: nextSeen }
                : row,
            ),
          },
      );
      setReceipt({ item, seen: nextSeen });
      await refresh();
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : L('更新失败，请重试。', 'Update failed. Please try again.'),
      );
      setRefreshing(false);
    } finally {
      mutationBusy.current = false;
      setBusy('');
    }
  }
  return (
    <div className="research-inbox-page">
      <header className="page-title inbox-header">
        <div>
          <p className="eyebrow">{L('研究工作区', 'Research workspace')}</p>
          <h1>{L('研究收件箱', 'Research inbox')}</h1>
          <p>
            {L(
              '把需要你判断、回应或重新核对的工作放在一起。',
              'Review, respond and revisit changed evidence in one place.',
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing || !!busy}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={15}
            className={refreshing ? 'inbox-spinning' : ''}
            aria-hidden="true"
          />
          {L('刷新', 'Refresh')}
        </Button>
      </header>
      <div className="inbox-toolbar">
        <fieldset
          className="inbox-state-control"
          aria-label={L('查看状态', 'Receipt status')}
        >
          {[false, true].map((value) => (
            <Button
              key={String(value)}
              variant={seen === value ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={seen === value}
              onClick={() => setSeen(value)}
            >
              {value ? L('已查看', 'Seen') : L('待处理', 'Pending')}
              {data && (
                <span className="inbox-count">
                  {scoped.filter((item) => item.seen === value).length}
                </span>
              )}
            </Button>
          ))}
        </fieldset>
        <div className="inbox-search-filters">
          <div className="inbox-search">
            <Search size={15} aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={L('搜索收件箱', 'Search inbox')}
              placeholder={L('搜索事项或项目', 'Search items or projects')}
            />
          </div>
          {projects.length > 1 && (
            <Select
              value={project}
              onValueChange={(value) => setProject(value || 'all')}
            >
              <SelectTrigger
                className="inbox-project-filter"
                aria-label={L('筛选项目', 'Filter by project')}
              >
                <SelectValue>
                  {project === 'all'
                    ? L('全部项目', 'All projects')
                    : projects.find(([id]) => id === project)?.[1]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">
                  {L('全部项目', 'All projects')}
                </SelectItem>
                {projects.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <fieldset
        className="inbox-filters"
        aria-label={L('收件箱分类', 'Inbox categories')}
      >
        {[['all', L('全部', 'All')], ...Object.entries(labels)].map(
          ([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? 'secondary' : 'ghost'}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
              {data && (
                <span className="inbox-count">
                  {
                    scoped.filter(
                      (item) =>
                        item.seen === seen &&
                        (key === 'all' || item.kind === key),
                    ).length
                  }
                </span>
              )}
            </Button>
          ),
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="inbox-clear"
            onClick={clearFilters}
          >
            <X size={14} aria-hidden="true" />
            {L('清除筛选', 'Clear filters')}
          </Button>
        )}
      </fieldset>
      <p className="inbox-receipt-hint">
        {L(
          '“已查看”只整理你的收件箱，不会通过审读或替同事解决问题。新的修订会再次提醒你。',
          'Marking seen only organizes your inbox. It does not approve work or resolve a colleague’s discussion. New revisions appear again.',
        )}
      </p>
      {data && (!data.preferences.tasks || !data.preferences.mentions) && (
        <p className="inbox-preferences-hint">
          {!data.preferences.tasks && !data.preferences.mentions
            ? L(
                '研究提醒已关闭，收件箱不会显示新的事项。',
                'Research reminders are turned off, so new items are hidden from the inbox.',
              )
            : !data.preferences.tasks
              ? L(
                  '研究任务与材料更新提醒已关闭。',
                  'Task and source update reminders are turned off.',
                )
              : L(
                  '讨论提醒已关闭。',
                  'Discussion reminders are turned off.',
                )}{' '}
          <Link href="/?settings=profile">
            {L('调整提醒偏好', 'Change reminder preferences')}
          </Link>
        </p>
      )}
      {loadError && (
        <div className="inbox-feedback inbox-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>
              {data
                ? L(
                    '刷新失败，正在显示上次读取的事项。',
                    'Refresh failed. Showing the last loaded items.',
                  )
                : L('暂时无法读取收件箱', 'Could not load your inbox')}
            </strong>
            <p>{loadError}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing || !!busy}
            onClick={() => void refresh()}
          >
            {L('重试', 'Retry')}
          </Button>
        </div>
      )}
      {actionError && (
        <div className="inbox-feedback inbox-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>{L('未能更新此事项', 'Could not update this item')}</strong>
            <p>{actionError}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing || !!busy}
            onClick={() => {
              setActionError('');
              void refresh();
            }}
          >
            {L('刷新事项', 'Refresh items')}
          </Button>
        </div>
      )}
      {receipt && (
        <div className="inbox-feedback inbox-success">
          <output>
            <Check size={16} aria-hidden="true" />
            <span>
              {receipt.seen
                ? L('已标为已查看', 'Marked as seen')
                : L('已移回待处理', 'Moved back to pending')}{' '}
              · {title(receipt.item)}
            </span>
          </output>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() => void updateReceipt(receipt.item, !receipt.seen)}
          >
            <Undo2 size={14} aria-hidden="true" />
            {L('撤销', 'Undo')}
          </Button>
        </div>
      )}
      {!data && !loadError && (
        <output className="inbox-loading">
          <RefreshCw size={20} className="inbox-spinning" aria-hidden="true" />
          {L('正在读取收件箱…', 'Loading your inbox…')}
        </output>
      )}
      {!!items.length && (
        <output className="inbox-result-count">
          {L(
            `${items.length} 条${seen ? '已查看' : '待处理'}事项`,
            `${items.length} ${seen ? 'seen' : 'pending'} ${items.length === 1 ? 'item' : 'items'}`,
          )}
        </output>
      )}
      <div className="inbox-items" aria-busy={!!busy}>
        {items.map((item) => {
          const date = dateLabel(item.updated_at);
          return (
            <article
              key={item.key}
              className={`inbox-item inbox-item-${item.kind}`}
            >
              <div className="inbox-item-meta">
                <span className="inbox-kind">{labels[item.kind]}</span>
                <small>{item.project_title}</small>
                {date && (
                  <time dateTime={item.updated_at} title={date.exact}>
                    {date.short}
                  </time>
                )}
              </div>
              <a
                href={item.href}
                className="inbox-item-link"
                aria-label={L(
                  `打开：${title(item)} · ${item.project_title}`,
                  `Open: ${title(item)} · ${item.project_title}`,
                )}
              >
                <strong>{title(item)}</strong>
                <span className="inbox-open-action">
                  {item.kind === 'mention'
                    ? L('参与讨论', 'Join discussion')
                    : item.kind === 'source'
                      ? L('核对材料', 'Compare sources')
                      : L('查看任务', 'View task')}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </span>
              </a>
              <p className="inbox-item-detail">{detail(item)}</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={!!busy}
                onClick={() => void updateReceipt(item, !item.seen)}
              >
                {busy === item.key ? (
                  <RefreshCw
                    size={14}
                    className="inbox-spinning"
                    aria-hidden="true"
                  />
                ) : item.seen ? (
                  <Undo2 size={14} aria-hidden="true" />
                ) : (
                  <Check size={14} aria-hidden="true" />
                )}
                {busy === item.key
                  ? L('正在更新…', 'Updating…')
                  : item.seen
                    ? L('移回待处理', 'Move to pending')
                    : L('标为已查看', 'Mark seen')}
              </Button>
            </article>
          );
        })}
      </div>
      {data && !items.length && (
        <section className="inbox-empty">
          <div className="inbox-empty-icon">
            {hasFilters ? (
              <Search size={26} strokeWidth={1.5} aria-hidden="true" />
            ) : seen ? (
              <Inbox size={26} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Check size={26} strokeWidth={1.5} aria-hidden="true" />
            )}
          </div>
          <h2>
            {hasFilters
              ? L('没有匹配的事项', 'No matching items')
              : seen
                ? L('这里没有已查看事项', 'No seen items here')
                : L('暂时没有待处理事项', 'You’re all caught up')}
          </h2>
          <p>
            {hasFilters
              ? L(
                  '试试其他关键词，或清除项目与分类筛选。',
                  'Try another search, or clear the project and category filters.',
                )
              : seen
                ? L(
                    '仍需关注的事项标为已查看后会出现在这里，随时可以移回待处理。',
                    'Active items you mark as seen appear here. You can move them back to pending at any time.',
                  )
                : L(
                    '新的审读请求、讨论提醒和材料修订会在这里汇集。',
                    'New review requests, discussion mentions and source revisions will appear here.',
                  )}
          </p>
          {hasFilters ? (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {L('清除筛选', 'Clear filters')}
            </Button>
          ) : (
            <Link href="/" className="inbox-workspace-link">
              {L('返回项目继续研究', 'Continue in your projects')}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
