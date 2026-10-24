// 続きもの（コメントで展開が決まる物語）のこれまでの話。
// 公開OKにした日の動画を1話として数え、台本に書いた2択と、オーナーが入力したコメントの結果をつなげる。
import type { Account } from "../config/accounts.js";
import type { AudienceChoice, SeriesChoices } from "../domain.js";
import type { Store } from "../store/store.js";

/** 続きものを何日分さかのぼって読むか（全20話前後・2日に1話を想定して余裕をもたせる） */
const LOOKBACK_DAYS = 400;

export interface Episode {
  number: number;
  date: string;
  title: string;
  summary: string;
  choices: SeriesChoices;
  chosen?: AudienceChoice;
}

/** date より前に公開OKにした話を、古い順に返す */
export async function loadEpisodes(store: Store, account: Account, date: string): Promise<Episode[]> {
  const days = (await store.recentDays(date, LOOKBACK_DAYS)).reverse();
  const episodes: Episode[] = [];
  for (const day of days) {
    const s = day.accounts[account.id];
    const script = s?.production?.script;
    if (s?.production?.status !== "approved" || !script?.choices) continue;
    episodes.push({
      number: episodes.length + 1,
      date: day.date,
      title: script.title,
      summary: script.episodeSummary ?? script.scenes.map((x) => x.caption).join(" / "),
      choices: script.choices,
      chosen: s.audienceChoice,
    });
  }
  return episodes;
}

/** 前回の話の結果をまだ聞いていなければ、その話を返す */
export function pendingEpisode(episodes: Episode[]): Episode | undefined {
  const last = episodes.at(-1);
  return last && !last.chosen ? last : undefined;
}

export function describeChoice(e: Episode): string {
  const c = e.chosen;
  if (!c) return "（結果はまだ）";
  switch (c.pick) {
    case "A":
      return `A「${e.choices.a}」`;
    case "B":
      return `B「${e.choices.b}」`;
    case "other":
      return `どちらでもない：${c.note ?? ""}`;
    case "auto":
      return "コメントがなかったので、物語として自然な方を選ぶ（おまかせ）";
  }
}

/** 企画・台本のエージェントに渡す、シリーズの説明とこれまでの話 */
export function seriesBrief(account: Account, episodes: Episode[]): string {
  const series = account.series;
  if (!series) return "";
  const next = episodes.length + 1;
  const log = episodes
    .map((e) => `- 第${e.number}話「${e.title}」：${e.summary}\n  最後の2択 A「${e.choices.a}」/ B「${e.choices.b}」→ 視聴者の選択：${describeChoice(e)}`)
    .join("\n");
  return [
    `# 続きもの「${series.title}」`,
    `## 物語の前提\n${series.premise.trim()}`,
    `## 主人公\n${series.protagonist.trim()}`,
    `## 2択の決まりごと\n${series.choiceRule.trim()}`,
    `## これまでの話\n${log || "（まだありません。今回が第1話です）"}`,
    `## 今回\n第${next}話。${episodes.length > 0 ? `前回の視聴者の選択（${describeChoice(episodes.at(-1)!)}）の結果から話を続ける。` : "物語の始まり。状況と主人公を伝え、最初の2択で終える。"}`,
  ].join("\n\n");
}

/** 前回の話（episodeDate の日の動画）について、視聴者が選んだものを記録する */
export async function recordChoice(store: Store, accountId: string, episodeDate: string, choice: AudienceChoice): Promise<void> {
  await store.updateAccount(episodeDate, accountId, (s) => {
    s.audienceChoice = choice;
  });
}
