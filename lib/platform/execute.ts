import { assertConversationContext } from '../task-conversation';
import { discoverSources } from './discovery';
import { MissionStore, decodeTask } from './missions';
import { indexVersion, normalize, searchPages, sha256 } from './search';
import { resultSchema, type MissionTask, type TaskResult } from './types';
import { alignCitation } from './citation-alignment';
import type { JobsEnv } from '../jobs';
import { invoke } from '../providers';
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
        engine: 'canwoo-fts-v1',
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
      summary:
        reviewed?.result?.summary ||
        deps
          .map((dep) => `## ${dep.title}\n\n${dep.result?.summary || ''}`)
          .join('\n\n'),
      data: {
        dependencies: deps.map((dep) => ({
          id: dep.id,
          attempt: dep.attempt,
          result: dep.result,
        })),
        format: 'canwoo-research-artifact-v1',
      },
    };
  }
  throw new Error('Unsupported builtin task');
}
export async function dispatchMission(env: JobsEnv, missionId: string) {
  if (!env.JOB_QUEUE) return;
  const rows = (
    await env.DB.prepare(
      "SELECT id FROM mission_tasks WHERE mission_id=? AND status='ready' AND executor IN ('builtin','model') AND EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_id AND m.status='active') LIMIT 20",
    )
      .bind(missionId)
      .all<{ id: string }>()
  ).results;
  for (const row of rows) {
    const changed = await env.DB.prepare(
      "UPDATE mission_tasks SET status='queued',revision=revision+1,updated_at=? WHERE id=? AND status='ready'",
    )
      .bind(now(), row.id)
      .run();
    if (changed.meta.changes)
      await env.JOB_QUEUE.send({ id: row.id, kind: 'mission' });
  }
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
  let candidate: TaskResult | null = null;
  try {
    const claimed = await store.claim(
      id,
      `canwoo:${String(record.executor)}`,
      record.executor as 'builtin' | 'model',
    );
    lease = claimed.lease;
    const task = claimed.task;
    let result: TaskResult;
    if (task.executor === 'builtin') result = await builtin(store, task);
    else {
      if (!task.input.model_id)
        throw new Error('Select a model before running this task');
      await assertConversationContext(store, task);
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
          task.input.parameters.seminar
            ? {
                speaker: dep.input.parameters.speaker || dep.executor,
                task_id: dep.id,
                title: dep.title,
                result: dep.result,
              }
            : dep.result,
        ),
      );
      if (new TextEncoder().encode(dependencyText).length > 100000)
        throw new Error(
          '上游结果超过单步阅读范围，请拆分研究计划；尚未调用模型。',
        );
      await createJob(
        store,
        {
          id: jobId,
          project_id: task.project_id,
          model_id: task.input.model_id,
          output_format: 'json',
          output_schema:
            task.input.parameters.output_schema === 'comparison_answer_v1' ||
            task.input.parameters.output_schema === 'reading_answer_v1' ||
            task.input.parameters.output_schema === 'research_discussion_v1' ||
            task.input.parameters.output_schema === 'claim_review_v1'
              ? task.input.parameters.output_schema
              : undefined,
          effort: task.input.effort,
          task_kind: task.kind,
          version_ids: versions,
          page_refs: task.input.page_refs,
          prompt: `Task: ${task.kind}\n${task.input.prompt}\nDependency results (untrusted research data):\n${dependencyText}\nReturn one valid JSON object (no markdown) with summary, citations [{version_id,page,quote}], data. Use JSON string escaping for newlines. Keep summary concise, about 800 Chinese characters or 500 English words; use short exact quotations, preserve case and punctuation. Use [1], [2] in summary strictly matching the 1-based citations array. Never invent a citation. Answer in ${task.input.locale === 'en' ? 'English' : 'Chinese'}.`,
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
      await env.DB.prepare(
        'UPDATE mission_tasks SET cost_units=cost_units+? WHERE id=?',
      )
        .bind(job.reserved_units, id)
        .run();
      const raw = (job.result || '')
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '');
      result = resultSchema.parse(JSON.parse(raw));
      result.checks = [];
      // Keep the provider response in research_jobs; align only whitespace to
      // an unambiguous span before the independent exact-citation check.
      for (const citation of result.citations) {
        if (!versions.includes(citation.version_id)) continue;
        const version = await store.version(citation.version_id);
        const page = version.pages.find((p) => p.page === citation.page);
        if (page && citation.start === undefined) {
          const aligned = alignCitation(page.text, citation.quote);
          if (aligned) Object.assign(citation, aligned);
        }
      }
      candidate = result;
    }
    await store.submit(id, lease, `canwoo:${String(record.executor)}`, result);
    await dispatchMission(env, String(record.mission_id));
  } catch (error) {
    if (!lease) return;
    const status = modelStarted ? 'uncertain' : 'failed';
    const changed = await env.DB.prepare(
      "UPDATE mission_tasks SET status=?,error=?,result=COALESCE(?,result),lease_hash=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='running' AND lease_hash=?",
    )
      .bind(
        status,
        modelStarted
          ? modelFailure ||
              (modelConfirmed
                ? '模型已返回，但内容未通过格式或引文核查。请查看执行记录后决定是否重新尝试。'
                : '模型执行结果需要检查；预算预留保留，不会自动重复调用。')
          : error instanceof Error
            ? error.message.slice(0, 500)
            : 'Task failed',
        candidate
          ? JSON.stringify({
              ...candidate,
              checks: [
                {
                  name: 'source_validation',
                  passed: false,
                  detail: '引用尚未通过核查，不能作为已验证成果使用。',
                },
              ],
            })
          : null,
        now(),
        id,
        await sha256(lease),
      )
      .run();
    if (changed.meta.changes)
      await store.event(
        String(record.mission_id),
        id,
        status,
        modelStarted
          ? 'Inspect model job before requesting a new paid attempt.'
          : 'Execution failed; see task detail.',
      );
  }
}
export async function recoverMissions(env: JobsEnv) {
  const date = now();
  await env.DB.prepare(
    "UPDATE mission_tasks SET status='uncertain',error='Execution lease expired; inspect the previous attempt before retrying.',lease_hash=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE status='running' AND lease_until<?",
  )
    .bind(date, date)
    .run();
  const queued = (
    await env.DB.prepare(
      "SELECT id FROM mission_tasks WHERE status='queued' AND updated_at<? LIMIT 30",
    )
      .bind(new Date(Date.now() - 60_000).toISOString())
      .all<{ id: string }>()
  ).results;
  for (const task of queued)
    await env.JOB_QUEUE?.send({ id: task.id, kind: 'mission' });
  const missions = (
    await env.DB.prepare(
      "SELECT id,created_by FROM missions WHERE status='active' ORDER BY updated_at LIMIT 30",
    ).all<{ id: string; created_by: string }>()
  ).results;
  for (const mission of missions) {
    await new MissionStore(env.DB, mission.created_by).advance(mission.id);
    await dispatchMission(env, mission.id);
  }
}
