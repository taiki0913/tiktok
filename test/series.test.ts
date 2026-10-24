import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadAccounts } from "../src/config/accounts.js";
import type { AccountDayState, DayState } from "../src/domain.js";
import { planAccount } from "../src/jobs/planning.js";
import type { VideoScript } from "../src/production/scriptAgent.js";
import { loadEpisodes, pendingEpisode, recordChoice, seriesBrief } from "../src/series/series.js";
import { ACTIONS, accountBlocks, summaryBlocks } from "../src/slack/blocks.js";
import { Store } from "../src/store/store.js";

const accounts = await loadAccounts("config/accounts.yaml");
const cosmos = accounts.find((a) => a.id === "cosmos")!;

const script = (n: number, a: string, b: string) =>
  ({
    title: `第${n}話　テスト`,
    scenes: [{ narration: "n", caption: "c", visual: "v", onScreen: [] }],
    endQuestion: `A：${a}　B：${b}　コメントで決めて`,
    sources: [],
    facts: [],
    postCaption: "p",
    hashtags: [],
    choices: { a, b },
    episodeSummary: `第${n}話のあらすじ。酸素は残り${72 - n * 6}時間`,
  }) as VideoScript;

async function addEpisode(store: Store, date: string, s: VideoScript | undefined, status: "approved" | "review" = "approved") {
  await store.updateAccount(date, cosmos.id, (st) => {
    st.status = "approved";
    st.selectedIndex = 0;
    st.production = { status, version: 1, warnings: [], revisions: [], ...(s ? { script: s } : {}) };
  });
}

test("accounts.yaml：宇宙と深海は続きもので、主人公と2択の決まりごとがある", () => {
  assert.equal(cosmos.series?.title, "深海8000mからの生還");
  assert.match(cosmos.series?.protagonist ?? "", /ナギ/);
  // 参考にしたアカウントの主人公と名前がかぶらないこと
  for (const a of accounts) assert.doesNotMatch(JSON.stringify(a), /湊|ミナト/, a.id);
});

test("続きもの：公開OKにした日の、2択のある動画だけを古い順に1話ずつ数える", async () => {
  const dir = await mkdtemp(join(tmpdir(), "series-"));
  try {
    const store = new Store(dir);
    await addEpisode(store, "2026-10-20", undefined); // 続きもの以前の雑学の動画（2択なし）
    await addEpisode(store, "2026-10-22", script(1, "ハッチを開ける", "救助を待つ"));
    await addEpisode(store, "2026-10-24", script(2, "ライトを消す", "アームを伸ばす"), "review"); // 公開OK前
    const episodes = await loadEpisodes(store, cosmos, "2026-10-26");
    assert.deepEqual(episodes.map((e) => [e.number, e.date]), [[1, "2026-10-22"]]);
    assert.equal(pendingEpisode(episodes)?.date, "2026-10-22");

    await recordChoice(store, cosmos.id, "2026-10-22", { pick: "B", at: "x" });
    const after = await loadEpisodes(store, cosmos, "2026-10-26");
    assert.equal(pendingEpisode(after), undefined);
    const brief = seriesBrief(cosmos, after);
    assert.match(brief, /第1話「第1話　テスト」/);
    assert.match(brief, /視聴者の選択：B「救助を待つ」/);
    assert.match(brief, /第2話。前回の視聴者の選択/);
    assert.match(brief, /酸素は残り66時間/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("続きもの：前回の結果をまだ聞いていなければ、企画を作る前に Slack で聞く（Claude は呼ばない）", async () => {
  const dir = await mkdtemp(join(tmpdir(), "series-"));
  try {
    const store = new Store(dir);
    await addEpisode(store, "2026-10-22", script(1, "ハッチを開ける", "救助を待つ"));
    const seen: AccountDayState[] = [];
    const notifier = {
      prepareDay: async () => {},
      summaryUpdated: async () => {},
      accountUpdated: async (_d: string, _a: unknown, s: AccountDayState) => void seen.push(s),
    };
    const state = await planAccount({ store, notifier, accounts }, cosmos, "2026-10-24");
    assert.equal(state.status, "awaiting_choice");
    assert.deepEqual(state.seriesAsk, { episode: 1, date: "2026-10-22", choices: { a: "ハッチを開ける", b: "救助を待つ" } });

    const blocks = JSON.stringify(accountBlocks("2026-10-24", cosmos, 2, state));
    assert.match(blocks, /第1話のコメントは/);
    assert.match(blocks, new RegExp(`${ACTIONS.seriesChoice}:A`));
    assert.match(blocks, /A：ハッチを開ける/);
    assert.match(blocks, new RegExp(ACTIONS.seriesChoiceOpen));
    const day: DayState = { date: "2026-10-24", accounts: { cosmos: state } };
    assert.match(JSON.stringify(summaryBlocks(day, accounts)), /コメントの結果待ち/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
