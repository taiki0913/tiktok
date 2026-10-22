import { z } from "zod";
import type { VideoScript } from "./production/scriptAgent.js";

/** 競合調査エージェントが企画エージェントに渡す「結果だけ」のまとめ */
export const ResearchBriefSchema = z.object({
  trendSummary: z.string().describe("このジャンルで今伸びている傾向の要約（3〜5文）"),
  winningPatterns: z
    .array(
      z.object({
        pattern: z.string().describe("伸びている動画に共通する型（冒頭のつかみ・構成・タイトル付け・尺など）"),
        evidence: z.string().describe("その型が見られた動画や数字"),
      }),
    )
    .describe("3〜5件"),
  hotTopics: z
    .array(
      z.object({
        topic: z.string(),
        why: z.string().describe("今このネタが効く理由"),
        source: z.string().describe("出典（URL か『YouTube上位動画』など）"),
      }),
    )
    .describe("企画に使えそうな今週の話題。3〜8件"),
  standoutVideos: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        viewsPerDay: z.number().nullable().describe("1日あたり再生数。不明なら null"),
        takeaway: z.string().describe("この動画から盗むべきポイント"),
      }),
    )
    .describe("特に参考にすべき動画。最大5件"),
  avoid: z.array(z.string()).describe("飽和している・避けるべきネタや型"),
});
export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

export const ProposalSchema = z.object({
  title: z.string().describe("企画タイトル（30字以内。管理用）"),
  hook: z.string().describe("冒頭2秒で見せる・言うつかみ"),
  summary: z.string().describe("どんな動画か（2〜3文）"),
  outline: z.array(z.string()).describe("構成の流れ。4〜6項目で、各項目に秒数の目安を付ける"),
  lengthSec: z.number().int().describe("想定の尺（秒）"),
  caption: z.string().describe("TikTokの投稿文（ハッシュタグは含めない）"),
  hashtags: z.array(z.string()).describe("3〜6個。#は付けない"),
  basedOn: z.string().describe("競合調査のどの結果を根拠にした企画か"),
  originality: z.string().describe("よくある動画との違い、このアカウントならではの工夫"),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const PlanSchema = z.object({
  proposals: z.array(ProposalSchema).describe("方向性の異なる企画を3案"),
});

export type AccountStatus = "planning" | "awaiting_approval" | "approved" | "skipped" | "error";

export type ProductionStatus =
  | "queued"
  | "scripting"
  | "voicing"
  | "coding"
  | "rendering"
  | "review"
  | "approved"
  | "failed"
  | "unsupported";

/** 動画づくりの進み具合（企画が決定したあと） */
export interface ProductionState {
  status: ProductionStatus;
  /** 何回目の制作か（作り直すたびに増える） */
  version: number;
  jobId?: string;
  script?: VideoScript;
  /** 書き出した mp4 の場所 */
  videoFile?: string;
  durationSec?: number;
  /** 台本エージェントが「自信なし」とした事実 */
  factsToCheck?: { claim: string; basis: string }[];
  /** ナレーションのクレジット（例：VOICEVOX:九州そら）。投稿文に入れる。null はナレーションなし */
  voiceCredit?: string | null;
  /** ナレーションを無音で代用したときなどの注意 */
  warnings: string[];
  agentSummary?: string;
  costUsd?: number | null;
  error?: string;
  /** 作り直しの指示（mode=script は台本から、visual は映像だけ） */
  revisions: { instruction: string; mode: "script" | "visual"; at: string }[];
  /** スレッドに投稿した確認メッセージ */
  slackReviewTs?: string;
  /** 公開OKにした動画の保存先（EXPORT_DIR） */
  saved?: SavedState;
  /** TikTok への自動投稿（UPLOAD_POST_API_KEY を設定したときだけ） */
  post?: PostState;
}

export interface SavedState {
  status: "saved" | "failed";
  videoFile?: string;
  /** 投稿文を書いたテキストファイル */
  textFile?: string;
  /** 投稿文（説明文＋ハッシュタグ） */
  text: string;
  error?: string;
  /** 投稿文をスレッドに送ったか */
  textPosted?: boolean;
}

export type PostStatus =
  | "scheduling" // 投稿サービスへアップロード中
  | "scheduled" // 投稿予約済み（時刻になると投稿サービスが投稿する）
  | "posting" // すぐ投稿にした。結果待ち
  | "posted"
  | "failed"
  | "canceled"
  | "unknown"; // 結果を確認できなかった

export interface PostState {
  status: PostStatus;
  /** 何回目の投稿の試みか（やり直すたびに増える。二重投稿を防ぐキーにも使う） */
  attempt: number;
  /** 投稿する時刻（ISO） */
  scheduledAt?: string;
  /** 投稿サービスの受付番号（予約投稿は jobId、すぐ投稿は requestId） */
  jobId?: string;
  requestId?: string;
  url?: string;
  error?: string;
  /** 投稿の結果をスレッドで知らせたか */
  notified?: boolean;
}

export interface AccountDayState {
  accountId: string;
  status: AccountStatus;
  production?: ProductionState;
  research?: ResearchBrief;
  proposals?: Proposal[];
  selectedIndex?: number;
  /** オーナーからの修正指示の履歴（企画エージェントが好みを学ぶのにも使う） */
  revisions: { instruction: string; at: string }[];
  slack?: { channel: string; ts: string };
  error?: string;
  updatedAt: string;
}

export interface DayState {
  date: string;
  accounts: Record<string, AccountDayState>;
  slackSummary?: { channel: string; ts: string };
  /** 全アカウントの決定を通知済みか */
  allDecidedNotified?: boolean;
}

export interface ReferenceVideo {
  accountId: string;
  url: string;
  caption: string;
  authorName: string;
  addedAt: string;
}
