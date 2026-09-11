'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Search, Sparkles } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { MissionView } from '@/lib/platform/types';
import { defaultSourceSelectionCriteria } from '@/lib/platform/source-search-recipe';
import { Button } from '@/components/ui/button';
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

type Candidate = {
  id: string;
  title: string;
  creators: string[];
  issued_date: string;
  institution: string;
  landing_url: string;
  access_status: string;
  verification_level: string;
  decision: string;
  relevance_reason: string;
  rejection_reason: string;
};
type Lead = Candidate & {
  access_note: string;
  status: string;
};
type SearchState = {
  run: Record<string, unknown>;
  mission: MissionView;
  candidates: Candidate[];
  leads: Lead[];
};

export default function SourceDiscovery({
  projectId,
  disabled = false,
  variant = 'secondary',
  onSourcesChanged,
}: {
  projectId: string;
  disabled?: boolean;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  onSourcesChanged?: () => Promise<unknown> | void;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectionCriteria, setSelectionCriteria] = useState(() =>
    defaultSourceSelectionCriteria(locale),
  );
  const [effort, setEffort] = useState<'low' | 'high' | 'max'>('max');
  const [provider, setProvider] = useState<'catalogs' | 'brave' | 'tavily'>(
    'catalogs',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SearchState | null>(null);
  const polling = useRef<AbortController | null>(null);

  useEffect(() => () => polling.current?.abort(), []);

  async function poll(id: string) {
    polling.current?.abort();
    const controller = new AbortController();
    polling.current = controller;
    while (!controller.signal.aborted) {
      const next = await api<SearchState>(
        `/api/source-discovery?id=${encodeURIComponent(id)}`,
        undefined,
        'GET',
        controller.signal,
      );
      setState(next);
      if (
        ['completed', 'cancelled'].includes(next.mission.mission.status) ||
        next.mission.tasks.some((task) =>
          ['failed', 'uncertain'].includes(task.status),
        )
      ) {
        setBusy(false);
        if (next.mission.mission.status === 'completed')
          await onSourcesChanged?.();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  async function search() {
    const value = query.trim();
    if (!value) return;
    setBusy(true);
    setMessage('');
    setState(null);
    try {
      const response = await api<{ id: string; mission: MissionView }>(
        '/api/source-discovery',
        {
          project_id: projectId,
          query: value,
          selection_criteria: selectionCriteria,
          locale,
          effort,
          max_steps: 8,
          search_provider: provider,
        },
      );
      await poll(response.id);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setBusy(false);
      setMessage(
        error instanceof Error
          ? error.message
          : L('资料搜索未完成。', 'Source search did not finish.'),
      );
    }
  }

  const completed =
    state?.mission.tasks.filter((task) =>
      ['succeeded', 'accepted'].includes(task.status),
    ).length || 0;
  const total = state?.mission.tasks.length || 0;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Sparkles size={16} />
        {L('通过 AI 搜索添加资料', 'Add sources with AI search')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mission-dialog">
          <DialogHeader>
            <DialogTitle>{L('AI 资料搜索', 'AI source search')}</DialogTitle>
            <DialogDescription>
              {L(
                '助手会反复选择检索、核查、解析全文、导入、保存待补资料或排除结果。每一步都会保存，目录文字不会被当作史料证据。',
                'The agent iterates through search, inspection, full-text resolution, import, lead saving, and rejection. Every step is saved; catalog text is never treated as source evidence.',
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="platform-form"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <label>
              {L('这次想找什么资料', 'What sources are you looking for?')}
              <Textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={12000}
                rows={6}
                required
                placeholder={L(
                  '说明问题、时期、地点、人物、希望的史料类型与应排除的范围。',
                  'Describe the question, period, places, people, source types, and exclusions.',
                )}
              />
            </label>
            <label>
              {L('资料选择标准', 'Source selection criteria')}
              <Textarea
                value={selectionCriteria}
                onChange={(event) => setSelectionCriteria(event.target.value)}
                maxLength={6000}
                rows={4}
                required
                placeholder={L(
                  '写明必须满足的年代、地域、语种、资料类型、机构、全文条件与排除项。',
                  'Specify required periods, regions, languages, source types, institutions, full-text conditions, and exclusions.',
                )}
              />
              <small>
                {L(
                  '默认标准可以直接修改；越严格的要求会约束代理每一轮核查与取舍。',
                  'Edit the defaults freely; stricter requirements constrain every agent inspection and decision.',
                )}
              </small>
            </label>
            <div className="platform-form-grid">
              <label>
                {L('推理强度', 'Reasoning effort')}
                <NativeSelect
                  value={effort}
                  onChange={(event) =>
                    setEffort(event.target.value as 'low' | 'high' | 'max')
                  }
                >
                  <NativeSelectOption value="max">Max</NativeSelectOption>
                  <NativeSelectOption value="high">High</NativeSelectOption>
                  <NativeSelectOption value="low">Low</NativeSelectOption>
                </NativeSelect>
              </label>
              <label>
                {L('网页检索', 'Web search')}
                <NativeSelect
                  value={provider}
                  onChange={(event) =>
                    setProvider(
                      event.target.value as 'catalogs' | 'brave' | 'tavily',
                    )
                  }
                >
                  <NativeSelectOption value="catalogs">
                    {L('只用公开馆藏与学术目录', 'Public catalogs only')}
                  </NativeSelectOption>
                  <NativeSelectOption value="brave">
                    Brave + catalogs
                  </NativeSelectOption>
                  <NativeSelectOption value="tavily">
                    Tavily + catalogs
                  </NativeSelectOption>
                </NativeSelect>
              </label>
            </div>
            <small>
              {L(
                '默认执行最多 8 个代理步骤。可安全取得的公开原件会自动导入；其余相关记录保存为待补资料。',
                'Runs at most 8 agent operations. Safely retrievable public originals are imported; other relevant records become source leads.',
              )}
            </small>
            <Button
              type="submit"
              disabled={busy || !query.trim() || !selectionCriteria.trim()}
            >
              {busy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Search size={16} />
              )}
              {busy
                ? L('代理正在研究…', 'Agent researching…')
                : L('开始代理检索', 'Start agent search')}
            </Button>
          </form>
          {message && (
            <output role="alert" className="platform-notice">
              {message}
            </output>
          )}
          {state && (
            <section className="research-candidates" aria-live="polite">
              <h4>{L('执行进度', 'Agent progress')}</h4>
              <p>
                {completed} / {total} · {state.mission.mission.status}
              </p>
              {state.mission.tasks
                .filter(
                  (task) =>
                    task.input.parameters.source_agent_stage === 'tool' &&
                    task.result,
                )
                .map((task) => (
                  <p key={task.id}>{task.result?.summary}</p>
                ))}
              <h4>{L('已核查候选', 'Inspected candidates')}</h4>
              {state.candidates
                .filter((candidate) => candidate.decision !== 'rejected')
                .map((candidate) => (
                  <article key={candidate.id}>
                    <a
                      href={candidate.landing_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {candidate.title} <ExternalLink size={12} />
                    </a>
                    <small>
                      {candidate.institution} · {candidate.issued_date} ·{' '}
                      {candidate.decision} · {candidate.verification_level}
                    </small>
                    <p>{candidate.relevance_reason}</p>
                  </article>
                ))}
              {!!state.leads.length && (
                <h4>{L('待补资料', 'Sources needing files')}</h4>
              )}
              {state.leads.map((lead) => (
                <article key={lead.id}>
                  <a href={lead.landing_url} target="_blank" rel="noreferrer">
                    {lead.title}
                  </a>
                  <small>{lead.access_note}</small>
                  <p>{lead.relevance_reason}</p>
                </article>
              ))}
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
