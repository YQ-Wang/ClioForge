'use client';

import { useState } from 'react';
import { Loader2, Search, Sparkles } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { TaskResult } from '@/lib/platform/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ResearchCandidates from './research-candidates';

export default function SourceDiscovery({
  projectId,
  disabled = false,
  variant = 'secondary',
}: {
  projectId: string;
  disabled?: boolean;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<TaskResult | null>(null);

  async function search() {
    const value = query.trim();
    if (!value) return;
    setBusy(true);
    setMessage('');
    setResult(null);
    try {
      const response = await api<{ result: TaskResult }>(
        '/api/source-discovery',
        {
          id: crypto.randomUUID(),
          project_id: projectId,
          query: value,
          locale,
        },
      );
      setResult(response.result);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : L(
              '资料搜索未完成，请重试。',
              'Source search did not finish. Try again.',
            ),
      );
    } finally {
      setBusy(false);
    }
  }

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
                '搜索助手先把你填写的目标整理为最多 3 个检索词，再调用 Crossref 和美国国会图书馆目录。这不会创建研究计划。',
                'The search assistant turns the goal you enter into at most three queries, then calls Crossref and the Library of Congress catalogs. It does not create a research plan.',
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
                maxLength={2000}
                rows={5}
                required
                placeholder={L(
                  '例如：检索万历年间国本之争、东林党形成与癸巳京察相关的中英文史料和研究。',
                  'For example: Find Chinese- and English-language primary sources and scholarship on the succession controversy, the Donglin movement, and the 1593 Beijing evaluation.',
                )}
              />
              <small>
                {L(
                  '你填写的这段文字会发送给默认模型；模型产生的检索词会发送给上述公开目录。项目的其他内容不会发送。',
                  'This text is sent to your default model; its generated queries are sent to the public catalogs above. No other project content is sent.',
                )}
              </small>
            </label>
            <Button type="submit" disabled={busy || !query.trim()}>
              {busy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Search size={16} />
              )}
              {busy
                ? L('搜索助手正在查找…', 'Search assistant is working…')
                : L('搜索候选资料', 'Search for candidates')}
            </Button>
          </form>
          {message && (
            <output role="alert" className="platform-notice">
              {message}
            </output>
          )}
          {result && (
            <section aria-live="polite">
              <p>{result.summary}</p>
              <ResearchCandidates result={result} />
              <p className="text-xs text-muted-foreground leading-6">
                {L(
                  '候选项只是目录线索。请先打开、核对版本与使用权，再决定是否导入全文。',
                  'Candidates are catalog leads only. Open them and check the edition and rights before deciding whether to import full text.',
                )}
              </p>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
