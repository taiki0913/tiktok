import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CODE_PRODUCIBLE, isPlanningDay, loadAccounts } from "../src/config/accounts.js";
import { PlanSchema, ResearchBriefSchema, type AccountDayState, type Proposal } from "../src/domain.js";
import { extractTikTokUrls } from "../src/research/tiktokOembed.js";
import { isJapaneseTitle, parseIsoDuration, toVideos } from "../src/research/youtube.js";
import {
  ACTIONS,
  accountBlocks,
  ButtonValueSchema,
  countDecided,
  referencePromptBlocks,
  summaryBlocks,
} from "../src/slack/blocks.js";
import { Store } from "../src/store/store.js";
import { mapWithLimit } from "../src/util/concurrency.js";
import { dateInTz, daysBefore, formatJpDate, hourInTz } from "../src/util/date.js";

const accounts = await loadAccounts("config/accounts.yaml");

const proposal = (title: string): Proposal => ({
  title,
  hook: "つかみ",
  summary: "概要",
  outline: ["0-3秒 問い", "3-60秒 展開", "60-70秒 オチ"],
  lengthSec: 70,
  caption: "投稿文",
  hashtags: ["雑学", "日本史"],
  basedOn: "根拠",
  originality: "独自性",
});

const state = (over: Partial<AccountDayState>): AccountDayState => ({
  accountId: "history",
  status: "awaiting_approval",
  revisions: [],
  updatedAt: "2026-10-16T00:00:00Z",
  ...over,
});

test("accounts.yaml: 6アカウントがすべて読み込める", () => {
  assert.equal(accounts.length, 6);
  assert.deepEqual(
    accounts.map((a) => a.production).sort(),
    ["manga", "motion_graphics", "polygon", "polygon", "polygon", "polygon"],
  );
  for (const a of accounts) assert.ok(a.lengthSec[0] >= 60, `${a.id} は60秒以上`);
});

test("企画を作る日：毎日のアカウントと2日に1回のアカウントがあり、休止中のアカウントは作らない", () => {
  const on = (date: string) => accounts.filter((a) => isPlanningDay(a, date)).map((a) => a.id).sort();
  // 日本史は毎日、宇宙と深海（group 0）と心理学（group 1）は2日に1回で交互、都市伝説・漫画・未来は休止
  assert.deepEqual(on("2026-10-24"), ["cosmos", "history"]);
  assert.deepEqual(on("2026-10-25"), ["history", "psychology"]);
  // 月をまたいでも1日おきのまま（10/31 と 11/1 は別の組）
  assert.notDeepEqual(on("2026-10-31"), on("2026-11-01"));
  // 作る日のアカウントは、すべてコードで動画にできる作り方
  for (const a of accounts.filter((x) => x.active)) assert.ok(CODE_PRODUCIBLE.includes(a.production), a.id);
});

test("日付ユーティリティ", () => {
  // UTC 2026-10-15 20:00 は日本時間 10/16 5:00
  const d = new Date("2026-10-15T20:00:00Z");
  assert.equal(dateInTz(d, "Asia/Tokyo"), "2026-10-16");
  assert.equal(hourInTz(d, "Asia/Tokyo"), 5);
  assert.equal(formatJpDate("2026-10-16"), "10/16(金)");
  assert.equal(daysBefore("2026-03-01", 1), "2026-02-28");
});

test("YouTube: 動画時間の変換とショートの絞り込み", () => {
  assert.equal(parseIsoDuration("PT1M5S"), 65);
  assert.equal(parseIsoDuration("PT45S"), 45);
  assert.equal(parseIsoDuration("PT1H"), 3600);
  assert.ok(Number.isNaN(parseIsoDuration("bad")));

  const now = new Date("2026-10-16T00:00:00Z");
  const videos = toVideos(
    {
      items: [
        {
          id: "short1",
          snippet: { title: "短い", channelTitle: "ch", publishedAt: "2026-10-14T00:00:00Z" },
          contentDetails: { duration: "PT58S" },
          statistics: { viewCount: "20000", likeCount: "100" },
        },
        {
          id: "long1",
          snippet: { title: "長い", channelTitle: "ch", publishedAt: "2026-10-14T00:00:00Z" },
          contentDetails: { duration: "PT10M" },
          statistics: { viewCount: "50000" },
        },
      ],
    },
    now,
  );
  assert.equal(videos.length, 1);
  assert.equal(videos[0]!.viewsPerDay, 10000);
  assert.equal(videos[0]!.commentCount, null);
  assert.equal(videos[0]!.url, "https://www.youtube.com/shorts/short1");
});

