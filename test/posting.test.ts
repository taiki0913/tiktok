import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadAccounts } from "../src/config/accounts.js";
import type { AccountDayState, ProductionState, Proposal } from "../src/domain.js";
import { buildCaption, decidePostTime, Publisher } from "../src/posting/publisher.js";
import { interpretStatus, readPublishRef, type PostCheck, type PostingService, type PublishRequest } from "../src/posting/uploadPost.js";
import { ACTIONS, accountBlocks, productionLine, reviewBlocks } from "../src/slack/blocks.js";
import { Store } from "../src/store/store.js";
import { zonedTimeToUtc } from "../src/util/date.js";

const accounts = await loadAccounts("config/accounts.yaml");
const cosmos = accounts.find((a) => a.id === "cosmos")!; // 投稿時刻 20:00
const TZ = "Asia/Tokyo";
const DATE = "2026-10-22";
const at = (hhmm: string, date = DATE): Date => zonedTimeToUtc(date, hhmm, TZ);

const proposal: Proposal = {
  title: "t",
  hook: "h",
  summary: "s",
  outline: [],
  lengthSec: 70,
  caption: "深海8000mの先に魚はいない",
  hashtags: ["深海", "#雑学", "宇宙 の ふしぎ", "深海"],
  basedOn: "b",
  originality: "o",
};

class FakeService implements PostingService {
  requests: PublishRequest[] = [];
  canceled: string[] = [];
  fail: string | null = null;
  next: PostCheck = { state: "pending" };
  async publish(req: PublishRequest) {
    this.requests.push(req);
    if (this.fail) throw new Error(this.fail);
    return req.scheduledAt ? { jobId: `job-${this.requests.length}` } : { requestId: `req-${this.requests.length}` };
  }
  async check() {
    return this.next;
  }
  async cancel(jobId: string) {
    this.canceled.push(jobId);
  }
}

async function setup(opts: { now: Date; service: FakeService | null; date?: string }) {
  const dir = await mkdtemp(join(tmpdir(), "post-"));
  const store = new Store(dir);
  const date = opts.date ?? DATE;
  await store.updateAccount(date, cosmos.id, (s) => {
    s.status = "approved";
    s.selectedIndex = 0;
    s.proposals = [proposal];
    s.production = {
      status: "approved",
      version: 1,
      jobId: `${date}-cosmos-v1`,
      videoFile: join(dir, "v.mp4"),
      warnings: [],
      revisions: [],
    };
  });
  const seen: (string | undefined)[] = [];
  let now = opts.now;
  const publisher = new Publisher(
    {
      store,
      service: opts.service,
      timeZone: TZ,
      now: () => now,
      notifier: { productionUpdated: async (_d, _a, s: AccountDayState) => void seen.push(s.production?.post?.status) },
    },
    [cosmos],
  );
  const post = async () => (await store.getDay(date))?.accounts[cosmos.id]?.production?.post;
  return { dir, store, publisher, seen, post, setNow: (d: Date) => (now = d) };
}

test("投稿文：投稿文のあとに、#を付けてそろえたハッシュタグを並べる", () => {
  assert.equal(buildCaption(proposal), "深海8000mの先に魚はいない\n\n#深海 #雑学 #宇宙のふしぎ");
});

test("投稿時刻：日本時間の投稿時刻に予約し、10分を切っていたらすぐ投稿する", () => {
  assert.equal(at("20:00").toISOString(), "2026-10-22T11:00:00.000Z");
  assert.equal(decidePostTime(DATE, "20:00", at("09:00"), TZ)?.toISOString(), "2026-10-22T11:00:00.000Z");
  assert.equal(decidePostTime(DATE, "20:00", at("19:55"), TZ), null);
  assert.equal(decidePostTime(DATE, "20:00", at("21:00"), TZ), null);
});

