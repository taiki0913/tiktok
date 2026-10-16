import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "../config/env.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// 安全判定で応答が断られたとき、サーバー側で推奨モデルに自動で切り替えて再実行する
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

export class ClaudeResponseError extends Error {}

function assertUsableStop(
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

/** スキーマどおりの JSON を返させる */
export async function generateStructured<T extends z.ZodType>(opts: {
  label: string;
  schema: T;
  system: string;
  prompt: string;
  effort?: Effort;
}): Promise<z.infer<T>> {
  const response = await getClient().beta.messages.parse({
    model: env.CLAUDE_MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: opts.effort ?? "high",
      format: betaZodOutputFormat(opts.schema),
    },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  logUsage(opts.label, response.usage);
  assertUsableStop(response, opts.label);
  if (response.parsed_output == null) {
    throw new ClaudeResponseError(`[${opts.label}] 出力をJSONとして読み取れませんでした`);
  }
  return response.parsed_output as z.infer<T>;
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
