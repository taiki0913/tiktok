import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Lesson } from "../src/domain.js";
import { lessonsText } from "../src/review/lessons.js";
import type { Review } from "../src/review/reviewAgent.js";
import { ACTIONS, critiqueBlocks } from "../src/slack/blocks.js";
import { Store } from "../src/store/store.js";

const lesson = (text: string, target: Lesson["target"] = "visual"): Lesson => ({ text, target, from: "2026-10-27", at: "x" });

test("学び：新しい順にためて、同じものは重ねず、12件までにする", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lessons-"));
  try {
    const store = new Store(dir);
    await store.addLessons("history", [lesson("1フレーム目に大きな文字で問いを出す"), lesson("尺は35秒以内", "plan")]);
    await store.addLessons("history", [lesson("1フレーム目に大きな文字で問いを出す"), lesson("最初の一言を疑問形にする", "script")]);
    const got = await store.getLessons("history");
    assert.deepEqual(got.map((l) => l.text), ["最初の一言を疑問形にする", "1フレーム目に大きな文字で問いを出す", "尺は35秒以内"]);
    assert.deepEqual(await store.getLessons("cosmos"), []);
    for (let i = 0; i < 20; i++) await store.addLessons("history", [lesson(`学び${i}`)]);
    assert.equal((await store.getLessons("history")).length, 12);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("学び：エージェントには、関わるものだけを渡す", () => {
  const lessons = [lesson("文字を大きく", "visual"), lesson("尺は35秒以内", "plan")];
  assert.match(lessonsText(lessons, ["visual"]), /\[映像\] 文字を大きく/);
  assert.doesNotMatch(lessonsText(lessons, ["visual"]), /35秒/);
  assert.equal(lessonsText(lessons, ["post"]), "");
});

test("Slack：レビューの結果に、点数・数字・変えること・追加した学びを出す", () => {
  const review: Review = {
    metrics: { views: 240, avgWatchSec: 6.2, fullWatchPercent: 3.1, other: "2秒で54%が離脱" },
    score: 3,
    verdict: "冒頭2秒で半分に逃げられている",
    dropOff: "0〜2秒：タイトル表示だけで何の動画か分からない",
    problems: [{ when: "0〜2秒", issue: "タイトル表示から始まる" }],
    fixes: [{ target: "visual", action: "1フレーム目に問いを大きく出す" }],
    lessons: [{ target: "visual", text: "タイトル表示から始めない" }],
    keep: [],
  };
  const text = JSON.stringify(critiqueBlocks("2026-10-27", review, [lesson("タイトル表示から始めない")]));
  assert.match(text, /3\/10/);
  assert.match(text, /再生 240/);
  assert.match(text, /最後まで 3.1%/);
  assert.match(text, /\[映像\] 1フレーム目に問いを大きく出す/);
  assert.match(text, /学びに追加しました/);
  assert.ok(ACTIONS.critique);
});
