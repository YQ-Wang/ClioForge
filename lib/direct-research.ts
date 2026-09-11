import { ResearchStore } from './store';
import { HttpError } from './errors';
import { DEFAULT_RESEARCH_MODEL, GLM_PRICE_CEILING } from './model-routing';
export type DirectPrice = {
  input_rate: number;
  output_rate: number;
  max_output: number;
};
export async function directPrice(
  store: ResearchStore,
  modelId: string,
  kind: string,
): Promise<DirectPrice> {
  const model = await store.model(modelId);
  const policy = await store.db
    .prepare(
      'SELECT input_rate,output_rate,max_output FROM model_policies WHERE owner_id=? AND model_id=? AND task_kind=?',
    )
    .bind(store.owner, modelId, kind)
    .first<DirectPrice>();
  if (policy && policy.input_rate > 0 && policy.output_rate > 0) return policy;
  if (
    model.provider === 'openrouter' &&
    model.model_id === DEFAULT_RESEARCH_MODEL
  )
    return {
      input_rate: GLM_PRICE_CEILING.input,
      output_rate: GLM_PRICE_CEILING.output,
      max_output: 16384,
    };
  throw new HttpError(
    409,
    '请先在账号设置的模型连接中，为此类任务保存模型费率。',
  );
}
export async function reserveDirectRun(
  store: ResearchStore,
  input: Parameters<ResearchStore['startRun']>[0],
  price: DirectPrice,
  inputBound: number,
  locale = 'zh-CN',
) {
  await store.project(input.project_id, 'write');
  if (
    ![price.input_rate, price.output_rate, price.max_output, inputBound].every(
      Number.isFinite,
    ) ||
    price.input_rate <= 0 ||
    price.output_rate < 0 ||
    price.max_output < 0 ||
    inputBound < 0
  )
    throw new HttpError(400, '费用预留参数无效。');
  const reserved = Math.max(
    1,
    Math.ceil(
      inputBound * price.input_rate + price.max_output * price.output_rate,
    ),
  );
  const date = new Date().toISOString();
  const result = await store.db
    .batch([
      store.db
        .prepare(
          "INSERT INTO research_runs(id,owner_id,project_id,kind,status,prompt,model_snapshot,source_version_ids,created_at) SELECT ?,?,?,?,'running',?,?,?,? WHERE (SELECT limit_units-committed_units FROM project_budgets WHERE project_id=?)>=? ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          input.id,
          store.owner,
          input.project_id,
          input.kind,
          input.prompt,
          JSON.stringify({ ...input.model_snapshot, ...price }),
          JSON.stringify(input.source_version_ids),
          date,
          input.project_id,
          reserved,
        ),
      store.db
        .prepare(
          "INSERT INTO direct_run_costs SELECT id,project_id,owner_id,'reserved',?,?,?,?,created_at FROM research_runs WHERE id=? AND owner_id=? AND status='running' ON CONFLICT(run_id) DO NOTHING",
        )
        .bind(
          reserved,
          price.input_rate,
          price.output_rate,
          price.max_output,
          input.id,
          store.owner,
        ),
      // The transitional phase belongs to this transaction; a replay cannot debit twice.
      store.db
        .prepare(
          "UPDATE project_budgets SET committed_units=committed_units+? WHERE project_id=? AND EXISTS(SELECT 1 FROM direct_run_costs WHERE run_id=? AND owner_id=? AND phase='reserved')",
        )
        .bind(reserved, input.project_id, input.id, store.owner),
      store.db
        .prepare(
          "UPDATE direct_run_costs SET phase='calling' WHERE run_id=? AND owner_id=? AND phase='reserved'",
        )
        .bind(input.id, store.owner),
    ])
    .catch((error) => {
      if (String(error).includes('research_runs.owner_id'))
        throw new HttpError(
          409,
          '已有转录或即时分析任务正在运行，请先等待它完成。',
        );
      throw error;
    });
  if (!result[0].meta.changes) {
    const existing = await store.run(input.id);
    if (existing) return false;
    throw new HttpError(
      409,
      locale === 'en'
        ? `Insufficient project budget. This call needs a conservative reservation of $${(reserved / 1_000_000).toFixed(4)}; this is not the final charge. Adjust the budget under Tasks and alerts. No model was called.`
        : `项目研究助手预算不足。本次需要预留 $${(reserved / 1_000_000).toFixed(4)}（保守估算，并非最终费用）。请在「任务与关注」调整额度。本次没有调用模型。`,
    );
  }
  return true;
}
export async function finishDirectRun(
  store: ResearchStore,
  id: string,
  result: Parameters<ResearchStore['finishRun']>[1],
  called: boolean,
) {
  const cost = await store.db
    .prepare('SELECT * FROM direct_run_costs WHERE run_id=? AND owner_id=?')
    .bind(id, store.owner)
    .first<
      DirectPrice & {
        project_id: string;
        reserved_units: number;
        phase: string;
      }
    >();
  if (!cost) throw new HttpError(404, '任务费用记录不存在。');
  const known =
    !called ||
    (result.status === 'succeeded' &&
      (result.input_tokens || 0) > 0 &&
      ((result.output_tokens || 0) > 0 || cost.output_rate === 0));
  const charge = !called
    ? 0
    : known
      ? Math.ceil(
          (result.input_tokens || 0) * cost.input_rate +
            (result.output_tokens || 0) * cost.output_rate,
        )
      : cost.reserved_units;
  await store.db.batch([
    store.db
      .prepare(
        "UPDATE project_budgets SET committed_units=MAX(0,committed_units+?) WHERE project_id=? AND EXISTS(SELECT 1 FROM direct_run_costs c JOIN research_runs r ON r.id=c.run_id WHERE c.run_id=? AND c.owner_id=? AND c.phase='calling' AND r.status='running')",
      )
      .bind(charge - cost.reserved_units, cost.project_id, id, store.owner),
    store.db
      .prepare(
        "UPDATE direct_run_costs SET phase=?,reserved_units=? WHERE run_id=? AND owner_id=? AND phase='calling' AND EXISTS(SELECT 1 FROM research_runs WHERE id=? AND status='running')",
      )
      .bind(known ? 'settled' : 'uncertain', charge, id, store.owner, id),
    store.db
      .prepare(
        "UPDATE research_runs SET status=?,result=?,error=?,input_tokens=?,output_tokens=?,finished_at=? WHERE id=? AND owner_id=? AND status='running'",
      )
      .bind(
        result.status,
        result.result ?? null,
        result.error ?? null,
        result.input_tokens || 0,
        result.output_tokens || 0,
        new Date().toISOString(),
        id,
        store.owner,
      ),
  ]);
  return store.run(id);
}
export async function recoverDirectRuns(db: D1Database) {
  await db
    .prepare(
      "UPDATE research_runs SET status='failed',error='早期调用结果尚未确认，请核对厂商记录后再决定是否新建任务。',finished_at=? WHERE status='running' AND created_at<? AND NOT EXISTS(SELECT 1 FROM direct_run_costs c WHERE c.run_id=research_runs.id)",
    )
    .bind(
      new Date().toISOString(),
      new Date(Date.now() - 10 * 60_000).toISOString(),
    )
    .run();
  const stale = (
    await db
      .prepare(
        "SELECT r.id,r.owner_id FROM research_runs r JOIN direct_run_costs c ON c.run_id=r.id WHERE r.status='running' AND r.created_at<? LIMIT 50",
      )
      .bind(new Date(Date.now() - 10 * 60_000).toISOString())
      .all<{ id: string; owner_id: string }>()
  ).results;
  for (const row of stale)
    await finishDirectRun(
      new ResearchStore(db, row.owner_id),
      row.id,
      {
        status: 'failed',
        error:
          '调用结果尚未确认，预算预留保留。请先核对模型厂商记录；不会自动重复调用。',
      },
      true,
    );
}
