// 競合調査エージェント（企画エージェントのサブエージェント）。
// 公式データだけを集め、企画エージェントには「結果だけ」をまとめた ResearchBrief を渡す。
import type { Account } from "../config/accounts.js";
import { env } from "../config/env.js";
import { ResearchBriefSchema, type ReferenceVideo, type ResearchBrief } from "../domain.js";
import { generateStructured, researchWithWebSearch } from "../llm/claude.js";
import { collectTrendingShorts, type YouTubeVideo } from "./youtube.js";

export interface ResearchInputs {
  youtube: YouTubeVideo[];
  references: ReferenceVideo[];
  webMemo: string | null;
  notes: string[];
}

async function gatherInputs(
  account: Account,
  date: string,
  references: ReferenceVideo[],
): Promise<ResearchInputs> {
  const notes: string[] = [];

  let youtube: YouTubeVideo[] = [];
  if (!env.YOUTUBE_API_KEY) {
    notes.push("YOUTUBE_API_KEY が未設定のため YouTube 調査をスキップ");
  } else if (account.research.youtubeQueries.length > 0) {
    try {
      youtube = await collectTrendingShorts(env.YOUTUBE_API_KEY, account.research.youtubeQueries, {
        japaneseOnly: account.research.japaneseOnly,
      });
    } catch (e) {
      notes.push(`YouTube 調査に失敗: ${(e as Error).message}`);
    }
  }

  let webMemo: string | null = null;
  if (env.RESEARCH_WEB_SEARCH && account.research.webSearchHint) {
    try {
      webMemo = await researchWithWebSearch({
        label: `web調査:${account.id}`,
        maxSearches: 5,
        system:
          "あなたは日本のショート動画チャンネルのリサーチ担当です。Web検索で事実を確認し、" +
          "ショート動画のネタになる話題だけを簡潔に報告します。推測と事実を区別し、出典URLを必ず添えてください。",
        prompt:
          `今日は ${date} です。ジャンル「${account.genre}」について、` +
          `「${account.research.webSearchHint}」を調べてください。\n` +
          "ショート動画のネタになりそうな話題を最大8件、次の形式の箇条書きで答えてください。\n" +
          "- 話題: … / なぜ今か: … / 出典: URL",
      });
    } catch (e) {
      notes.push(`Web 調査に失敗: ${(e as Error).message}`);
    }
  }

  return { youtube, references, webMemo, notes };
}

function formatInputs(inputs: ResearchInputs): string {
  const yt =
    inputs.youtube.length === 0
      ? "（データなし）"
      : inputs.youtube
          .map(
            (v, i) =>
              `${i + 1}. 「${v.title}」 ${v.channelTitle} / ${v.durationSec}秒 / ` +
              `再生${v.viewCount.toLocaleString()}（1日あたり${v.viewsPerDay.toLocaleString()}） / ` +
              `いいね${v.likeCount ?? "?"} / コメント${v.commentCount ?? "?"} / ${v.url}`,
          )
          .join("\n");
  const refs =
    inputs.references.length === 0
      ? "（なし）"
      : inputs.references
          .map((r) => `- 「${r.caption}」 @${r.authorName} ${r.url}`)
          .join("\n");
  return [
    "## YouTubeショート：直近7日で伸びている同ジャンル動画（1日あたり再生数の多い順）",
    yt,
    "## オーナーが参考に指定したTikTok動画（キャプションのみ）",
    refs,
    "## Web検索で見つけた今週の話題",
    inputs.webMemo ?? "（データなし）",
  ].join("\n\n");
}

export async function runResearch(
  account: Account,
  date: string,
  references: ReferenceVideo[],
): Promise<ResearchBrief> {
  const inputs = await gatherInputs(account, date, references);
  for (const n of inputs.notes) console.warn(`[research:${account.id}] ${n}`);

  return generateStructured({
    label: `競合調査:${account.id}`,
    schema: ResearchBriefSchema,
    effort: "medium",
    system:
      "あなたはTikTok運用チームの競合調査担当です。集めたデータを分析し、企画担当がすぐ使える要点だけを渡します。" +
      "データにないことを作らないでください。データが少ない場合は、その旨を trendSummary に書いてください。",
    prompt: [
      `# 対象アカウント\n${account.name}（ジャンル: ${account.genre} / ターゲット: ${account.target}）`,
      `# 調査日\n${date}`,
      `# 集めたデータ\n${formatInputs(inputs)}`,
      "# 依頼\nこのジャンルで今伸びている傾向・勝ちパターン・使える話題・参考動画・避けるべきものをまとめてください。",
    ].join("\n\n"),
  });
}
