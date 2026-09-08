'use client';
import ResearchText from './research-text';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, downloadJson } from '@/lib/client-api';
import { replayTrace, type AgentTrace } from '@/lib/harness/trace';
import { taskStatusLabels, orderedTasks } from '@/lib/task-presentation';
import { useI18n } from '@/lib/i18n/provider';
export function ResearchTrace({
  projectId,
  missionId,
}: {
  projectId: string;
  missionId: string;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [checks, setChecks] = useState<Awaited<
    ReturnType<typeof replayTrace>
  > | null>(null);
  async function show(value: AgentTrace) {
    const result = await replayTrace(value);
    setTrace(result.trace);
    setChecks(result);
  }
  async function load() {
    setOpen(true);
    setBusy(true);
    setError('');
    setTrace(null);
    setChecks(null);
    try {
      await show(
        await api<AgentTrace>(
          `/api/platform?project_id=${projectId}&mission_id=${missionId}&trace=1`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load trace');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => void load()}>
        {L('执行回放', 'Execution replay')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {L('研究执行回放', 'Research execution replay')}
            </DialogTitle>
          </DialogHeader>
          <p>
            {L(
              '查看实际执行的操作与出处检查，不会重新调用模型。导出的文件包含所选史料与研究结果，请按研究资料保管。',
              'Inspect executed steps and source checks without new model calls. Exports include source text and research results; handle them as research data.',
            )}
          </p>
          {busy && <output>{L('正在读取记录…', 'Loading records…')}</output>}
          {error && <p role="alert">{error}</p>}
          {checks && (
            <>
              <p>
                {L(
                  `已检查 ${checks.checked} 项结果；${checks.pending} 项尚无结果；${checks.failures.length} 项检查未通过。`,
                  `Checked ${checks.checked} results; ${checks.pending} pending; ${checks.failures.length} failed checks.`,
                )}
              </p>
              <p>
                {L(
                  '引文与操作检查不能确认历史解释正确。',
                  'Source and tool checks do not establish historical correctness.',
                )}
              </p>
              {checks.failures.map((f, i) => (
                <p key={i}>{f}</p>
              ))}
            </>
          )}
          {trace && (
            <>
              <ol className="space-y-3">
                {orderedTasks(trace.data.tasks, trace.data.edges).map((t) => (
                  <li
                    key={t.id}
                    className="rounded-xl border border-border p-4 space-y-2"
                  >
                    <strong>{t.title}</strong>
                    <p>
                      {taskStatusLabels[
                        t.status as keyof typeof taskStatusLabels
                      ]?.[locale === 'en' ? 1 : 0] || t.status}{' '}
                      ·{' '}
                      {t.result?.summary
                        ? t.result.summary.length > 240
                          ? t.result.summary.slice(0, 240) + '…'
                          : t.result.summary
                        : L('尚未产生结果', 'No result yet')}
                    </p>
                    {t.result && t.result.summary.length > 240 && (
                      <details>
                        <summary className="cursor-pointer text-primary">
                          {L('展开完整结果', 'Expand full result')}
                        </summary>
                        <ResearchText text={t.result.summary} />
                      </details>
                    )}
                    {t.failure_stage && (
                      <p>
                        {L('故障位置', 'Failure stage')}:{' '}
                        {(
                          {
                            local_delivery: L(
                              'Canwoo 保存与交接',
                              'Canwoo persistence and handoff',
                            ),
                            output_validation: L(
                              '输出格式或出处核查',
                              'Output or citation checks',
                            ),
                            provider: L(
                              '模型请求或响应',
                              'Model request or response',
                            ),
                            preparation: L(
                              '调用前准备',
                              'Preparation before calling',
                            ),
                          } as Record<string, string>
                        )[t.failure_stage] || t.failure_stage}
                      </p>
                    )}
                    {trace.data.jobs
                      .filter((j) => j.task_id === t.id)
                      .map((j) => (
                        <details key={j.id}>
                          <summary className="cursor-pointer text-primary">
                            {j.provider} / {j.model} ·{' '}
                            {L('调用详情', 'Request details')}
                          </summary>
                          <p>
                            {L('计入或预留额度', 'Settled or reserved budget')}:
                            ${(j.reserved_units / 1000000).toFixed(4)} ·{' '}
                            {j.input_tokens} / {j.output_tokens} tokens ·{' '}
                            {j.effort || 'default'}
                          </p>
                          <pre className="whitespace-pre-wrap text-xs">
                            {j.diagnostics ||
                              L(
                                '此记录没有诊断信息',
                                'No diagnostics recorded',
                              )}
                          </pre>
                        </details>
                      ))}
                  </li>
                ))}
              </ol>
              <Button
                variant="outline"
                onClick={() =>
                  downloadJson(trace, 'canwoo-research-trace.json')
                }
              >
                {L('导出回放记录', 'Export replay record')}
              </Button>
            </>
          )}
          <label>
            {L(
              '在本地检查已有回放文件（不上传）',
              'Check an existing replay file locally (not uploaded)',
            )}
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setError('');
                setBusy(true);
                setTrace(null);
                setChecks(null);
                try {
                  if (file.size > 8 * 1024 * 1024)
                    throw new Error(
                      L('回放文件超过 8 MB。', 'Replay file exceeds 8 MB.'),
                    );
                  await show(JSON.parse(await file.text()));
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'Invalid replay file',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </DialogContent>
      </Dialog>
    </>
  );
}
