import { z } from 'zod';
import { authenticate, failure, HttpError, jsonBody } from '@/lib/server';
import { decrypt } from '@/lib/crypto';
import {
  directPrice,
  finishDirectRun,
  reserveDirectRun,
} from '@/lib/direct-research';
import { invoke, safeProviderFailure } from '@/lib/providers';
import { resultSchema, type TaskResult } from '@/lib/platform/types';
import { searchSourceCandidates } from '@/lib/platform/discovery';

export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  query: z.string().trim().min(1).max(2_000),
  locale: z.enum(['zh-CN', 'en']).default('zh-CN'),
});

const queryPlanSchema = z.object({
  queries: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
});

const system =
  'You are a humanities source-search planner. Turn only the researcher-provided search request into one to three concise catalog queries using historically relevant names, aliases, offices, events, dates, and language variants. Do not answer the research question and do not invent results. Return only a JSON object with the shape {"queries":["..."]}.';

function readSavedResult(value: string | null): TaskResult | null {
  if (!value) return null;
  try {
    return resultSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { user, store, settings } = await authenticate(request);
    const input = inputSchema.parse(await jsonBody(request));
    await store.project(input.project_id, 'write');
    const previous = await store.run(input.id);
    if (previous) {
      if (previous.project_id !== input.project_id)
        throw new HttpError(409, '搜索请求不属于当前项目。');
      const result = readSavedResult(previous.result);
      if (previous.status === 'succeeded' && result)
        return Response.json({ result, run: previous });
      throw new HttpError(
        409,
        previous.error || '这次搜索已经结束，请发起新的搜索。',
      );
    }

    const policy = await store.db
      .prepare(
        "SELECT model_id FROM model_policies WHERE owner_id=? AND task_kind='analysis'",
      )
      .bind(user.id)
      .first<{ model_id: string }>();
    if (!policy)
      throw new HttpError(
        409,
        '请先在「助手设置」中保存默认模型与费率，再运行 AI 资料搜索。',
      );
    const secret = settings.FOLIOTRACE_ENCRYPTION_KEY;
    if (!secret) throw new HttpError(503, '尚未配置模型服务。');
    const model = await store.model(policy.model_id);
    const price = await directPrice(store, model.id, 'analysis');
    const apiKey = await decrypt(
      model.encrypted_key,
      secret,
      `${user.id}:${model.id}`,
    );
    const started = await reserveDirectRun(
      store,
      {
        id: input.id,
        project_id: input.project_id,
        kind: 'analysis',
        prompt: input.query,
        source_version_ids: [],
        model_snapshot: {
          provider: model.provider,
          model_id: model.model_id,
          prompt_version: 1,
          feature: 'source_discovery',
          effort: 'high',
        },
      },
      price,
      new TextEncoder().encode(system + input.query).length + 4096,
      input.locale,
    );
    if (!started) {
      const run = await store.run(input.id);
      const result = readSavedResult(run?.result || null);
      if (run?.status === 'succeeded' && result)
        return Response.json({ result, run });
      throw new HttpError(409, run?.error || '这次搜索无法继续。');
    }

    let called = false;
    try {
      // Recheck access immediately before the cost-bearing model call.
      await store.project(input.project_id, 'write');
      called = true;
      const response = await invoke({
        provider: model.provider,
        model: model.model_id,
        key: apiKey,
        system,
        prompt: input.query,
        outputFormat: 'json',
        maxOutput: price.max_output,
        effort: 'high',
        taskKind: 'search',
        priceCeiling: {
          input: price.input_rate,
          output: price.output_rate,
        },
      });
      const plan = queryPlanSchema.parse(JSON.parse(response.text));
      const result = await searchSourceCandidates(store, {
        project_id: input.project_id,
        version_ids: [],
        queries: plan.queries,
        external: true,
        locale: input.locale,
      });
      const run = await finishDirectRun(
        store,
        input.id,
        {
          status: 'succeeded',
          result: JSON.stringify(result),
          error: response.truncated
            ? '检索词规划达到模型输出上限，候选结果可能不完整。'
            : undefined,
          input_tokens: response.inputTokens,
          output_tokens: response.outputTokens,
        },
        called,
      );
      return Response.json({ result, run });
    } catch (error) {
      const message =
        error instanceof SyntaxError || error instanceof z.ZodError
          ? '搜索助手未返回可执行的检索词。请查看用量记录后再决定是否重试。'
          : safeProviderFailure(error);
      await finishDirectRun(
        store,
        input.id,
        { status: 'failed', error: message },
        called,
      );
      throw new HttpError(502, message);
    }
  } catch (error) {
    return failure(error);
  }
}