test("投稿サービスの応答：TikTok の結果から、投稿済み・失敗・処理中を読み取る", () => {
  assert.deepEqual(readPublishRef({ success: true, job_id: "j1" }), { jobId: "j1", requestId: undefined });
  assert.deepEqual(readPublishRef({ success: true, data: { request_id: "r1" } }), { jobId: undefined, requestId: "r1" });
  assert.deepEqual(
    interpretStatus({ status: "completed", results: [{ platform: "tiktok", success: true, url: "https://www.tiktok.com/@a/video/1" }] }),
    { state: "posted", url: "https://www.tiktok.com/@a/video/1" },
  );
  assert.deepEqual(interpretStatus({ status: "completed", results: [{ platform: "tiktok", success: true }] }), { state: "posted" });
  // 受付済み（Queued）はまだ投稿ではない
  assert.deepEqual(interpretStatus({ status: "in_progress", results: [{ platform: "tiktok", success: true, message: "Queued" }] }), { state: "pending" });
  assert.deepEqual(interpretStatus({ status: "completed", results: [{ platform: "tiktok", success: false, error: "spam risk" }] }), {
    state: "failed",
    error: "spam risk",
  });
  assert.deepEqual(interpretStatus({ status: "pending" }), { state: "pending" });
  assert.deepEqual(interpretStatus(null), { state: "pending" });
});

