'use client';
import MaterialPreparation from './material-preparation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { Model } from '@/lib/types';
import type { SearchHit } from '@/lib/platform/search';
export default function SemanticSearch({
  projectId,
  query,
  onResults,
}: {
  projectId: string;
  query: string;
  onResults: (hits: SearchHit[]) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [models, setModels] = useState<Model[]>([]),
    [connection, setConnection] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [count, setCount] = useState(0),
    [writable, setWritable] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      api<{ models: Model[] }>('/api/workspace?models=1'),
      api<{ indexed: number; writable: boolean }>(
        `/api/semantic?project_id=${projectId}`,
      ),
    ])
      .then(([m, s]) => {
        if (!active) return;
        const items = m.models.filter((v) => v.provider === 'openrouter');
        setModels(items);
        setConnection(items[0]?.id || '');
        setCount(s.indexed);
        setWritable(s.writable);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  async function run() {
    setBusy(true);
    setMessage('');
    try {
      const data = await api<{ hits: SearchHit[] }>('/api/semantic', {
        action: 'search',
        project_id: projectId,
        connection_id: connection,
        run_id: crypto.randomUUID(),
        query,
      });
      onResults(data.hits);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  }
  if (!writable) return null;
  return (
    <details className="semantic-search">
      <summary>
        {L('按意思查找（可选）', 'Search by meaning (optional)')}
      </summary>
      <p>
        {L(
          '结合原词、别名与语义寻找候选段落。准备资料和每次查询会使用你的 OpenRouter 余额，并计入项目预算；仅发送文字。资料可在后台准备，关闭网页后继续。',
          'Combine wording, aliases and meaning to find candidate passages. Preparation and queries use your OpenRouter balance and project allowance; only text is sent. Preparation continues in the background after you close this page.',
        )}
      </p>
      <p>
        {L(
          `已准备 ${count} 段。使用 text-embedding-3-small，最多 5,000 段；恢复备份后需要重新准备。`,
          `Prepared ${count} passages. Uses text-embedding-3-small; up to 5,000 passages. Rebuild after restoring a backup.`,
        )}
      </p>
      <label>
        {L('使用哪个模型账号支付', 'Model account to use')}
        <select
          value={connection}
          disabled={busy}
          onChange={(e) => setConnection(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {!models.length && (
        <p>
          {L(
            '请在账号设置添加 OpenRouter 连接，并由项目负责人设置预算。',
            'Add an OpenRouter connection in account settings and ask the project owner to set an allowance.',
          )}
        </p>
      )}
      <MaterialPreparation
        projectId={projectId}
        connection={connection}
        onIndexed={setCount}
      />
      <div className="flow-actions">
        <Button
          type="button"
          disabled={busy || !connection || !query.trim() || !count}
          onClick={() => void run()}
        >
          {busy
            ? L('正在查找…', 'Searching…')
            : L('按意思查找上面的词句', 'Search the phrase above by meaning')}
        </Button>
      </div>
      {message && <output>{message}</output>}
      <small>
        {L(
          '相似度用于排列阅读线索，不表示历史结论可信度；尚未准备的文字不在语义检索范围。',
          'Similarity ranks reading leads, not historical confidence. Unprepared text is excluded from semantic retrieval.',
        )}
      </small>
    </details>
  );
}
