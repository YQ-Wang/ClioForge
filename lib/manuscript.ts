import { z } from 'zod';
import { HttpError } from './errors';
import type { ResearchStore } from './store';
import type { MissionStore } from './platform/missions';
import { sha256 } from './platform/search';
import { sourcePath, projectPath } from './navigation';
import {
  taskInputSchema,
  type MissionDraft,
  type MissionTask,
  type TaskResult,
} from './platform/types';
import type { Claim, ClaimEvidence, Question } from './workbench-types';
import type { Evidence, Note } from './types';

export const manuscriptInput = z.object({
  request_id: z.uuid(),
  question_id: z.uuid(),
  claim_ids: z.array(z.uuid()).min(1).max(20),
  title: z.string().trim().min(1).max(160),
  audience: z.string().trim().min(1).max(1000),
  locale: z.enum(['zh-CN', 'en']),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        goal: z.string().trim().min(1).max(1000),
      }),
    )
    .min(2)
    .max(8),
  model_id: z.uuid(),
  input_rate: z.number().positive().max(10000),
  output_rate: z.number().positive().max(10000),
  budget_usd: z.number().min(0.01).max(100),
  snapshot_hash: z.string().length(64),
  confirmed: z.literal(true),
});
export type ManuscriptInput = z.infer<typeof manuscriptInput>;
export type ManuscriptBundle = {
  question: Question;
  claims: Claim[];
  links: ClaimEvidence[];
  evidence: Evidence[];
  sources: { id: string; title: string; head_id: string }[];
  entities: Record<string, unknown>[];
  relations: Record<string, unknown>[];
  bibliography: Record<string, unknown>[];
};
const order = <T extends { id: string }>(rows: T[]) =>
  rows.sort((a, b) => a.id.localeCompare(b.id));
