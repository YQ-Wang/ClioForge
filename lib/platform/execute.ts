import {
  priorResearch,
  researchContext,
  researchReportContext,
  researchTool,
} from '../harness/research-tools';
import {
  priorSourceSearch,
  sourceSearchContext,
} from '../harness/source-search-tools';
import { sourceSearchTool } from '../harness/source-search-executor';
import { z } from 'zod';
import { HttpError } from '../errors';
import { canRepairOutput, outputRetryFeedback } from './output-retry';
import { assertManuscriptCurrent, runManuscriptBuiltin } from '../manuscript';
import { assertConversationContext } from '../task-conversation';
import { runMaintenanceSteps } from '../background-maintenance';
import { discoverSources } from './discovery';
import { MissionStore, decodeTask } from './missions';
import { indexVersion, normalize, searchPages, sha256 } from './search';
import type { MissionTask, TaskResult } from './types';
import { savedModelResult } from './model-result';
import { expiredExecution, recoverModelResults } from './recover-model-result';
import type { JobsEnv } from '../jobs';
import { invoke } from '../providers';
import { mergeResearchTexts } from '../review-citations';
import { createJob, executeJob, jobById } from '../jobs';
const now = () => new Date().toISOString();
export async function dependencies(store: MissionStore, task: MissionTask) {
  return (
    await store.db
      .prepare(
        'SELECT p.* FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=? ORDER BY p.id',
      )
      .bind(task.id)
      .all()
  ).results.map(decodeTask);
}
export function overlap(a: string, b: string) {
  const shingles = (text: string) => {
    const words = normalize(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    return new Set(
      words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(' ')),
    );
  };
  const left = shingles(a),
    right = shingles(b);
  if (!left.size || !right.size) return 0;
  const same = [...left].filter((value) => right.has(value)).length;
  return same / (left.size + right.size - same);
}
export async function builtin(
  store: MissionStore,
  task: MissionTask,
  runtime: {
    files?: R2Bucket;
    credentials?: import('../search/connectors').SearchCredentials;
    request?: typeof fetch;
  } = {},
): Promise<TaskResult> {
  const L = (zh: string, en: string) => (task.input.locale === 'en' ? en : zh);
  if (typeof task.input.parameters.reuse_task === 'string') {
    const original = await store.task(task.input.parameters.reuse_task);
    if (
      original.project_id !== task.project_id ||
      !original.result ||
      !['succeeded', 'accepted'].includes(original.status) ||
      (await sha256(JSON.stringify(original.result))) !==
        task.input.parameters.expected_hash
    )
      throw new Error('此前结果已有变化，请重新检查续研计划。');
    return { ...original.result, checks: [] };
  }
  const deps = await dependencies(store, task);
  if (task.input.parameters.source_search === true)
    return sourceSearchTool(store, task, deps, runtime);
  if (
    ['tool', 'decision', 'report'].includes(
      String(task.input.parameters.agent_stage),
    )
  )
    return researchTool(store, task, deps);
  if (task.input.parameters.manuscript_stage)
    return runManuscriptBuiltin(store, task, deps);
  const inherited = [
    ...new Map(
      deps
        .flatMap((dep) => dep.result?.citations || [])
        .map((citation) => [
          JSON.stringify([citation.version_id, citation.page, citation.quote]),
          citation,
        ]),
    ).values(),
  ];
  const base = {
    citations: inherited.slice(0, 100),
    checks: [] as TaskResult['checks'],
  };
  if (task.kind === 'search' && task.input.parameters.discovery === true)
    return discoverSources(store, task, deps);
  if (task.kind === 'search') {
    for (const id of task.input.version_ids)
      await indexVersion(store.db, await store.version(id));
    const hits = await searchPages(store, task.project_id, task.input.query, {
      version_ids: task.input.version_ids,
      history: !!task.input.version_ids.length,
      limit: 30,
    });
    return {
      summary: L(
        `找到 ${hits.length} 页相关材料。检索仅覆盖本次所选资料；未找到并不等于历史上不存在。`,
        `${hits.length} page matches. Literal / alias search; this is bounded corpus coverage, not proof of absence.`,
      ),
      citations: hits
        .filter((hit) => hit.text.length > 0)
        .map((hit) => ({
          version_id: hit.version_id,
          page: hit.page,
          quote: hit.snippet,
          start: hit.text.indexOf(hit.snippet),
        })),
      checks: [
        {
          name: 'scope',
          passed: true,
          detail: `${task.input.version_ids.length} fixed versions; maximum 30 matching pages`,
        },
      ],
      data: {
        query: task.input.query,
        hits: hits.map(({ text: _text, ...hit }) => hit),
        engine: 'clioforge-fts-v1',
      },
    };
  }
  if (task.kind === 'compare') {
    const texts = await Promise.all(
      [
        ...new Set([
          ...task.input.version_ids,
          ...inherited.map((c) => c.version_id),
        ]),
      ]
        .slice(0, 50)
        .map(async (id) => {
          const version = await store.version(id);
          return {
            id,
            source_id: version.source_id,
            text: version.pages.map((page) => page.text).join('\n'),
          };
        }),
    );
    const pairs = [];
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const score = overlap(texts[i].text, texts[j].text);
        if (score >= Number(task.input.parameters.threshold ?? 0.2))
          pairs.push({
            left: texts[i].id,
            right: texts[j].id,
            jaccard: score,
            status: 'candidate',
          });
      }
    return {
      ...base,
      summary: L(
        `找到 ${pairs.length} 组值得对读的相似材料。共同措辞不能单独证明抄写关系或证言独立性。`,
        `${pairs.length} candidate textual parallels. Shared wording does not establish copying or independent testimony.`,
      ),
      data: {
        pairs: pairs.sort((a, b) => b.jaccard - a.jaccard).slice(0, 200),
        method: 'word-trigram-jaccard-v1',
        threshold: task.input.parameters.threshold ?? 0.2,
      },
    };
  }
  if (task.kind === 'compute') {
    const keywords = (
      typeof task.input.parameters.keywords === 'string'
        ? task.input.parameters.keywords
        : task.input.query
    )
      .split('|')
      .map(normalize)
      .filter(Boolean)
      .slice(0, 30);
    const rows = [];
    for (const id of task.input.version_ids) {
      const version = await store.version(id);
      for (const page of version.pages) {
        const text = normalize(page.text);
        rows.push({
          version_id: id,
          page: page.page,
          characters: page.text.length,
          counts: Object.fromEntries(
            keywords.map((keyword) => [
              keyword,
              text.split(keyword).length - 1,
            ]),
          ),
        });
      }
    }
    return {
      ...base,
      summary: L(
        `已统计 ${rows.length} 页材料中的词语出现次数。统计仅描述这批材料，保留所选词语与资料版本以便复算。`,
        `Reproducible keyword counts across ${rows.length} pages. Counts describe this corpus only.`,
      ),
      data: {
        recipe: 'keyword-count-v1',
        parameters: { keywords },
        version_ids: task.input.version_ids,
        rows,
      },
    };
  }
  if (task.kind === 'verify') {
    const result = {
      ...base,
      summary: L(
        `已将 ${inherited.length} 条引文与引用时的资料版本逐一核对。文字匹配不代表解释成立，仍需研究者复核。`,
        `Checked ${inherited.length} citations against fixed source versions. Historical interpretation remains subject to researcher review.`,
      ),
    };
    // Submission verifies every quotation before accepting this result. Running
    // the same checks here would store each check twice in the review record.
    return result;
  }
  if (task.kind === 'publish') {
    const reviewed = deps.some((dep) => dep.executor === 'model')
      ? deps.find((dep) => dep.executor === 'human' && dep.kind === 'review')
      : undefined;
    return {
      ...base,
      ...mergeResearchTexts(
        reviewed?.result
          ? [reviewed.result]
          : deps.map((dep) => ({
              summary: `## ${dep.title}\n\n${dep.result?.summary || ''}`,
              citations: dep.result?.citations || [],
            })),
      ),
      data: {
        dependencies: deps.map((dep) => ({
          id: dep.id,
          attempt: dep.attempt,
          result: dep.result,
        })),
        format: 'clioforge-research-artifact-v1',
      },
    };
  }
  throw new Error('Unsupported builtin task');
}
export async function dispatchMission(env: JobsEnv, missionId: string) {
  const queue = env.JOB_QUEUE;
  if (!queue) return;
  const rows = (
    await env.DB.prepare(
      "SELECT id FROM mission_tasks WHERE mission_id=? AND status='ready' AND executor IN ('builtin','model') AND EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_id AND m.status='active') LIMIT 20",
    )
      .bind(missionId)
      .all<{ id: string }>()
  ).results;
  await runMaintenanceSteps(
    rows.map((row) => ({
      name: `dispatch_task:${row.id}`,
      run: async () => {
        const changed = await env.DB.prepare(
          "UPDATE mission_tasks SET status='queued',revision=revision+1,updated_at=? WHERE id=? AND status='ready'",
        )
          .bind(now(), row.id)
          .run();
        if (changed.meta.changes)
          await queue.send({ id: row.id, kind: 'mission' });
      },
    })),
  );
}
export async function executeMissionTask(
  env: JobsEnv,
  id: string,
  modelInvoke: typeof invoke = invoke,
) {
  const record = await env.DB.prepare(
    'SELECT t.*,m.created_by FROM mission_tasks t JOIN missions m ON m.id=t.mission_id WHERE t.id=?',
  )
    .bind(id)
    .first();
  if (!record || !['ready', 'queued'].includes(String(record.status))) return;
  const store = new MissionStore(env.DB, String(record.created_by));
  let lease = '';
  let modelStarted = false;
  let modelFailure = '';
  let modelConfirmed = false;
  const candidate: { result: TaskResult | null } = { result: null };
  let claimedTask: MissionTask | null = null;
  let invalidOutput = false;
  try {
    const claimed = await store.claim(
      id,
      `clioforge:${String(record.executor)}`,
      record.executor as 'builtin' | 'model',
    );
    lease = claimed.lease;
    const task = claimed.task;
    claimedTask = task;
    let result: TaskResult;
    const stoppedDecision =
      task.input.parameters.agent_stage === 'decision' &&
      priorResearch(await dependencies(store, task)).stopped;
    const stoppedSourceDecision =
      task.input.parameters.source_agent_stage === 'decision' &&
      priorSourceSearch(await dependencies(store, task)).stopped;
    const emptyReport =
      task.input.parameters.agent_stage === 'report' &&
      !priorResearch(await dependencies(store, task)).steps.some(
        (s) => s.citations.length,
      );
    if (
      task.executor === 'builtin' ||
      stoppedDecision ||
      stoppedSourceDecision ||
      emptyReport
    )
      result = await builtin(store, task, {
        files: env.FILES,
        request: fetch,
        credentials:
          task.input.parameters.search_provider === 'brave' &&
          env.BRAVE_SEARCH_API_KEY
            ? {
                webProvider: 'brave',
                webKey: env.BRAVE_SEARCH_API_KEY,
                dplaKey: env.DPLA_API_KEY,
              }
            : task.input.parameters.search_provider === 'tavily' &&
                env.TAVILY_API_KEY
              ? {
                  webProvider: 'tavily',
                  webKey: env.TAVILY_API_KEY,
                  dplaKey: env.DPLA_API_KEY,
                }
              : { dplaKey: env.DPLA_API_KEY },
      });
    else {
      if (!task.input.model_id)
        throw new Error('Select a model before running this task');
      await assertConversationContext(store, task);
      if (task.input.parameters.manuscript_stage)
        await assertManuscriptCurrent(store, task);
      const deps = await dependencies(store, task);
      const jobId = crypto.randomUUID();
      const versions = [
        ...new Set([
          ...task.input.version_ids,
          ...(task.input.page_refs
            ? []
            : deps.flatMap(
                (dep) => dep.result?.citations.map((c) => c.version_id) || [],
              )),
        ]),
      ];
      if (versions.length > 10)
        throw new Error('一次模型步骤最多使用 10 份资料，请拆分研究计划。');
      const dependencyText = JSON.stringify(
        deps.map((dep) =>
          task.input.parameters.source_agent_stage &&
          dep.input.parameters.source_agent_stage === 'tool'
            ? sourceSearchContext(priorSourceSearch([dep]))
            : task.input.parameters.agent_stage &&
                dep.input.parameters.agent_stage === 'tool'
              ? task.input.parameters.agent_stage === 'report'
                ? researchReportContext(priorResearch([dep]))
                : researchContext(priorResearch([dep]))
              : task.input.parameters.seminar
                ? {
                    speaker: dep.input.parameters.speaker || dep.executor,
                    task_id: dep.id,
                    title: dep.title,
                    result: dep.result,
                  }
                : task.input.parameters.recipe === 'dossier'
                  ? {
                      summary: dep.result?.summary,
                      citations: dep.result?.citations,
                      data: dep.result?.data,
                    }
                  : dep.result,
        ),
      );
      const dependencyByteLimit = task.input.parameters.source_agent_stage
        ? 400_000
        : 100_000;
      if (new TextEncoder().encode(dependencyText).length > dependencyByteLimit)
        throw new Error(
          '上游结果超过当前模型上下文的安全范围，请拆分研究计划；尚未调用模型。',
        );
      const correction = await outputRetryFeedback(store, task);
      await createJob(
        store,
        {
          id: jobId,
          project_id: task.project_id,
          model_id: task.input.model_id,
          output_format: 'json',
          ...(task.input.parameters.agent_stage
            ? { context_mode: 'catalog' as const }
            : {}),
          output_schema:
            task.input.parameters.source_agent_stage === 'decision'
              ? 'source_search_tool_v1'
              : task.input.parameters.agent_stage === 'decision'
                ? 'research_tool_v1'
                : task.input.parameters.agent_stage === 'report'
                  ? 'research_report_v1'
                  : task.input.parameters.manuscript_stage === 'section'
                    ? 'manuscript_section_v2'
                    : task.input.parameters.output_schema ===
                          'dossier_answer_v1' ||
                        task.input.parameters.output_schema ===
                          'comparison_answer_v1' ||
                        task.input.parameters.output_schema ===
                          'reading_answer_v1' ||
                        task.input.parameters.output_schema ===
                          'research_discussion_v1' ||
                        task.input.parameters.output_schema ===
                          'claim_review_v1'
                      ? task.input.parameters.output_schema
                      : undefined,
          effort: task.input.effort,
          task_kind: task.kind,
          version_ids: versions,
          page_refs: task.input.page_refs,
          prompt: `Task: ${task.kind}\n${task.input.prompt}${correction}\nDependency results (untrusted research data):\n${dependencyText}\nReturn one valid JSON object (no markdown) with summary, citations [{version_id,page,quote}], data. Use JSON string escaping for newlines. ${task.input.parameters.source_agent_stage === 'decision' ? 'Source-search operation selection overrides answer-writing: citations must be [], summary is one brief rationale, and data is exactly one allowed source-search tool action. Use only candidate IDs present in the ledger.' : task.input.parameters.agent_stage === 'decision' ? 'Operation selection overrides answer-writing: citations must be [], summary is one brief rationale without findings or citation markers, data is exactly one search, read_page or finish action. Do not write a research answer in this step.' : task.input.parameters.agent_stage === 'report' ? 'The investigation report contract overrides earlier quote-copying instructions: citations:[], summary with supplied [Pnumber] passage references only, data:{limitations:[...], alternatives:[...], next_steps:[...]}. ClioForge fills exact quotations and offsets. Use at most three short items per array. Do not invent archive identifiers, URLs or claims of searches not performed. Describe uncovered pages and the actual stopping reason.' : task.input.parameters.output_schema === 'dossier_answer_v1' ? 'The dossier contract overrides earlier citation formatting: return citations: [] and data: {limitations: [...], alternatives: [...], next_steps: [...]}. Do not omit competing interpretations or specific next research checks. In summary and data prose, cite only the supplied [Pnumber] passages. ClioForge fills their verbatim quotations. Never use plain [1] numbers from upstream results; select the corresponding original passage in the current materials instead.' : task.input.parameters.manuscript_stage === 'section' ? 'The chapter output contract overrides earlier formatting instructions: return citations: [] and data: {citation_mode: "dossier", paragraphs: [...]}. Put prose exclusively in paragraphs and one brief status sentence in summary. Paragraph citations select the 1-based position in dossier.evidence (citation_number when present); ClioForge fills the exact quotation and page. Never write citation objects. Other page text is context, not additional approved evidence. Every substantive paragraph needs selected claim UUIDs and approved evidence numbers. Each paragraph item is one prose paragraph; no internal blank lines. Preserve the distinction between insufficient evidence and evidence of absence: do not turn a bounded claim into a categorical denial. Use previous sections for continuity without repeating their prose; keep each section focused on its own outline goal.' : 'Keep summary concise, about 800 Chinese characters or 500 English words; use short exact quotations, preserve case and punctuation. Use [1], [2] in summary strictly matching the 1-based citations array.'} Never invent a citation. Answer in ${task.input.locale === 'en' ? 'English' : 'Chinese'}.`,
          input_rate: task.input.input_rate,
          output_rate: task.input.output_rate,
          max_output: task.input.max_output,
          locale: task.input.locale,
        },
        { id: task.id, attempt: task.attempt },
      );
      await store.event(task.mission_id, id, 'model_job', jobId);
      modelStarted = true;
      await executeJob(env, jobId, modelInvoke);
      const job = await jobById(env.DB, jobId, store.owner);
      if (job?.status !== 'succeeded') {
        modelFailure = job?.error || '模型任务没有返回可确认的结果。';
        if (job?.status === 'failed' && job.reserved_units === 0) {
          modelStarted = false;
          throw new Error(modelFailure);
        }
        throw new Error('Model job did not finish with a confirmed result');
      }
      modelConfirmed = true;
      try {
        result = await savedModelResult(store, task, job);
        candidate.result = result;
        await store.checkResult(task, result);
      } catch (error) {
        // Only a confirmed response failing the output contract is repairable.
        // Permissions, stale inputs, DB failures and uncertain calls are not.
        invalidOutput =
          error instanceof SyntaxError ||
          error instanceof z.ZodError ||
          (error instanceof HttpError && error.status === 400);
        throw error;
      }
    }
    await store.submit(
      id,
      lease,
      `clioforge:${String(record.executor)}`,
      result,
    );
    await dispatchMission(env, String(record.mission_id));
  } catch (error) {
    if (!lease) return;
    const status = modelStarted && !invalidOutput ? 'uncertain' : 'failed';
    const detail =
      error instanceof Error ? error.message.slice(0, 500) : 'Task failed';
    const message = modelStarted
      ? modelFailure ||
        (modelConfirmed
          ? `模型已返回，但内容未通过核查：${detail}`
          : '模型执行结果需要检查；预算预留保留，不会自动重复调用。')
      : detail;
    const failedResult = candidate.result
      ? JSON.stringify({
          ...candidate.result,
          checks: [{ name: 'source_validation', passed: false, detail }],
        })
      : null;
    const repair = claimedTask
      ? canRepairOutput(claimedTask, invalidOutput)
      : false;
    const hash = await sha256(lease),
      date = now();
    const saved = await env.DB.batch([
      env.DB.prepare(
        "UPDATE task_attempts SET status=?,result=?,finished_at=? WHERE task_id=? AND attempt=? AND EXISTS(SELECT 1 FROM mission_tasks t WHERE t.id=task_id AND t.attempt=task_attempts.attempt AND t.status='running' AND t.lease_hash=?)",
      ).bind(status, failedResult, date, id, claimedTask!.attempt, hash),
      env.DB.prepare(
        "UPDATE mission_tasks SET status=CASE WHEN ? AND lease_until>? AND EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_id AND m.status='active') THEN 'blocked' ELSE ? END,failure_stage=?,error=?,result=COALESCE(?,result),lease_hash=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='running' AND lease_hash=? AND attempt=?",
      ).bind(
        repair ? 1 : 0,
        date,
        status,
        modelConfirmed && !invalidOutput
          ? 'local_delivery'
          : invalidOutput
            ? 'output_validation'
            : modelStarted
              ? 'provider'
              : 'preparation',
        message,
        failedResult,
        date,
        id,
        hash,
        claimedTask!.attempt,
      ),
    ]);
    if (saved[1].meta.changes) {
      const scheduled = repair && (await store.task(id)).status === 'blocked';
      await store.event(
        String(record.mission_id),
        id,
        scheduled ? 'output_retry' : status,
        scheduled
          ? 'One output correction scheduled within the project budget; original response retained.'
          : message,
      );
      if (scheduled) {
        await store.advance(String(record.mission_id));
        await dispatchMission(env, String(record.mission_id));
      }
    }
  }
}
export async function recoverMissions(env: JobsEnv) {
  const date = now();
  await env.DB.prepare(
    "UPDATE mission_tasks SET status='uncertain',error=?,lease_hash=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE status='running' AND lease_until<?",
  )
    .bind(expiredExecution, date, date)
    .run();
  await runMaintenanceSteps([
    { name: 'saved_model_responses', run: () => recoverModelResults(env) },
    { name: 'runnable_missions', run: () => recoverRunnableMissions(env) },
  ]);
}
async function recoverRunnableMissions(env: JobsEnv) {
  const queued = (
    await env.DB.prepare(
      "SELECT t.id FROM mission_tasks t JOIN missions m ON m.id=t.mission_id WHERE t.status='queued' AND t.updated_at<? AND m.status='active' ORDER BY t.updated_at,t.id LIMIT 30",
    )
      .bind(new Date(Date.now() - 60_000).toISOString())
      .all<{ id: string }>()
  ).results;
  const missions = (
    await env.DB.prepare(
      `SELECT m.id,m.created_by FROM missions m WHERE m.status='active' AND (
        EXISTS(SELECT 1 FROM mission_tasks t WHERE t.project_id=m.project_id AND t.mission_id=m.id AND (
          (t.status='ready' AND t.executor IN ('builtin','model')) OR
          (t.status='blocked' AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=t.id AND p.status NOT IN ('succeeded','accepted'))) OR
          (t.status IN ('ready','queued','running','review','succeeded','accepted') AND EXISTS(SELECT 1 FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=t.id AND p.status IN ('stale','rejected')))
        )) OR NOT EXISTS(SELECT 1 FROM mission_tasks t WHERE t.project_id=m.project_id AND t.mission_id=m.id AND t.status NOT IN ('succeeded','accepted'))
      ) ORDER BY m.updated_at,m.id LIMIT 30`,
    ).all<{ id: string; created_by: string }>()
  ).results;
  await runMaintenanceSteps([
    ...queued.map((task) => ({
      name: `queued_task:${task.id}`,
      run: async () => {
        await env.JOB_QUEUE?.send({ id: task.id, kind: 'mission' });
      },
    })),
    ...missions.map((mission) => ({
      name: `research_plan:${mission.id}`,
      run: async () => {
        await new MissionStore(env.DB, mission.created_by).advance(mission.id);
        await dispatchMission(env, mission.id);
      },
    })),
  ]);
}
