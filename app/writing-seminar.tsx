'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, projectRows } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import { agentRecipe, interleavePages } from '@/lib/platform/research-recipes';
import { DEFAULT_RESEARCH_MODEL, GLM_PRICE_CEILING } from '@/lib/model-routing';
import type { Source, SourceVersion, Model } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
export default function WritingSeminar({
  projectId,
  noteId,
  title,
  passage,
  question,
  onQuestion,
}: {
  projectId: string;
  noteId?: string;
  title: string;
  passage: () => string;
  question: string;
  onQuestion: (text: string) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [threads, setThreads] = useState<
    { id: string; title: string; status: string; needs_input: number }[]
  >([]);
  useEffect(() => {
    if (!noteId) return;
    let active = true;
    void api<{ threads: typeof threads }>(
      `/api/note-research?project_id=${projectId}&note_id=${noteId}`,
    )
      .then((r) => {
        if (active) setThreads(r.threads);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId, noteId]);
  const [mode, setMode] = useState<'seminar' | 'audit'>('seminar');
  const [data, setData] = useState<{
      sources: Source[];
      source_versions: SourceVersion[];
      models: Model[];
    } | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [model, setModel] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [mission, setMission] = useState(''),
    [inputRate, setInputRate] = useState(String(GLM_PRICE_CEILING.input)),
    [outputRate, setOutputRate] = useState(String(GLM_PRICE_CEILING.output));
  return (
    <details
      className="writing-tools"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy) {
          setBusy(true);
          void Promise.all([
            Promise.all([
              projectRows<Source>(projectId, 'sources'),
              projectRows<SourceVersion>(projectId, 'source_versions'),
            ]).then(([sources, source_versions]) => ({
              sources,
              source_versions,
            })),
            api<{ models: Model[] }>('/api/workspace?models=1'),
          ])
            .then(([snapshot, models]) => {
              setData({ ...snapshot, ...models });
              if (
                !models.models.some(
                  (m) => m.model_id === DEFAULT_RESEARCH_MODEL,
                )
              ) {
                setInputRate('');
                setOutputRate('');
              }
              setModel(
                models.models.find((m) => m.model_id === DEFAULT_RESEARCH_MODEL)
                  ?.id ||
                  models.models[0]?.id ||
                  '',
              );
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }
      }}
    >
      <summary>
        {L(
          '研究助手：研讨与逐条核查',
          'Research assistant: discussion and claim review',
        )}
      </summary>
      <p>
        {L(
          '选中正文中的一段，再提出问题。解释助手与质疑助手会依据你选择的材料讨论；你补充意见后，整理助手才继续。原笔记不会自动改写。',
          'Select a passage, then ask a question. Interpretation and critique assistants discuss your selected sources; a synthesis assistant continues after your input. Your draft remains under your control.',
        )}
      </p>
      {!!threads.length && (
        <section className="note-research-history">
          <h4>{L('继续这篇笔记的研究', 'Continue research on this note')}</h4>
          {threads.map((thread) => (
            <a
              key={thread.id}
              href={`/?project=${projectId}&tab=platform&mission=${thread.id}`}
            >
              <span>{thread.title}</span>
              <small>
                {thread.needs_input
                  ? L(
                      '等待你的审读或反馈',
                      'Waiting for your review or feedback',
                    )
                  : L('查看记录与后续步骤', 'Review discussion and next steps')}
              </small>
            </a>
          ))}
        </section>
      )}
      <fieldset
        className="flow-actions"
        aria-label={L('研究助手方式', 'Assistant method')}
      >
        <Button
          type="button"
          size="sm"
          variant={mode === 'seminar' ? 'secondary' : 'ghost'}
          aria-pressed={mode === 'seminar'}
          onClick={() => setMode('seminar')}
        >
          {L('讨论解释', 'Discuss interpretations')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'audit' ? 'secondary' : 'ghost'}
          aria-pressed={mode === 'audit'}
          onClick={() => setMode('audit')}
        >
          {L('逐条核查论述', 'Review individual claims')}
        </Button>
      </fieldset>
      {mode === 'audit' && (
        <p>
          {L(
            '核查选中段落中的原句，区分直接陈述、推断、依据不足和反证，并建议下一步材料。每次最多 20 条论述；助手意见仍需你审读。',
            'Review exact statements in the selected draft and distinguish direct statements, inference, insufficient evidence and counterevidence. Up to 20 claims per review; your assessment is still required.',
          )}
        </p>
      )}
      <Textarea
        aria-label={L(
          '给研究助手的问题',
          'Question for the research assistants',
        )}
        value={question}
        maxLength={2000}
        onChange={(e) => onQuestion(e.target.value)}
        placeholder={L(
          '例如：这段解释是否混淆了政策宣布与实际执行？还存在什么反证？',
          'For example: does this interpretation confuse a policy announcement with implementation? What counterevidence is available?',
        )}
      />
      {data && !data.models.length && (
        <p>
          <Link href="/?settings=models">
            {L(
              '先添加模型连接；当前笔记草稿已保存在本机。',
              'Add a model connection first; your note draft is kept locally.',
            )}
          </Link>
        </p>
      )}
      {data && (
        <>
          <label>
            {L(
              '用于核查的资料（最多 3 份、合计最多 24 页）',
              'Sources to check (up to 3 sources and 24 pages total)',
            )}
          </label>
          <div className="source-checkboxes">
            {data.sources.map((source) => (
              <label key={source.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(source.id)}
                  disabled={
                    !selected.includes(source.id) && selected.length >= 3
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, source.id]
                        : selected.filter((id) => id !== source.id),
                    )
                  }
                />
                {source.title}
              </label>
            ))}
          </div>
          <label>
            {L('研究模型', 'Research model')}
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                const isDefault =
                  data.models.find((m) => m.id === e.target.value)?.model_id ===
                  DEFAULT_RESEARCH_MODEL;
                setInputRate(isDefault ? String(GLM_PRICE_CEILING.input) : '');
                setOutputRate(
                  isDefault ? String(GLM_PRICE_CEILING.output) : '',
                );
              }}
            >
              {data.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.model_id}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <div className="form-pair">
        <label>
          {L(
            '输入单价（美元 / 百万 tokens）',
            'Input price (USD / million tokens)',
          )}
          <Input
            type="number"
            min="0"
            step="any"
            value={inputRate}
            onChange={(e) => setInputRate(e.target.value)}
          />
        </label>
        <label>
          {L(
            '输出单价（美元 / 百万 tokens）',
            'Output price (USD / million tokens)',
          )}
          <Input
            type="number"
            min="0"
            step="any"
            value={outputRate}
            onChange={(e) => setOutputRate(e.target.value)}
          />
        </label>
      </div>
      <p>
        {L(
          mode === 'seminar'
            ? '共 3 次模型步骤，中间停下来等你反馈。先生成可检查的计划；你开始执行后才使用项目预算。'
            : '逐条核查包含 1 次模型步骤、出处检查和你的最终审读。你开始执行后才使用项目预算。',
          mode === 'seminar'
            ? 'Three model steps, with a pause for your feedback. First create a reviewable plan; the project allowance is used only when you start it.'
            : 'Claim review uses one model step, citation checks and your final assessment. The project allowance is used only when you start it.',
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {mission ? (
        <a href={`/?project=${projectId}&tab=platform&mission=${mission}`}>
          {L(
            '打开研讨，检查材料与预算后开始',
            'Open the discussion; check sources and allowance before starting',
          )}
        </a>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={
            busy ||
            !data ||
            !model ||
            (mode === 'seminar' && !question.trim()) ||
            !selected.length ||
            !inputRate ||
            !outputRate ||
            Number(inputRate) <= 0 ||
            Number(outputRate) <= 0 ||
            !Number.isFinite(Number(inputRate)) ||
            !Number.isFinite(Number(outputRate))
          }
          onClick={async () => {
            if (!data) return;
            setBusy(true);
            setError('');
            try {
              const text = passage();
              if (text.length > 6000)
                throw new Error(
                  L(
                    '请先选中不超过 6,000 字符的一段正文。',
                    'Select a passage of up to 6,000 characters first.',
                  ),
                );
              const groups = selected.flatMap((id) => {
                const v = data.source_versions
                  .filter((v) => v.source_id === id)
                  .sort((a, b) => b.revision - a.revision)[0];
                return v
                  ? [
                      {
                        version_id: v.id,
                        pages: v.pages
                          .filter((p) => p.text.trim())
                          .map((p) => p.page),
                      },
                    ]
                  : [];
              });
              const pages = interleavePages(groups);
              if (pages.length > 24)
                throw new Error(
                  L(
                    '所选资料超过 24 页。请在研究计划页面选择具体页码。',
                    'Selected sources exceed 24 pages. Choose a page range in Research plans.',
                  ),
                );
              const draft = agentRecipe({
                method: {
                  title: (
                    (mode === 'audit'
                      ? L('逐条核查：', 'Claim review: ')
                      : L('笔记研讨：', 'Draft discussion: ')) + title
                  ).slice(0, 200),
                  kind: mode,
                  instructions:
                    question.trim() ||
                    L(
                      '逐条核查所选文稿，指出依据、推断和需要补充的材料。',
                      'Review the selected draft claim by claim, identify evidence, inferences and the next sources needed.',
                    ),
                  fields: ['Interpretation'],
                },
                pages,
                model_id: model,
                input_rate: Number(inputRate),
                output_rate: Number(outputRate),
                locale,
                comparisonText: text,
                noteId,
              });
              const result = await api<{ result: string }>('/api/platform', {
                action: 'create_mission',
                project_id: projectId,
                value: draft,
              });
              setMission(result.result);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Request failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          {L('准备研究研讨', 'Prepare research discussion')}
        </Button>
      )}
    </details>
  );
}
