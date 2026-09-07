'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FilePenLine, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/provider';
import { api, projectRows } from '@/lib/client-api';
import { noteHeads } from '@/lib/notes';
import { projectPath, sourcePath } from '@/lib/navigation';
import { DEFAULT_RESEARCH_MODEL, GLM_PRICE_CEILING } from '@/lib/model-routing';
import type { Model, Note } from '@/lib/types';
import type { ManuscriptBundle, manuscriptRuns } from '@/lib/manuscript';
type Overview = {
  questions: { id: string; title: string }[];
  claims: { id: string; question_id: string; body: string; kind: string }[];
  budget: { limit_units: number; committed_units: number } | null;
  runs: Awaited<ReturnType<typeof manuscriptRuns>>;
};
export default function ManuscriptBuilder({
  projectId,
  canWrite,
  onOpen,
  notes,
  onSaved,
}: {
  projectId: string;
  canWrite: boolean;
  onOpen: (note: Note) => void;
  notes: Note[];
  onSaved: () => Promise<unknown>;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<Overview | null>(null),
    [models, setModels] = useState<Model[]>([]),
    [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState('');
  const [question, setQuestion] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [title, setTitle] = useState(''),
    [audience, setAudience] = useState(''),
    [language, setLanguage] = useState(locale),
    [sections, setSections] = useState<{ title: string; goal: string }[]>([]);
  const [preview, setPreview] = useState<{
      bundle: ManuscriptBundle;
      hash: string;
    } | null>(null),
    [model, setModel] = useState(''),
    [inputRate, setInputRate] = useState(''),
    [outputRate, setOutputRate] = useState(''),
    [budget, setBudget] = useState('1.00'),
    [confirmed, setConfirmed] = useState(false),
    [requestId, setRequestId] = useState('');
  const polling = useRef(true);
  const saved = useRef({ notes, onSaved });
  saved.current = { notes, onSaved };
  const notified = useRef(new Set<string>());
  function receive(result: Overview) {
    polling.current = result.runs.some(
      (run) =>
        run.status === 'active' &&
        run.tasks.some(
          (task) =>
            task.executor !== 'human' &&
            ['ready', 'queued', 'running'].includes(task.status),
        ),
    );
    setData(result);
    const fresh = result.runs.filter(
      (run) =>
        run.note_id &&
        !notified.current.has(run.note_id) &&
        !saved.current.notes.some(
          (note) => note.id === run.note_id || note.root_id === run.note_id,
        ),
    );
    if (fresh.length) {
      fresh.forEach((run) => notified.current.add(run.note_id!));
      void saved.current.onSaved().catch(() => {
        fresh.forEach((run) => notified.current.delete(run.note_id!));
      });
    }
  }
  async function refresh() {
    try {
      receive(await api<Overview>(`/api/manuscripts?project_id=${projectId}`));
      setLoadError('');
    } catch (e) {
      setLoadError(
        e instanceof Error
          ? e.message
          : L('无法读取论文进度。', 'Could not load manuscript progress.'),
      );
    }
  }
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api<Overview>(
          `/api/manuscripts?project_id=${projectId}`,
        );
        if (active) {
          receive(result);
          setLoadError('');
        }
      } catch (e) {
        if (active)
          setLoadError(
            e instanceof Error
              ? e.message
              : 'Could not load manuscript progress.',
          );
      }
    };
    void load();
    const timer = setInterval(() => {
      if (polling.current && document.visibilityState === 'visible')
        void load();
    }, 15000);
    const focus = () => {
      void load();
    };
    window.addEventListener('focus', focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [projectId]);
  async function begin() {
    setBusy(true);
    setError('');
    setOpen(true);
    setStep(0);
    setPreview(null);
    setConfirmed(false);
    setRequestId(crypto.randomUUID());
    setAudience(
      L('历史与人文学科研究者', 'Researchers in history and the humanities'),
    );
    setLanguage(locale);
    setSections([
      {
        title: L('问题与研究范围', 'Question and scope'),
        goal: L(
          '说明核心问题、材料范围与能够回答的边界。',
          'Introduce the question, corpus and limits of what it can answer.',
        ),
      },
      {
        title: L('材料与论证', 'Sources and argument'),
        goal: L(
          '围绕已审读论点比较材料，区分原文陈述与推断。',
          'Compare evidence around reviewed claims; distinguish statements from inference.',
        ),
      },
      {
        title: L('竞争解释与研究缺口', 'Alternatives and gaps'),
        goal: L(
          '讨论反证、材料依赖、身份不确定性和仍需查找的材料。',
          'Discuss counterevidence, source dependence, uncertain identities and missing evidence.',
        ),
      },
      {
        title: L('结论与下一步', 'Conclusion and next steps'),
        goal: L(
          '在材料允许的范围内总结论点，明确剩余问题，不扩大结论。',
          'Summarize within the limits of the evidence and identify unresolved questions.',
        ),
      },
    ]);
    try {
      await refresh();
      const result = await api<{ models: Model[] }>('/api/workspace?models=1');
      setModels(result.models);
      const chosen =
        result.models.find((m) => m.model_id === DEFAULT_RESEARCH_MODEL) ||
        result.models[0];
      setModel(chosen?.id || '');
      setInputRate(
        chosen?.model_id === DEFAULT_RESEARCH_MODEL
          ? String(GLM_PRICE_CEILING.input)
          : '',
      );
      setOutputRate(
        chosen?.model_id === DEFAULT_RESEARCH_MODEL
          ? String(GLM_PRICE_CEILING.output)
          : '',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load models.');
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ bundle: ManuscriptBundle; hash: string }>(
        '/api/manuscripts',
        {
          action: 'preview',
          project_id: projectId,
          value: { question_id: question, claim_ids: selected },
        },
      );
      setPreview(result);
      setConfirmed(false);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to prepare sources.');
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await api<{ mission_id: string }>('/api/manuscripts', {
        action: 'create',
        project_id: projectId,
        value: {
          request_id: requestId,
          question_id: question,
          claim_ids: selected,
          title,
          audience,
          locale: language,
          sections,
          model_id: model,
          input_rate: Number(inputRate),
          output_rate: Number(outputRate),
          budget_usd: Number(budget),
          snapshot_hash: preview.hash,
          confirmed,
        },
      });
      setOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start manuscript.');
    } finally {
      setBusy(false);
    }
  }
  async function openDraft(noteId: string) {
    setBusy(true);
    setError('');
    try {
      const notes = await projectRows<Note>(projectId, 'notes');
      const note = noteHeads(notes).find(
        (n) => n.id === noteId || n.root_id === noteId,
      );
      if (!note)
        throw new Error(
          L('初稿暂不可用，请刷新笔记。', 'Draft unavailable. Refresh Notes.'),
        );
      onOpen(note);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open draft.');
    } finally {
      setBusy(false);
    }
  }
  const validOutline =
    title.trim() &&
    audience.trim() &&
    sections.length >= 2 &&
    sections.every((s) => s.title.trim() && s.goal.trim());
  return (
    <section
      className="manuscript-panel"
      aria-label={L('从研究到论文', 'From research to manuscript')}
    >
      <header>
        <div>
          <h3>
            {L(
              '把已审读的研究，组织成初稿',
              'Turn reviewed research into a draft',
            )}
          </h3>
          <p>
            {L(
              '确认依据与提纲，助手在后台逐章起草。你可以随时回来查看进度、核对原文并继续写作。',
              'Confirm evidence and an outline. Chapters run in the background; return to check progress, inspect sources and continue writing.',
            )}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!canWrite || busy}
          onClick={() => void begin()}
        >
          <FilePenLine size={16} />
          {L('根据研究生成初稿', 'Draft from research')}
        </Button>
      </header>
      {(loadError || (!open && error)) && (
        <p role="alert">
          {loadError || error}{' '}
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            {L('刷新', 'Refresh')}
          </Button>
        </p>
      )}
      {!!data?.runs.length && (
        <details className="manuscript-history" open>
          <summary>
            {L('论文初稿与后台进度', 'Manuscripts and background progress')} ·{' '}
            {data.runs.length}
          </summary>
          <div className="manuscript-runs">
            {data.runs.map((run) => {
              const completed = run.tasks.filter((t) =>
                ['succeeded', 'accepted'].includes(t.status),
              ).length;
              const attention = run.tasks.find((t) =>
                ['failed', 'uncertain', 'stale', 'rejected'].includes(t.status),
              );
              return (
                <article key={run.id}>
                  <div>
                    <strong>{run.title}</strong>
                    <p>
                      {run.changed
                        ? L(
                            '依据已有变化 · 原稿保留，请重新确认后生成新稿',
                            'Research changed · Keep this draft; reconfirm evidence for a new version',
                          )
                        : attention
                          ? L(
                              '需要检查 · 后续章节已等待',
                              'Needs inspection · Later chapters are waiting',
                            )
                          : run.status === 'completed'
                            ? L('本轮审读已完成', 'Review completed')
                            : run.note_id
                              ? L(
                                  '初稿已保存 · 等待你审读',
                                  'Draft saved · Awaiting your review',
                                )
                              : run.status === 'paused'
                                ? L('已暂停', 'Paused')
                                : run.status === 'cancelled'
                                  ? L('已取消', 'Cancelled')
                                  : L(
                                      '后台起草中',
                                      'Drafting in the background',
                                    )}{' '}
                      · {completed}/{run.tasks.length}
                    </p>
                  </div>
                  <div className="flow-actions">
                    {run.note_id && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void openDraft(run.note_id!)}
                      >
                        {L('打开初稿', 'Open draft')}
                        <ArrowRight size={14} />
                      </Button>
                    )}
                    <Link
                      href={`${projectPath(projectId, 'platform')}&mission=${run.id}${attention ? `&task=${attention.id}` : ''}`}
                    >
                      {attention
                        ? L('检查受阻步骤', 'Inspect blocked step')
                        : L('查看流程与分工', 'View workflow')}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="manuscript-dialog">
          <DialogHeader>
            <DialogTitle>
              {L(
                '根据研究生成论文初稿',
                'Draft a manuscript from your research',
              )}
            </DialogTitle>
            <DialogDescription>
              {L(
                '初稿会保存为一篇新笔记，不覆盖已有文章。无需填完每一个研究模块。',
                'Save a new editable note without overwriting existing writing. You do not need to complete every research module.',
              )}
            </DialogDescription>
          </DialogHeader>
          <ol
            className="manuscript-steps"
            aria-label={L('写作流程', 'Writing workflow')}
          >
            {[
              L('选择论点', 'Choose claims'),
              L('核对依据', 'Check evidence'),
              L('确认提纲与预算', 'Outline & budget'),
            ].map((label, i) => (
              <li key={label} aria-current={step === i ? 'step' : undefined}>
                <span>{i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {error && (
            <p role="alert" className="platform-notice">
              {error}
            </p>
          )}
          {step === 0 && (
            <div className="manuscript-fields">
              <label>
                {L(
                  '这篇文章回答哪个问题？',
                  'Which question will the article answer?',
                )}
                <select
                  value={question}
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    setSelected([]);
                    setTitle(
                      data?.questions
                        .find((q) => q.id === e.target.value)
                        ?.title.slice(0, 160) || '',
                    );
                  }}
                >
                  <option value="">
                    {L('选择研究问题', 'Choose a question')}
                  </option>
                  {data?.questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {L(
                  '选择要采用的已审读论点与竞争解释；系统会同时带上它们关联的支持证据与反证。',
                  'Choose reviewed claims and alternatives. Their linked supporting and contrary evidence will both be included.',
                )}
              </p>
              <div className="manuscript-selection">
                {data?.claims
                  .filter((c) => c.question_id === question)
                  .map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(c.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, c.id]
                              : ids.filter((id) => id !== c.id),
                          )
                        }
                      />
                      <span>
                        {c.body}
                        {c.kind === 'alternative' && (
                          <small>
                            {L('竞争解释', 'Alternative interpretation')}
                          </small>
                        )}
                      </span>
                    </label>
                  ))}
              </div>
              {(!question ||
                !data?.claims.some((c) => c.question_id === question)) && (
                <p>
                  {L(
                    '还没有可用的已审读论点？先在「问题与论证」关联证据并完成审读。',
                    'No reviewed claims yet? Link evidence and review claims in Questions & arguments.',
                  )}{' '}
                  <Link href={projectPath(projectId, 'arguments')}>
                    {L('前往问题与论证', 'Open questions & arguments')}
                  </Link>
                </p>
              )}
              <Button
                disabled={
                  busy || !question || !selected.length || selected.length > 20
                }
                onClick={() => void inspect()}
              >
                {busy
                  ? L('整理依据…', 'Preparing…')
                  : L('检查本轮依据', 'Inspect selected research')}
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
          {step === 1 && preview && (
            <div className="manuscript-fields">
              <p>
                {L(
                  '本轮将固定以下研究依据。没有相关人物条目也可以起草；候选身份仍作为不确定信息。',
                  'The following research will be frozen for this draft. Entity records are optional; candidate identities remain uncertain.',
                )}
              </p>
              <div className="manuscript-counts">
                <span>
                  {preview.bundle.claims.length}{' '}
                  {L('条已审读论点', 'reviewed claims')}
                </span>
                <span>
                  {preview.bundle.evidence.length}{' '}
                  {L('条关联证据', 'linked excerpts')}
                </span>
                <span>
                  {preview.bundle.entities.length}{' '}
                  {L('个人物／地点条目', 'entity records')}
                </span>
                <span>
                  {preview.bundle.relations.length}{' '}
                  {L('条材料关系', 'source relationships')}
                </span>
              </div>
              <details open>
                <summary>
                  {L('逐条对照原文', 'Inspect each source excerpt')}
                </summary>
                <div className="manuscript-evidence">
                  {preview.bundle.evidence.map((e) => (
                    <article key={e.id}>
                      <blockquote>{e.quote}</blockquote>
                      <p>
                        {preview.bundle.links
                          .filter((l) => l.evidence_id === e.id)
                          .map((l) =>
                            L(
                              l.relation === 'challenges'
                                ? '反证'
                                : l.relation === 'supports'
                                  ? '支持'
                                  : '背景',
                              l.relation,
                            ),
                          )
                          .join(' · ')}
                      </p>
                      <a
                        href={`${sourcePath(projectId, e.version_id, e.page)}&evidence=${e.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {
                          preview.bundle.sources.find(
                            (s) => s.id === e.source_id,
                          )?.title
                        }{' '}
                        · {L('第', 'p.')} {e.page} {L('页', '')} ↗
                      </a>
                    </article>
                  ))}
                </div>
              </details>
              {(preview.bundle.entities.length > 0 ||
                preview.bundle.relations.length > 0) && (
                <details>
                  <summary>
                    {L(
                      '人物身份与材料依赖',
                      'Identities and source dependence',
                    )}
                  </summary>
                  <div className="manuscript-evidence">
                    {preview.bundle.entities.map((entity) => (
                      <article key={String(entity.id)}>
                        <strong>{String(entity.name)}</strong>
                        <p>
                          {L('状态', 'Status')}:{' '}
                          {entity.status === 'confirmed'
                            ? L('已审读', 'Reviewed')
                            : L('未确认 / 有争议', 'Unconfirmed / contested')}
                        </p>
                        <p>
                          {Array.isArray(entity.aliases)
                            ? entity.aliases.join(' · ')
                            : ''}
                        </p>
                      </article>
                    ))}
                    {preview.bundle.relations.map((relation) => (
                      <article key={String(relation.id)}>
                        <strong>
                          {preview.bundle.sources.find(
                            (source) => source.id === relation.from_source,
                          )?.title || L('相关材料', 'Related source')}{' '}
                          →{' '}
                          {preview.bundle.sources.find(
                            (source) => source.id === relation.to_source,
                          )?.title ||
                            L(
                              '范围外关联材料',
                              'Related source outside this scope',
                            )}
                        </strong>
                        <p>{String(relation.basis)}</p>
                      </article>
                    ))}
                  </div>
                </details>
              )}
              <p>
                {L('已附书目', 'Bibliography entries included')}:{' '}
                {preview.bundle.bibliography.length} /{' '}
                {preview.bundle.sources.length}。
                {L(
                  '初稿不自动补造缺失书目或文献综述。',
                  'Missing references or literature reviews will not be invented.',
                )}
              </p>
              <p>
                {L(
                  '引文匹配只能核对文字。人物是否同一、材料是否独立、推断是否成立，仍需你判断。未选入的文献不能被补写成已经读过。',
                  'Quotation matching checks text only. Identity, source independence and interpretation remain scholarly judgments. Unprovided literature cannot be presented as already consulted.',
                )}
              </p>
              <Button onClick={() => setStep(2)}>
                {L('下一步：提纲与预算', 'Next: outline and budget')}
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
          {step === 2 && (
            <div className="manuscript-fields">
              <label>
                {L('文章标题', 'Article title')}
                <Input
                  value={title}
                  maxLength={160}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                {L('读者与写作要求', 'Audience and writing requirements')}
                <Textarea
                  value={audience}
                  maxLength={1000}
                  onChange={(e) => setAudience(e.target.value)}
                />
              </label>
              <label>
                {L('正文语言', 'Manuscript language')}
                <select
                  value={language}
                  onChange={(e) =>
                    setLanguage(e.target.value as 'zh-CN' | 'en')
                  }
                >
                  <option value="zh-CN">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <p>
                {L(
                  '每章约 400–700 中文字或 250–400 英文词，先形成可核查的研究初稿。你可以修改、增加或删除章节。',
                  'Aim for 400–700 Chinese characters or 250–400 English words per section. Edit, add or remove sections to shape a reviewable first draft.',
                )}
              </p>
              {sections.map((section, i) => (
                <fieldset key={i} className="manuscript-section">
                  <legend>
                    {L('章节', 'Section')} {i + 1}
                  </legend>
                  <label>
                    {L('章节标题', 'Section title')}
                    <Input
                      value={section.title}
                      maxLength={120}
                      onChange={(e) =>
                        setSections((old) =>
                          old.map((s, j) =>
                            j === i ? { ...s, title: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    {L('本章要回答什么？', 'What should this section answer?')}
                    <Textarea
                      value={section.goal}
                      maxLength={1000}
                      onChange={(e) =>
                        setSections((old) =>
                          old.map((s, j) =>
                            j === i ? { ...s, goal: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={sections.length <= 2}
                    onClick={() =>
                      setSections((old) => old.filter((_, j) => j !== i))
                    }
                  >
                    <X size={14} />
                    {L('删除章节', 'Remove section')}
                  </Button>
                </fieldset>
              ))}
              <Button
                variant="outline"
                disabled={sections.length >= 8}
                onClick={() =>
                  setSections((old) => [...old, { title: '', goal: '' }])
                }
              >
                <Plus size={16} />
                {L('增加章节', 'Add section')}
              </Button>
              <label>
                {L('写作助手', 'Writing model')}
                <select
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    const m = models.find((m) => m.id === e.target.value);
                    setInputRate(
                      m?.model_id === DEFAULT_RESEARCH_MODEL
                        ? String(GLM_PRICE_CEILING.input)
                        : '',
                    );
                    setOutputRate(
                      m?.model_id === DEFAULT_RESEARCH_MODEL
                        ? String(GLM_PRICE_CEILING.output)
                        : '',
                    );
                  }}
                >
                  <option value="">{L('选择模型', 'Choose a model')}</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} · {m.model_id}
                    </option>
                  ))}
                </select>
              </label>
              {!models.length && (
                <Link href="/?settings=models">
                  {L('添加模型连接', 'Add a model connection')}
                </Link>
              )}
              <div className="manuscript-pricing">
                <label>
                  {L(
                    '输入费率（美元／百万 token）',
                    'Input rate (USD / million tokens)',
                  )}
                  <Input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={inputRate}
                    onChange={(e) => setInputRate(e.target.value)}
                  />
                </label>
                <label>
                  {L(
                    '输出费率（美元／百万 token）',
                    'Output rate (USD / million tokens)',
                  )}
                  <Input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={outputRate}
                    onChange={(e) => setOutputRate(e.target.value)}
                  />
                </label>
                <label>
                  {L('本轮预算（美元）', 'Run budget (USD)')}
                  <Input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </label>
              </div>
              <p>
                {L(
                  '按填写费率预留费用，实际账单由模型服务商决定。预算不足会在调用前停止；超时不会自动重复扣费重试。',
                  'Reservations use the entered rates; your provider determines actual charges. Insufficient budget stops a call before dispatch. Uncertain calls are not automatically retried.',
                )}{' '}
                {L('项目可用预算约', 'Project budget available: about')} $
                {(
                  (data?.budget
                    ? data.budget.limit_units - data.budget.committed_units
                    : 0) / 1000000
                ).toFixed(2)}
                。
              </p>
              <label className="manuscript-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  {L(
                    '我已核对本轮证据并确认提纲与预算，允许后台起草；生成的文字仍需审读。',
                    'I checked the selected evidence and approve this outline and budget for background drafting; generated prose still needs review.',
                  )}
                </span>
              </label>
              <Button
                disabled={
                  busy ||
                  !confirmed ||
                  !validOutline ||
                  !model ||
                  Number(inputRate) <= 0 ||
                  Number(outputRate) <= 0 ||
                  !Number.isFinite(Number(inputRate)) ||
                  !Number.isFinite(Number(outputRate)) ||
                  Number(budget) < 0.01 ||
                  Number(budget) > 100
                }
                onClick={() => void create()}
              >
                {busy
                  ? L('建立后台流程…', 'Creating workflow…')
                  : L('确认并开始后台起草', 'Confirm and start drafting')}
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
          {step > 0 && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setError('');
                setConfirmed(false);
                setStep((s) => s - 1);
              }}
            >
              {L('返回上一步', 'Back')}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
