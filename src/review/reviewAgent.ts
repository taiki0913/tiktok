// レビューエージェント。投稿した動画を、TikTok の分析画面のスクリーンショット・動画の静止画・台本から厳しく見て、
// 次の動画で変えることと、このアカウントにずっと活かす学びを返す。学びは企画・台本・映像のエージェントに渡す。
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { PRODUCTION_STYLES, type Account } from "../config/accounts.js";
import type { AccountDayState, Lesson } from "../domain.js";
import { generateStructured } from "../llm/claude.js";
import { JOBS_DIR } from "../production/pipeline.js";
import { JobRenderer, type RenderSettings } from "../production/renderer.js";
import type { JobData } from "../../video/kit/job.js";

import { LESSON_LABELS } from "./lessons.js";

const LESSON_TARGETS = ["plan", "script", "visual", "post"] as const;

export const ReviewSchema = z.object({
  metrics: z
    .object({
      views: z.number().nullable().describe("再生数"),
      avgWatchSec: z.number().nullable().describe("平均視聴時間（秒）"),
      fullWatchPercent: z.number().nullable().describe("最後まで見た人の割合（%）"),
      other: z.string().describe("ほかに読み取れたこと（離脱グラフの形・流入元・フォロワー増など）。なければ空"),
    })
    .describe("分析画面のスクリーンショットから読み取った数字。スクリーンショットがなければすべて null と空"),
  score: z.number().int().min(1).max(10).describe("10点満点の厳しめの点数"),
  verdict: z.string().describe("ひとことの総評（忖度なし、40字以内）"),
  dropOff: z.string().describe("どこで・なぜ見るのをやめられたかの見立て。秒数と、その秒の映像・字幕・読み上げを挙げる"),
  problems: z
    .array(z.object({ when: z.string().describe("例：0〜2秒、全体"), issue: z.string() }))
    .describe("問題点。重い順に3〜5個"),
  fixes: z
    .array(z.object({ target: z.enum(LESSON_TARGETS), action: z.string() }))
    .describe("次の動画で必ず変えること。効果が大きい順に3つまで。仕組みにそのまま指示できる具体的な書き方にする"),
  lessons: z
    .array(z.object({ target: z.enum(LESSON_TARGETS), text: z.string() }))
    .describe("このアカウントの今後の動画にずっと活かす決まりごと。1〜3個。60字以内で具体的に（例：1フレーム目に大きな文字で問いを出す）"),
  keep: z.array(z.string()).describe("本当に良かった点（なければ空）"),
});
export type Review = z.infer<typeof ReviewSchema>;

function systemPrompt(account: Account): string {
  return `あなたはTikTokのショート動画のプロデューサー兼データアナリストです。オーナーから「忖度なく厳しく」と頼まれています。

# 見る動画
アカウント「${account.name}」（${account.genre}）の動画です。企画・台本・映像のコード・ナレーション（合成音声）をすべてAIが自動で作っています。
- ターゲット: ${account.target}
- トーン: ${account.tone}
- 作り方: ${PRODUCTION_STYLES[account.production]}

# レビューのしかた
- 褒めるのは本当に良い点だけ。遠回しにせず、伸びない理由をはっきり言う。
- 根拠を必ず示す：分析画面の数字、何秒目か、その秒の静止画・字幕・読み上げ。
- 「もっと面白く」のような、ふわっとした助言は禁止。次の動画でそのまま実行できる指示にする。
- 指示は、この仕組みのどこを変えるか（企画・台本・映像・投稿）に分けて書く。オーナーが手で直すことは前提にしない。
- 数字の目安（公式ではない、よく言われるもの）：冒頭2〜3秒で半分以上が離れていたらつかみの問題。平均視聴時間が動画の長さの3割未満なら構成・テンポの問題。最後まで見た人が1割未満なら長すぎるか、途中に山がない。新しいアカウントで再生が数百で止まるのは、最初に見せた人の多くが飛ばしたという意味。
- これまでの学びが守られていなければ、それも指摘する。同じ学びを重ねて出さない。`;
}

