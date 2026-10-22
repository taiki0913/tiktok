import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadAccounts } from "../src/config/accounts.js";
import type { AccountDayState, ProductionState } from "../src/domain.js";
import { markQueued, pickBgm, produceVideo, type ProductionNotifier } from "../src/production/pipeline.js";
import { VoicevoxClient } from "../src/production/voicevox.js";
import { accountBlocks, ACTIONS, failureBlocks, isProductionBusy, productionLine, reviewBlocks } from "../src/slack/blocks.js";
import { Store } from "../src/store/store.js";
import { computeTimeline, DEFAULT_TIMELINE } from "../video/kit/job.js";

const accounts = await loadAccounts("config/accounts.yaml");

test("タイムライン：ナレーションの長さから場面の位置を決め、60秒に満たなければ間を広げる", () => {
  const t = computeTimeline([10, 20, 15], { ...DEFAULT_TIMELINE, minTotalSec: 0 });
  assert.deepEqual(t.scenes.map((s) => s.from), [0, 320, 931]);
  assert.equal(t.scenes[0]!.audioFrom, 9); // 最初の間 0.3秒
  assert.equal(t.durationInFrames, t.endCardFrom + 120); // 締めの画面 4秒

  const padded = computeTimeline([10, 20, 15]);
  assert.ok(padded.durationInFrames / 30 >= 61, `${padded.durationInFrames / 30}秒`);
});

test("BGM：フォルダの音源から毎回同じ曲を選び、無ければ null", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bgm-"));
  try {
    assert.equal(await pickBgm("cosmos", "job-1", dir), null);
    await mkdir(join(dir, "cosmos"));
    for (const f of ["a.mp3", "b.wav", "memo.txt"]) await writeFile(join(dir, "cosmos", f), "");
    const first = await pickBgm("cosmos", "job-1", dir);
    assert.match(first ?? "", /\.(mp3|wav)$/);
    assert.equal(await pickBgm("cosmos", "job-1", dir), first);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("作り直すたびに版が進み、指示と前回の台本を引き継ぐ", async () => {
  const dir = await mkdtemp(join(tmpdir(), "store-"));
  try {
    const store = new Store(dir);
    const first = await markQueued(store, "2026-10-19", "cosmos");
    assert.equal(first.production?.version, 1);
    await store.updateAccount("2026-10-19", "cosmos", (s) => {
      s.production!.status = "review";
      s.production!.jobId = "2026-10-19-cosmos-v1";
      s.production!.slackReviewTs = "123";
    });
    const second = await markQueued(store, "2026-10-19", "cosmos", { instruction: "冒頭を派手に", mode: "visual" });
    assert.equal(second.production?.version, 2);
    assert.equal(second.production?.status, "queued");
    assert.equal(second.production?.jobId, "2026-10-19-cosmos-v1");
    assert.equal(second.production?.slackReviewTs, undefined);
    assert.deepEqual(second.production?.revisions.map((r) => r.mode), ["visual"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("失敗した回を指示なしでやり直すと、その回のジョブを引き継ぐ（指示つきの作り直しは引き継がない）", async () => {
  const dir = await mkdtemp(join(tmpdir(), "store-"));
  try {
    const store = new Store(dir);
    await markQueued(store, "2026-10-19", "cosmos");
    await store.updateAccount("2026-10-19", "cosmos", (s) => {
      s.production!.status = "failed";
      s.production!.jobId = "2026-10-19-cosmos-v1";
    });
    const retry = await markQueued(store, "2026-10-19", "cosmos");
    assert.equal(retry.production?.retryOf, "2026-10-19-cosmos-v1");
    assert.equal(retry.production?.version, 2);

    await store.updateAccount("2026-10-19", "cosmos", (s) => {
      s.production!.status = "review";
    });
    const revised = await markQueued(store, "2026-10-19", "cosmos", { instruction: "暗くして", mode: "visual" });
    assert.equal(revised.production?.retryOf, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Slack：動画づくりに失敗したら、企画のメッセージにも『もう一度作る』ボタンを出す", () => {
  const cosmos = accounts.find((a) => a.id === "cosmos")!;
  const state = (status: ProductionState["status"]): AccountDayState => ({
    accountId: "cosmos",
    status: "approved",
    selectedIndex: 0,
    proposals: [{ title: "t", hook: "h", summary: "s", outline: [], lengthSec: 70, caption: "c", hashtags: [], basedOn: "b", originality: "o" }],
    production: { status, version: 1, warnings: [], revisions: [] },
    revisions: [],
    updatedAt: "",
  });
  assert.match(JSON.stringify(accountBlocks("d", cosmos, 2, state("failed"))), new RegExp(ACTIONS.videoRetry));
  assert.doesNotMatch(JSON.stringify(accountBlocks("d", cosmos, 2, state("coding"))), new RegExp(ACTIONS.videoRetry));
});

test("漫画・AI映像のアカウントは『準備中』になり、Claude を呼ばない", async () => {
  const dir = await mkdtemp(join(tmpdir(), "store-"));
  try {
    const store = new Store(dir);
    const manga = accounts.find((a) => a.production === "manga")!;
    await store.updateAccount("2026-10-19", manga.id, (s) => {
      s.status = "approved";
      s.selectedIndex = 0;
      s.proposals = [
        { title: "t", hook: "h", summary: "s", outline: [], lengthSec: 70, caption: "c", hashtags: [], basedOn: "b", originality: "o" },
      ];
    });
    await markQueued(store, "2026-10-19", manga.id);
    const seen: (ProductionState["status"] | undefined)[] = [];
    const notifier: ProductionNotifier = {
      productionUpdated: async (_d, _a, state: AccountDayState) => {
        seen.push(state.production?.status);
      },
    };
    await produceVideo(
      { store, notifier, voicevox: new VoicevoxClient("http://127.0.0.1:9"), render: {}, videosDir: dir },
      manga,
      "2026-10-19",
    );
    assert.deepEqual(seen, ["unsupported"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Slack：動画の進み具合と、確認・失敗のメッセージ", () => {
  const base: ProductionState = { status: "coding", version: 2, warnings: [], revisions: [] };
  assert.ok(isProductionBusy(base));
  assert.match(productionLine(base), /映像を作成中.*2回目/);

  const cosmos = accounts.find((a) => a.id === "cosmos")!;
  const review = reviewBlocks("2026-10-19", cosmos, {
    ...base,
    status: "review",
    durationSec: 72,
    agentSummary: "深海を潜る構成",
    factsToCheck: [{ claim: "水深8336m", basis: "2023年発表" }],
    warnings: ["BGM がありません"],
    costUsd: 0.84,
  });
  const text = JSON.stringify(review);
  assert.match(text, /約72秒/);
  assert.match(text, /確認してほしい事実/);
  assert.match(text, /約\$0\.84/);
  assert.match(text, new RegExp(ACTIONS.videoApprove));
  assert.match(text, new RegExp(ACTIONS.videoReviseOpen));

  assert.doesNotMatch(JSON.stringify(reviewBlocks("d", cosmos, { ...base, status: "approved" })), /video_approve/);
  assert.match(JSON.stringify(failureBlocks("d", "a", { ...base, status: "failed", error: "boom" })), /boom/);
});
