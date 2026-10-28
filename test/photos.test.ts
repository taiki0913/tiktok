import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadAccounts } from "../src/config/accounts.js";
import type { ProductionState, Proposal } from "../src/domain.js";
import { findPhotos, licenseKind, photoCreditsText, searchCommons, type PhotoAsset } from "../src/production/photos.js";
import { markQueued } from "../src/production/pipeline.js";
import { postTextFor } from "../src/production/postText.js";
import type { VideoScript } from "../src/production/scriptAgent.js";
import { reviewBlocks } from "../src/slack/blocks.js";
import { Store } from "../src/store/store.js";

const accounts = await loadAccounts("config/accounts.yaml");
const history = accounts.find((a) => a.id === "history")!;
const cosmos = accounts.find((a) => a.id === "cosmos")!;

const meta = (license: string, name: string, extra: Record<string, string> = {}) => ({
  License: { value: license },
  LicenseShortName: { value: name },
  Artist: { value: '<a href="x">Uchida Kuichi</a>' },
  ImageDescription: { value: "<p>Tokugawa Yoshinobu</p>" },
  DateTimeOriginal: { value: "1867" },
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])),
});

const page = (title: string, index: number, m: ReturnType<typeof meta>, size = 2000) => ({
  title: `File:${title}`,
  index,
  imageinfo: [
    {
      url: `https://upload.example/${title}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}`,
      thumburl: `https://upload.example/thumb/1280px-${title}`,
      thumbwidth: Math.min(1280, size),
      thumbheight: Math.round(Math.min(1280, size) * 1.4),
      width: size,
      height: Math.round(size * 1.4),
      mime: "image/jpeg",
      extmetadata: m,
    },
  ],
});

/** Wikimedia Commons の代わり（検索と画像のダウンロード） */
function fakeFetch(pages: ReturnType<typeof page>[], calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    assert.match(String((init?.headers as Record<string, string>)["User-Agent"]), /tiktok-agents/);
    if (url.startsWith("https://commons.wikimedia.org/w/api.php")) {
      return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
    }
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, url.length % 256]), { status: 200 });
  }) as typeof fetch;
}

test("accounts.yaml：本物の写真は日本史だけで使う", () => {
  assert.equal(history.archivePhotos, true);
  assert.equal(cosmos.archivePhotos, false);
});

test("写真のライセンス：パブリックドメイン・CC0・CC BY だけを使い、BY-SA・NC・商標などの制限つきは使わない", () => {
  assert.equal(licenseKind(meta("pd", "Public domain")), "pd");
  assert.equal(licenseKind(meta("cc0", "CC0")), "pd");
  assert.equal(licenseKind(meta("", "Public domain")), "pd");
  assert.equal(licenseKind(meta("cc-by-4.0", "CC BY 4.0")), "by");
  assert.equal(licenseKind(meta("cc-by-sa-4.0", "CC BY-SA 4.0")), null);
  assert.equal(licenseKind(meta("cc-by-nc-2.0", "CC BY-NC 2.0")), null);
  assert.equal(licenseKind(meta("", "")), null);
  assert.equal(licenseKind(meta("pd", "Public domain", { Restrictions: "trademarked" })), null);
  assert.equal(licenseKind(meta("pd", "Public domain", { Restrictions: "personality" })), "pd");
});

test("写真の検索：自由に使えて大きさの足りる写真だけを、検索の順に返す", async () => {
  const calls: string[] = [];
  const found = await searchCommons(
    "Tokugawa Yoshinobu",
    fakeFetch(
      [
        page("b.jpg", 2, meta("cc-by-4.0", "CC BY 4.0")),
        page("sa.jpg", 3, meta("cc-by-sa-4.0", "CC BY-SA 4.0")),
        page("a.jpg", 1, meta("pd", "Public domain")),
        page("tiny.jpg", 4, meta("pd", "Public domain"), 300),
      ],
      calls,
    ),
  );
  assert.deepEqual(
    found.map((c) => [c.title, c.kind, c.license, c.author]),
    [
      ["a.jpg", "pd", "パブリックドメイン", "Uchida Kuichi"],
      ["b.jpg", "by", "CC BY 4.0", "Uchida Kuichi"],
    ],
  );
  assert.equal(found[0]!.previewUrl, "https://upload.example/thumb/400px-a.jpg");
  assert.match(calls[0]!, /gsrsearch=Tokugawa\+Yoshinobu\+filetype%3Abitmap/);
});

