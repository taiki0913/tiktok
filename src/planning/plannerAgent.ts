// 企画エージェント。競合調査の結果と過去の採用履歴をもとに、アカウントごとに3案を出す。
import { PRODUCTION_STYLES, type Account } from "../config/accounts.js";
import { PlanSchema, type DayState, type Proposal, type ResearchBrief, type ReviewSummary } from "../domain.js";
import { generateStructured } from "../llm/claude.js";
import { formatJpDate } from "../util/date.js";

export const PROPOSALS_PER_ACCOUNT = 3;

function systemPrompt(account: Account): string {
  const rules = account.rules.map((r) => `- ${r}`).join("\n");
  return `あなたはTikTokアカウント「${account.name}」の企画担当です。毎朝${PROPOSALS_PER_ACCOUNT}つの企画案を出し、オーナーがその中から1つを選びます。

# アカウント設定
- ジャンル: ${account.genre}
- コンセプト: ${account.concept.trim()}
- ターゲット: ${account.target}
- トーン: ${account.tone}
- 動画の作り方: ${PRODUCTION_STYLES[account.production]}${account.visual ? `\n- 見た目の方針: ${account.visual}` : ""}
- 尺: ${account.lengthSec[0]}〜${account.lengthSec[1]}秒

# 企画の条件
- ${account.lengthSec[0] >= 60 ? "収益化（TikTok Creator Rewards Program）を目指すため、尺は必ず60秒以上にする。" : `いまはフォロワーを増やす段階。収益化の条件（60秒以上）より、最後まで見られる短さを優先し、尺は${account.lengthSec[0]}〜${account.lengthSec[1]}秒にする。`}
- オリジナルの企画にする。他人の動画の焼き直し・転載・まとめ動画にしない。
${
  account.series
    ? "- hook には、その話でいちばんの危機を数字入りで1文で書く（例：酸素は残り18時間）。"
    : account.format
      ? `- 企画と台本の型（必ず守る）：${account.format.trim()}`
      : `- hook には「このジャンルが好きな人でも8割は知らない、具体的な事実」を1文で書く。書けない企画は出さない。よく知られた雑学（定番ネタ）は、その題材のいちばん意外な逸話を入口にできるときだけ使う。
- 冒頭で答えや人物名を明かさない構成にする。答えは尺の6割までに出し、答えのあとは5秒以内で締める。`
}
- 競合調査の動画は「伸びる型」を学ぶ参考にとどめ、内容をなぞらない。このアカウントならではの切り口・語り・構成で差をつける。
- 冒頭2秒で離脱を防ぐつかみを入れ、最後まで見たくなる流れ（問い→展開→答えやオチ）にする。${account.series ? "" : "暗転してコメントを促す締めの画面は作らない（最後の場面で終える）。コメントしたくなる問いかけは投稿文（caption）に入れる。"}
- テンポを最優先する。1文を短くし、2〜3秒ごとに新しい情報か映像の変化を入れる。
- 事実・説・推測の区別は、テロップのラベル（「通説」「新説」「想像図」など）やパートの切り替えで一度示せば十分とする。ナレーションで「可能性」「推測」などの断り書きを毎回くり返さない。
- 上の「動画の作り方」で実際に作れる企画にする。人物の実写撮影や演技が必要な企画は出さない。
- ${PROPOSALS_PER_ACCOUNT}案は方向性を変える。案1は競合調査で今伸びている話題や型に乗る企画、案2はこのジャンルの定番で外さない企画、案3は少し実験的な切り口の企画にする。
- 過去に出した企画と同じネタは避ける。オーナーの過去の修正指示は好みとして反映する。

# このアカウント固有のルール
${rules || "- 特になし"}`;
}

/** 投稿した結果（再生数など）の短い説明 */
function reviewText(r: ReviewSummary): string {
  return [
    r.views !== null ? `再生${r.views.toLocaleString("ja-JP")}回` : "",
    r.avgWatchSec !== null ? `平均視聴${r.avgWatchSec}秒` : "",
    r.fullWatchPercent !== null ? `完全視聴${r.fullWatchPercent}%` : "",
  ]
    .filter(Boolean)
    .join("・");
}

