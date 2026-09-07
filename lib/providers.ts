import { boundedBytes } from './files';
import { CLAIM_REVIEW_SCHEMA, claimReviewJsonSchema } from './claim-review';
import {
  DEFAULT_RESEARCH_MODEL,
  GLM_PRICE_CEILING,
  resolveEffort,
  type ThinkingEffort,
} from './model-routing';
import type { Provider } from './types';
import {
  COMPARISON_OUTPUT_SCHEMA,
  comparisonOutputJsonSchema,
  READING_OUTPUT_SCHEMA,
  DISCUSSION_OUTPUT_SCHEMA,
  discussionOutputJsonSchema,
  readingOutputJsonSchema,
} from './reading-output';
export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
export function safeProviderFailure(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (
    error instanceof Error &&
    ['TimeoutError', 'AbortError'].includes(error.name)
  )
    return '模型响应超时。请稍后查看任务记录，再决定是否重试。';
  if (error instanceof Error && /illegal invocation/i.test(error.message))
    return '模型连接适配器调用方式不受当前运行环境支持。';
  if (error instanceof Error && error.name === 'TypeError')
    return '模型调用配置无法在当前运行环境执行（TypeError）。';
  return '与模型服务的连接中断，未能确认返回结果。';
}
export type ModelRequest = {
  provider: Provider;
  model: string;
  key: string;
  system: string;
  prompt: string;
  image?: string;
  maxOutput?: number;
  outputFormat?: 'json';
  sourceVersionIds?: string[];
  outputSchema?:
    | typeof COMPARISON_OUTPUT_SCHEMA
    | typeof READING_OUTPUT_SCHEMA
    | typeof DISCUSSION_OUTPUT_SCHEMA
    | typeof CLAIM_REVIEW_SCHEMA;
  effort?: ThinkingEffort;
  taskKind?: string;
  priceCeiling?: { input: number; output: number };
};
function constrainedSchema(input: ModelRequest) {
  const schema =
    input.outputSchema === CLAIM_REVIEW_SCHEMA
      ? claimReviewJsonSchema
      : input.outputSchema === COMPARISON_OUTPUT_SCHEMA
        ? comparisonOutputJsonSchema
        : input.outputSchema === DISCUSSION_OUTPUT_SCHEMA
          ? discussionOutputJsonSchema
          : readingOutputJsonSchema;
  if (
    input.outputSchema === CLAIM_REVIEW_SCHEMA ||
    !input.sourceVersionIds?.length
  )
    return schema;
  const reading =
    input.outputSchema === COMPARISON_OUTPUT_SCHEMA
      ? comparisonOutputJsonSchema
      : input.outputSchema === DISCUSSION_OUTPUT_SCHEMA
        ? discussionOutputJsonSchema
        : readingOutputJsonSchema;
  return {
    ...reading,
    properties: {
      ...reading.properties,
      citations: {
        ...reading.properties.citations,
        items: {
          ...reading.properties.citations.items,
          properties: {
            ...reading.properties.citations.items.properties,
            version_id: {
              ...reading.properties.citations.items.properties.version_id,
              enum: [...new Set(input.sourceVersionIds)],
            },
          },
        },
      },
    },
  };
}