export async function manuscriptBundle(
  store: ResearchStore,
  project: string,
  questionId: string,
  claimIds: string[],
): Promise<ManuscriptBundle> {
  await store.project(project);
  if (
    !claimIds.length ||
    claimIds.length > 20 ||
    new Set(claimIds).size !== claimIds.length
  )
    throw new HttpError(400, '请选择 1–20 条不同的已审读论点。');
  const question = await store.db
    .prepare('SELECT * FROM research_questions WHERE id=? AND project_id=?')
    .bind(questionId, project)
    .first<Question>();
  if (!question) throw new HttpError(404, '研究问题不存在。');
  const claims = order(
    (
      await store.db
        .prepare(
          'SELECT * FROM claims WHERE project_id=? AND question_id=? AND id IN (SELECT value FROM json_each(?))',
        )
        .bind(project, questionId, JSON.stringify(claimIds))
        .all<Claim>()
    ).results,
  );
  if (
    claims.length !== claimIds.length ||
    claims.some((c) => c.status !== 'reviewed' || c.kind === 'next_step')
  )
    throw new HttpError(400, '请选择该问题下已审读的论点或竞争解释。');
  const links = order(
    (
      await store.db
        .prepare(
          'SELECT * FROM claim_evidence WHERE project_id=? AND claim_id IN (SELECT value FROM json_each(?))',
        )
        .bind(project, JSON.stringify(claimIds))
        .all<ClaimEvidence>()
    ).results,
  );
  if (claims.some((c) => !links.some((l) => l.claim_id === c.id)))
    throw new HttpError(
      400,
      '每条选中论点至少需要关联一条证据；请先在问题与论证中补充。',
    );
  const evidenceIds = [...new Set(links.map((l) => l.evidence_id))];
  if (evidenceIds.length > 30)
    throw new HttpError(400, '一次初稿最多使用 30 条证据，请按研究问题拆分。');
  const evidence = order(
    (
      await store.db
        .prepare(
          'SELECT * FROM evidence WHERE project_id=? AND id IN (SELECT value FROM json_each(?))',
        )
        .bind(project, JSON.stringify(evidenceIds))
        .all<Evidence>()
    ).results,
  );
  if (evidence.length !== evidenceIds.length)
    throw new HttpError(409, '关联证据已变化，请重新检查。');
  const sourceIds = [...new Set(evidence.map((e) => e.source_id))];
  if (sourceIds.length > 10)
    throw new HttpError(400, '一次初稿最多使用 10 份材料，请缩小范围。');
  const sources = order(
    (
      await store.db
        .prepare(
          'SELECT s.id,s.title,(SELECT v.id FROM source_versions v WHERE v.source_id=s.id ORDER BY v.revision DESC LIMIT 1) head_id FROM sources s WHERE s.project_id=? AND s.id IN (SELECT value FROM json_each(?))',
        )
        .bind(project, JSON.stringify(sourceIds))
        .all<ManuscriptBundle['sources'][number]>()
    ).results,
  );
  for (const e of evidence) {
    const version = await store.version(e.version_id),
      page = version.pages.find((p) => p.page === e.page);
    if (version.project_id !== project || !page?.text.includes(e.quote))
      throw new HttpError(409, '证据与固定原文不一致，请先核查。');
    const head = sources.find((s) => s.id === e.source_id)?.head_id;
    if (head !== e.version_id)
      throw new HttpError(
        409,
        '所选证据有较新材料版本，请先更新或重新摘录后再起草。',
      );
  }
  const versions = new Set(evidence.map((e) => e.version_id));
  const entities = (
    await store.db
      .prepare(
        'SELECT id,kind,name,aliases,date_start,date_end,evidence,status,canonical_id,revision FROM entities WHERE project_id=? AND canonical_id IS NULL ORDER BY id LIMIT 1001',
      )
      .bind(project)
      .all()
  ).results;
  if (entities.length > 1000)
    throw new HttpError(400, '人物条目过多，请按专题拆分项目。');
  const relevantEntities = entities
    .map((e) => ({
      ...e,
      aliases: JSON.parse(String(e.aliases)),
      evidence: JSON.parse(String(e.evidence)) as { version_id: string }[],
    }))
    .filter((e) => e.evidence.some((c) => versions.has(c.version_id)));
  const relations = (
    await store.db
      .prepare(
        'SELECT * FROM source_relations WHERE project_id=? AND (from_source IN (SELECT value FROM json_each(?)) OR to_source IN (SELECT value FROM json_each(?))) ORDER BY id LIMIT 101',
      )
      .bind(project, JSON.stringify(sourceIds), JSON.stringify(sourceIds))
      .all()
  ).results;
  if (relations.length > 100)
    throw new HttpError(400, '材料关系过多，请缩小项目范围。');
  const bibliography = (
    await store.db
      .prepare(
        'SELECT * FROM bibliography_entries WHERE project_id=? AND source_id IN (SELECT value FROM json_each(?)) ORDER BY id',
      )
      .bind(project, JSON.stringify(sourceIds))
      .all()
  ).results.map((r) => ({ ...r, csl: JSON.parse(String(r.csl)) }));
  const bundle = {
    question,
    claims,
    links,
    evidence,
    sources,
    entities: relevantEntities,
    relations,
    bibliography,
  };
  if (new TextEncoder().encode(JSON.stringify(bundle)).length > 60000)
    throw new HttpError(
      400,
      '研究依据超过单轮写作范围，请减少论点或拆分文章。',
    );
  return bundle;
}
export const bundleHash = (bundle: ManuscriptBundle) =>
  sha256(JSON.stringify(bundle));