test("写真探し：選ばれた写真を保存し、場面・説明・出典を返す。選ばれなかった場面は使わない", async () => {
  const dir = await mkdtemp(join(tmpdir(), "photos-"));
  try {
    const needs: VideoScript["photoNeeds"] = [
      { sceneIndex: 6, subject: "晩年の徳川慶喜の肖像写真", queries: ["Tokugawa Yoshinobu", "徳川慶喜"] },
      { sceneIndex: 2, subject: "存在しない写真", queries: ["nothing"] },
      { sceneIndex: 99, subject: "場面の番号が範囲外", queries: ["x"] },
    ];
    let seen = 0;
    const photos = await findPhotos(needs, 10, {
      publicDir: dir,
      fetch: fakeFetch([page("a.jpg", 1, meta("pd", "Public domain")), page("b.jpg", 2, meta("cc-by-4.0", "CC BY 4.0"))]),
      pick: async (n, candidates) => {
        seen = n.length;
        assert.ok(candidates[0]!.list[0]!.preview, "Claude に見せる小さい画像を付ける");
        return [
          { need: 0, candidate: 1, caption: "晩年の徳川慶喜", reason: "説明と一致" },
          { need: 1, candidate: null, caption: "", reason: "該当なし" },
        ];
      },
    });
    assert.equal(seen, 2, "範囲外の場面は探さない");
    assert.equal(photos.length, 1);
    const p = photos[0]!;
    assert.deepEqual([p.src, p.sceneIndex, p.caption, p.kind], ["photos/p1.jpg", 6, "晩年の徳川慶喜", "by"]);
    assert.equal(p.credit, "写真：Uchida Kuichi／CC BY 4.0（Wikimedia Commons）");
    assert.ok((await readFile(join(dir, "photos", "p1.jpg"))).length > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const asset = (o: Partial<PhotoAsset>): PhotoAsset => ({
  src: "photos/p1.jpg",
  width: 900,
  height: 1200,
  caption: "晩年の徳川慶喜",
  credit: "写真：Wikimedia Commons（パブリックドメイン）",
  sceneIndex: 5,
  sourceUrl: "https://commons.wikimedia.org/wiki/File:a.jpg",
  license: "パブリックドメイン",
  kind: "pd",
  author: "作者不明",
  ...o,
});

test("投稿文：写真の出典を、ナレーションのクレジットのあとに入れる（CC BY は作者と元のページも）", () => {
  const photos = [asset({}), asset({ caption: "慶喜が撮った写真", kind: "by", license: "CC BY 4.0", author: "Tojo Museum", sourceUrl: "https://c/b" })];
  assert.equal(
    photoCreditsText(photos),
    "写真出典：Wikimedia Commons\n・晩年の徳川慶喜（パブリックドメイン）\n・慶喜が撮った写真：Tojo Museum／CC BY 4.0 https://c/b",
  );
  assert.equal(photoCreditsText([]), null);
  const proposal = { caption: "c", hashtags: ["日本史"] } as Proposal;
  const p: ProductionState = { status: "approved", version: 1, warnings: [], revisions: [], voiceCredit: "VOICEVOX:青山龍星", photos };
  assert.match(postTextFor(history, proposal, p), /VOICEVOX:青山龍星\n\n写真出典：Wikimedia Commons\n・晩年の徳川慶喜/);
});

test("Slack：使った本物の写真を、元のページへのリンクつきで確認に出す", () => {
  const p: ProductionState = { status: "review", version: 1, warnings: [], revisions: [], photos: [asset({})] };
  const text = JSON.stringify(reviewBlocks("2026-10-28", history, p));
  assert.match(text, /使った本物の写真/);
  assert.match(text, /場面6：晩年の徳川慶喜（パブリックドメイン）<https:\/\/commons\.wikimedia\.org\/wiki\/File:a\.jpg\|元のページ>/);
});

test("作り直し：前回の写真を引き継ぐ（映像だけの作り直しで使う）", async () => {
  const dir = await mkdtemp(join(tmpdir(), "photos-store-"));
  try {
    const store = new Store(dir);
    await store.updateAccount("2026-10-28", history.id, (s) => {
      s.status = "approved";
      s.production = { status: "review", version: 1, warnings: [], revisions: [], jobId: "j1", photos: [asset({})] };
    });
    const s = await markQueued(store, "2026-10-28", history.id, { instruction: "写真を大きく", mode: "visual" });
    assert.equal(s.production?.photos?.[0]?.caption, "晩年の徳川慶喜");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
