'use client';
import { unchangedOcrPage } from '@/lib/ocr-candidates';
import SourceDerivation from './source-derivation';
import { citationSpan, validCitationSpan } from '@/lib/citation-location';
import { useI18n } from '@/lib/i18n/provider';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  FileText,
  GitBranch,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  ArrowLeft,
  ArrowRight,
  Check,
  Maximize2,
  Minimize2,
  Quote,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
  api,
  ApiError,
  downloadJson,
  uploadOriginal,
  readOriginal,
  rpc,
  loadSnapshot,
  projectHeader,
  loadWorkbench,
} from '@/lib/client-api';
import { documentType, extractPages, pageImage } from '@/lib/documents';
import type {
  Project,
  Source,
  SourceVersion,
  Note,
  Evidence,
  Run,
  Model,
} from '@/lib/types';
import { Field, Notice } from './workspace';
import { formText } from '@/lib/form-values';
import ResearchPlatform from './research-platform';
import BibliographyPanel from './bibliography-panel';
import ArgumentPanel from './argument-panel';
import ProvenancePanel from './provenance-panel';
import TasksPanel from './tasks-panel';
import { DraftShelf, NoteEditor, TextDiff } from './version-tools';
import SourcePreview, { type ReaderLocation } from './source-preview';
import HighlightedText, { type TextSelection } from './highlighted-text';
import ReadingAnnotations from './reading-annotations';
import { useReadingPage } from '@/hooks/use-reading-page';
import { draftPrefix, type DraftRecord } from '@/lib/drafts';
import { noteHeads } from '@/lib/notes';
import NoteLibrary from './note-library';
import SourceComparison from './source-comparison';
import SourceManagement from './source-management';
import EvidenceLibrary from './evidence-library';
import BatchTranscription from './batch-transcription';
import { useLocalDraft } from '@/hooks/use-local-draft';
import ProjectOverview from './project-overview';
import FeaturePurpose from './feature-purpose';
import ProjectSettings from './project-settings';
import SourceSearch from './source-search';
import IiifImport from './iiif-import';
import CloudConnections from './cloud-connections';
import { projectSections, sourcePath } from '@/lib/navigation';
import {
  navigateWorkspace,
  useWorkspaceSearch,
} from '@/hooks/use-workspace-route';
import { missionPath, researchRoute } from '@/lib/research-navigation';
import { canPublishReaderLocation, sourceRoute } from '@/lib/source-navigation';
import { DEFAULT_RESEARCH_MODEL } from '@/lib/model-routing';
import { Cloud } from 'lucide-react';
import type { WorkbenchData, Region } from '@/lib/workbench-types';
const time = (value: string, locale: string) =>
  new Date(value).toLocaleString(locale);
const relationName = { supports: '支持', challenges: '质疑', context: '背景' };
const methodName = (method: string) =>
  ({
    import: '导入文本',
    manual: '人工校订',
    restore: '版本恢复',
    'ocr-reviewed': 'OCR 已核查',
  })[method] || method;
