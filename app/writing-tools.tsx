'use client';
import EvidenceDiscussion from './evidence-discussion';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { usePreparedDownload } from '@/lib/use-prepared-download';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import { api } from '@/lib/client-api';
import type { WritingCitation } from '@/lib/writing-export';
import type { Claim, ClaimEvidence } from '@/lib/workbench-types';
import type { Evidence } from '@/lib/types';
type Materials = {
  citations: WritingCitation[];
  evidence: Evidence[];
  claims: Claim[];
  links: ClaimEvidence[];
};
export default function WritingTools({
  projectId,
  title,
  body,
  document: richDocument,
  onInsert,
}: {
  projectId: string;
  title: string;
  body: string;
  document?: string | null;
  onInsert?: (text: string) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const { download, prepare } = usePreparedDownload();
  const [data, setData] = useState<Materials | null>(null),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<string | null>(null),
    [printReady, setPrintReady] = useState(false);
  const printFrame = useRef<HTMLIFrameElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const cite = (c: WritingCitation) =>
    `[${c.label.replaceAll(']', '）')}](${c.href}&evidence=${c.id})`;
  const matchingCitations =
    data?.citations.filter((c) =>
      `${c.label} ${c.text}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    ) || [];
  async function loadMaterials() {
    setBusy(true);
    setError('');
    try {
      setData(await api<Materials>(`/api/writing?project_id=${projectId}`));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : L(
              '无法加载出处，请重试。',
              'Could not load citations. Please retry.',
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="writing-tools"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy) void loadMaterials();
      }}
    >
      <summary>
        {L(
          '引用、论证提纲与 Word 导出',
          'Citations, argument outline and Word export',
        )}
      </summary>
      <p>
        {L(
          '选择你已经保存的证据插入出处，导出时转换为 Word 脚注。脚注为静态文字，不是 Zotero 动态引用。',
          'Insert evidence you have saved. Export converts its links to Word footnotes. Footnotes are static text, not live Zotero citations.',
        )}
      </p>
      {busy && (
        <output>
          {L('正在准备引用与导出，请稍候…', 'Preparing citations and export…')}
        </output>
      )}
      <fieldset
        className="writing-export-actions"
        aria-label={L('导出格式', 'Export format')}
      >
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const r = await fetch('/api/writing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  project_id: projectId,
                  title,
                  body,
                  document: richDocument,
                }),
              });
              if (!r.ok)
                throw new Error(((await r.json()) as { error: string }).error);
              prepare(await r.blob(), (title || 'ClioForge') + '.docx');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Export failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          {L('导出 Word（含脚注）', 'Export Word with footnotes')}
        </Button>
        {download && !busy && (
          <a
            href={download.url}
            download={download.name}
            className={buttonVariants({ variant: 'outline' })}
          >
            {L('保存已准备的 Word 文稿', 'Save prepared Word document')}
          </a>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const response = await fetch('/api/writing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  project_id: projectId,
                  title,
                  body,
                  document: richDocument,
                  format: 'print',
                }),
              });
              if (!response.ok)
                throw new Error(
                  ((await response.json()) as { error: string }).error,
                );
              setPrintReady(false);
              setPreview(URL.createObjectURL(await response.blob()));
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Print failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          {L('预览 / 保存 PDF', 'Preview / save PDF')}
        </Button>
      </fieldset>
      <p>
        {L(
          'Word 保留文字格式、表格、图画和脚注，并将常用公式转换为可编辑公式。打印可保存 PDF；可再次编辑的画布请保留完整文稿或项目备份。',
          'Word preserves text styling, tables, diagrams and footnotes, with editable common equations. Print to save a PDF; retain the complete document or a backup to reopen drawing canvases.',
        )}
      </p>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="writing-print-dialog sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {L('文稿打印预览', 'Document print preview')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '检查文稿后，打开打印窗口并选择“另存为 PDF”。',
                'Check the document, then open print and choose Save as PDF.',
              )}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <iframe
              ref={printFrame}
              src={preview}
              title={L('待打印的文稿', 'Document to print')}
              sandbox="allow-same-origin allow-modals"
              onLoad={() => setPrintReady(true)}
            />
          )}
          <Button
            type="button"
            disabled={!printReady}
            onClick={() => {
              try {
                const target = printFrame.current?.contentWindow;
                if (!target)
                  throw new Error(
                    L('预览尚未加载。', 'Preview has not loaded.'),
                  );
                target.focus();
                target.print();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Print failed');
                setPreview(null);
              }
            }}
          >
            {L('打开打印窗口', 'Open print dialog')}
          </Button>
        </DialogContent>
      </Dialog>
      {error && <p role="alert">{error}</p>}
      {onInsert && (data || error) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void loadMaterials()}
        >
          {data
            ? L('刷新可引用证据', 'Refresh available evidence')
            : L('重新加载出处', 'Retry loading citations')}
        </Button>
      )}
      {data && onInsert && (
        <>
          <Input
            aria-label={L('查找可引用证据', 'Find evidence to cite')}
            placeholder={L(
              '按材料标题或原文查找',
              'Find by source title or quotation',
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="writing-evidence-list">
            {matchingCitations.map((c) => (
              <article key={c.id}>
                <strong>{c.label}</strong>
                <p>{data.evidence.find((e) => e.id === c.id)?.quote}</p>
                {c.stale && (
                  <small>
                    {L(
                      '材料有新版本，请重新核对',
                      'Source updated; check this evidence',
                    )}
                  </small>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onInsert(cite(c))}
                >
                  {L('插入出处', 'Insert citation')}
                </Button>
                <EvidenceDiscussion projectId={projectId} targetId={c.id} />
              </article>
            ))}
          </div>
          {!!data.citations.length && !matchingCitations.length && (
            <output>
              {L(
                '没有匹配的证据，请换一个关键词或清空搜索。',
                'No matching evidence. Try another keyword or clear the search.',
              )}
            </output>
          )}
          {!data.citations.length && (
            <p>
              {L(
                '阅读材料时先保存一条证据摘录，它就会出现在这里。',
                'Save an evidence excerpt while reading; it will appear here.',
              )}
            </p>
          )}
          {!!data.claims.length && (
            <details>
              <summary>
                {L(
                  '从已有论证组织提纲',
                  'Build an outline from existing claims',
                )}
              </summary>
              {data.claims.map((claim) => {
                const linked = data.links.filter(
                  (l) => l.claim_id === claim.id,
                );
                return (
                  <article key={claim.id}>
                    <strong>{claim.body}</strong>
                    <p>
                      {L('支持', 'Supports')}:{' '}
                      {linked.filter((l) => l.relation === 'supports').length} ·{' '}
                      {L('挑战', 'Challenges')}:{' '}
                      {linked.filter((l) => l.relation === 'challenges').length}{' '}
                      ·{' '}
                      {claim.status === 'reviewed'
                        ? L('已审读', 'Reviewed')
                        : L('草稿', 'Draft')}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        onInsert(
                          `\n## ${claim.body}\n\n${linked
                            .map((l) => {
                              const c = data.citations.find(
                                  (c) => c.id === l.evidence_id,
                                ),
                                e = data.evidence.find(
                                  (e) => e.id === l.evidence_id,
                                );
                              return c
                                ? `- ${l.relation === 'supports' ? L('支持', 'Supports') : l.relation === 'challenges' ? L('挑战', 'Challenges') : L('背景', 'Context')}: ${e?.quote || ''} ${cite(c)}`
                                : '';
                            })
                            .join(
                              '\n',
                            )}\n\n${L('待写：解释这些材料能支持到什么范围，并回应不同解释。', 'To write: explain the scope supported by these sources and address alternatives.')}\n`,
                        )
                      }
                    >
                      {L('加入提纲', 'Add to outline')}
                    </Button>
                  </article>
                );
              })}
            </details>
          )}
        </>
      )}
    </details>
  );
}
