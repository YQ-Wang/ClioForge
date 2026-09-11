import {
  priorResearch,
  validateResearchAction,
  validateResearchReport,
} from '../harness/research-tools';
import {
  assertManuscriptCurrent,
  validateManuscriptSection,
} from '../manuscript';
import { requireClaimAssessments } from '../claim-assessments';
import { checkClaimReview } from '../claim-review';
import { loadBoard } from './task-board';
import { z } from 'zod';
import { checkReadingOutput } from '../reading-output';
import { checkExtraction } from './research-recipes';
import { validateShortlist } from './discovery';
import { ResearchStore } from '../store';
import { HttpError } from '../errors';
import { sha256 } from './search';
import {
  missionDraftSchema,
  resultSchema,
  validateGraph,
  type Mission,
  type MissionTask,
  type MissionView,
  type TaskEdge,
  type TaskEvent,
  type Artifact,
  type TaskResult,
  type TaskCorrection,
} from './types';
const now = () => new Date().toISOString();
export function decodeTask(row: Record<string, unknown>): MissionTask {
  const { lease_hash: _secret, review_token: _review, ...safe } = row;
  return {
    ...safe,
    input: JSON.parse(String(row.input)),
    result: typeof row.result === 'string' ? JSON.parse(row.result) : null,
  } as MissionTask;
}
export class MissionStore extends ResearchStore {
  async artifactSummaries(projectId: string) {
    await this.project(projectId);
    return this.db
      .prepare(
        `SELECT a.id,a.project_id,a.title,a.kind,a.sha256,a.license,a.created_by,a.created_at,a.source_versions,
        (SELECT m.title FROM missions m WHERE m.id=a.mission_id AND m.project_id=?) AS research_title,
        CASE WHEN a.project_id=? THEN a.mission_id ELSE NULL END AS mission_id,
        substr(json_extract(a.body,'$.summary'),1,240) AS summary_excerpt,
        CASE WHEN EXISTS(SELECT 1 FROM mission_tasks mt WHERE mt.id=a.task_id AND (mt.status IN ('stale','rejected') OR mt.result<>a.body)) THEN 1 ELSE 0 END AS outdated
       FROM artifacts a WHERE a.project_id=? OR EXISTS(SELECT 1 FROM artifact_grants g WHERE g.artifact_id=a.id AND g.project_id=?)
       ORDER BY a.created_at DESC LIMIT 100`,
      )
      .bind(projectId, projectId, projectId, projectId)
      .all();
  }
  async mission(
    id: string,
    permission: 'read' | 'write' | 'review' | 'admin' = 'read',
  ) {
    const row = await this.db
      .prepare('SELECT * FROM missions WHERE id=?')
      .bind(id)
      .first<Mission>();
    if (!row) throw new HttpError(404, '研究计划不存在。');
    await this.project(row.project_id, permission);
    return row;
  }
  async task(id: string, permission: 'read' | 'write' | 'review' = 'read') {
    const row = await this.db
      .prepare('SELECT * FROM mission_tasks WHERE id=?')
      .bind(id)
      .first();
    if (!row) throw new HttpError(404, '研究任务不存在。');
    await this.project(String(row.project_id), permission);
    return decodeTask(row);
  }
  async event(
    missionId: string,
    taskId: string | null,
    kind: string,
    detail: string,
    actor = this.owner,
  ) {
    await this.db
      .prepare(
        'INSERT INTO task_events(task_id,mission_id,actor,kind,detail,created_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(taskId, missionId, actor, kind, detail.slice(0, 10000), now())
      .run();
  }
  async list(projectId: string) {
    await this.project(projectId);
    return (
      await this.db
        .prepare(
          "SELECT m.*, (SELECT COUNT(*) FROM mission_tasks t WHERE t.mission_id=m.id) AS task_count,(SELECT COUNT(*) FROM mission_tasks t WHERE t.mission_id=m.id AND t.status IN ('succeeded','accepted')) AS done_count FROM missions m WHERE project_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .bind(projectId)
        .all()
    ).results;
  }
  async view(id: string): Promise<MissionView> {
    const mission = await this.mission(id),
      project = await this.project(mission.project_id);
    const [tasks, edges, events, artifacts, corrections, evaluations] =
      await Promise.all([
        this.db
          .prepare(
            'SELECT * FROM mission_tasks WHERE mission_id=? ORDER BY created_at,id',
          )
          .bind(id)
          .all(),
        this.db
          .prepare('SELECT * FROM task_dependencies WHERE mission_id=?')
          .bind(id)
          .all<TaskEdge>(),
        this.db
          .prepare(
            'SELECT * FROM task_events WHERE mission_id=? ORDER BY id DESC LIMIT 250',
          )
          .bind(id)
          .all<TaskEvent>(),
        this.db
          .prepare(
            'SELECT * FROM artifacts WHERE mission_id=? ORDER BY created_at DESC LIMIT 100',
          )
          .bind(id)
          .all(),
        this.db
          .prepare(
            'SELECT c.* FROM task_corrections c JOIN mission_tasks t ON t.id=c.task_id WHERE t.mission_id=? ORDER BY c.created_at,c.id',
          )
          .bind(id)
          .all(),
        this.db
          .prepare(
            "SELECT e.id,e.config,e.metrics,e.created_by,e.created_at,CASE WHEN json_extract(e.results,'$.result')=t.result THEN 1 ELSE 0 END AS current FROM evaluation_runs e JOIN mission_tasks t ON t.id=json_extract(e.config,'$.task_id') WHERE e.project_id=? AND e.dataset=? ORDER BY e.created_at DESC LIMIT 1000",
          )
          .bind(mission.project_id, id)
          .all(),
      ]);
    return {
      evaluations: evaluations.results.map(
        (row) =>
          ({
            ...row,
            config: JSON.parse(String(row.config)),
            metrics: JSON.parse(String(row.metrics)),
          }) as import('./evaluation').Evaluation,
      ),
      corrections: corrections.results.map(
        (row) =>
          ({ ...row, body: JSON.parse(String(row.body)) }) as TaskCorrection,
      ),
      mission,
      ...(await loadBoard(this.db, id, tasks.results.map(decodeTask))),
      edges: edges.results,
      events: events.results,
      artifacts: artifacts.results.map(
        (row) =>
          ({
            ...row,
            body: JSON.parse(String(row.body)),
            source_versions: JSON.parse(String(row.source_versions)),
          }) as Artifact,
      ),
      role: project.role,
    };
  }
  async create(projectId: string, raw: unknown) {
    await this.project(projectId, 'write');
    const draft = missionDraftSchema.parse(raw);
    try {
      validateGraph(draft.tasks);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : 'Invalid graph',
      );
    }
    const id = crypto.randomUUID(),
      date = now();
    const versions = [
      ...new Set(draft.tasks.flatMap((task) => task.input.version_ids)),
    ];
    const sourceVersions = new Map<
      string,
      Awaited<ReturnType<typeof this.version>>
    >();
    for (const versionId of versions) {
      const version = await this.version(versionId);
      if (version.project_id !== projectId)
        throw new HttpError(400, '输入版本不属于此项目。');
      sourceVersions.set(versionId, version);
    }
    const checkedModels = new Set<string>();
    for (const task of draft.tasks) {
      if (task.input.page_refs)
        for (const ref of task.input.page_refs) {
          if (
            !task.input.version_ids.includes(ref.version_id) ||
            !sourceVersions
              .get(ref.version_id)
              ?.pages.some((p) => p.page === ref.page)
          )
            throw new HttpError(400, '所选页不在任务固定材料中。');
        }
      if (
        ['search', 'compare', 'compute', 'extract', 'counter', 'ocr'].includes(
          task.kind,
        ) &&
        task.input.version_ids.length === 0 &&
        task.dependencies.length === 0 &&
        task.input.parameters.source_search !== true
      )
        throw new HttpError(400, '请为任务固定资料版本或上游任务。');
      if (
        task.executor === 'model' &&
        (task.input.input_rate <= 0 || task.input.output_rate <= 0)
      )
        throw new HttpError(400, '请设置模型费率，以便预留研究预算。');
      if (
        task.executor === 'model' &&
        task.input.model_id &&
        !checkedModels.has(task.input.model_id)
      ) {
        await this.model(task.input.model_id);
        checkedModels.add(task.input.model_id);
      }
      if (
        task.executor === 'builtin' &&
        !['search', 'compare', 'verify', 'compute', 'publish'].includes(
          task.kind,
        )
      )
        throw new HttpError(400, '此任务需要模型、外部 agent 或研究者执行。');
    }
    // One atomic batch; bulk JSON inserts avoid per-page SQL statement limits.
    const records = draft.tasks.map((task) => ({
      ...task,
      input: JSON.stringify(task.input),
    }));
    const edges = draft.tasks.flatMap((task) =>
      task.dependencies.map((dep) => ({ task: task.id, dep })),
    );
    const inputs = draft.tasks.flatMap((task) =>
      task.input.version_ids.map((version) => ({ task: task.id, version })),
    );
    const recordChunks = Array.from(
      { length: Math.ceil(records.length / 40) },
      (_, i) => records.slice(i * 40, i * 40 + 40),
    );
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO missions(id,project_id,title,question,scope,acceptance,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          projectId,
          draft.title,
          draft.question,
          draft.scope,
          draft.acceptance,
          this.owner,
          date,
          date,
        ),
      ...recordChunks.map((chunk) =>
        this.db
          .prepare(
            "INSERT INTO mission_tasks(id,mission_id,project_id,title,kind,executor,assignee,input,created_at,updated_at) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.title'),json_extract(value,'$.kind'),json_extract(value,'$.executor'),json_extract(value,'$.assignee'),json_extract(value,'$.input'),?,? FROM json_each(?)",
          )
          .bind(id, projectId, date, date, JSON.stringify(chunk)),
      ),
      this.db
        .prepare(
          "INSERT INTO task_dependencies SELECT json_extract(value,'$.task'),json_extract(value,'$.dep'),? FROM json_each(?)",
        )
        .bind(id, JSON.stringify(edges)),
      this.db
        .prepare(
          "INSERT INTO task_inputs SELECT json_extract(value,'$.task'),json_extract(value,'$.version') FROM json_each(?)",
        )
        .bind(JSON.stringify(inputs)),
    ]);
    await this.event(id, null, 'created', draft.title);
    return id;
  }
  async control(id: string, action: 'start' | 'pause' | 'resume' | 'cancel') {
    const mission = await this.mission(id, 'write');
    const allowed = {
      start: ['draft'],
      pause: ['active'],
      resume: ['paused'],
      cancel: ['draft', 'active', 'paused'],
    }[action];
    if (!allowed.includes(mission.status))
      throw new HttpError(409, '当前研究计划状态不允许此操作。');
    const status =
      action === 'pause'
        ? 'paused'
        : action === 'cancel'
          ? 'cancelled'
          : 'active';
    const changed = await this.db
      .prepare(
        'UPDATE missions SET status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
      )
      .bind(status, now(), id, mission.revision)
      .run();
    if (!changed.meta.changes) throw new HttpError(409, '计划已更新，请刷新。');
    if (action === 'cancel')
      await this.db
        .prepare(
          "UPDATE mission_tasks SET status='cancelled',revision=revision+1,updated_at=? WHERE mission_id=? AND status IN ('blocked','ready','queued','running','review')",
        )
        .bind(now(), id)
        .run();
    await this.event(id, null, action, status);
    await this.advance(id);
  }
  async advance(id: string) {
    await this.db
      .prepare(
        "WITH RECURSIVE impacted(id) AS (SELECT id FROM mission_tasks WHERE mission_id=? AND status IN ('stale','rejected') UNION SELECT d.task_id FROM task_dependencies d JOIN impacted i ON d.depends_on=i.id) UPDATE mission_tasks SET status='stale',revision=revision+1,updated_at=? WHERE id IN (SELECT id FROM impacted) AND status IN ('accepted','succeeded','review','running')",
      )
      .bind(id, now())
      .run();
    await this.db
      .prepare(
        "UPDATE mission_tasks SET status='blocked',revision=revision+1,updated_at=? WHERE mission_id=? AND status IN ('ready','queued') AND EXISTS(SELECT 1 FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=mission_tasks.id AND p.status NOT IN ('succeeded','accepted'))",
      )
      .bind(now(), id)
      .run();
    await this.db
      .prepare(
        "UPDATE mission_tasks SET status='ready',revision=revision+1,updated_at=? WHERE mission_id=? AND status='blocked' AND EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_id AND m.status='active') AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=mission_tasks.id AND p.status NOT IN ('succeeded','accepted'))",
      )
      .bind(now(), id)
      .run();
    await this.db
      .prepare(
        "UPDATE missions SET status='completed',revision=revision+1,updated_at=? WHERE id=? AND status='active' AND NOT EXISTS(SELECT 1 FROM mission_tasks t WHERE t.mission_id=missions.id AND t.status NOT IN ('succeeded','accepted'))",
      )
      .bind(now(), id)
      .run();
  }
  async claim(
    id: string,
    actor: string,
    executor: 'external' | 'builtin' | 'model' | 'human',
  ) {
    const task = await this.task(id, 'write');
    const token = crypto.randomUUID() + crypto.randomUUID(),
      until = new Date(Date.now() + 5 * 60_000).toISOString();
    const results = await this.db.batch([
      this.db
        .prepare(
          "UPDATE mission_tasks SET status='running',attempt=attempt+1,claimed_by=?,lease_hash=?,lease_until=?,revision=revision+1,updated_at=? WHERE id=? AND executor=? AND status IN ('ready','queued') AND EXISTS(SELECT 1 FROM missions m WHERE m.id=mission_id AND m.status='active') AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=mission_tasks.id AND p.status NOT IN ('succeeded','accepted'))",
        )
        .bind(actor, await sha256(token), until, now(), id, executor),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO task_attempts(task_id,attempt,actor,input,dependencies,status,created_at) SELECT id,attempt,claimed_by,input,COALESCE((SELECT json_group_array(json_object('id',p.id,'attempt',p.attempt,'input',json(p.input),'result',json(p.result))) FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=mission_tasks.id),'[]'),'running',? FROM mission_tasks WHERE id=? AND lease_hash=?",
        )
        .bind(now(), id, await sha256(token)),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(409, '任务不可领取，或已由其他执行者领取。');
    await this.event(task.mission_id, id, 'claimed', actor, actor);
    return { task: await this.task(id), lease: token };
  }
  async heartbeat(id: string, lease: string, actor: string) {
    const task = await this.task(id, 'write');
    const changed = await this.db
      .prepare(
        "UPDATE mission_tasks SET lease_until=?,updated_at=? WHERE id=? AND status='running' AND claimed_by=? AND lease_hash=? AND lease_until>?",
      )
      .bind(
        new Date(Date.now() + 5 * 60_000).toISOString(),
        now(),
        id,
        actor,
        await sha256(lease),
        now(),
      )
      .run();
    if (!changed.meta.changes) throw new HttpError(409, '任务租约已失效。');
    return task.id;
  }
  async checkResult(task: MissionTask, result: TaskResult) {
    const checks = [];
    const manuscript = task.input.parameters.manuscript_root
      ? await assertManuscriptCurrent(this, task)
      : null;
    if (task.input.parameters.manuscript_stage === 'section') {
      validateManuscriptSection(result, manuscript!.bundle);
    }
    if (
      task.executor === 'model' &&
      task.input.parameters.output_schema === 'claim_review_v1'
    )
      checkClaimReview(
        result,
        typeof task.input.parameters.draft_text === 'string'
          ? task.input.parameters.draft_text
          : '',
      );
    if (
      task.input.parameters.require_citations === true &&
      !result.citations.length
    )
      throw new HttpError(
        400,
        '研究结果没有提供原文引文，请检查输出后再决定是否重试。',
      );
    if (
      task.executor === 'model' &&
      (task.input.parameters.output_schema === 'dossier_answer_v1' ||
        task.input.parameters.output_schema === 'comparison_answer_v1' ||
        task.input.parameters.output_schema === 'reading_answer_v1' ||
        task.input.parameters.output_schema === 'research_discussion_v1')
    )
      checkReadingOutput(
        result,
        ['comparison_answer_v1', 'dossier_answer_v1'].includes(
          String(task.input.parameters.output_schema),
        ),
      );
    const allowed = new Set(task.input.version_ids);
    const dependencies = (
      await this.db
        .prepare(
          'SELECT p.input,p.result FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=?',
        )
        .bind(task.id)
        .all<{ input: string; result: string | null }>()
    ).results;
    for (const dep of dependencies) {
      for (const version of JSON.parse(dep.input).version_ids as string[])
        allowed.add(version);
      if (dep.result)
        for (const citation of (JSON.parse(dep.result) as TaskResult).citations)
          allowed.add(citation.version_id);
    }
    if (task.input.parameters.agent_stage === 'decision')
      validateResearchAction(result);
    if (task.input.parameters.source_agent_stage === 'decision') {
      const dependencyTasks = (
        await this.db
          .prepare(
            'SELECT p.* FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=?',
          )
          .bind(task.id)
          .all()
      ).results.map(decodeTask);
      const { priorSourceSearch, validateSourceSearchAction } =
        await import('../harness/source-search-tools');
      const memory = priorSourceSearch(dependencyTasks);
      if (!memory.stopped) validateSourceSearchAction(result, memory);
    }
    if (task.input.parameters.agent_stage === 'report') {
      const dependencyTasks = (
        await this.db
          .prepare(
            'SELECT p.* FROM task_dependencies d JOIN mission_tasks p ON p.id=d.depends_on WHERE d.task_id=?',
          )
          .bind(task.id)
          .all()
      ).results.map(decodeTask);
      validateResearchReport(result, priorResearch(dependencyTasks));
    }
    if (task.input.parameters.extraction === true)
      checkExtraction(
        result,
        z.array(z.string()).parse(task.input.parameters.fields),
      );
    if (task.input.parameters.shortlist === true)
      result.data = validateShortlist(
        result,
        dependencies.map((d) => ({
          result: d.result ? JSON.parse(d.result) : null,
        })),
      );
    if (
      task.executor === 'model' &&
      ['audit', 'update'].includes(String(task.input.parameters.recipe)) &&
      task.input.parameters.output_schema !== 'claim_review_v1'
    ) {
      const findings = z
        .object({
          findings: z
            .array(
              z.object({
                claim: z.string().min(1),
                assessment: z.string().min(1),
                alternative: z.string(),
                next_step: z.string(),
                citations: z.array(z.number().int().positive()).min(1),
              }),
            )
            .max(30),
        })
        .parse(result.data).findings;
      if (
        findings.some((f) => f.citations.some((n) => !result.citations[n - 1]))
      )
        throw new HttpError(400, '研究意见引用了不存在的原文编号。');
    }
    if (task.input.parameters.parallel === true) {
      const data = z
        .object({
          pairs: z
            .array(
              z.object({
                left_citation: z.number().int().positive(),
                right_citation: z.number().int().positive(),
                reason: z.string().min(1),
                limitation: z.string(),
              }),
            )
            .max(10),
        })
        .parse(result.data);
      for (const pair of data.pairs) {
        const a = result.citations[pair.left_citation - 1],
          b = result.citations[pair.right_citation - 1];
        if (!a || !b || (a.version_id === b.version_id && a.page === b.page))
          throw new HttpError(400, '对读结果需要来自不同页的两条实际引文。');
      }
    }
    for (const citation of result.citations) {
      if (
        task.executor === 'model' &&
        task.input.page_refs &&
        !task.input.page_refs.some(
          (p) =>
            p.version_id === citation.version_id && p.page === citation.page,
        )
      )
        throw new HttpError(400, '引文超出了本步骤实际阅读的页码。');
      if (!allowed.has(citation.version_id))
        throw new HttpError(400, '引文不在任务固定材料或依赖产物范围内。');
      const version = await this.version(citation.version_id);
      if (version.project_id !== task.project_id)
        throw new HttpError(400, '引文不属于此项目。');
      const page = version.pages.find((p) => p.page === citation.page),
        start = citation.start ?? page?.text.indexOf(citation.quote) ?? -1;
      if (
        !page ||
        start < 0 ||
        page.text.slice(start, start + citation.quote.length) !== citation.quote
      )
        throw new HttpError(400, '引文与固定版本不一致。');
      checks.push({
        name: `citation:${citation.version_id}:${citation.page}`,
        passed: true,
        detail: 'Exact text and version verified',
      });
    }
    return checks;
  }
  async submit(id: string, lease: string, actor: string, raw: unknown) {
    const task = await this.task(id, 'write'),
      result = resultSchema.parse(raw);
    const checks = await this.checkResult(task, result);
    result.checks = [
      ...(task.executor === 'builtin' ? result.checks : []),
      ...checks,
    ].slice(0, 100);
    const status =
      task.executor === 'human' ||
      task.kind === 'review' ||
      task.kind === 'publish'
        ? 'review'
        : 'succeeded';
    const date = now(),
      hash = await sha256(lease);
    const noteStatements: D1PreparedStatement[] = [];
    if (
      task.executor === 'builtin' &&
      task.input.parameters.manuscript_stage === 'assemble'
    ) {
      const { noteId, config } = await assertManuscriptCurrent(this, task);
      const note = z
        .object({
          manuscript_note: z.object({
            title: z.string().min(1).max(200),
            body: z.string().max(100000),
          }),
        })
        .parse(result.data).manuscript_note;
      if (note.title !== config.title)
        throw new HttpError(400, '论文标题与确认的提纲不一致。');
      const existing = await this.db
        .prepare('SELECT project_id,title,body FROM notes WHERE id=?')
        .bind(noteId)
        .first<{ project_id: string; title: string; body: string }>();
      if (
        existing &&
        (existing.project_id !== task.project_id ||
          existing.title !== note.title ||
          existing.body !== note.body)
      )
        throw new HttpError(409, '初稿保存标识已被使用，原稿没有被覆盖。');
      // Commit the new note and the task result in the same lease-guarded batch.
      noteStatements.push(
        this.db
          .prepare(
            "INSERT INTO notes(id,project_id,parent_id,revision,title,body,created_at,document) SELECT ?,project_id,NULL,1,?,?,?,NULL FROM mission_tasks WHERE id=? AND attempt=? AND status='running' AND claimed_by=? AND lease_hash=? AND lease_until>? ON CONFLICT(id) DO NOTHING",
          )
          .bind(
            noteId,
            note.title,
            note.body,
            date,
            id,
            task.attempt,
            actor,
            hash,
            date,
          ),
      );
    }
    if (noteStatements.length) {
      const { manuscript_note: _draft, ...metadata } = result.data as Record<
        string,
        unknown
      >;
      result.data = metadata;
    }
    const serialized = JSON.stringify(result);
    const accepted = await this.db.batch([
      ...noteStatements,
      this.db
        .prepare(
          "UPDATE task_attempts SET result=?,status=?,finished_at=? WHERE task_id=? AND attempt=? AND EXISTS(SELECT 1 FROM mission_tasks t WHERE t.id=task_id AND t.attempt=task_attempts.attempt AND t.status='running' AND t.claimed_by=? AND t.lease_hash=? AND t.lease_until>?)",
        )
        .bind(serialized, status, date, id, task.attempt, actor, hash, date),
      this.db
        .prepare(
          "UPDATE mission_tasks SET result=?,status=?,error=NULL,failure_stage=NULL,lease_hash=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE id=? AND attempt=? AND status='running' AND claimed_by=? AND lease_hash=? AND lease_until>?",
        )
        .bind(serialized, status, date, id, task.attempt, actor, hash, date),
    ]);
    if (!accepted.at(-1)!.meta.changes)
      throw new HttpError(409, '任务租约已失效，结果未覆盖当前尝试。');
    await this.event(
      task.mission_id,
      id,
      status,
      result.summary.slice(0, 1000),
      actor,
    );
    await this.advance(task.mission_id);
    return this.task(id);
  }
  async correct(
    id: string,
    raw: unknown,
    reason: string,
    expected: number,
    citations?: unknown,
  ) {
    const task = await this.task(id, 'review');
    if (
      task.input.parameters.extraction !== true ||
      !['succeeded', 'review', 'accepted'].includes(task.status) ||
      !task.result
    )
      throw new HttpError(409, '请选择已完成的摘录。');
    if (!reason.trim()) throw new HttpError(400, '请记录纠正依据。');
    const result = resultSchema.parse({
      ...task.result,
      data: raw,
      citations: citations ?? task.result.citations,
      checks: [],
    });
    result.checks = await this.checkResult(task, result);
    const correction = crypto.randomUUID(),
      date = now();
    const changed = await this.db.batch([
      this.db
        .prepare(
          "UPDATE mission_tasks SET result=?,status='review',revision=revision+1,updated_at=?,review_token=? WHERE id=? AND revision=? AND status IN ('succeeded','review','accepted')",
        )
        .bind(JSON.stringify(result), date, correction, id, expected),
      this.db
        .prepare(
          'INSERT INTO task_corrections SELECT ?,project_id,id,?,?,?,? FROM mission_tasks WHERE id=? AND review_token=?',
        )
        .bind(
          correction,
          JSON.stringify({ before: task.result, after: result }),
          reason.slice(0, 10000),
          this.owner,
          date,
          id,
          correction,
        ),
      this.db
        .prepare(
          "WITH RECURSIVE affected(id) AS (SELECT task_id FROM task_dependencies WHERE depends_on=? UNION SELECT d.task_id FROM task_dependencies d JOIN affected a ON d.depends_on=a.id) UPDATE mission_tasks SET status='stale',revision=revision+1,updated_at=? WHERE id IN (SELECT id FROM affected) AND status IN ('running','succeeded','accepted','review') AND EXISTS(SELECT 1 FROM task_corrections WHERE id=?)",
        )
        .bind(id, date, correction),
    ]);
    if (!changed[0].meta.changes)
      throw new HttpError(409, '摘录已被其他研究者更新，请刷新。');
    await this.event(task.mission_id, id, 'corrected', reason);
    await this.advance(task.mission_id);
    return this.task(id);
  }
  async review(
    id: string,
    decision: 'accepted' | 'rejected',
    reason: string,
    expected: number,
  ) {
    const task = await this.task(id, 'review');
    if (!['review', 'succeeded'].includes(task.status) || !task.result)
      throw new HttpError(409, '任务尚无可复核产物。');
    if (!reason.trim()) throw new HttpError(400, '请记录复核依据。');
    await this.checkResult(task, task.result);
    if (
      decision === 'accepted' &&
      task.executor === 'human' &&
      task.input.parameters.recipe === 'audit'
    )
      await requireClaimAssessments(this, task.mission_id);
    const reviewId = crypto.randomUUID(),
      date = now();
    const results = await this.db.batch([
      this.db
        .prepare(
          "UPDATE mission_tasks SET status=?,revision=revision+1,updated_at=?,review_token=? WHERE id=? AND revision=? AND status IN ('review','succeeded')",
        )
        .bind(decision, date, reviewId, id, expected),
      this.db
        .prepare(
          'INSERT INTO task_reviews SELECT ?,id,attempt,?,?,?,? FROM mission_tasks WHERE id=? AND revision=? AND status=? AND review_token=?',
        )
        .bind(
          reviewId,
          this.owner,
          decision,
          reason.slice(0, 10000),
          date,
          id,
          expected + 1,
          decision,
          reviewId,
        ),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(409, '任务已有更新，请重新检查。');
    await this.event(task.mission_id, id, decision, reason);
    if (decision === 'accepted') await this.artifact(task);
    await this.advance(task.mission_id);
  }
  async artifact(task: MissionTask) {
    if (!task.result) return;
    const body = JSON.stringify(task.result),
      id = crypto.randomUUID();
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO artifacts(id,project_id,mission_id,task_id,title,kind,body,source_versions,sha256,license,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        task.project_id,
        task.mission_id,
        task.id,
        task.title,
        task.kind,
        body,
        JSON.stringify([
          ...new Set([
            ...task.input.version_ids,
            ...task.result.citations.map((c) => c.version_id),
          ]),
        ]),
        await sha256(body),
        'private; source rights retained',
        task.claimed_by || this.owner,
        now(),
      )
      .run();
    return id;
  }
  async retry(id: string, expected: number) {
    const task = await this.task(id, 'write');
    if (!['failed', 'uncertain', 'rejected', 'stale'].includes(task.status))
      throw new HttpError(409, '当前任务不能重新执行。');
    const changed = await this.db
      .prepare(
        "UPDATE mission_tasks SET status='blocked',result=NULL,error=NULL,lease_hash=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
      )
      .bind(now(), id, expected)
      .run();
    if (!changed.meta.changes) throw new HttpError(409, '任务已更新。');
    await this.db
      .prepare(
        "UPDATE missions SET status='active',revision=revision+1,updated_at=? WHERE id=? AND status='completed'",
      )
      .bind(now(), task.mission_id)
      .run();
    await this.event(
      task.mission_id,
      id,
      'retry',
      'New attempt requested; previous events and reservations retained',
    );
    await this.advance(task.mission_id);
  }
}