export default function ProjectDesk({
  project,
  userId,
  onAssistantSettings,
  tab,
  onNavigate,
  onCounts,
  onProjectUpdated,
}: {
  project: Project;
  tab: string;
  onNavigate: (tab: string) => void;
  onCounts: (counts: Record<string, number>) => void;
  onProjectUpdated: (project: Project) => void;
  userId: string;
  onAssistantSettings: () => void;
}) {
  const { t, locale } = useI18n();
  const [sources, setSources] = useState<Source[]>([]);
  const [versions, setVersions] = useState<SourceVersion[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [preferredModel, setPreferredModel] = useState('');
  const [sourceId, setSourceId] = useState('');
  const sourceItems = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = sourceItems.current;
    if (tab !== 'sources' || !list) return;
    const revealSelected = () => {
      const selected = list.querySelector<HTMLElement>('[aria-current="true"]');
      if (!selected) return;
      const top = selected.offsetTop;
      if (
        top < list.scrollTop ||
        top + selected.offsetHeight > list.scrollTop + list.clientHeight
      )
        list.scrollTop = Math.max(
          0,
          top - (list.clientHeight - selected.offsetHeight) / 2,
        );
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(list);
    return () => observer.disconnect();
  }, [sourceId, tab, sources]);
  const [importOpen, setImportOpen] = useState(false);
  const setTab = onNavigate;
  const navigate = onNavigate;
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [focused, setFocused] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [overviewCounts, setOverviewCounts] = useState<{
    sources: number;
    notes: number;
    evidence: number;
  } | null>(null);
  const [role, setRole] = useState(project.role || 'viewer');
  const [accessLost, setAccessLost] = useState(false);
  const canWrite = ['owner', 'editor', 'reviewer'].includes(role);
  const [noteDraft, setNoteDraft] = useState<{
    note: Note | null;
    key: string;
    initial?: { title: string; text: string };
  } | null>(null);
  function openNote(
    note: Note | null,
    draft?: DraftRecord,
    initial?: { title: string; text: string },
  ) {
    setNoteDraft({
      note,
      key:
        draft?.key ||
        `${draftPrefix(userId, project.id)}note:${note?.id || crypto.randomUUID()}`,
      initial,
    });
  }
  const [workbench, setWorkbench] = useState<WorkbenchData | null>(null);
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [researchReturn, setResearchReturn] = useState('');
  const [budgetReturn, setBudgetReturn] = useState('');
  const [bibliographySource, setBibliographySource] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const refreshController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      refreshController.current?.abort();
    };
  }, []);
  const refresh = useCallback(async () => {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const header = await projectHeader(project.id, controller.signal);
      const [snapshot, detail] = await Promise.all([
        loadSnapshot(project.id, controller.signal, header),
        loadWorkbench(project.id, controller.signal, header.checkpoint),
      ]);
      if (!mounted.current || controller.signal.aborted) return;
      setRole(snapshot.project.role || 'viewer');
      setWorkbench(detail);
      setSources(snapshot.sources);
      setVersions(snapshot.source_versions);
      setNotes(snapshot.notes);
      setEvidence(snapshot.evidence);
      setRuns(snapshot.research_runs);
      setModels(snapshot.models);
      setSourceId((current) =>
        snapshot.sources.some((source) => source.id === current)
          ? current
          : snapshot.sources[0]?.id || '',
      );
      setDetailsLoaded(true);
      return { ...snapshot, workbench: detail };
    } catch (error) {
      if (controller.signal.aborted) return;
      controller.abort();
      if (error instanceof ApiError && [401, 403, 404].includes(error.status))
        setAccessLost(true);
      if (mounted.current)
        setMessage(
          error instanceof ApiError && error.status === 429
            ? error.message
            : '暂时无法读取项目，请刷新重试。未保存的笔记仍可从本机草稿恢复。',
        );
    } finally {
      if (mounted.current && refreshController.current === controller)
        setLoading(false);
    }
  }, [project.id]);
  useEffect(() => {
    if (detailsLoaded) return;
    setLoading(true);
    if (tab !== 'overview') {
      void refresh();
      return;
    }
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    void api<{
      project: Project;
      sources: Source[];
      counts: { sources: number; notes: number; evidence: number };
    }>(
      `/api/workspace?project_id=${encodeURIComponent(project.id)}&overview=1`,
      undefined,
      'GET',
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setRole(data.project.role || 'viewer');
        setSources(data.sources);
        setOverviewCounts(data.counts);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && [401, 403, 404].includes(error.status))
          setAccessLost(true);
        setMessage(
          error instanceof Error
            ? error.message
            : '暂时无法读取项目，请刷新重试。未保存的笔记仍可从本机草稿恢复。',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh, tab, detailsLoaded, project.id]);
  useEffect(() => {
    void api<{ prices: { model_id: string }[] }>('/api/models/pricing')
      .then((data) => setPreferredModel(data.prices[0]?.model_id || ''))
      .catch(() => {});
  }, []);
  const checkAccess = useCallback(
    () =>
      void api<{ project: Project }>(
        `/api/workspace?project_id=${project.id}&access=1`,
      )
        .then((data) => setRole(data.project.role || 'viewer'))
        .catch((error) => {
          if (
            error instanceof ApiError &&
            [401, 403, 404].includes(error.status)
          )
            setAccessLost(true);
        }),
    [project.id],
  );
  useEffect(() => {
    window.addEventListener('focus', checkAccess);
    return () => window.removeEventListener('focus', checkAccess);
  }, [checkAccess]);
  const latest = (id: string) =>
    versions
      .filter((v) => v.source_id === id)
      .sort((a, b) => b.revision - a.revision)[0];
  const routeSearch = useWorkspaceSearch();
  const readerRoute = sourceRoute(routeSearch, project.id, versions);
  const [appliedSourceSearch, setAppliedSourceSearch] = useState('');
  const readerWrittenSearch = useRef('');
  const readerReady =
    !loading &&
    appliedSourceSearch === routeSearch &&
    (readerRoute.kind === 'source' || readerRoute.kind === 'default');
  useEffect(() => {
    if (loading || appliedSourceSearch === routeSearch) return;
    const incoming = sourceRoute(routeSearch, project.id, versions);
    if (incoming.kind === 'unavailable') return;
    // The reader already applied its own page/annotation change. A history or
    // external navigation instead needs a fresh location, even on the same source.
    const fromReader = readerWrittenSearch.current === routeSearch;
    readerWrittenSearch.current = '';
    if (incoming.kind === 'source' && !fromReader) {
      setSourceId(incoming.sourceId);
      setLocation({
        sourceId: incoming.sourceId,
        versionId: incoming.versionId,
        page: incoming.page,
        annotationId: incoming.annotationId,
        start: incoming.start,
        end: incoming.end,
        nonce: crypto.randomUUID(),
      });
    }
    setAppliedSourceSearch(routeSearch);
  }, [loading, versions, project.id, routeSearch, appliedSourceSearch]);
  const publishReaderLocation = useCallback(
    (path: string) => {
      if (
        !canPublishReaderLocation(
          window.location.search,
          appliedSourceSearch,
          project.id,
        )
      )
        return;
      const search = path.slice(path.indexOf('?'));
      if (search === window.location.search) return;
      readerWrittenSearch.current = search;
      navigateWorkspace(path, true);
    },
    [appliedSourceSearch, project.id],
  );
  const latestNotes = noteHeads(notes).filter((note) => !note.archived);
  useEffect(() => {
    onCounts({
      sources:
        !detailsLoaded && overviewCounts
          ? overviewCounts.sources
          : sources.length,
      notes:
        !detailsLoaded && overviewCounts
          ? overviewCounts.notes
          : latestNotes.length,
      evidence:
        !detailsLoaded && overviewCounts
          ? overviewCounts.evidence
          : evidence.length,
    });
  }, [
    sources.length,
    latestNotes.length,
    evidence.length,
    onCounts,
    detailsLoaded,
    overviewCounts,
  ]);
  const currentSource = sources.find((s) => s.id === sourceId);
  const visibleSources = sources.filter(
    (source) =>
      source.title.toLowerCase().includes(search.toLowerCase()) &&
      (sourceFilter === 'all' ||
        (sourceFilter === 'blank'
          ? latest(source.id)?.pages.some((page) => !page.text.trim())
          : source.media_type.startsWith(sourceFilter))),
  );
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  }
  type ImportItem = {
    file: File;
    status: 'waiting' | 'running' | 'ready' | 'failed';
    error?: string;
    pages?: Awaited<ReturnType<typeof extractPages>>;
    receipt?: { id: string; path: string };
    type?: string;
  };
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [importExpanded, setImportExpanded] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importStopping, setImportStopping] = useState(false);
  const importActive = useRef(false);
  const stopImport = useRef(false);
  async function importFiles(items: ImportItem[]) {
    if (busy || importActive.current || !canWrite) return;
    importActive.current = true;
    stopImport.current = false;
    setImporting(true);
    setImportStopping(false);
    setImportExpanded(true);
    setBusy(true);
    setImportOpen(false);
    setMessage('');
    const queue = items.map((item) => ({ ...item }));
    setImportItems([...queue]);
    let lastId = '';
    try {
      for (const item of queue) {
        if (stopImport.current || !mounted.current) break;
        if (item.status === 'ready') continue;
        item.status = 'running';
        item.error = undefined;
        setImportItems([...queue]);
        try {
          item.type ||= documentType(item.file);
          item.pages ||= await extractPages(item.file, item.type);
          if (!mounted.current) break;
          item.receipt ||= await uploadOriginal(
            project.id,
            item.file,
            item.type,
          );
          const imported = await rpc('import_source', {
            p_id: item.receipt.id,
            p_project: project.id,
            p_title: item.file.name,
            p_path: item.receipt.path,
            p_type: item.type,
            p_pages: item.pages,
          });
          if (imported.error) throw new Error(imported.error.message);
          item.status = 'ready';
          lastId = item.receipt.id;
        } catch (error) {
          item.status = 'failed';
          item.error =
            error instanceof Error ? error.message : t('导入未完成，请重试。');
        }
        if (mounted.current) setImportItems([...queue]);
      }
      if (!mounted.current) return;
      await refresh();
      if (lastId && mounted.current) {
        setSourceId(lastId);
        setLocation(null);
        navigate('sources');
      }
    } finally {
      importActive.current = false;
      if (mounted.current) {
        setImporting(false);
        setImportStopping(false);
        setBusy(false);
      }
    }
  }
  function openEvidence(item: Evidence) {
    setSourceId(item.source_id);
    setLocation({
      sourceId: item.source_id,
      versionId: item.version_id,
      page: item.page,
      start: item.quote_start,
      end: item.quote_end,
      region: item.region,
      annotationId: item.id,
      nonce: crypto.randomUUID(),
    });
    setTab('sources');
  }
  async function exportProject() {
    await action(async () => {
      const snapshot = await refresh();
      if (!snapshot) throw new Error(t('无法导出未完整读取的数据。'));
      downloadJson(
        {
          format: 'foliotrace',
          version: 1,
          exported_at: new Date().toISOString(),
          project: snapshot.project,
          sources: snapshot.sources,
          source_versions: snapshot.source_versions,
          notes: snapshot.notes,
          evidence: snapshot.evidence,
          research_runs: snapshot.research_runs,
          workbench: snapshot.workbench,
        },
        `${project.title.replace(/[^\p{L}\p{N}_-]/gu, '_')}.json`,
      );
      setMessage(
        '已导出文本、版本、引文与任务记录。原始附件请在资料阅读器中逐份下载。',
      );
    });
  }
  if (accessLost)
    return (
      <div className="desk-empty">
        <h2>
          {locale === 'en'
            ? 'This project is no longer available to your account'
            : '你的账户已无法访问这个项目'}
        </h2>
        <p>
          {locale === 'en'
            ? 'Access may have changed. Contact the project owner if you need to continue.'
            : '项目权限可能已变更。如需继续研究，请联系项目负责人。'}
        </p>
        <Link href="/">
          {locale === 'en' ? 'Back to my research' : '回到我的研究'}
        </Link>
      </div>
    );
  return (
    <>
      <div className="page-title project-summary">
        <div>
          <p className="eyebrow">{t('研究项目')}</p>
          <h1>
            {tab === 'overview'
              ? project.title
              : projectSections.find((item) => item.id === tab)?.[
                  locale === 'en' ? 'en' : 'zh'
                ]}
          </h1>
          {tab === 'overview' && (
            <p className="text-muted-foreground mt-2">{project.description}</p>
          )}
        </div>
        <div className="project-actions">
          {tab === 'sources' && sources.length > 1 && (
            <Button variant="outline" onClick={() => setComparing(true)}>
              {locale === 'en' ? 'Compare sources' : '材料对读'}
            </Button>
          )}
          {['sources', 'notes'].includes(tab) && (
            <DraftShelf
              userId={userId}
              projectId={project.id}
              onResume={(draft) => {
                if (draft.value.kind === 'note') {
                  openNote(
                    notes.find((note) => note.id === draft.value.entityId) ||
                      null,
                    draft,
                  );
                  setTab('notes');
                } else {
                  const version = versions.find(
                    (v) =>
                      v.id === draft.value.versionId &&
                      v.source_id === draft.value.sourceId,
                  );
                  if (!version) {
                    setMessage('草稿所依赖的版本暂不可用；请刷新后再恢复。');
                    return;
                  }
                  setSourceId(version.source_id);
                  setLocation({
                    sourceId: version.source_id,
                    versionId: version.id,
                    page: draft.value.page || 1,
                    annotationId:
                      draft.value.kind === 'reading'
                        ? draft.value.entityId
                        : undefined,
                    nonce: crypto.randomUUID(),
                  });
                  setTab('sources');
                }
              }}
            />
          )}
          <Button
            variant="outline"
            size="icon"
            disabled={busy}
            onClick={() => void refresh()}
            aria-label={t('刷新项目')}
          >
            <RefreshCw size={15} />
          </Button>
          {['overview', 'sources'].includes(tab) && (
            <Button
              disabled={busy || !canWrite}
              onClick={() => setImportOpen(true)}
            >
              <Upload size={15} />
              {t('导入资料')}
            </Button>
          )}
        </div>
      </div>
      {comparing && sources.length > 1 && (
        <SourceComparison
          sources={sources}
          versions={versions}
          initialSource={sourceId}
          userId={userId}
          canWrite={canWrite}
          onClose={() => setComparing(false)}
          onCompose={(title, text) => {
            setComparing(false);
            setTab('notes');
            openNote(null, undefined, { title, text });
          }}
        />
      )}
      <input
        ref={upload}
        className="hidden"
        type="file"
        multiple
        accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          if (files.length > 20) {
            setMessage(
              locale === 'en'
                ? 'Please select up to 20 files at a time.'
                : '每次最多选择 20 份资料。',
            );
            return;
          }
          if (files.length)
            void importFiles([
              ...importItems.filter((item) => item.status !== 'ready'),
              ...files.map((file) => ({ file, status: 'waiting' as const })),
            ]);
        }}
      />
      {importItems.length > 0 && (
        <section
          className="import-progress"
          aria-label={
            locale === 'en' ? 'Source import progress' : '资料导入进度'
          }
        >
          <div>
            <strong>
              {locale === 'en' ? 'Source import' : '资料导入'} ·{' '}
              {importItems.filter((item) => item.status === 'ready').length} /{' '}
              {importItems.length}
            </strong>
            {importing ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={importStopping}
                onClick={() => {
                  stopImport.current = true;
                  setImportStopping(true);
                }}
              >
                {importStopping
                  ? locale === 'en'
                    ? 'Finishing this file…'
                    : '正在完成当前文件…'
                  : locale === 'en'
                    ? 'Stop after this file'
                    : '完成当前文件后暂停'}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={importExpanded}
                aria-controls="source-import-details"
                onClick={() => setImportExpanded((expanded) => !expanded)}
              >
                {importExpanded
                  ? locale === 'en'
                    ? 'Hide details'
                    : '收起详情'
                  : locale === 'en'
                    ? 'Show details'
                    : '查看详情'}
              </Button>
            )}
          </div>
          <progress
            aria-label={
              locale === 'en' ? 'Files ready to read' : '可以阅读的文件'
            }
            value={importItems.filter((item) => item.status === 'ready').length}
            max={importItems.length}
          />
          <div
            id="source-import-details"
            className="import-details"
            hidden={!importExpanded}
          >
            {importItems.map((item, index) => (
              <div className="import-file-row" key={index}>
                <FileText size={15} />
                <span>{item.file.name}</span>
                <small>
                  {item.status === 'ready'
                    ? locale === 'en'
                      ? 'Ready to read'
                      : '可以阅读'
                    : item.status === 'running'
                      ? locale === 'en'
                        ? 'Saving original and text…'
                        : '正在保存原件与文字…'
                      : item.status === 'failed'
                        ? item.error
                        : locale === 'en'
                          ? 'Waiting'
                          : '等待导入'}
                </small>
                {!importing && item.status !== 'ready' && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      locale === 'en'
                        ? `Remove ${item.file.name} from import`
                        : `从导入中移除 ${item.file.name}`
                    }
                    onClick={() =>
                      setImportItems((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!importing &&
            importItems.some((item) => item.status !== 'ready') && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !canWrite}
                onClick={() => void importFiles(importItems)}
              >
                {locale === 'en'
                  ? 'Continue unfinished files'
                  : '继续未完成的文件'}
              </Button>
            )}
          <p hidden={!importExpanded}>
            {locale === 'en'
              ? 'Originals are preserved. Check extracted text against the source; image-only pages can be transcribed in the reader.'
              : '原件保留。自动提取文字请对照原件核查；没有文字的扫描页可在阅读器中转录。'}
          </p>
        </section>
      )}
      {message && <Notice text={message} />}
      {!canWrite && (
        <Notice
          text={
            locale === 'en'
              ? 'You can read and download this project. Ask the owner for permission to contribute.'
              : '你可以阅读和下载这个项目。如需编辑，请联系项目负责人调整权限。'
          }
        />
      )}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="import-dialog">
          <DialogHeader>
            <DialogTitle>{t('把研究材料带进来')}</DialogTitle>
            <DialogDescription>
              {t('保留原件，自动提取可识别文字。你可以随时对照和校订。')}
            </DialogDescription>
          </DialogHeader>
          <div className="import-choices">
            <button disabled={busy} onClick={() => upload.current?.click()}>
              <Upload size={25} />
              <strong>{t('从电脑导入')}</strong>
              <span>{t('PDF、照片、文本')}</span>
            </button>
            <button
              onClick={() => {
                setImportOpen(false);
                navigate('drive');
              }}
            >
              <Cloud size={25} />
              <strong>Google Drive</strong>
              <span>{t('选择账号，再选择资料')}</span>
            </button>
          </div>
          <IiifImport projectId={project.id} onImported={refresh} />
          <p className="muted">
            {t('每份资料最大 20 MB。扫描件和照片可以在阅读时逐页识别文字。')}
          </p>
        </DialogContent>
      </Dialog>
      <FeaturePurpose tab={tab} onNavigate={navigate} />
      <ProjectPanel active={tab} value="overview">
        {!loading && sources.length > 0 && (
          <SourceSearch
            projectId={project.id}
            onOpen={(source, version, page) => {
              setSourceId(source);
              setLocation({
                sourceId: source,
                versionId: version,
                page,
                nonce: crypto.randomUUID(),
              });
              navigate('sources');
            }}
          />
        )}
        {loading ? (
          <Notice text={t('正在读取材料…')} />
        ) : (
          <ProjectOverview
            projectId={project.id}
            sources={sources}
            counts={!detailsLoaded ? overviewCounts : null}
            notes={latestNotes}
            evidence={evidence}
            busy={busy}
            onImport={() => upload.current?.click()}
            onDrive={() => navigate('drive')}
            onNavigate={navigate}
            onSource={(id) => {
              setSourceId(id);
              setLocation(null);
              navigate('sources');
            }}
            canSearch={canWrite}
          />
        )}
      </ProjectPanel>
      <ProjectPanel active={tab} value="drive">
        <CloudConnections
          projectId={project.id}
          onImported={refresh}
          onRead={(id) => {
            setSourceId(id);
            setLocation(null);
            setSearch('');
            navigate('sources');
          }}
        />
      </ProjectPanel>
      <ProjectPanel
        active={
          ['platform', 'search', 'findings', 'team', 'agents'].includes(tab)
            ? 'platform'
            : tab
        }
        value="platform"
      >
        <ResearchPlatform
          userId={userId}
          section={
            tab === 'findings'
              ? 'library'
              : tab === 'platform'
                ? 'missions'
                : tab
          }
          project={project}
          models={models}
          budget={workbench?.budget || null}
          onNote={(title, text) => {
            navigate('notes');
            openNote(null, undefined, { title, text });
          }}
          sources={sources}
          versions={versions}
          onRefresh={refresh}
          onImport={() => setImportOpen(true)}
          onOpenSource={(sourceId, versionId, page, citation) => {
            const text =
              versions
                .find((v) => v.id === versionId)
                ?.pages.find((p) => p.page === page)?.text || '';
            const span = citation ? citationSpan(text, citation) : null;
            const current = researchRoute(window.location.search, project.id);
            if (current.mission)
              setResearchReturn(
                missionPath(
                  project.id,
                  current.mission,
                  current.task,
                  current.mode,
                ),
              );
            setSourceId(sourceId);
            setLocation({
              sourceId,
              versionId,
              page,
              ...span,
              nonce: crypto.randomUUID(),
            });
            setTab('sources');
          }}
        />
      </ProjectPanel>
      <ProjectPanel active={tab} value="sources" keepMounted>
        {researchReturn && (
          <Button
            variant="ghost"
            className="source-return-task"
            onClick={() => {
              navigateWorkspace(researchReturn);
              setResearchReturn('');
            }}
          >
            <ArrowLeft size={16} />
            {locale === 'en' ? 'Return to research task' : '返回刚才的研究任务'}
          </Button>
        )}
        {loading ? (
          <Notice text={t('正在读取材料…')} />
        ) : (
          <div className={`reading-desk ${focused ? 'is-focused' : ''}`}>
            <aside className="source-list">
              <div className="source-list-heading">
                <span>{t('项目资料')}</span>
                <span>{sources.length}</span>
              </div>
              <div className="source-search">
                <Search size={15} />
                <Input
                  aria-label={t('搜索资料')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('搜索资料标题')}
                />
              </div>
              <NativeSelect
                className="mb-3 w-full"
                aria-label={locale === 'en' ? 'Filter sources' : '筛选资料'}
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                <NativeSelectOption value="all">
                  {locale === 'en' ? 'All sources' : '全部资料'}
                </NativeSelectOption>
                <NativeSelectOption value="application/pdf">
                  PDF
                </NativeSelectOption>
                <NativeSelectOption value="image/">
                  {locale === 'en' ? 'Photographs and images' : '照片与图像'}
                </NativeSelectOption>
                <NativeSelectOption value="text/">
                  {locale === 'en' ? 'Text documents' : '文字材料'}
                </NativeSelectOption>
                <NativeSelectOption value="blank">
                  {locale === 'en'
                    ? 'Pages without transcription'
                    : '含未转录页面'}
                </NativeSelectOption>
              </NativeSelect>
              <div className="source-items" ref={sourceItems}>
                {visibleSources.map((source) => (
                  <button
                    key={source.id}
                    className={`source-item ${sourceId === source.id ? 'selected' : ''}`}
                    aria-current={sourceId === source.id ? 'true' : undefined}
                    onClick={() => {
                      setSourceId(source.id);
                      setLocation(null);
                      const version = latest(source.id);
                      if (version)
                        navigateWorkspace(
                          sourcePath(project.id, version.id, 1),
                        );
                    }}
                  >
                    <FileText size={16} />
                    <span>
                      {source.title}
                      <small>
                        v{latest(source.id)?.revision || 1} ·{' '}
                        {t('{0} 页', {
                          0: latest(source.id)?.pages.length || 0,
                        })}
                      </small>
                    </span>
                  </button>
                ))}
                {sources.length > 0 && !visibleSources.length && (
                  <p className="p-2 text-xs text-muted-foreground leading-6">
                    {t('没有匹配的资料，试试其他标题关键词。')}
                  </p>
                )}
                {!sources.length && (
                  <p className="text-sm text-muted-foreground leading-7">
                    {t(
                      '导入 PDF、照片或文本，开始阅读第一份材料。单份最大 20 MiB，内测每账户 500 MiB 原件额度。',
                    )}
                  </p>
                )}
              </div>
            </aside>
            {readerRoute.kind === 'unavailable' ? (
              <Notice
                text={
                  locale === 'en'
                    ? 'This source version or page is unavailable in this project. Select a source or return to your research task.'
                    : '此资料版本或页码在当前项目中不可用。请选择资料，或返回刚才的研究任务。'
                }
              />
            ) : currentSource && latest(sourceId) ? (
              <SourceReader
                key={`${sourceId}:${latest(sourceId).id}:${location?.sourceId === sourceId ? location.nonce : ''}`}
                source={currentSource}
                versions={versions.filter((v) => v.source_id === sourceId)}
                models={models}
                preferredModel={preferredModel}
                runs={runs}
                active={tab === 'sources' && readerReady}
                onLocationChange={publishReaderLocation}
                onBudget={() => {
                  setBudgetReturn(
                    window.location.pathname + window.location.search,
                  );
                  setTab('runs');
                }}
                onModelSettings={onAssistantSettings}
                projectId={project.id}
                readOnly={!canWrite}
                onRole={setRole}
                onCheckAccess={checkAccess}
                userId={userId}
                location={location?.sourceId === sourceId ? location : null}
                onBibliography={() => {
                  setBibliographySource(sourceId);
                  setTab('bibliography');
                }}
                onSaved={refresh}
                report={setMessage}
                focused={focused}
                onToggleFocus={() => setFocused((value) => !value)}
              />
            ) : (
              <div className="desk-empty">
                <BookOpen size={35} strokeWidth={1.3} />
                <h2>{t('让研究从材料开始')}</h2>
                <p>{t('保存原件，逐页阅读，再留下你的判断。')}</p>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setImportOpen(true)}
                >
                  <Upload size={16} />
                  {t('导入第一份资料')}
                </Button>
              </div>
            )}
          </div>
        )}
      </ProjectPanel>
      <ProjectPanel active={tab} value="source-management">
        <SourceManagement
          projectId={project.id}
          role={role}
          onSourcesChanged={refresh}
        />
      </ProjectPanel>
      <ProjectPanel active={tab} value="notes">
        <NoteLibrary
          notes={notes}
          userId={userId}
          projectId={project.id}
          canWrite={canWrite}
          loading={loading}
          onOpen={openNote}
          onSaved={refresh}
        />
      </ProjectPanel>
      <ProjectPanel active={tab} value="evidence">
        <EvidenceLibrary
          key={project.id}
          items={evidence}
          sources={sources}
          versions={versions}
          needsReview={
            new Set(
              evidence
                .filter((item) => {
                  const version = versions.find(
                      (v) => v.id === item.version_id,
                    ),
                    head = latest(item.source_id);
                  const changed =
                    !version ||
                    !head ||
                    version.pages.find((p) => p.page === item.page)?.text !==
                      head.pages.find((p) => p.page === item.page)?.text;
                  return (
                    changed &&
                    !workbench?.evidence_reviews.some(
                      (r) =>
                        r.evidence_id === item.id && r.version_id === head?.id,
                    )
                  );
                })
                .map((item) => item.id),
            )
          }
          canWrite={canWrite}
          onRead={() => setTab('sources')}
          onCompose={(title, text) => {
            setTab('notes');
            openNote(null, undefined, { title, text });
          }}
          renderCard={(item) => {
            const version = versions.find((v) => v.id === item.version_id);
            const changed =
              version &&
              version.pages[item.page - 1]?.text !==
                latest(item.source_id)?.pages[item.page - 1]?.text;
            const head = latest(item.source_id);
            const reviewed = workbench?.evidence_reviews.some(
              (review) =>
                review.evidence_id === item.id &&
                review.version_id === head?.id,
            );
            return (
              <article className="evidence-card" key={item.id}>
                <div className="flex gap-3 items-center">
                  <span className="status-tag" data-relation={item.relation}>
                    {t(relationName[item.relation])}
                  </span>
                  <h2>{item.question}</h2>
                </div>
                <blockquote>{item.quote}</blockquote>
                <p>{item.interpretation || t('尚未添加研究解释。')}</p>
                <button className="citation" onClick={() => openEvidence(item)}>
                  {sources.find((s) => s.id === item.source_id)?.title} · v
                  {version?.revision}
                  {' · '}
                  {t('第 {0} 页', { 0: item.page })}
                </button>
                {changed && head && (
                  <div className="citation-review">
                    <span
                      className="status-tag"
                      data-state={reviewed ? 'saved' : 'dirty'}
                    >
                      {reviewed
                        ? t('已核查这次变化')
                        : t('引文所在页面已修改 · 待复核')}
                    </span>
                    <p className="text-xs mt-2">
                      {t('引文仍固定于 v')}
                      {version.revision}
                      {t('，不会自动改写。')}
                    </p>
                    <details>
                      <summary>
                        {t('比较引文所在页 v')}
                        {version.revision} → v{head.revision}
                      </summary>
                      <TextDiff
                        before={version.pages[item.page - 1]?.text || ''}
                        after={head.pages[item.page - 1]?.text || ''}
                      />
                    </details>
                    {!reviewed && canWrite && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void action(async () => {
                            await api('/api/workbench', {
                              action: 'review_evidence',
                              project_id: project.id,
                              evidence_id: item.id,
                              version_id: head.id,
                            });
                            await refresh();
                          })
                        }
                      >
                        {t('已核查这次变化')}
                      </Button>
                    )}
                  </div>
                )}
              </article>
            );
          }}
        />
      </ProjectPanel>
      <ProjectPanel active={tab} value="bibliography">
        {workbench && (
          <BibliographyPanel
            projectId={project.id}
            sources={sources}
            entries={workbench.bibliography}
            initialSource={bibliographySource}
            onSaved={refresh}
          />
        )}
      </ProjectPanel>
      <ProjectPanel active={tab} value="arguments">
        {workbench && (
          <ArgumentPanel
            projectId={project.id}
            canWrite={canWrite}
            canReview={['owner', 'reviewer'].includes(role)}
            data={workbench}
            evidence={evidence}
            sources={sources}
            onSaved={refresh}
            onOpenEvidence={openEvidence}
          />
        )}
      </ProjectPanel>
      <ProjectPanel active={tab} value="provenance">
        {workbench && (
          <ProvenancePanel
            projectId={project.id}
            data={workbench}
            sources={sources}
            versions={versions}
            canWrite={canWrite}
            onSaved={refresh}
          />
        )}
      </ProjectPanel>
      <ProjectPanel active={tab} value="runs">
        {!models.length && (
          <div className="next-review">
            <Sparkles size={22} />
            <div>
              <h3>{t('需要研究助手时，再连接模型账户')}</h3>
              <p>
                {t(
                  '阅读与默认比较流程可以直接使用。智能分析与转录由你的模型账户付费。',
                )}
              </p>
            </div>
            <Button variant="outline" onClick={onAssistantSettings}>
              {t('打开助手设置')}
            </Button>
          </div>
        )}
        {budgetReturn && (
          <Button
            variant="outline"
            className="mb-4"
            onClick={() => {
              navigateWorkspace(budgetReturn);
              setBudgetReturn('');
            }}
          >
            <ArrowLeft size={16} />
            {locale === 'en'
              ? 'Return to your reading and question'
              : '返回刚才的原文与提问'}
          </Button>
        )}
        {workbench && (
          <TasksPanel
            projectId={project.id}
            data={workbench}
            models={models}
            sources={sources}
            versions={versions}
            runs={runs}
            onSaved={refresh}
          />
        )}
      </ProjectPanel>
      <ProjectPanel active={tab} value="history">
        <p className="section-toolbar">
          {t('原件保留；资料校订与笔记修改均追加版本。')}
        </p>
        {[
          ...versions.map((v) => ({
            id: v.id,
            date: v.created_at,
            title:
              sources.find((s) => s.id === v.source_id)?.title || t('资料'),
            detail: t('资料 v{0} · {1}', {
              0: v.revision,
              1: t(methodName(v.method)),
            }),
          })),
          ...notes.map((n) => ({
            id: n.id,
            date: n.created_at,
            title: n.title,
            detail: t('笔记 v{0}', { 0: n.revision }),
          })),
        ]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((item) => (
            <div className="history-row" key={item.id}>
              <GitBranch size={17} />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <time>{time(item.date, locale)}</time>
            </div>
          ))}
      </ProjectPanel>

      <ProjectPanel active={tab} value="data">
        <ProjectSettings
          project={project}
          onUpdated={onProjectUpdated}
          onExport={exportProject}
          busy={busy || loading}
        />
      </ProjectPanel>
      {noteDraft && (
        <NoteEditor
          key={noteDraft.key}
          note={noteDraft.note}
          draftKey={noteDraft.key}
          initial={noteDraft.initial}
          notes={notes}
          userId={userId}
          projectId={project.id}
          readOnly={!canWrite}
          onClose={() => setNoteDraft(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
function ProjectPanel({
  active,
  value,
  keepMounted = false,
  children,
}: {
  active: string;
  value: string;
  keepMounted?: boolean;
  children: React.ReactNode;
}) {
  if (active !== value && !keepMounted) return null;
  return (
    <section className="project-panel" hidden={active !== value}>
      {children}
    </section>
  );
}

function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: Model[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <NativeSelect
      aria-label={t('选择模型连接')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full"
    >
      <NativeSelectOption value="">
        {models.length ? t('选择模型连接') : t('请先在「模型与密钥」添加连接')}
      </NativeSelectOption>
      {models.map((m) => (
        <NativeSelectOption key={m.id} value={m.id}>
          {m.label} · {m.model_id}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
function SourceReader({
  source,
  versions,
  models,
  preferredModel,
  runs,
  active,
  onLocationChange,
  onBudget,
  onModelSettings,
  projectId,
  onSaved,
  report,
  focused,
  onToggleFocus,
  userId,
  location,
  onBibliography,
  readOnly,
  onRole,
  onCheckAccess,
}: {
  source: Source;
  versions: SourceVersion[];
  models: Model[];
  preferredModel: string;
  runs: Run[];
  active: boolean;
  onLocationChange: (path: string) => void;
  onBudget: () => void;
  onModelSettings: () => void;
  projectId: string;
  onSaved: () => Promise<unknown>;
  report: (text: string) => void;
  focused: boolean;
  onToggleFocus: () => void;
  userId: string;
  location: ReaderLocation | null;
  onBibliography: () => void;
  readOnly: boolean;
  onRole: (role: string) => void;
  onCheckAccess: () => void;
}) {
  const { t, locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const sorted = [...versions].sort((a, b) => b.revision - a.revision);
  const current = sorted[0];
  const [versionId, setVersionId] = useState(location?.versionId || current.id);
  const version = sorted.find((v) => v.id === versionId)!;
  const [page, setPage] = useState(location?.page || 1);
  const pageText = version.pages.find((p) => p.page === page)?.text || '';
  const citationFocus = useMemo(
    () =>
      location?.versionId === version.id &&
      location.page === page &&
      location.start != null &&
      location.end != null
        ? validCitationSpan(pageText, location.start, location.end)
        : null,
    [
      location?.versionId,
      location?.page,
      location?.start,
      location?.end,
      version.id,
      page,
      pageText,
    ],
  );
  const localDraft = useLocalDraft(
    `${draftPrefix(userId, projectId)}source:${source.id}:${version.id}:${page}`,
    {
      kind: 'source',
      entityId: source.id,
      sourceId: source.id,
      versionId: version.id,
      page,
      title: source.title,
      text: pageText,
    },
  );
  const draft = localDraft.value.text;
  const setDraft = (text: string) =>
    localDraft.update({ ...localDraft.value, text });
  // Only a fresh manual selection can be attached to a new excerpt. Existing
  // regions are displayed by SourcePreview's persistent highlight layer.
  const [region, setRegion] = useState<Region | null>(null);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [annotationId, setAnnotationId] = useState(
    location?.annotationId || '',
  );
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [pendingAnchorId, setPendingAnchorId] = useState('');
  const [annotationError, setAnnotationError] = useState('');
  const reading = useReadingPage(
    projectId,
    version.id,
    page,
    active,
    annotationId,
  );
  const annotation = reading.evidence.find((item) => item.id === annotationId);
  useEffect(() => {
    if (reading.role) onRole(reading.role);
    if (reading.accessDenied) onCheckAccess();
  }, [reading.role, reading.accessDenied, onRole, onCheckAccess]);
  const textHighlights = reading.evidence.flatMap((item) =>
    item.quote_start != null && item.quote_end != null
      ? [
          {
            id: item.id,
            start: item.quote_start,
            end: item.quote_end,
            quote: item.quote,
          },
        ]
      : [],
  );
  useEffect(() => {
    setSelection(null);
    setEditing(false);
    setAnnotationOpen(false);
    setAnnotationId(
      location?.versionId === version.id && location.page === page
        ? location.annotationId || ''
        : '',
    );
  }, [version.id, page, location]);
  function selectAnnotation(id: string) {
    setAnnotationId(id);
    setRegion(null);
  }
  const selectedStart = useRef<number | undefined>(undefined);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelId, setModelId] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const modelChosen = useRef(false);
  const ocrLocal = useLocalDraft(
    `${draftPrefix(userId, projectId)}source:${source.id}:${version.id}:${page}:ocr`,
    {
      kind: 'source',
      entityId: source.id,
      sourceId: source.id,
      versionId: version.id,
      page,
      title: source.title,
      text: '',
      ocrRunId: '',
      partial: false,
    },
  );
  const ocrDraft = ocrLocal.value.text || null;
  const setOcrDraft = (
    text: string,
    runId = ocrLocal.value.ocrRunId,
    partial = ocrLocal.value.partial,
  ) => ocrLocal.update({ ...ocrLocal.value, text, ocrRunId: runId, partial });
  const previousOcr = runs
    .filter(
      (run) =>
        run.kind === 'ocr' &&
        run.model_snapshot.page === page &&
        run.source_version_ids.some((id) => {
          const candidate = versions.find((v) => v.id === id);
          return !!candidate && unchangedOcrPage(candidate, version, page);
        }),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  useEffect(() => {
    setModelId(
      (current) =>
        (modelChosen.current &&
        models.some((model) => model.vision && model.id === current)
          ? current
          : '') ||
        models.find((model) => model.vision && model.id === preferredModel)
          ?.id ||
        models.find(
          (model) => model.vision && model.model_id === DEFAULT_RESEARCH_MODEL,
        )?.id ||
        models.find((model) => model.vision)?.id ||
        '',
    );
  }, [models, preferredModel]);
  useEffect(() => {
    if (active)
      onLocationChange(
        sourcePath(projectId, version.id, page, citationFocus) +
          (annotationId
            ? `&annotation=${encodeURIComponent(annotationId)}`
            : ''),
      );
  }, [
    active,
    projectId,
    version.id,
    page,
    annotationId,
    citationFocus,
    onLocationChange,
  ]);
  const [quote, setQuote] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!active) return;
    setUrl('');
    setBlob(null);
    setOriginalText(null);
    let current = true;
    let objectUrl = '';
    void readOriginal(source.id)
      .then(async (data) => {
        const text = source.media_type.startsWith('text/')
          ? await data.text()
          : null;
        if (!current) return;
        objectUrl = URL.createObjectURL(data);
        setBlob(data);
        setUrl(objectUrl);
        setOriginalText(text);
      })
      .catch(() => {
        if (current) report('无法载入原件，请刷新重试。');
      });
    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [active, source.id, source.object_path, source.media_type, report]);
  useEffect(() => {
    setRegion(null);
  }, [versionId, page, location]);
  useEffect(() => {
    if (
      localDraft.loaded &&
      location?.versionId === versionId &&
      location.page === page &&
      location.start != null &&
      location.end != null
    ) {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(location.start, location.end);
      textarea.current?.scrollIntoView({ block: 'center' });
    }
  }, [localDraft.loaded, location, versionId, page]);
  async function perform(work: () => Promise<void>) {
    report('');
    setBusy(true);
    try {
      await work();
    } catch (error) {
      report(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(false);
    }
  }
  async function save(method: string, text = draft) {
    await perform(async () => {
      const pages =
        method === 'restore'
          ? version.pages
          : current.pages.map((p) => (p.page === page ? { ...p, text } : p));
      const { error } = await rpc('revise_source', {
        p_source: source.id,
        p_expected: current.revision,
        p_pages: pages,
        p_method: method,
        ...(method === 'ocr-reviewed'
          ? { p_ocr_run: ocrLocal.value.ocrRunId || undefined, p_page: page }
          : {}),
      });
      if (error) throw new Error(error.message);
      localDraft.clear();
      if (method === 'ocr-reviewed') ocrLocal.clear();
      await onSaved();
      report('新版本已保存，旧引文仍固定到之前的版本。');
    });
  }
  async function requestOcr(
    requestPage: number,
    reuseCompleted = false,
    selectedRegion?: Region | null,
  ): Promise<Run> {
    if (!blob) throw new Error(t('无法载入原件，请刷新重试。'));
    const image = await pageImage(
      blob,
      source.media_type,
      requestPage,
      selectedRegion,
    );
    const { run } = await api('/api/research', {
      id: crypto.randomUUID(),
      project_id: projectId,
      kind: 'ocr',
      reuse_completed: reuseCompleted,
      model_id: modelId,
      version_ids: [current.id],
      prompt: t('转录 {0} 第 {1} 页（浏览器提供的原件页图像）', {
        0: source.title,
        1: requestPage,
      }),
      page: requestPage,
      image,
      region: selectedRegion || undefined,
      locale,
    });
    await onSaved();
    return run;
  }
  async function ocr() {
    if (!blob) return;
    await perform(async () => {
      const selectedRegion = region;
      const run = await requestOcr(page, false, selectedRegion);
      if (run.status !== 'succeeded' || !run.result)
        throw new Error(run.error || t('转录未完成。'));
      setOcrDraft(run.result, run.id, !!selectedRegion);
      report(
        'OCR 结果已存入任务记录。请对照原件核查，确认后再保存为资料版本。',
      );
    });
  }
  async function addEvidence(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      const { error } = await rpc('add_evidence', {
        p_version: version.id,
        p_page: page,
        p_quote: form.get('quote'),
        p_start:
          selectedStart.current !== undefined &&
          draft.slice(
            selectedStart.current,
            selectedStart.current + formText(form, 'quote').length,
          ) === form.get('quote')
            ? selectedStart.current
            : undefined,
        p_region: region,
        p_question: form.get('question'),
        p_interpretation: form.get('interpretation'),
        p_relation: form.get('relation'),
      });
      if (error) throw new Error(error.message);
      setQuote(null);
      setRegion(null);
      await reading.refresh();
      await onSaved();
      report('证据已关联到具体版本与页码。');
    });
  }
  async function addAnnotation(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || dirty || readOnly) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setAnnotationError('');
    try {
      let id = pendingAnchorId;
      if (!id) {
        const { data, error } = await rpc('add_evidence', {
          p_version: version.id,
          p_page: page,
          p_quote: selection.quote,
          p_start: selection.start,
          p_region: region,
          p_question:
            formText(form, 'question').trim() ||
            L('阅读标记', 'Reading highlight'),
          p_interpretation: '',
          p_relation: 'context',
        });
        if (error) throw new Error(error.message);
        id = String(data);
        setPendingAnchorId(id);
      }
      const body = formText(form, 'comment').trim();
      if (body) {
        try {
          await api('/api/platform', {
            action: 'comment',
            project_id: projectId,
            value: { target_id: id, body },
          });
        } catch {
          // Keep the dialog and its text in memory even if storage is unavailable.
          // Retrying uses the saved anchor and cannot create another highlight.
          throw new Error(
            L(
              '高亮已保存，批注尚未送达。文字保留在此处，请重试或先复制保存。',
              'Highlight saved, but the comment was not sent. Your text remains here; retry or copy it before closing.',
            ),
          );
        }
      }
      setAnnotationOpen(false);
      setPendingAnchorId('');
      setSelection(null);
      setRegion(null);
      window.getSelection()?.removeAllRanges();
      setAnnotationId(id);
      await reading.refresh();
      await onSaved();
    } catch (e) {
      setAnnotationError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  const dirty = localDraft.loaded && draft !== pageText;
  const compareVersion = version.id === current.id ? sorted[1] : current;
  if (reading.accessDenied)
    return (
      <section className="reading-notes-bar">
        <p role="alert" className="reading-error">
          {reading.error}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void reading.refresh()}
        >
          {L('重新检查访问权限', 'Check access again')}
        </Button>
      </section>
    );
  return (
    <section className="source-reader">
      {localDraft.error && <Notice text={localDraft.error} />}
      {localDraft.restored && dirty && (
        <Notice
          text={t('已恢复本机草稿（基于 v{0}）。请对照原件和当前版本后保存。', {
            0: version.revision,
          })}
        />
      )}

      <div className="reader-toolbar">
        <div className="reader-title-row">
          <h2>{source.title}</h2>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={focused}
            onClick={onToggleFocus}
          >
            {focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {focused ? t('退出专注') : t('专注阅读')}
          </Button>
        </div>
        <div className="reader-controls">
          <Button variant="ghost" size="sm" onClick={onBibliography}>
            {t('书目信息')}
          </Button>
          <NativeSelect
            aria-label={t('资料版本')}
            value={versionId}
            disabled={busy || dirty}
            onChange={(e) => {
              setVersionId(e.target.value);
              setPage(1);
            }}
          >
            {sorted.map((v) => (
              <NativeSelectOption key={v.id} value={v.id}>
                v{v.revision} · {t(methodName(v.method))}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('上一页')}
            disabled={busy || dirty || page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ArrowLeft size={16} />
          </Button>
          <NativeSelect
            aria-label={t('页码')}
            value={page}
            disabled={busy || dirty}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {version.pages.map((p) => (
              <NativeSelectOption key={p.page} value={p.page}>
                {t('第 {0} 页', { 0: p.page })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('下一页')}
            disabled={busy || dirty || page >= version.pages.length}
            onClick={() => setPage((value) => value + 1)}
          >
            <ArrowRight size={16} />
          </Button>
          {url && (
            <a href={url} download={source.title} className="citation">
              <Download size={13} />
              {t('下载原件')}
            </a>
          )}
        </div>
      </div>
      <SourceDerivation
        versionId={version.id}
        disabled={busy || dirty}
        onVersion={(id) => {
          setVersionId(id);
          setPage(1);
        }}
      />
      <div
        className={`reader-columns ${source.media_type.startsWith('text/') ? 'text-source' : ''}`}
      >
        {source.media_type.startsWith('text/') ? (
          <details className="reading-original-text">
            <summary>
              {L('查看导入时的原始文本', 'View the original imported text')}
            </summary>
            <pre
              className="original-text"
              aria-label={t('{0} 原始文本', { 0: source.title })}
            >
              {originalText ?? t('正在读取原件…')}
            </pre>
          </details>
        ) : (
          <div className="original-pane">
            <div className="pane-label">
              <span>{t('原始材料')}</span>
              <span>{t('保留原件')}</span>
            </div>
            {!url ? (
              <p className="p-5 text-muted-foreground">{t('正在读取原件…')}</p>
            ) : !source.media_type.startsWith('text/') ? (
              <SourcePreview
                blob={blob}
                url={url}
                type={source.media_type}
                page={page}
                title={source.title}
                region={region}
                onRegion={setRegion}
                highlights={reading.evidence.map((item) => ({
                  id: item.id,
                  region: item.region || null,
                  label: item.question,
                }))}
                activeHighlight={annotationId}
                onHighlight={selectAnnotation}
              />
            ) : (
              <pre
                className="original-text"
                aria-label={t('{0} 原始文本', { 0: source.title })}
              >
                {originalText}
              </pre>
            )}
          </div>
        )}
        <div className="transcription-pane">
          <div className="pane-label">
            <span>
              {t('转录与校订 · v')}
              {version.revision} / p.{page}
            </span>
            <span className="status-tag" data-state={dirty ? 'dirty' : 'saved'}>
              {dirty ? (
                t('未保存')
              ) : version.id !== current.id ? (
                t('历史版本 · 只读')
              ) : (
                <>
                  <Check size={12} />
                  {t('已保存')}
                </>
              )}
            </span>
          </div>
          <div className="reading-mode-controls">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={!editing && !dirty}
              disabled={dirty}
              onClick={() => setEditing(false)}
            >
              {L('阅读与批注', 'Read & annotate')}
            </Button>
            {!readOnly && version.id === current.id && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={editing || dirty}
                onClick={() => setEditing(true)}
              >
                {L('校订文字', 'Edit transcription')}
              </Button>
            )}
          </div>
          {editing || dirty ? (
            <Textarea
              ref={textarea}
              aria-label={t('页内文字')}
              className="transcription-text"
              value={draft}
              disabled={!localDraft.loaded}
              readOnly={
                readOnly || (version.id !== current.id && !localDraft.restored)
              }
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('本页尚无文字，可手工转录或使用图像模型 OCR。')}
            />
          ) : pageText ? (
            <HighlightedText
              text={pageText}
              focusKey={location?.nonce}
              focus={
                active && citationFocus
                  ? {
                      ...citationFocus,
                      quote: pageText.slice(
                        citationFocus.start,
                        citationFocus.end,
                      ),
                    }
                  : undefined
              }
              highlights={textHighlights}
              activeId={annotationId}
              onSelect={selectAnnotation}
              onSelection={setSelection}
              label={L(
                '页内文字，可选择文字添加高亮',
                'Page text, select a passage to highlight',
              )}
            />
          ) : (
            <p className="reading-empty-page">
              {L(
                '本页尚无文字。先手工转录或运行 OCR、对照原件核查后，就可以选中文字添加高亮与批注。',
                'This page has no transcription yet. Transcribe it or run OCR and check the original, then select text to highlight and annotate.',
              )}
            </p>
          )}
          {!editing && !dirty && !!pageText && (
            <div className="reading-selection-bar">
              <span>
                {selection
                  ? L(
                      `已选 ${selection.quote.length} 字`,
                      `${selection.quote.length} characters selected`,
                    )
                  : L(
                      '选中一段文字，留下你的阅读问题。',
                      'Select a passage to leave a reading question.',
                    )}
                {region &&
                  ` · ${L('已框选原件区域', 'Original region selected')}`}
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !selection?.quote.trim()}
                  onClick={() => {
                    setAnnotationError('');
                    setPendingAnchorId('');
                    setAnnotationOpen(true);
                  }}
                >
                  {L('高亮并批注', 'Highlight & comment')}
                </Button>
              )}
            </div>
          )}
          <div className="flex gap-2 flex-wrap p-4 border-t">
            {version.id === current.id && (editing || dirty) ? (
              <Button
                disabled={busy || !dirty || readOnly}
                size="sm"
                onClick={() => void save('manual')}
              >
                <Save size={14} />
                {t('保存校订')}
              </Button>
            ) : version.id !== current.id && !readOnly && dirty ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void save('manual')}
              >
                {t('将恢复草稿另存为新版本')}
              </Button>
            ) : version.id !== current.id && !readOnly ? (
              <Button
                disabled={busy}
                size="sm"
                onClick={() => void save('restore')}
              >
                {t('恢复此版本为新版本')}
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={busy || dirty || !draft.trim() || readOnly}
              size="sm"
              onClick={() => {
                const area = textarea.current;
                selectedStart.current = editing
                  ? area?.selectionStart
                  : selection?.start;
                setQuote(
                  editing && area
                    ? draft.slice(area.selectionStart, area.selectionEnd)
                    : selection?.quote || '',
                );
              }}
            >
              <Quote size={14} />
              {t('摘录证据')}
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => localDraft.clear()}
              >
                {t('撤销未保存修改')}
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="reading-notes-bar">
        <div className="reading-thread-heading">
          <h3>
            {L('本页阅读标记', 'Highlights on this page')} ·{' '}
            {reading.evidence.length}
          </h3>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={L('刷新阅读标记', 'Refresh highlights')}
            onClick={() => void reading.refresh()}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
        {reading.error && (
          <p role="alert" className="reading-error">
            {t(reading.error)}
          </p>
        )}
        {reading.truncated && (
          <p className="reading-help">
            {L(
              '显示本页最近 100 条标记。完整摘录保留在证据与项目导出中。',
              'Showing the latest 100 highlights. All excerpts remain in Evidence and project exports.',
            )}
          </p>
        )}
        {!reading.evidence.length && !reading.error && (
          <p className="reading-help">
            {reading.loading
              ? L('正在读取标记…', 'Loading highlights…')
              : L(
                  '保存的高亮和证据摘录会留在原文上，并显示在这里。',
                  'Saved highlights and evidence excerpts stay on the page and appear here.',
                )}
          </p>
        )}
        <div className="reading-highlight-list">
          {reading.evidence.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={annotationId === item.id}
              onClick={() => selectAnnotation(item.id)}
            >
              <span>{item.question}</span>
              <small>{item.quote}</small>
            </button>
          ))}
        </div>
        {annotationId && !annotation && !reading.loading && !reading.error && (
          <p className="reading-help">
            {L(
              '这个标记未在本页最近记录中，请在证据摘录中查找其固定版本。',
              'This highlight is not among the recent records on this page. Find its fixed version in Evidence.',
            )}
          </p>
        )}
      </div>
      {annotation && (
        <ReadingAnnotations
          key={annotation.id}
          projectId={projectId}
          userId={userId}
          evidence={annotation}
          models={models}
          preferredModel={preferredModel}
          active={active}
          readOnly={readOnly || reading.role === 'viewer'}
          onClose={() => setAnnotationId('')}
          onBudget={onBudget}
          onModelSettings={onModelSettings}
        />
      )}
      <Dialog
        open={annotationOpen}
        onOpenChange={(open) => {
          if (!busy) setAnnotationOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {L('留下阅读标记', 'Leave a reading highlight')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '所选原文、版本与页码会固定保存。批注可由项目成员一起讨论。',
                'The selected passage, version and page are preserved. Project members can discuss the annotation.',
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="reading-annotation-form"
            onSubmit={(event) => void addAnnotation(event)}
          >
            <blockquote>{selection?.quote}</blockquote>
            {region && (
              <small>
                {L(
                  '同时保存原件上的框选区域。',
                  'The selected region on the original is also saved.',
                )}
              </small>
            )}
            <label>
              {L('阅读问题或标记名称', 'Reading question or label')}
              <Input
                name="question"
                readOnly={!!pendingAnchorId}
                maxLength={500}
                placeholder={L(
                  '例如：这里的亲属称谓如何理解？',
                  'For example: how should this kinship term be read?',
                )}
              />
            </label>
            <label>
              {L('第一条批注（可选）', 'First comment (optional)')}
              <Textarea
                name="comment"
                maxLength={10000}
                placeholder={L(
                  '记录你的观察、不确定之处或下一步。',
                  'Record an observation, uncertainty or next step.',
                )}
              />
            </label>
            {annotationError && (
              <p role="alert" className="reading-error">
                {annotationError}
              </p>
            )}
            <Button type="submit" disabled={busy || !selection?.quote.trim()}>
              {busy
                ? L('保存中…', 'Saving…')
                : L('保存高亮与批注', 'Save highlight & comment')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {compareVersion && (
        <details className="source-diff">
          <summary>
            {t('版本差异：v')}
            {compareVersion.revision}
            {t('→ 当前阅读 v')}
            {version.revision}
            {dirty ? t('（含草稿）') : ''}
          </summary>
          <TextDiff
            before={compareVersion.pages[page - 1]?.text || ''}
            after={draft}
          />
        </details>
      )}
      {version.id === current.id && !source.media_type.startsWith('text/') && (
        <div className="ocr-bar">
          <ModelPicker
            models={models.filter((m) => m.vision)}
            value={modelId}
            onChange={(value) => {
              modelChosen.current = true;
              setModelId(value);
            }}
          />
          <Button
            variant="outline"
            disabled={
              busy ||
              !modelId ||
              !blob ||
              dirty ||
              readOnly ||
              previousOcr?.status === 'running'
            }
            onClick={() => void ocr()}
          >
            <Sparkles size={14} />
            {busy
              ? t('处理中…')
              : region
                ? L('转录框选区域', 'Transcribe selected region')
                : t('转录当前页')}
          </Button>
          <p>
            {L(
              '多栏报纸建议先在原件上框选一栏，再转录。',
              'For multi-column newspapers, select one column on the original before transcribing.',
            )}{' '}
            {L(
              '图像发送给所选模型；按项目预算预留费用，成功后核算。',
              'The image goes to your selected model. Cost is reserved against the project budget and settled after success.',
            )}
          </p>
          {current.pages.length > 1 && (
            <Button
              variant="outline"
              disabled={busy || !modelId || !blob || dirty || readOnly}
              onClick={() => setBatchOpen(true)}
            >
              {L('批量转录', 'Batch transcription')}
            </Button>
          )}
          <Button variant="ghost" onClick={onBudget}>
            {L('查看预算', 'View budget')}
          </Button>
          {!models.some((model) => model.vision) && (
            <Button variant="outline" onClick={onModelSettings}>
              {L('连接可读取图像的模型', 'Connect an image-capable model')}
            </Button>
          )}
        </div>
      )}
      {batchOpen && (
        <BatchTranscription
          version={current}
          currentPage={page}
          modelId={modelId}
          imageForPage={async (page) => {
            if (!blob) throw new Error(t('无法载入原件，请刷新重试。'));
            return pageImage(blob, source.media_type, page);
          }}
          onClose={() => {
            setBatchOpen(false);
            void onSaved();
          }}
          onPage={setPage}
        />
      )}
      {previousOcr && !ocrDraft && version.id === current.id && (
        <div className="ocr-resume settings-feedback">
          <p>
            {previousOcr.status === 'succeeded'
              ? L(
                  '本页已有转录候选，可以继续核查，无需再次付费。',
                  'A transcription candidate is saved for this page. Resume review without another model call.',
                )
              : previousOcr.status === 'running'
                ? L(
                    '本页已有转录任务，稍后刷新查看结果。不会自动重复调用。',
                    'A transcription is already in progress. Refresh later for its result; it will not be repeated automatically.',
                  )
                : L(
                    '上次转录未确认完成。先核对任务记录与厂商费用，再决定是否重试。',
                    'The previous transcription did not complete reliably. Check its record and provider charges before retrying.',
                  )}
          </p>
          {previousOcr.status === 'succeeded' && previousOcr.result && (
            <Button
              variant="outline"
              disabled={readOnly}
              onClick={() =>
                setOcrDraft(
                  previousOcr.result!,
                  previousOcr.id,
                  !!previousOcr.model_snapshot.region,
                )
              }
            >
              {L('继续核查上次转录', 'Resume transcription review')}
            </Button>
          )}
        </div>
      )}
      {ocrDraft !== null && (
        <section className="ocr-review">
          <h3>{t('OCR 草稿 · 需要核查')}</h3>
          {previousOcr?.error && <p role="alert">{t(previousOcr.error)}</p>}
          <p className="settings-hint">
            {L(
              '核查中的修改会保存为本机草稿。确认保存前不会替换原文。',
              'Review edits are saved as a local draft. The source text changes only when you explicitly save a new version.',
            )}
          </p>
          {ocrLocal.error && <p role="alert">{t(ocrLocal.error)}</p>}
          <Textarea
            aria-label={t('核查 OCR 结果')}
            className="min-h-48 my-4"
            value={ocrDraft}
            onChange={(e) => setOcrDraft(e.target.value)}
          />
          {ocrLocal.value.partial && (
            <p className="settings-feedback">
              {L(
                '这是局部转录。插入到本页草稿后，请检查阅读顺序和覆盖范围，再保存资料版本。',
                'This is a partial transcription. Insert it into the page draft, check reading order and coverage, then save a source version.',
              )}
            </p>
          )}
          <Button
            disabled={
              busy || readOnly || !ocrLocal.loaded || version.id !== current.id
            }
            onClick={() => {
              if (ocrLocal.value.partial) {
                setDraft([draft, ocrDraft].filter(Boolean).join('\n\n'));
                setEditing(true);
                ocrLocal.clear();
              } else void save('ocr-reviewed', ocrDraft);
            }}
          >
            {ocrLocal.value.partial
              ? L('插入本页草稿', 'Insert into page draft')
              : t('已核查，保存为新版本')}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => ocrLocal.clear()}
          >
            {L('放弃本机核查修改', 'Discard local review edits')}
          </Button>
        </section>
      )}
      <Dialog
        open={quote !== null}
        onOpenChange={(open) => {
          if (!open) setQuote(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('保存证据')}</DialogTitle>
            <DialogDescription>
              {source.title} · v{version.revision}
              {' · '}
              {t('第 {0} 页。原文与解释分别记录。', { 0: page })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addEvidence} className="space-y-4">
            {region && (
              <p className="text-sm text-muted-foreground">
                {t('已关联本页的原件框选区域。')}
              </p>
            )}
            <Field label={t('原文摘录（须与本页完全一致）')}>
              <Textarea
                name="quote"
                required
                maxLength={10000}
                defaultValue={quote || ''}
              />
            </Field>
            <Field label={t('关联的研究问题')}>
              <Input name="question" required maxLength={2000} />
            </Field>
            <Field label={t('证据关系')}>
              <NativeSelect name="relation">
                <NativeSelectOption value="context">
                  {t('提供背景')}
                </NativeSelectOption>
                <NativeSelectOption value="supports">
                  {t('支持某个判断')}
                </NativeSelectOption>
                <NativeSelectOption value="challenges">
                  {t('质疑某个判断')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label={t('你的解释')}>
              <Textarea name="interpretation" maxLength={10000} />
            </Field>
            <Button type="submit" disabled={busy}>
              {t('保存证据')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
