import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadAccounts } from "../src/config/accounts.js";
import type { AccountDayState, ProductionState, Proposal } from "../src/domain.js";
import { exportBaseName, saveApprovedVideo } from "../src/production/exporter.js";
import { formatPostText, postTextFor } from "../src/production/postText.js";
import type { VideoScript } from "../src/production/scriptAgent.js";
import { ACTIONS, productionLine, reviewBlocks } from "../src/slack/blocks.js";
import { Store } from "../src/store/store.js";

const accounts = await loadAccounts("config/accounts.yaml");
const history = accounts.find((a) => a.id === "history")!; // 19:00「知られざる日本史」
const DATE = "2026-10-22";

const proposal: Proposal = {
  title: "t",
  hook: "h",
  summary: "s",
  outline: [],
  lengthSec: 70,
  caption: "企画の投稿文",
  hashtags: ["日本史"],
  basedOn: "b",
  originality: "o",
};

test("投稿文：説明文のあとに、#を付けてそろえたハッシュタグを並べる", () => {
  assert.equal(formatPostText(" 深海8000mの先に魚はいない ", ["深海", "#雑学", "宇宙 の ふしぎ", "深海"]), "深海8000mの先に魚はいない\n\n#深海 #雑学 #宇宙のふしぎ");
});

test("投稿文：完成した台本の投稿文を使い、なければ企画の投稿文を使う", () => {
  const script = { postCaption: "台本の投稿文", hashtags: ["江戸", "雑学"] } as VideoScript;
  assert.equal(postTextFor(proposal, script), "台本の投稿文\n\n#江戸 #雑学");
  assert.equal(postTextFor(proposal, {} as VideoScript), "企画の投稿文\n\n#日本史");
  assert.equal(postTextFor(proposal), "企画の投稿文\n\n#日本史");
});

test("ファイル名は投稿時刻が先頭で、Windowsで使えない文字を置き換える", () => {
  assert.equal(exportBaseName(history), "1900_知られざる日本史");
  assert.equal(exportBaseName({ ...history, name: "A/B:C?" }), "1900_A_B_C_");
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "export-"));
  const store = new Store(join(dir, "data"));
  const videoFile = join(dir, "v.mp4");
  await writeFile(videoFile, "video");
  await store.updateAccount(DATE, history.id, (s) => {
    s.status = "approved";
    s.selectedIndex = 0;
    s.proposals = [proposal];
    s.production = {
      status: "approved",
      version: 1,
      jobId: "j",
      videoFile,
      warnings: [],
      revisions: [],
      script: { postCaption: "台本の投稿文", hashtags: ["江戸"] } as VideoScript,
    };
  });
  const seen: (string | undefined)[] = [];
  const notifier = { productionUpdated: async (_d: string, _a: unknown, s: AccountDayState) => void seen.push(s.production?.saved?.status) };
  const saved = async () => (await store.getDay(DATE))?.accounts[history.id]?.production?.saved;
  return { dir, store, notifier, seen, saved };
}

test("公開OKの動画と投稿文を、日付のフォルダに保存する", async () => {
  const t = await setup();
  try {
    const exportDir = join(t.dir, "drive", "TikTok");
    await saveApprovedVideo({ store: t.store, notifier: t.notifier, exportDir }, history, DATE);
    const s = await t.saved();
    assert.equal(s?.status, "saved");
    assert.equal(s?.videoFile, join(exportDir, DATE, "1900_知られざる日本史.mp4"));
    assert.equal(await readFile(s!.videoFile!, "utf8"), "video");
    assert.equal(await readFile(join(exportDir, DATE, "1900_知られざる日本史.txt"), "utf8"), "台本の投稿文\n\n#江戸\n");
    assert.deepEqual(t.seen, ["saved"]);
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }
});

test("保存できなければ失敗として知らせ、もう一度保存するボタンを出す", async () => {
  const t = await setup();
  try {
    const notADir = join(t.dir, "file");
    await writeFile(notADir, "");
    await saveApprovedVideo({ store: t.store, notifier: t.notifier, exportDir: notADir }, history, DATE);
    const s = await t.saved();
    assert.equal(s?.status, "failed");
    const p: ProductionState = { status: "approved", version: 1, warnings: [], revisions: [], saved: s };
    assert.match(JSON.stringify(reviewBlocks(DATE, history, p)), new RegExp(ACTIONS.saveRetry));
    assert.match(productionLine(p), /保存に失敗/);
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }
});

test("Slack：保存先と投稿の目安の時刻を表示する", () => {
  const p: ProductionState = {
    status: "approved",
    version: 1,
    warnings: [],
    revisions: [],
    saved: { status: "saved", videoFile: "G:\\マイドライブ\\TikTok\\2026-10-22\\1900_知られざる日本史.mp4", text: "x" },
  };
  const text = JSON.stringify(reviewBlocks(DATE, history, p));
  assert.match(text, /1900_知られざる日本史\.mp4/);
  assert.match(text, /投稿の目安：19:00/);
  assert.doesNotMatch(text, new RegExp(ACTIONS.postCancel));
});