/** 過去の企画。同じTikTokアカウントのもう1本（ids）の企画もまとめて見せる */
export function historySection(ids: string[], history: DayState[]): string {
  const lines: string[] = [];
  const revisions: string[] = [];
  for (const day of history) for (const id of ids) {
    const s = day.accounts[id];
    if (!s?.proposals) continue;
    const titles = s.proposals.map((p, i) => ({ title: p.title, adopted: i === s.selectedIndex }));
    const result = s.review ? `（${reviewText(s.review)}）` : "";
    const adopted = titles.filter((t) => t.adopted).map((t) => `「${t.title}」${result}`);
    const rejected = titles.filter((t) => !t.adopted).map((t) => `「${t.title}」`);
    lines.push(
      `- ${formatJpDate(day.date)} 採用: ${adopted.join("") || (s.status === "skipped" ? "（スキップ）" : "（未決定）")}` +
        ` / 不採用: ${rejected.join("") || "なし"}`,
    );
    for (const r of s.revisions) revisions.push(`- ${formatJpDate(day.date)}: ${r.instruction}`);
  }
  return [
    "# 過去の企画（同じネタは避けること。採用された企画の傾向はオーナーの好み。数字が付いた企画は投稿した結果なので、伸びた企画の題材の選び方・切り口・つかみの型を優先して取り入れる）",
    lines.join("\n") || "（まだありません）",
    "# オーナーの過去の修正指示",
    revisions.join("\n") || "（まだありません）",
  ].join("\n\n");
}

export interface PlanRequest {
  account: Account;
  date: string;
  research: ResearchBrief;
  history: DayState[];
  revision?: { instruction: string; previous: Proposal[] };
  /** 続きもののとき：シリーズの説明とこれまでの話 */
  seriesBrief?: string;
  /** これまでのレビューからの学び */
  lessons?: string;
  /** 過去の企画を見るアカウントID（同じTikTokアカウントのもう1本を含む。省略時はこのアカウントだけ） */
  relatedIds?: string[];
  /** 同じ日に、同じTikTokアカウントのもう1本で出ている企画案（題材をかぶらせない） */
  sameDay?: Proposal[];
}

/** 同じ日のもう1本の企画案 */
export function sameDaySection(proposals: Proposal[]): string {
  return `# 今日のもう1本（同じアカウントで別の時刻に投稿する）の企画案
${proposals
    .map((p) => `- ${p.title}：${p.summary}`)
    .join("\n")}\nこれらとは別の人物・時代・題材にする（同じ日に似た動画が並ばないように）。`;
}

/** 続きものの企画の決まりごと（通常の「3案は方向性を変える」の代わり） */
const SERIES_PLANNING = `# 続きものの企画
- ${PROPOSALS_PER_ACCOUNT}案は、どれも同じ「次の話」の、展開の違う案にする（案1は王道の展開、案2は意外な展開、案3は深海の科学の見せ場が多い展開）。
- どの案も、前回の視聴者の選択の結果から始め、最後は次の2択で終える。outline の最後に、その2択（A・B）を書く。
- title は「第N話　〇〇」の形にする。
- 1話で話を進めすぎない。視聴者が「続きが見たい」と思うところで終える。`;

export async function runPlanner(req: PlanRequest): Promise<Proposal[]> {
  const parts = [
    ...(req.seriesBrief ? [req.seriesBrief] : []),
    `# 今日の日付\n${req.date}`,
    `# 競合調査の結果\n${JSON.stringify(req.research, null, 2)}`,
    historySection(req.relatedIds ?? [req.account.id], req.history),
    ...(req.sameDay?.length ? [sameDaySection(req.sameDay)] : []),
    ...(req.lessons ? [req.lessons] : []),
  ];
  if (req.revision) {
    const prev = req.revision.previous.map((p, i) => `${i + 1}. ${p.title}：${p.summary}`).join("\n");
    parts.push(
      `# 今回の修正指示\nオーナーは次の案に対して修正を指示しました。\n${prev}\n\n` +
        `指示: 「${req.revision.instruction || "全体的に作り直してほしい"}」\n` +
        `この指示を反映した新しい${PROPOSALS_PER_ACCOUNT}案を出してください。`,
    );
  } else {
    parts.push(`# 依頼\n今日の企画を${PROPOSALS_PER_ACCOUNT}案出してください。`);
  }

  const { proposals } = await generateStructured({
    label: `企画:${req.account.id}`,
    schema: PlanSchema,
    effort: "high",
    system: req.seriesBrief ? `${systemPrompt(req.account)}\n\n${SERIES_PLANNING}` : systemPrompt(req.account),
    prompt: parts.join("\n\n"),
  });
  if (proposals.length === 0) throw new Error("企画案が1つも返ってきませんでした");
  return proposals.slice(0, PROPOSALS_PER_ACCOUNT);
}
