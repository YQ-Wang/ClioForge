'use client';
import SemanticSearch from './semantic-search';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import { api } from '@/lib/client-api';
import type { SearchHit } from '@/lib/platform/search';
export default function SourceSearch({
  projectId,
  onOpen,
}: {
  projectId: string;
  onOpen: (source: string, version: string, page: number) => void;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [query, setQuery] = useState(''),
    [submitted, setSubmitted] = useState(''),
    [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]),
    [message, setMessage] = useState(''),
    [more, setMore] = useState(false);
  async function search(append = false) {
    const term = append ? submitted : query.trim();
    if (!term) return;
    setBusy(true);
    setMessage('');
    try {
      const params = new URLSearchParams({
        project_id: projectId,
        q: term,
        offset: String(append ? hits.length : 0),
      });
      const data = await api<{ hits: SearchHit[] }>(`/api/platform?${params}`);
      setSubmitted(term);
      setHits((old) => (append ? [...old, ...data.hits] : data.hits));
      setMore(data.hits.length === 30);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : L('检索未完成，请重试。', 'Search did not finish. Please retry.'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="source-quick-search">
      <h3>{L('这批材料里，哪里提到了…', 'Where do these sources mention…')}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <Input
          aria-label={L(
            '在项目材料中查找词句',
            'Find a name or phrase in project sources',
          )}
          placeholder={L(
            '输入一个名字、地点或词句',
            'Enter a name, place or phrase',
          )}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={2000}
        />
        <Button type="submit" disabled={busy || !query.trim()}>
          <Search size={16} />
          {busy ? L('查找中…', 'Searching…') : L('查找原文', 'Find passages')}
        </Button>
      </form>
      <p className="search-scope">
        {L(
          '搜索本项目当前版本的文字，点击结果回到原页。尚未转录的照片不在检索范围内。',
          'Search the current text of this project and open each result at its source page. Images without a transcription are not searchable.',
        )}
      </p>
      <SemanticSearch
        projectId={projectId}
        query={query}
        onResults={(results) => {
          setSubmitted(query);
          setHits(results);
          setMore(false);
        }}
      />
      {message && <output className="platform-notice">{message}</output>}
      {submitted && (
        <output className="search-summary">
          {L(
            `「${submitted}」找到 ${hits.length}${more ? '+' : ''} 处`,
            `${hits.length}${more ? '+' : ''} passages for “${submitted}”`,
          )}
        </output>
      )}
      {submitted && !hits.length && !busy && (
        <p>
          {L(
            '当前文字中没有找到。可以尝试旧称、异体字或不同译名；这不能说明历史上没有发生。',
            'No match in the current text. Try an older name, spelling variant or translation; absence here is not evidence that something never happened.',
          )}
        </p>
      )}
      {hits.map((hit) => (
        <button
          className="quick-search-hit"
          key={hit.id}
          onClick={() => onOpen(hit.source_id, hit.version_id, hit.page)}
        >
          <strong>
            {hit.title} · {L(`第 ${hit.page} 页`, `p. ${hit.page}`)}
          </strong>
          <p>{hit.snippet}</p>
          <span>{L('对照原页 →', 'Open source page →')}</span>
        </button>
      ))}
      {more && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void search(true)}
        >
          {L('查看更多原文', 'More passages')}
        </Button>
      )}
    </section>
  );
}