test("YouTube: 日本語タイトルの判定", () => {
  assert.ok(isJapaneseTitle("【江戸時代】夜の明かり"));
  assert.ok(isJapaneseTitle("マイクラ"));
  assert.ok(!isJapaneseTitle("Ranking Weirdest Sea Creatures"));
  assert.ok(!isJapaneseTitle("cat meme 😂"));
});

test("TikTok URL の抽出（Slack の <url|表示> 形式を含む）", () => {
  const text =
    "これ伸びてる <https://www.tiktok.com/@user/video/123|tiktok.com/@user/video/123> と https://vt.tiktok.com/ZSabc/";
  assert.deepEqual(extractTikTokUrls(text), [
    "https://www.tiktok.com/@user/video/123",
    "https://vt.tiktok.com/ZSabc/",
  ]);
  assert.deepEqual(extractTikTokUrls("関係ないURL https://example.com"), []);
});

test("構造化出力のスキーマが Claude API 用に変換できる", () => {
  for (const schema of [PlanSchema, ResearchBriefSchema]) {
    const format = betaZodOutputFormat(schema);
    assert.equal(format.type, "json_schema");
    assert.equal(format.schema.type, "object");
  }
});

test("Slack: 承認待ちメッセージに3案の決定ボタンが付く", () => {
  const account = accounts[0]!;
  const blocks = accountBlocks(
    "2026-10-16",
    account,
    0,
    state({ proposals: [proposal("案1"), proposal("案2"), proposal("案3")] }),
  );
  const buttons = blocks.flatMap((b) =>
    b.type === "section" && b.accessory?.type === "button" ? [b.accessory] : [],
  );
  assert.equal(buttons.length, 3);
  assert.deepEqual(
    buttons.map((b) => ButtonValueSchema.parse(JSON.parse(b.value!))),
    [0, 1, 2].map((i) => ({ d: "2026-10-16", a: account.id, i })),
  );
  assert.ok(buttons.every((b) => b.action_id === ACTIONS.approve));
  assert.ok(blocks.length <= 50, "Slack の上限は1メッセージ50ブロック");
});

test("Slack: 決定数の集計と一覧", () => {
  const day = {
    date: "2026-10-16",
    accounts: {
      history: state({ status: "approved", selectedIndex: 1, proposals: [proposal("A"), proposal("B")] }),
      urban_legend: state({ accountId: "urban_legend", status: "skipped" }),
      cosmos: state({ accountId: "cosmos", status: "awaiting_approval" }),
    },
  };
  assert.deepEqual(countDecided(day, accounts), { decided: 2, total: 3 });
  const text = JSON.stringify(summaryBlocks(day, accounts));
  assert.match(text, /案B「B」/);
  assert.match(text, /決定 2\/3/);
});

test("Slack: 参考動画の振り分けボタンは全アカウント分で、値が2000文字以内", () => {
  const blocks = referencePromptBlocks("あ".repeat(1000), "user", "https://www.tiktok.com/@u/video/1", accounts);
  const actions = blocks.find((b) => b.type === "actions");
  assert.ok(actions && actions.type === "actions");
  assert.equal(actions.elements.length, accounts.length);
  for (const el of actions.elements) {
    assert.ok(el.type === "button" && (el.value?.length ?? 0) <= 2000);
  }
});

test("Store: 同時に更新しても内容が失われない", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tiktok-agents-"));
  try {
    const store = new Store(dir);
    await mapWithLimit(accounts, 6, (a) =>
      store.updateAccount("2026-10-16", a.id, (s) => {
        s.status = "awaiting_approval";
      }),
    );
    const day = await store.getDay("2026-10-16");
    assert.equal(Object.keys(day!.accounts).length, 6);

    await store.updateDay("2026-10-15", () => {});
    await store.updateDay("2026-10-14", () => {});
    const recent = await store.recentDays("2026-10-16", 14);
    assert.deepEqual(recent.map((d) => d.date), ["2026-10-15", "2026-10-14"]);

    const ref = { accountId: "history", url: "u", caption: "c", authorName: "a", addedAt: "t" };
    await store.addReference(ref);
    await store.addReference(ref);
    assert.equal((await store.listReferences()).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
