import type { JobsEnv } from './jobs';
export async function checkWatches(
  env: JobsEnv,
  fetcher: typeof fetch = fetch,
) {
  const date = new Date().toISOString();
  const due = (
    await env.DB.prepare(
      'SELECT * FROM research_watches WHERE enabled=1 AND next_run<=? ORDER BY next_run LIMIT 10',
    )
      .bind(date)
      .all<{
        id: string;
        project_id: string;
        query: string;
        interval_days: number;
      }>()
  ).results;
  for (const watch of due) {
    const lease = await env.DB.prepare(
      'UPDATE research_watches SET next_run=? WHERE id=? AND enabled=1 AND next_run<=?',
    )
      .bind(new Date(Date.now() + 10 * 60_000).toISOString(), watch.id, date)
      .run();
    if (!lease.meta.changes) continue;
    try {
      const url = new URL('https://api.crossref.org/works');
      url.search = new URLSearchParams({
        query: watch.query,
        sort: 'indexed',
        order: 'desc',
        rows: '20',
        select: 'DOI,title,URL,published,author,publisher',
      }).toString();
      const response = await fetcher(url, {
        headers: { 'User-Agent': 'Canwoo/0.1 research-watch' },
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('source unavailable');
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error('source too large');
      const data = JSON.parse(text) as {
        message: { items: Record<string, unknown>[] };
      };
      if (!Array.isArray(data.message?.items))
        throw new Error('source invalid');
      for (const item of data.message.items.slice(0, 20)) {
        if (typeof item.DOI !== 'string' || item.DOI.length > 500) continue;
        const title = Array.isArray(item.title)
          ? String(item.title[0] || item.DOI).slice(0, 1000)
          : item.DOI;
        const digest = new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(JSON.stringify(item)),
          ),
        );
        const hash = Array.from(digest, (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
        await env.DB.prepare(
          "INSERT OR IGNORE INTO research_inbox VALUES(?,?,?,'watch',?,?,?,'pending',?)",
        )
          .bind(
            crypto.randomUUID(),
            watch.project_id,
            `watch:${watch.id}:${item.DOI}:${hash}`,
            title,
            `Crossref 资料线索 · 检索词：${watch.query}\n本次范围：按收录更新排序的前 20 条 DOI 元数据，不能代表全部相关史料。`,
            `https://doi.org/${encodeURIComponent(item.DOI)}`,
            date,
          )
          .run();
      }
      await env.DB.prepare(
        'UPDATE research_watches SET checked_at=?,error=NULL,next_run=? WHERE id=?',
      )
        .bind(
          date,
          new Date(Date.now() + watch.interval_days * 86400000).toISOString(),
          watch.id,
        )
        .run();
    } catch {
      await env.DB.prepare(
        'UPDATE research_watches SET checked_at=?,error=?,next_run=? WHERE id=?',
      )
        .bind(
          date,
          'Crossref 检索失败，本次覆盖不完整；一小时后重试。',
          new Date(Date.now() + 3600000).toISOString(),
          watch.id,
        )
        .run();
    }
  }
}
