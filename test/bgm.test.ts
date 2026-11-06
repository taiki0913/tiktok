import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { moodTracks } from "../src/production/pipeline.js";
import { BGM_CROSSFADE_FRAMES, computeBgmCues } from "../video/kit/job.js";

const files = { calm: "bgm-calm.mp3", tension: "bgm-tension.mp3", danger: "bgm-danger.mp3", hope: "bgm-hope.mp3" };
const half = BGM_CROSSFADE_FRAMES / 2;

test("BGM：雰囲気が変わるところで切り替え、境目は重ねてクロスフェードする", () => {
  const cues = computeBgmCues(
    [
      { from: 9, mood: "calm" },
      { from: 300, mood: "calm" },
      { from: 600, mood: "tension" },
      { from: 900, mood: "danger" },
      { from: 1300, mood: "hope" },
    ],
    1800,
    files,
  );
  assert.deepEqual(
    cues.map((c) => [c.mood, c.from, c.from + c.durationInFrames]),
    [
      ["calm", 0, 600 + half],
      ["tension", 600 - half, 900 + half],
      ["danger", 900 - half, 1300 + half],
      ["hope", 1300 - half, 1800],
    ],
  );
  assert.equal(cues[0]!.src, "bgm-calm.mp3");
});

test("BGM：短すぎる区間（5秒未満）は前にまとめ、曲のない雰囲気は前の曲を続ける", () => {
  const cues = computeBgmCues(
    [
      { from: 0, mood: "calm" },
      { from: 400, mood: "danger" }, // 100フレームだけ → calm にまとめる
      { from: 500, mood: "calm" },
      { from: 800, mood: "sad" }, // 曲がない → calm を続ける
      { from: 1000, mood: "tension" },
    ],
    1500,
    files,
  );
  assert.deepEqual(cues.map((c) => c.mood), ["calm", "tension"]);
  assert.equal(cues[1]!.from, 1000 - half);
});

test("BGM：雰囲気のない（古い）台本や、曲がないときは区間を作らない", () => {
  assert.deepEqual(computeBgmCues([{ from: 0 }, { from: 300 }], 900, files), []);
  assert.deepEqual(computeBgmCues([{ from: 0, mood: "calm" }], 900, {}), []);
});

test("BGM：moods フォルダから雰囲気ごとの曲を見つける（複数あればジョブごとに1曲）", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bgm-"));
  try {
    assert.deepEqual(await moodTracks("cosmos", "job", dir), {});
    await mkdir(join(dir, "cosmos", "moods"), { recursive: true });
    for (const f of ["calm.mp3", "tension.mp3", "tension-2.mp3", "memo.txt"]) await writeFile(join(dir, "cosmos", "moods", f), "");
    const found = await moodTracks("cosmos", "job-1", dir);
    assert.deepEqual(Object.keys(found).sort(), ["calm", "tension"]);
    assert.match(found.tension!, /tension(-2)?\.mp3$/);
    assert.equal((await moodTracks("cosmos", "job-1", dir)).tension, found.tension);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("BGM：日本史は、謎・不穏（mystery）を含む7つの雰囲気の和の曲を持ち、2本目（昼）も同じ曲を使う", async () => {
  const { SCENE_MOODS } = await import("../src/production/scriptAgent.js");
  const { baseId, loadAccounts } = await import("../src/config/accounts.js");
  const tracks = await moodTracks("history", "2026-11-06-history-v1");
  assert.deepEqual(Object.keys(tracks).sort(), [...SCENE_MOODS].sort());
  assert.ok(SCENE_MOODS.includes("mystery"));
  const second = (await loadAccounts("config/accounts.yaml")).find((a) => a.id === "history_2")!;
  assert.equal(baseId(second), "history");
});

test("accounts.yaml：日本史は「常識をくつがえす異説」の型で、説を作らない決まりがある（2本目も同じ）", async () => {
  const { loadAccounts } = await import("../src/config/accounts.js");
  const accounts = await loadAccounts("config/accounts.yaml");
  for (const id of ["history", "history_2"]) {
    const a = accounts.find((x) => x.id === id)!;
    assert.match(a.format ?? "", /通説派？異説派？/);
    assert.ok(a.rules.some((r) => r.includes("説を作らない")), id);
  }
  // 型を決めていないアカウントは標準の構成のまま
  assert.equal(accounts.find((x) => x.id === "psychology")!.format, undefined);
});