export function providerRequest(input: ModelRequest): {
  url: string;
  headers: Record<string, string>;
  body: object;
} {
  const { provider, model, key, system, prompt, image } = input;
  const content = [
    { type: 'text', text: prompt },
    ...(image ? [{ type: 'image_url', image_url: { url: image } }] : []),
  ];
  if (provider === 'openai' || provider === 'openrouter')
    return {
      url:
        provider === 'openai'
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: {
        model,
        ...(input.outputFormat === 'json'
          ? {
              response_format:
                input.outputSchema === COMPARISON_OUTPUT_SCHEMA ||
                input.outputSchema === READING_OUTPUT_SCHEMA ||
                input.outputSchema === DISCUSSION_OUTPUT_SCHEMA ||
                input.outputSchema === CLAIM_REVIEW_SCHEMA
                  ? {
                      type: 'json_schema',
                      json_schema: {
                        name: input.outputSchema,
                        strict: true,
                        schema: constrainedSchema(input),
                      },
                    }
                  : { type: 'json_object' },
            }
          : {}),
        ...(provider === 'openrouter'
          ? {
              provider: {
                require_parameters: true,
                max_price: {
                  prompt:
                    input.priceCeiling?.input ??
                    (model === DEFAULT_RESEARCH_MODEL
                      ? GLM_PRICE_CEILING.input
                      : undefined),
                  completion:
                    input.priceCeiling?.output ??
                    (model === DEFAULT_RESEARCH_MODEL
                      ? GLM_PRICE_CEILING.output
                      : undefined),
                },
              },
              ...(resolveEffort(provider, model, input.taskKind, input.effort)
                ? {
                    reasoning: {
                      effort: resolveEffort(
                        provider,
                        model,
                        input.taskKind,
                        input.effort,
                      ),
                      exclude: true,
                    },
                  }
                : {}),
            }
          : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        ...(provider === 'openai'
          ? { max_completion_tokens: input.maxOutput ?? 4096 }
          : { max_tokens: input.maxOutput ?? 4096 }),
      },
    };
  const match = image?.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (image && !match) throw new Error('Unsupported image');
  if (provider === 'anthropic')
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: {
        model,
        system,
        max_tokens: input.maxOutput ?? 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...(match
                ? [
                    {
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: match[1],
                        data: match[2],
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    };
  if (provider !== 'google') throw new Error('Unsupported provider');
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            ...(match
              ? [{ inline_data: { mime_type: match[1], data: match[2] } }]
              : []),
          ],
        },
      ],
      generationConfig: { maxOutputTokens: input.maxOutput ?? 4096 },
    },
  };
}
export async function invoke(
  input: ModelRequest,
  fetcher: typeof fetch = fetch,
): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
  truncated?: boolean;
}> {
  const request = providerRequest(input);
  const response = await fetcher(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    redirect: 'manual',
    signal: AbortSignal.timeout(
      resolveEffort(
        input.provider,
        input.model,
        input.taskKind,
        input.effort,
      ) === 'low'
        ? 90_000
        : 150_000,
    ),
  }).catch((error: unknown) => {
    const code = error instanceof Error ? error.name : 'unknown';
    throw new ProviderError(
      'transport',
      `模型请求未获得响应（${['TypeError', 'TimeoutError', 'AbortError', 'Error'].includes(code) ? code : '网络错误'}）。请稍后检查任务记录。`,
    );
  });
  // Do not echo vendor errors: gateways may include request headers or material.
  if (!response.ok)
    throw new ProviderError(
      `http_${response.status}`,
      `模型服务返回 HTTP ${response.status}。${
        response.status === 401
          ? '密钥未通过验证，请重新保存有效密钥。'
          : response.status === 402
            ? '模型账户额度不足，请检查该密钥所属账户的余额。'
            : response.status === 404
              ? '没有可用的模型路由，请检查模型名称、参数和价格限制。'
              : response.status === 429
                ? '请求过于频繁，请稍后重试。'
                : '请检查模型连接，稍后再试。'
      }`,
    );
  const data = (await boundedBytes(response, 2_000_000)
    .then((bytes) => JSON.parse(new TextDecoder().decode(bytes)))
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        ['AbortError', 'TimeoutError'].includes(error.name)
      )
        throw new ProviderError(
          'response_timeout',
          '模型已开始响应，但未在等待时间内完成。请检查用量后再决定是否重试。',
        );
      throw new ProviderError(
        'invalid_json',
        '模型服务返回的数据无法解析。请稍后重试或更换服务商。',
      );
    })) as {
    content?: { type: string; text: string }[];
    stop_reason?: string;
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
    }[];
    choices?: { finish_reason?: string; message?: { content?: string } }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
  const text =
    input.provider === 'anthropic'
      ? data.content
          ?.filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
      : input.provider === 'google'
        ? data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || '')
            .join('\n')
        : data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim())
    throw new ProviderError(
      'empty_response',
      '模型未返回可用正文，可能已用完思考或输出额度；请检查任务记录后再决定是否重试。',
    );
  const inputTokens =
    data.usage?.input_tokens ??
    data.usage?.prompt_tokens ??
    data.usageMetadata?.promptTokenCount ??
    0;
  const outputTokens =
    data.usage?.output_tokens ??
    data.usage?.completion_tokens ??
    data.usageMetadata?.candidatesTokenCount ??
    0;
  const truncated =
    data.stop_reason === 'max_tokens' ||
    data.candidates?.[0]?.finishReason === 'MAX_TOKENS' ||
    data.choices?.[0]?.finish_reason === 'length';
  return {
    text,
    inputTokens,
    outputTokens,
    ...(truncated ? { truncated: true } : {}),
  };
}
