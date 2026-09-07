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
  onSample,
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
  onSample: () => void;
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
                  '还没有资料。也可以先用一组公开铭文熟悉研究流程。',
                  'No sources yet. You can also explore the workflow with a small set of public inscriptions.',
                )}
              </p>
              <Button variant="secondary" disabled={busy} onClick={onSample}>
                {busy
                  ? L('正在准备…', 'Preparing…')
                  : L('用公开史料试一试', 'Try public historical sources')}
              </Button>
              <small>
                {L(
                  '40 条 LED 拉丁铭文 · 保留出处与许可',
                  '40 LED Latin inscriptions · sources and license preserved',
                )}
              </small>
            </div>
          )}
        </section>
        <section className="overview-section research-prompts">
          <header>
            <h3>{L('一张书桌上的研究过程', 'Your research, connected')}</h3>
          </header>
          {[
            {
              number: '01',
              title: L('阅读与校订', 'Read and annotate'),
              text: L(
                '对照原件，保留难辨认与不确定之处。',
                'Keep the original in view and mark what remains uncertain.',
              ),
              tab: 'sources',
            },
            {
              number: '02',
              title: L('摘录与比较', 'Excerpt and compare'),
              text: L(
                '让支持、质疑与不同解释各有依据。',
                'Keep evidence for supporting and competing interpretations.',
              ),
              tab: 'evidence',
            },
            {
              number: '03',
              title: L('组织与写作', 'Organize and write'),
              text: L(
                '把阅读所得连成自己的研究论述。',
                'Develop your reading into your own argument.',
              ),
              tab: 'notes',
            },
          ].map((item) => (
            <button key={item.number} onClick={() => onNavigate(item.tab)}>
              <span>{item.number}</span>
              <div>
                <h4>{item.title}</h4>
                <p>{item.text}</p>
              </div>
              <ArrowRight size={15} />
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
