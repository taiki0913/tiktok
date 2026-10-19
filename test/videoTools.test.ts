// 動画作成エージェントの道具（読み書き・チェック・静止画）の動作確認。
// 静止画の書き出しは Chrome を使って時間がかかるので、RUN_RENDER_TESTS=1 のときだけ行う。
import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { writeJobFiles } from "../src/production/jobFiles.js";
import { JobRenderer } from "../src/production/renderer.js";
import { createVideoTools } from "../src/production/videoAgent.js";
import type { JobData } from "../video/kit/job.js";

const JOB_ID = "test-video-tools";
const jobDir = join(process.cwd(), "video", "jobs", JOB_ID);
const renderer = new JobRenderer(jobDir, JOB_ID, {
  browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE,
  gl: process.env.REMOTION_GL as "swangle" | undefined,
});
let finishedWith: string | null = null;
const tools = Object.fromEntries(
  createVideoTools({ jobDir, jobId: JOB_ID, renderer, onFinish: (s) => (finishedWith = s) }).map((t) => [t.name, t]),
);
const call = async (name: string, input: unknown): Promise<unknown> => {
  // 道具ごとに入力の型が違うので、ここでは型を緩めて呼ぶ
  const tool = tools[name] as unknown as { parse: (x: unknown) => unknown; run: (x: unknown) => Promise<unknown> };
  return tool.run(tool.parse(input));
};

before(async () => {
  const example = join(process.cwd(), "video", "examples", "future-population");
  const job = JSON.parse(await readFile(join(example, "job.json"), "utf8")) as JobData;
  await writeJobFiles(jobDir, { ...job, id: JOB_ID });
  await mkdir(join(jobDir, "public"), { recursive: true });
  await cp(join(example, "Video.tsx"), join(jobDir, "Video.tsx"));
});

after(async () => {
  await rm(jobDir, { recursive: true, force: true });
  await renderer.cleanup();
});

test("書き込みはジョブのフォルダの .tsx/.ts だけ", async () => {
  await assert.rejects(call("write_file", { path: "../evil.tsx", content: "x" }), /外には書けません/);
  await assert.rejects(call("write_file", { path: "entry.tsx", content: "x" }), /書き換えられません/);
  await assert.rejects(call("write_file", { path: "notes.md", content: "x" }), /\.tsx/);
  assert.match(String(await call("write_file", { path: "Extra.tsx", content: "export const A = 1;\n" })), /書きました/);
});

test("読み込みは部品集・お手本・ジョブのフォルダだけ", async () => {
  await assert.rejects(call("read_file", { path: ".env" }), /読めるのは/);
  await assert.rejects(call("read_file", { path: "src/config/env.ts" }), /読めるのは/);
  assert.match(String(await call("read_file", { path: "video/kit/KIT.md" })), /部品集/);
});

test("check：型エラーを見つけ、直れば OK を返す", async () => {
  const good = await readFile(join(jobDir, "Video.tsx"), "utf8");
  await call("write_file", { path: "Video.tsx", content: `${good}\nconst broken: number = "文字";\n` });
  assert.match(String(await call("check", {})), /型エラー/);
  assert.match(String(await call("finish", { summary: "まだ" })), /型エラー/);
  assert.equal(finishedWith, null);

  await call("write_file", { path: "Video.tsx", content: good });
  assert.match(String(await call("check", {})), /^OK/);
  await call("finish", { summary: "できました" });
  assert.equal(finishedWith, "できました");
});

test("render_frames：静止画を画像として返す", { skip: !process.env.RUN_RENDER_TESTS }, async () => {
  const result = (await call("render_frames", { frames: [30] })) as { type: string }[];
  assert.ok(Array.isArray(result), String(result));
  assert.deepEqual(result.map((b) => b.type), ["text", "image"]);
});