/** 動画の静止画（冒頭は細かく、あとは全体から）をジョブの作業フォルダから書き出す */
async function captureFrames(jobId: string, render: RenderSettings): Promise<{ label: string; data: string }[]> {
  const jobDir = join(JOBS_DIR, jobId);
  let job: JobData;
  try {
    job = JSON.parse(await readFile(join(jobDir, "job.json"), "utf8")) as JobData;
  } catch {
    return []; // 作業フォルダが残っていない
  }
  const d = job.durationInFrames;
  const frames = [...new Set([0, 15, 30, 60, 90, Math.round(d * 0.25), Math.round(d * 0.5), Math.round(d * 0.75), Math.max(0, d - 60)])];
  const renderer = new JobRenderer(jobDir, jobId, render);
  try {
    const stills = await renderer.stills(frames, 0.35);
    return Promise.all(
      stills.map(async (s) => ({ label: `動画の静止画：${(s.frame / job.fps).toFixed(1)}秒`, data: (await readFile(s.file)).toString("base64") })),
    );
  } finally {
    await renderer.cleanup();
  }
}

/** 台本（場面ごとの秒数・字幕・読み上げ）を、レビュー用の文章にする */
async function scriptText(state: AccountDayState): Promise<string> {
  const p = state.production;
  const proposal = state.proposals?.[state.selectedIndex ?? -1];
  const lines: string[] = [];
  if (proposal) lines.push(`企画：${proposal.title}\nつかみ：${proposal.hook}\n内容：${proposal.summary}`);
  let job: JobData | undefined;
  if (p?.jobId) job = JSON.parse(await readFile(join(JOBS_DIR, p.jobId, "job.json"), "utf8").catch(() => "null")) ?? undefined;
  if (job) {
    lines.push(`動画の長さ：${(job.durationInFrames / job.fps).toFixed(1)}秒`);
    for (const s of job.scenes) {
      lines.push(`${(s.from / job.fps).toFixed(1)}〜${((s.from + s.durationInFrames) / job.fps).toFixed(1)}秒　字幕「${s.caption}」　読み上げ「${s.narration}」${s.mood ? `　雰囲気 ${s.mood}` : ""}`);
    }
    lines.push(`締めの画面：${job.endCard.question}`);
  } else if (p?.script) {
    for (const s of p.script.scenes) lines.push(`字幕「${s.caption}」　読み上げ「${s.narration}」`);
  }
  return lines.join("\n");
}

export interface ReviewInput {
  account: Account;
  date: string;
  state: AccountDayState;
  /** 分析画面のスクリーンショット */
  screenshots: { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }[];
  /** オーナーのひとこと（再生数など） */
  note?: string;
  lessons: Lesson[];
  render: RenderSettings;
}

export async function runReview(input: ReviewInput): Promise<Review> {
  const { account, state } = input;
  const frames = state.production?.jobId ? await captureFrames(state.production.jobId, input.render).catch(() => []) : [];
  const prompt = [
    `# 動画（${input.date}）\n${await scriptText(state)}`,
    input.note ? `# オーナーのひとこと\n${input.note}` : "",
    input.lessons.length > 0
      ? `# これまでのレビューで決めた学び\n${input.lessons.map((l) => `- [${LESSON_LABELS[l.target]}] ${l.text}`).join("\n")}`
      : "",
    input.screenshots.length > 0
      ? "# 依頼\n分析画面のスクリーンショットの数字と、動画の静止画・台本から、厳しくレビューしてください。"
      : "# 依頼\n分析の数字はまだありません。動画の静止画と台本だけから、投稿したら見るのをやめられそうなところを厳しくレビューしてください（metrics はすべて null と空）。",
  ]
    .filter(Boolean)
    .join("\n\n");
  return generateStructured({
    label: `レビュー:${account.id}`,
    schema: ReviewSchema,
    effort: "high",
    system: systemPrompt(account),
    prompt,
    images: [
      ...input.screenshots.map((s, i) => ({ ...s, label: `分析画面のスクリーンショット${i + 1}` })),
      ...frames.map((f) => ({ mediaType: "image/jpeg" as const, data: f.data, label: f.label })),
    ],
  });
}