test("公開OKの動画を投稿時刻に予約し、もう一度呼んでも二重に投稿しない", async () => {
  const service = new FakeService();
  const t = await setup({ now: at("09:00"), service });
  try {
    await t.publisher.publish(cosmos, DATE);
    await t.publisher.publish(cosmos, DATE);
    assert.equal(service.requests.length, 1);
    const req = service.requests[0]!;
    assert.equal(req.profile, "cosmos");
    assert.equal(req.scheduledAt?.toISOString(), at("20:00").toISOString());
    assert.equal(req.idempotencyKey, `${DATE}-cosmos-v1-post1`);
    assert.equal(req.aigc, false);
    assert.match(req.caption, /#深海/);
    assert.deepEqual(t.seen, ["scheduling", "scheduled"]);
    const post = await t.post();
    assert.equal(post?.status, "scheduled");
    assert.equal(post?.jobId, "job-1");
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }
});

test("投稿時刻を過ぎてから公開OKにしたら、すぐ投稿して結果を確かめる", async () => {
  const service = new FakeService();
  const t = await setup({ now: at("21:00"), service });
  try {
    await t.publisher.publish(cosmos, DATE);
    assert.equal(service.requests[0]!.scheduledAt, undefined);
    assert.equal((await t.post())?.status, "posting");

    await t.publisher.check(cosmos, DATE); // まだ処理中
    assert.equal((await t.post())?.status, "posting");
    service.next = { state: "posted", url: "https://www.tiktok.com/@a/video/1" };
    await t.publisher.check(cosmos, DATE);
    const post = await t.post();
    assert.equal(post?.status, "posted");
    assert.equal(post?.url, "https://www.tiktok.com/@a/video/1");
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }
});

test("投稿に失敗したら知らせ、やり直すと別のキーで投稿する", async () => {
  const service = new FakeService();
  service.fail = "tiktok_privacy_unavailable";
  const t = await setup({ now: at("09:00"), service });
  try {
    await t.publisher.publish(cosmos, DATE);
    let post = await t.post();
    assert.equal(post?.status, "failed");
    assert.match(post?.error ?? "", /privacy/);

    await t.publisher.publish(cosmos, DATE); // やり直しの指示がなければ何もしない
    assert.equal(service.requests.length, 1);

    service.fail = null;
    await t.publisher.publish(cosmos, DATE, { retry: true });
    post = await t.post();
    assert.equal(post?.status, "scheduled");
    assert.equal(post?.attempt, 2);
    assert.equal(service.requests[1]!.idempotencyKey, `${DATE}-cosmos-v1-post2`);
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }
});

test("予約を取り消せる。予約時刻を過ぎたら結果を確かめ、6時間わからなければ『確認できず』にする", async () => {
  const service = new FakeService();
  const t = await setup({ now: at("09:00"), service });
  try {
    await t.publisher.publish(cosmos, DATE);
    await t.publisher.check(cosmos, DATE); // 予約時刻の前は問い合わせない
    assert.equal((await t.post())?.status, "scheduled");

    t.setNow(at("20:30"));
    await t.publisher.check(cosmos, DATE);
    assert.equal((await t.post())?.status, "scheduled");
    t.setNow(at("02:30", "2026-10-23"));
    await t.publisher.check(cosmos, DATE);
    assert.equal((await t.post())?.status, "unknown");
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }

  const t2 = await setup({ now: at("09:00"), service: new FakeService() });
  try {
    await t2.publisher.publish(cosmos, DATE);
    await t2.publisher.cancel(cosmos, DATE);
    assert.equal((await t2.post())?.status, "canceled");
  } finally {
    await rm(t2.dir, { recursive: true, force: true });
  }
});

test("投稿サービスが未設定なら『手で投稿』にする。定期確認では今日の分だけ投稿を続ける", async () => {
  const t = await setup({ now: at("09:00"), service: null });
  try {
    await t.publisher.publish(cosmos, DATE);
    assert.equal((await t.post())?.status, "manual");
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }

  // 公開OKのあと投稿する前に止まった：今日の分は投稿し、昨日の分は勝手に投稿しない
  const service = new FakeService();
  const today = await setup({ now: at("09:00"), service });
  const yesterday = await setup({ now: at("09:00"), service, date: "2026-10-21" });
  try {
    await today.publisher.tick();
    assert.equal((await today.post())?.status, "scheduled");
    await yesterday.publisher.tick();
    assert.equal(await yesterday.post(), undefined);
  } finally {
    await rm(today.dir, { recursive: true, force: true });
    await rm(yesterday.dir, { recursive: true, force: true });
  }
});

test("Slack：予約・投稿済み・失敗の表示と、予約後は決定を取り消せないこと", () => {
  const base: ProductionState = { status: "approved", version: 1, warnings: [], revisions: [], videoFile: "data/videos/x.mp4" };
  const scheduled = { ...base, post: { status: "scheduled" as const, attempt: 1, scheduledAt: at("20:00").toISOString(), jobId: "j" } };
  const text = JSON.stringify(reviewBlocks(DATE, "cosmos", scheduled));
  assert.match(text, /10\/22\(木\) 20:00 にTikTokへ投稿予約しました/);
  assert.match(text, new RegExp(ACTIONS.postCancel));
  assert.match(productionLine(scheduled), /20:00/);

  const posted = { ...base, post: { status: "posted" as const, attempt: 1, url: "https://www.tiktok.com/@a/video/1" } };
  assert.match(JSON.stringify(reviewBlocks(DATE, "cosmos", posted)), /video\/1/);
  const failed = { ...base, post: { status: "failed" as const, attempt: 1, error: "boom" } };
  assert.match(JSON.stringify(reviewBlocks(DATE, "cosmos", failed)), new RegExp(`boom.*${ACTIONS.postRetry}`));
  assert.match(JSON.stringify(reviewBlocks(DATE, "cosmos", { ...base, post: { status: "manual", attempt: 1 } })), /手で投稿/);

  const state = (p: ProductionState): AccountDayState => ({
    accountId: "cosmos",
    status: "approved",
    selectedIndex: 0,
    proposals: [proposal],
    production: p,
    revisions: [],
    updatedAt: "",
  });
  assert.doesNotMatch(JSON.stringify(accountBlocks(DATE, cosmos, 2, state(scheduled))), new RegExp(ACTIONS.undo));
  assert.match(JSON.stringify(accountBlocks(DATE, cosmos, 2, state(base))), new RegExp(ACTIONS.undo));
});