export function manuscriptRecipe(
  input: ManuscriptInput,
  bundle: ManuscriptBundle,
): MissionDraft {
  const L = (zh: string, en: string) => (input.locale === 'en' ? en : zh);
  const refs = [
    ...new Map(
      bundle.evidence.map((e) => [
        `${e.version_id}:${e.page}`,
        { version_id: e.version_id, page: e.page },
      ]),
    ).values(),
  ];
  const versions = [...new Set(refs.map((r) => r.version_id))];
  const root = input.request_id,
    note = crypto.randomUUID();
  const base = { version_ids: versions, page_refs: refs, locale: input.locale };
  const tasks: MissionDraft['tasks'] = [
    {
      id: root,
      title: L('固定已审读依据', 'Freeze reviewed research'),
      kind: 'compute',
      executor: 'builtin',
      assignee: '',
      dependencies: [],
      input: taskInputSchema.parse({
        ...base,
        parameters: {
          manuscript_stage: 'prepare',
          manuscript_root: root,
          manuscript_config: input,
          manuscript_bundle: bundle,
          manuscript_note: note,
        },
      }),
    },
  ];
  let previous = root;
  const sectionIds: string[] = [];
  input.sections.forEach((section, index) => {
    const id = crypto.randomUUID();
    sectionIds.push(id);
    tasks.push({
      id,
      title: `${index + 1}. ${section.title}`,
      kind: 'compare',
      executor: 'model',
      assignee: L('写作助手', 'Writing assistant'),
      dependencies: [...new Set([root, previous])],
      input: taskInputSchema.parse({
        ...base,
        model_id: input.model_id,
        input_rate: input.input_rate,
        output_rate: input.output_rate,
        max_output: 4096,
        effort: index === 0 ? 'low' : 'high',
        prompt: `Write one manuscript section: ${section.title}. Purpose: ${section.goal}. Audience: ${input.audience}. Central question: ${bundle.question.title}. Target 400–700 Chinese characters or 250–400 English words for this section. The researcher approved the outline, NOT your new prose. Use only the frozen dossier and supplied pages; preserve contrary evidence, uncertain identities and source dependence. Do not invent literature, bibliography, causal links or missing facts. Add an explicit gap paragraph where further research is needed. Previous section results provide continuity, not new evidence. Return data: {paragraphs:[{text:string,basis:"evidence"|"interpretation"|"gap",claim_ids:[UUID],citations:[1-based citation numbers]}]}. Each non-gap paragraph must have at least one selected claim ID and citation. Cite only quotations contained in the dossier's selected evidence excerpts, using their exact fixed version and page. No inline citations or URLs in paragraph text; Canwoo adds links from the citations array. Use at most 10 short quotations total. Do not return headings, tables or a bibliography inside paragraph text.`,
        parameters: {
          manuscript_stage: 'section',
          manuscript_root: root,
          section_index: index,
          require_citations: true,
        },
      }),
    });
    previous = id;
  });
  const assemble = crypto.randomUUID();
  tasks.push({
    id: assemble,
    title: L('检查引用并保存初稿', 'Check citations and save draft'),
    kind: 'compute',
    executor: 'builtin',
    assignee: '',
    dependencies: [root, ...sectionIds],
    input: taskInputSchema.parse({
      ...base,
      parameters: { manuscript_stage: 'assemble', manuscript_root: root },
    }),
  });
  tasks.push({
    id: crypto.randomUUID(),
    title: L('审读论文初稿与论证缺口', 'Review the manuscript and its gaps'),
    kind: 'review',
    executor: 'human',
    assignee: '',
    dependencies: [assemble],
    input: taskInputSchema.parse({
      ...base,
      prompt: L(
        '打开笔记中的初稿，核对各段依据、竞争解释和待补材料。自动引文检查只验证文字出处；请在写作区修改，再记录审读意见。',
        'Open the draft in Notes, inspect paragraph sources, alternatives and gaps. Exact quotation checks do not validate interpretations. Edit in Notes and record your review.',
      ),
      parameters: { manuscript_root: root },
    }),
  });
  return {
    title: L('论文初稿：', 'Manuscript: ') + input.title,
    question: bundle.question.title,
    scope: L(
      '仅使用本轮确认的证据、论点与材料版本。',
      'Use only the confirmed evidence, claims and source versions.',
    ),
    acceptance: L(
      '逐段有出处；保留反证与缺口；完整初稿进入笔记，等待研究者审读。',
      'Traceable paragraphs, preserved counterevidence and gaps, editable draft awaiting researcher review.',
    ),
    tasks,
  };
}
export async function manuscriptRoot(store: MissionStore, task: MissionTask) {
  const root = await store.task(
    z.uuid().parse(task.input.parameters.manuscript_root),
  );
  if (
    root.project_id !== task.project_id ||
    root.mission_id !== task.mission_id ||
    root.input.parameters.manuscript_stage !== 'prepare'
  )
    throw new HttpError(400, '论文依据不属于此研究计划。');
  const config = manuscriptInput.parse(root.input.parameters.manuscript_config);
  const bundle = root.input.parameters.manuscript_bundle as ManuscriptBundle;
  if ((await bundleHash(bundle)) !== config.snapshot_hash)
    throw new HttpError(409, '论文依据记录无效。');
  return {
    root,
    config,
    bundle,
    noteId: z.uuid().parse(root.input.parameters.manuscript_note),
  };
}
export async function assertManuscriptCurrent(
  store: MissionStore,
  task: MissionTask,
) {
  const context = await manuscriptRoot(store, task);
  const current = await manuscriptBundle(
    store,
    task.project_id,
    context.config.question_id,
    context.config.claim_ids,
  );
  if ((await bundleHash(current)) !== context.config.snapshot_hash)
    throw new HttpError(
      409,
      '研究依据已有变化。请重新确认依据并建立新一轮初稿；原稿保持不变。',
    );
  return context;
}
const paragraphSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  basis: z.enum(['evidence', 'interpretation', 'gap']),
  claim_ids: z.array(z.uuid()).max(20),
  citations: z.array(z.number().int().positive()).max(10),
});
export function validateManuscriptSection(
  result: TaskResult,
  bundle: ManuscriptBundle,
) {
  const { paragraphs } = z
    .object({ paragraphs: z.array(paragraphSchema).min(1).max(12) })
    .parse(result.data);
  if (!paragraphs.some((p) => p.basis !== 'gap'))
    throw new HttpError(400, '章节未包含有依据的正文。');
  if (result.citations.length > 10) throw new HttpError(400, '章节引文过多。');
  for (const c of result.citations)
    if (
      !bundle.evidence.some(
        (e) =>
          e.version_id === c.version_id &&
          e.page === c.page &&
          e.quote.includes(c.quote),
      )
    )
      throw new HttpError(400, '章节引用了未选入本轮写作依据的摘录。');
  for (const p of paragraphs) {
    if (/https?:\/\/|\]\(|\[\d+\]|<[^>]+>/.test(p.text))
      throw new HttpError(
        400,
        '请通过段落引用字段关联出处，不要生成链接或编号。',
      );
    if (p.basis !== 'gap' && (!p.claim_ids.length || !p.citations.length))
      throw new HttpError(400, '正文段落缺少论点或原文依据。');
    if (p.claim_ids.some((id) => !bundle.claims.some((c) => c.id === id)))
      throw new HttpError(400, '章节引用了未选中的论点。');
    if (p.citations.some((n) => !result.citations[n - 1]))
      throw new HttpError(400, '章节引用编号无效。');
    if (
      p.basis !== 'gap' &&
      p.claim_ids.some(
        (claim) =>
          !bundle.links.some(
            (link) =>
              link.claim_id === claim &&
              p.citations.some((n) => {
                const citation = result.citations[n - 1];
                return bundle.evidence.some(
                  (e) =>
                    e.id === link.evidence_id &&
                    e.version_id === citation.version_id &&
                    e.page === citation.page &&
                    e.quote.includes(citation.quote),
                );
              }),
          ),
      )
    )
      throw new HttpError(400, '段落中有论点缺少与其关联的引文。');
    for (const n of p.citations) {
      const citation = result.citations[n - 1];
      if (
        p.basis !== 'gap' &&
        !bundle.links.some(
          (l) =>
            p.claim_ids.includes(l.claim_id) &&
            bundle.evidence.some(
              (e) =>
                e.id === l.evidence_id &&
                e.version_id === citation.version_id &&
                e.page === citation.page &&
                e.quote.includes(citation.quote),
            ),
        )
      )
        throw new HttpError(400, '段落引文未关联到所选论点。');
    }
  }
  if (paragraphs.reduce((n, p) => n + p.text.length, 0) > 5000)
    throw new HttpError(400, '章节过长，请缩短正文。');
  result.data = { paragraphs };
  result.summary = paragraphs
    .map(
      (p) =>
        `${p.basis === 'gap' ? '[待补 / Gap] ' : ''}${p.text}${p.citations.map((n) => `[${n}]`).join('')}`,
    )
    .join('\n\n');
  return paragraphs;
}
const safe = (text: string) => text.replace(/[\\`*_[\]<>#]/g, '\\$&');
export async function runManuscriptBuiltin(
  store: MissionStore,
  task: MissionTask,
  deps: MissionTask[],
): Promise<TaskResult> {
  const { config, bundle, noteId } = await assertManuscriptCurrent(store, task);
  const L = (zh: string, en: string) => (config.locale === 'en' ? en : zh);
  if (task.input.parameters.manuscript_stage === 'prepare')
    return {
      summary: L(
        '研究者已确认本轮依据与提纲。后续文字仍待审读。',
        'The researcher confirmed the dossier and outline. New prose still requires review.',
      ),
      citations: [],
      checks: [],
      data: { dossier: bundle, outline: config.sections },
    };
  const sections = deps
    .filter((d) => d.input.parameters.manuscript_stage === 'section')
    .sort(
      (a, b) =>
        Number(a.input.parameters.section_index) -
        Number(b.input.parameters.section_index),
    );
  if (
    sections.length !== config.sections.length ||
    sections.some(
      (s, i) =>
        s.input.parameters.section_index !== i ||
        s.status !== 'succeeded' ||
        !s.result,
    )
  )
    throw new HttpError(409, '仍有章节未完成，暂不拼接不完整论文。');
  const blocks = [
    `> ${L('AI 辅助初稿 · 待研究者审读。引文文字匹配不代表论证成立。', 'AI-assisted draft · Awaiting researcher review. Quotation matches do not establish an argument.')}`,
    `[${L('查看研究流程与执行记录', 'Research workflow and execution record')}](${projectPath(task.project_id, 'platform')}&mission=${task.mission_id})`,
  ];
  const citations: TaskResult['citations'] = [];
  const coveredClaims = new Set<string>();
  const usedEvidence = new Set<string>();
  for (const [i, section] of sections.entries()) {
    const result = section.result!,
      paragraphs = validateManuscriptSection(result, bundle);
    blocks.push(`## ${safe(config.sections[i].title)}`);
    for (const p of paragraphs) {
      if (p.basis !== 'gap') p.claim_ids.forEach((id) => coveredClaims.add(id));
      const refs = p.citations.map((n) => {
        const c = result.citations[n - 1];
        const e = bundle.evidence.find(
          (e) =>
            e.version_id === c.version_id &&
            e.page === c.page &&
            e.quote.includes(c.quote),
        )!;
        usedEvidence.add(e.id);
        const number = citations.push(c);
        return `[${number}](${sourcePath(task.project_id, c.version_id, c.page)}&evidence=${e.id})`;
      });
      blocks.push(
        `${p.basis === 'gap' ? `**${L('待补材料', 'Research gap')}：** ` : ''}${safe(p.text)} ${refs.join(' ')}`,
      );
      blocks.push(
        `> ${p.basis === 'interpretation' ? L('解释 / 推断', 'Interpretation') : p.basis === 'gap' ? L('尚待研究', 'Unresolved') : L('材料陈述', 'Source-based statement')}${p.claim_ids.length ? ` · ${L('对应论点', 'Linked claims')}：${p.claim_ids.map((id) => `[C${bundle.claims.findIndex((c) => c.id === id) + 1}](${projectPath(task.project_id, 'arguments')})`).join(' / ')}` : ''}`,
      );
    }
  }
  const missingClaims = bundle.claims.filter(
    (claim) => !coveredClaims.has(claim.id),
  );
  const missingCounterevidence = bundle.evidence.filter(
    (evidence) =>
      !usedEvidence.has(evidence.id) &&
      bundle.links.some(
        (link) =>
          link.evidence_id === evidence.id && link.relation === 'challenges',
      ),
  );
  if (missingClaims.length || missingCounterevidence.length) {
    blocks.push(
      `## ${L('仍未整合的论点与反证', 'Claims and counterevidence still to integrate')}`,
      L(
        '以下是覆盖检查发现的缺口，不能视作已经处理。请补写或说明排除理由。',
        'The coverage check found these gaps. Address them or record why they are excluded.',
      ),
    );
    missingClaims.forEach((claim) => blocks.push(`- ${safe(claim.body)}`));
    missingCounterevidence.forEach((evidence) =>
      blocks.push(
        `- ${L('尚未引用的反证', 'Uncited counterevidence')}: “${safe(evidence.quote)}” [${L('核对原页', 'Inspect source')}](${sourcePath(task.project_id, evidence.version_id, evidence.page)}&evidence=${evidence.id})`,
      ),
    );
  }
  blocks.push(
    `## ${L('本轮选定的已审读论点', 'Reviewed claims selected for this draft')}`,
    ...bundle.claims.map((c, i) => `C${i + 1}. ${safe(c.body)}`),
  );
  blocks.push(`## ${L('原文核对清单', 'Quotation checklist')}`);
  citations.forEach((c, i) =>
    blocks.push(
      `${i + 1}. “${safe(c.quote)}” — [${L('原页', 'Source page')}](${sourcePath(task.project_id, c.version_id, c.page)})`,
    ),
  );
  blocks.push(
    `## ${L('审读前仍需完成', 'Before accepting this draft')}`,
    L(
      '逐段核对解释是否超出材料；补足相关研究与书目信息；核对人物身份、译名和材料依赖关系；明确保留竞争解释与缺口。',
      'Check interpretations against the sources; complete the literature review and bibliography; verify identities, translations and source dependence; preserve alternatives and gaps.',
    ),
  );
  const body = blocks.join('\n\n');
  if (body.length > 100000)
    throw new HttpError(400, '初稿超过笔记长度上限，请缩小文章范围。');
  return {
    summary: L(
      '初稿已保存到笔记与写作。请逐段核对原文，并检查尚未整合的论点与反证。',
      'The draft is saved in Notes & writing. Check each paragraph and any unintegrated claims or counterevidence.',
    ),
    citations: [],
    checks: [
      {
        name: 'research_coverage',
        passed: !missingClaims.length && !missingCounterevidence.length,
        detail: `${missingClaims.length} claims and ${missingCounterevidence.length} counterevidence excerpts not integrated; researcher review required`,
      },
      {
        name: 'section_citations',
        passed: true,
        detail: `${sections.length} sections; ${citations.length} paragraph citations; interpretation not verified`,
      },
    ],
    data: {
      format: 'canwoo-manuscript-draft-v1',
      project_id: task.project_id,
      note_id: noteId,
      manuscript_note: { title: config.title, body },
      coverage: {
        missing_claim_ids: missingClaims.map((c) => c.id),
        missing_counterevidence_ids: missingCounterevidence.map((e) => e.id),
      },
      section_tasks: sections.map((s) => s.id),
      snapshot_hash: config.snapshot_hash,
    },
  };
}
export async function manuscriptRuns(store: MissionStore, project: string) {
  await store.project(project);
  const rows = (
    await store.db
      .prepare(
        "SELECT t.id,t.mission_id,t.input,m.title,m.status FROM mission_tasks t JOIN missions m ON m.id=t.mission_id WHERE t.project_id=? AND json_extract(t.input,'$.parameters.manuscript_stage')='prepare' ORDER BY m.created_at DESC LIMIT 20",
      )
      .bind(project)
      .all<{
        id: string;
        mission_id: string;
        input: string;
        title: string;
        status: string;
      }>()
  ).results;
  return Promise.all(
    rows.map(async (row) => {
      const params = JSON.parse(row.input).parameters;
      const config = manuscriptInput.parse(params.manuscript_config);
      let changed = false;
      try {
        changed =
          (await bundleHash(
            await manuscriptBundle(
              store,
              project,
              config.question_id,
              config.claim_ids,
            ),
          )) !== config.snapshot_hash;
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        changed = true;
      }
      const tasks = (
        await store.db
          .prepare(
            'SELECT id,title,status,error,executor FROM mission_tasks WHERE project_id=? AND mission_id=? ORDER BY created_at,id',
          )
          .bind(project, row.mission_id)
          .all<{
            id: string;
            title: string;
            status: string;
            error: string | null;
            executor: string;
          }>()
      ).results;
      const note = await store.db
        .prepare('SELECT id FROM notes WHERE id=? AND project_id=?')
        .bind(params.manuscript_note, project)
        .first<Pick<Note, 'id'>>();
      return {
        id: row.mission_id,
        title: config.title,
        status: row.status,
        changed,
        note_id: note?.id || null,
        tasks,
      };
    }),
  );
}

export async function createManuscript(
  store: MissionStore,
  project: string,
  raw: unknown,
) {
  await store.project(project, 'write');
  const input = manuscriptInput.parse(raw);
  const find = () =>
    store.db
      .prepare(
        'SELECT mission_id,project_id,input FROM mission_tasks WHERE id=?',
      )
      .bind(input.request_id)
      .first<{ mission_id: string; project_id: string; input: string }>();
  let existing = await find();
  if (!existing) {
    const bundle = await manuscriptBundle(
      store,
      project,
      input.question_id,
      input.claim_ids,
    );
    if ((await bundleHash(bundle)) !== input.snapshot_hash)
      throw new HttpError(409, '研究依据已变化，请重新预览并确认。');
    try {
      await store.create(project, manuscriptRecipe(input, bundle));
    } catch (error) {
      existing = await find();
      if (!existing) throw error;
    }
    existing = await find();
  }
  if (
    !existing ||
    existing.project_id !== project ||
    JSON.stringify(JSON.parse(existing.input).parameters.manuscript_config) !==
      JSON.stringify(input)
  )
    throw new HttpError(
      409,
      '这个创建请求已被使用，请刷新并检查已有论文计划。',
    );
  return store.mission(existing.mission_id, 'write');
}
