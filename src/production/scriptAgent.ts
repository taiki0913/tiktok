// 台本エージェント。承認された企画から、場面ごとの読み上げ文・字幕・映像の指示を作る。
// 動画に含む事実はすべて書き出させ、自信のないものは Slack でオーナーに確認してもらう。
import { z } from "zod";
import { PRODUCTION_STYLES, type Account } from "../config/accounts.js";
import type { Proposal } from "../domain.js";
import { generateStructured } from "../llm/claude.js";

/** 読み上げの速さの目安（VOICEVOX・速さ1.1〜1.15で、1秒あたりの文字数） */
const CHARS_PER_SEC = 7;

export const VideoScriptSchema = z.object({
  title: z.string().describe("動画のタイトル（管理用）"),
  scenes: z
    .array(
      z.object({
        narration: z
          .string()
          .describe(
            "読み上げ用の文。数字はカンマなしの算用数字、単位や英字略語はカタカナで書く（例：8336メートル、ナサ）。読み間違えやすい語はひらがなにする",
          ),
        caption: z.string().describe("画面に出す字幕。読み上げを短くまとめ、強調したい語を[ ]で囲む。30字以内"),
        visual: z.string().describe("この場面の映像の指示（何が映り、カメラがどう動き、何が起きるか）"),
        onScreen: z.array(z.string()).describe("画面に出す数字・ラベル・グラフの中身（なければ空）"),
      }),
    )
    .describe("6〜12場面。1場面は5〜10秒の分量"),
  endQuestion: z.string().describe("最後に画面に出す、コメントを促す問いかけ"),
  postCaption: z
    .string()
    .describe("TikTokの投稿文（説明文）。ハッシュタグは含めない。1〜3文で、続きが気になる一言かコメントを促す問いかけを入れる"),
  hashtags: z
    .array(z.string())
    .describe("投稿に付けるハッシュタグ。4〜6個。#は付けない。ジャンルの定番のタグと、この動画の題材のタグを混ぜる"),
  sources: z.array(z.string()).describe("画面の最後に小さく出す出典（機関名・資料名）"),
  facts: z
    .array(
      z.object({
        claim: z.string().describe("動画に含まれる事実・数値"),
        basis: z.string().describe("その根拠（資料名や、一般に知られた事実かどうか）"),
        confidence: z.enum(["high", "medium", "low"]).describe("正しいと言える確からしさ"),
      }),
    )
    .describe("動画に含まれる事実・数値をすべて列挙する"),
});
export type VideoScript = z.infer<typeof VideoScriptSchema>;

function systemPrompt(account: Account): string {
  const [minSec, maxSec] = account.lengthSec;
  const rules = account.rules.map((r) => `- ${r}`).join("\n");
  return `あなたはTikTokアカウント「${account.name}」の台本作家です。承認された企画を、そのまま動画にできる台本に仕上げます。

# アカウント設定
- ジャンル: ${account.genre}
- トーン: ${account.tone}
- 動画の作り方: ${PRODUCTION_STYLES[account.production]}
- 見た目の方針: ${account.visual || "特になし"}

# 台本の条件
- 読み上げの合計は${minSec}〜${maxSec}秒（約${minSec * CHARS_PER_SEC}〜${maxSec * CHARS_PER_SEC}文字）。収益化の条件のため、必ず60秒以上にする。
- 最初の場面は2秒で引き込む一言にする。1文は短く、2〜3秒ごとに新しい情報か映像の変化を入れる。
- 映像の指示は「動画の作り方」で実際に作れるものだけにする。実写・写真・実在の映像は使えない。
- 事実・説・推測の区別は字幕のラベル（「通説」「新説」「想像図」など）で一度示せば十分。読み上げで断り書きをくり返さない。
- 最後は問いかけ（endQuestion）で締める。

# 投稿文
- postCaption と hashtags は、企画の投稿文（caption・hashtags）をもとに、完成した台本の内容に合わせて書く。
- 投稿文には答えやオチを書かない（動画を見たくなるようにする）。

# 事実の扱い
- 確かだと言える事実と数値だけを使う。数字を作らない。自信のない事実は、使わずに言い換えるのを優先する。
- 使った事実・数値はすべて facts に書き出し、確からしさを正直に評価する。low のものはオーナーが確認する。

# このアカウント固有のルール
${rules || "- 特になし"}`;
}

export interface ScriptRequest {
  account: Account;
  proposal: Proposal;
  revision?: { instruction: string; previous: VideoScript };
}

export async function runScriptAgent(req: ScriptRequest): Promise<VideoScript> {
  const parts = [`# 承認された企画\n${JSON.stringify(req.proposal, null, 2)}`];
  if (req.revision) {
    parts.push(
      `# 前回の台本\n${JSON.stringify(req.revision.previous, null, 2)}`,
      `# 修正指示\n「${req.revision.instruction || "全体的に見直してほしい"}」\nこの指示を反映して台本を書き直してください。`,
    );
  } else {
    parts.push("# 依頼\nこの企画の台本を書いてください。");
  }
  return generateStructured({
    label: `台本:${req.account.id}`,
    schema: VideoScriptSchema,
    effort: "high",
    system: systemPrompt(req.account),
    prompt: parts.join("\n\n"),
  });
}

/** 確認が必要な事実（確からしさが low のもの） */
export function factsToCheck(script: VideoScript): VideoScript["facts"] {
  return script.facts.filter((f) => f.confidence === "low");
}
