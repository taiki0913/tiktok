import "dotenv/config";
import { z } from "zod";

const boolFromString = z
  .enum(["true", "false"])
  .default("true")
  .transform((v) => v === "true");

const EnvSchema = z.object({
  // ANTHROPIC_API_KEY は SDK が環境変数から直接読むので、ここでは存在チェックだけ行う
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),

  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_CHANNEL_ID: z.string().optional(),

  YOUTUBE_API_KEY: z.string().optional(),
  RESEARCH_WEB_SEARCH: boolFromString,

  MORNING_CRON: z.string().default("30 6 * * *"),
  TIMEZONE: z.string().default("Asia/Tokyo"),
  DATA_DIR: z.string().default("data"),
  ACCOUNTS_FILE: z.string().default("config/accounts.yaml"),
});

export type Env = z.infer<typeof EnvSchema>;

// 空文字の項目は「未設定」として扱う（.env.example をコピーしただけの状態を許容するため）
const raw = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""),
);

export const env: Env = EnvSchema.parse(raw);

export function requireClaudeEnv(): void {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(".env に ANTHROPIC_API_KEY が設定されていません（https://console.anthropic.com/ で発行できます）");
  }
}

export interface SlackEnv {
  botToken: string;
  appToken: string;
  channelId: string;
}

export function requireSlackEnv(): SlackEnv {
  const missing = (["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_CHANNEL_ID"] as const).filter(
    (k) => !env[k],
  );
  if (missing.length > 0) {
    throw new Error(`.env に Slack の設定がありません: ${missing.join(", ")}`);
  }
  return {
    botToken: env.SLACK_BOT_TOKEN!,
    appToken: env.SLACK_APP_TOKEN!,
    channelId: env.SLACK_CHANNEL_ID!,
  };
}
