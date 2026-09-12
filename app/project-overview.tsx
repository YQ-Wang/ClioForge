'use client';
import {
  ArrowRight,
  BookOpen,
  Cloud,
  FileText,
  NotebookPen,
  Quote,
  Search,
  Upload,
  Check,
} from 'lucide-react';
import ResearchBrief from './research-brief';
import ResearchPath from './research-path';
import SourceDiscovery from './source-discovery';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import type { Evidence, Note, Source } from '@/lib/types';
export default function ProjectOverview({
  projectId,
  sources,
  notes,
  counts,
  evidence,
  onImport,
  onDrive,
  onNavigate,
  onSource,
  canSearch,
  busy,
}: {
  projectId: string;
  sources: Source[];
  notes: Note[];
  counts?: { sources: number; notes: number; evidence: number } | null;
  evidence: Evidence[];
  onImport: () => void;
  onDrive: () => void;
  onNavigate: (tab: string) => void;
  onSource: (id: string) => void;
  canSearch: boolean;
  busy: boolean;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const started = sources.length > 0;
  return (
    <div className="project-overview">
      <ResearchBrief projectId={projectId} />
      <section className="next-step-card">
        <div>
          <p className="eyebrow">{L('下一步', 'YOUR NEXT STEP')}</p>
          <h2>
            {started
              ? L('回到材料，继续追问', 'Return to the sources. Keep asking.')
              : L('先放下一份材料', 'Begin with your first source')}
          </h2>
          <p>
            {started
              ? L(
                  '阅读一页，留下一段摘录，或围绕一个问题比较这批材料。每一步都保留出处。',
                  'Read a page, save a passage, or compare these sources around a question. Every step keeps a path back to the original.',
                )
              : L(
                  'PDF、照片或文本都可以。原件会被保留，你可以随时回看，不必先配置研究助手。',
                  'A PDF, photograph or text file is enough. Your original is preserved. You can start reading without setting up an assistant.',
                )}
          </p>
          <div className="flow-actions">
            <Button
              disabled={busy}
              onClick={started ? () => onNavigate('sources') : onImport}
            >
              {started ? <BookOpen size={17} /> : <Upload size={17} />}{' '}
              {started
                ? L('继续阅读', 'Continue reading')
                : L('从电脑导入', 'Upload a source')}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={started ? () => onNavigate('platform') : onDrive}
            >
              {started ? <Search size={17} /> : <Cloud size={17} />}{' '}
              {started
                ? L('围绕问题比较', 'Explore a question')
                : L('从 Google Drive 选择', 'Choose from Google Drive')}
            </Button>
            <SourceDiscovery
              projectId={projectId}
              disabled={busy || !canSearch}
              variant="outline"
            />
          </div>
        </div>
        <div className="desk-illustration" aria-hidden="true">
          <div className="desk-sheet sheet-back" />
          <div className="desk-sheet sheet-front">
            <span />
            <span />
            <span />
            <i />
            <span />
            <span />
            <span />
          </div>
          <div className="desk-quote">“</div>
          <div className="desk-check">
            <Check size={17} />
          </div>
        </div>
      </section>
      <div className="overview-counts">
        {[
          {
            n: counts?.sources ?? sources.length,
            label: L('份资料', 'Sources'),
            icon: FileText,
            tab: 'sources',
          },
          {
            n: counts?.evidence ?? evidence.length,
            label: L('条证据摘录', 'Evidence excerpts'),
            icon: Quote,
            tab: 'evidence',
          },
          {
            n: counts?.notes ?? notes.length,
            label: L('篇研究笔记', 'Research notes'),
            icon: NotebookPen,
            tab: 'notes',
          },
        ].map((item) => (
          <button key={item.tab} onClick={() => onNavigate(item.tab)}>
            <item.icon size={19} />
            <strong>{item.n}</strong>
            <span>{item.label}</span>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <div className="overview-columns">
        <section className="overview-section">
          <header>
            <h3>{L('你的材料', 'Your sources')}</h3>
            {started && (
              <button onClick={() => onNavigate('sources')}>
                {L('查看全部', 'View all')}
                <ArrowRight size={14} />
              </button>
            )}
          </header>
          {started ? (
            sources.slice(0, 5).map((source) => (
              <button
                className="overview-source"
                key={source.id}
                onClick={() => onSource(source.id)}
              >
                <span>
                  <FileText size={19} />
                </span>
                <div>
                  <strong>{source.title}</strong>
                  <small>
                    {new Date(source.created_at).toLocaleDateString(locale)}
                  </small>
                </div>
                <ArrowRight size={15} />
              </button>
            ))
          ) : (
            <div className="gentle-empty">
              <BookOpen size={26} />
              <p>
                {L(
                  '还没有资料。可以自行导入相关材料，或让搜索助手先寻找候选资料。',
                  'No sources yet. Import relevant material yourself, or ask the search assistant to find candidates first.',
                )}
              </p>
              <small>
                {L(
                  '搜索助手会根据你输入的搜索目标生成检索词并调用目录检索；候选结果由你确认，不会自动混入项目。',
                  'The search assistant derives queries from the search goal you enter and calls catalog search. You review candidates before anything is added.',
                )}
              </small>
            </div>
          )}
        </section>
        <ResearchPath
          onNavigate={onNavigate}
          counts={
            counts || {
              sources: sources.length,
              evidence: evidence.length,
              notes: notes.length,
            }
          }
        />
      </div>
    </div>
  );
}
