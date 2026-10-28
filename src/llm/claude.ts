import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "../config/env.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// 安全判定で応答が断られたとき、サーバー側で推奨モデルに自動で切り替えて再実行する
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | undefined;
export function getClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

/** 100万トークンあたりの料金（ドル）。費用の目安をログに出すために使う */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

/** 使ったトークン数から費用の目安（ドル）を出す。料金表にないモデルは null */
export function estimateCostUsd(model: string, usage: Anthropic.Beta.BetaUsage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

export class ClaudeResponseError extends Error {}

export function assertUsableStop(
  response: { stop_reason: string | null; stop_details?: { category?: string | null; explanation?: string | null } | null },
  label: string,
): void {
  if (response.stop_reason === "refusal") {
    const d = response.stop_details;
    throw new ClaudeResponseError(
      `[${label}] Claude が応答を断りました（${d?.category ?? "理由不明"}）${d?.explanation ? `: ${d.explanation}` : ""}`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new ClaudeResponseError(`[${label}] 出力が上限に達して途中で切れました`);
  }
}

function logUsage(label: string, usage: Anthropic.Beta.BetaUsage): void {
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  console.log(
    `[claude] ${label}: in=${usage.input_tokens} out=${usage.output_tokens}` +
      (searches ? ` web_search=${searches}` : ""),
  );
}

/** スキーマどおりの JSON を返させるときの出力の上限（考える分も含む） */
const STRUCTURED_MAX_TOKENS = 64000;
const STRUCTURED_OUTPUTS_BETA = "structured-outputs-2025-12-15";

/** スキーマどおりの JSON を返させる */
export async function generateStructured<T extends z.ZodType>(opts: {
  label: string;
  schema: T;
  system: string;
  prompt: string;
  effort?: Effort;
  /** 一緒に見せる画像（動画の静止画・分析画面のスクリーンショットなど） */
  images?: { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string; label?: string }[];
}): Promise<z.infer<T>> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of opts.images ?? []) {
    if (img.label) content.push({ type: "text", text: img.label });
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  }
  content.push({ type: "text", text: opts.prompt });
  // 考える量が多い依頼（続きものの企画など）は 16000 トークンでは足りないことがあるので、上限を大きくする。
  // 上限が大きいと時間がかかることがあるため、ストリーミングで受け取る（使った分だけ課金される）
  const stream = getClient().beta.messages.stream({
    model: env.CLAUDE_MODEL,
    max_tokens: STRUCTURED_MAX_TOKENS,
    betas: [FALLBACK_BETA, STRUCTURED_OUTPUTS_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: opts.effort ?? "high",
      format: betaZodOutputFormat(opts.schema),
    },
    system: opts.system,
    messages: [{ role: "user", content }],
  });
  const response = await stream.finalMessage();
  logUsage(opts.label, response.usage);
  assertUsableStop(response, opts.label);
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ClaudeResponseError(`[${opts.label}] 出力をJSONとして読み取れませんでした`);
  }
  const result = opts.schema.safeParse(data);
  if (!result.success) {
    throw new ClaudeResponseError(`[${opts.label}] 出力の形が決めた形と違います：${result.error.message.slice(0, 500)}`);
  }
  return result.data as z.infer<T>;
}

/** Web検索を使って調べ、文章で結果を返させる */
export async function researchWithWebSearch(opts: {
  label: string;
  system: string;
  prompt: string;
  maxSearches: number;
}): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  // 検索が長引くとサーバー側で一時停止（pause_turn）するので、続きから再開させる
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await getClient().beta.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: opts.system,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: opts.maxSearches,
          user_location: { type: "approximate", country: "JP", timezone: env.TIMEZONE },
        },
      ],
      messages,
    });
    logUsage(opts.label, response.usage);
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    assertUsableStop(response, opts.label);
    return response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
  throw new ClaudeResponseError(`[${opts.label}] Web検索が終わりませんでした`);
}
