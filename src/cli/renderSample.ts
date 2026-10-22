// Claude を使わずに、見本の動画（video/examples/future-population）を書き出す。
// VOICEVOX のナレーション・BGM・動画の書き出しが PC で動くかを確かめるためのもの。
//   npm run video:sample
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { loadAccounts } from "../config/accounts.js";
import { env } from "../config/env.js";
import { writeJobFiles } from "../production/jobFiles.js";
import { JOBS_DIR, pickBgm } from "../production/pipeline.js";
import { JobRenderer } from "../production/renderer.js";
import { productionSettings } from "../production/settings.js";
import { narrate } from "../production/voicevox.js";
import { computeTimeline, DEFAULT_TIMELINE, type JobData } from "../../video/kit/job.js";

const EXAMPLE = join(process.cwd(), "video", "examples", "future-population");
const JOB_ID = "sample-future";

const account = (await loadAccounts(env.ACCOUNTS_FILE)).find((a) => a.id === "future");
if (!account) throw new Error("config/accounts.yaml に future アカウントがありません");
const settings = productionSettings();
const example = JSON.parse(await readFile(join(EXAMPLE, "job.json"), "utf8")) as JobData;

const jobDir = join(JOBS_DIR, JOB_ID);
await rm(jobDir, { recursive: true, force: true });
const publicDir = join(jobDir, "public");
await mkdir(publicDir, { recursive: true });

console.log(`ナレーションを作成中（${account.voice.speaker}）…`);
const narration = await narrate(
  example.scenes.map((s) => s.narration),
  account.voice,
  { client: settings.voicevox, publicDir, relDir: "" },
);
if (narration.warning) console.warn(`⚠ ${narration.warning}`);

const bgmSrc = await pickBgm(account.id, JOB_ID);
if (bgmSrc) await cp(bgmSrc, join(publicDir, "bgm.mp3"));
else console.warn(`⚠ BGM がありません（public/bgm/${account.id}/ に音源を入れると付きます）`);

// 見本は短いので、最低の長さ（60秒）は気にしない
const timeline = computeTimeline(narration.clips.map((c) => c.durationSec), { ...DEFAULT_TIMELINE, minTotalSec: 0 });
await writeJobFiles(jobDir, {
  ...example,
  id: JOB_ID,
  durationInFrames: timeline.durationInFrames,
  scenes: example.scenes.map((s, i) => ({ ...s, ...timeline.scenes[i]!, audio: narration.clips[i]!.file })),
  endCard: { ...example.endCard, from: timeline.endCardFrom },
  bgm: bgmSrc ? "bgm.mp3" : null,
  credits: [],
});
await cp(join(EXAMPLE, "Video.tsx"), join(jobDir, "Video.tsx"));

const output = join("out", "sample-future.mp4");
const renderer = new JobRenderer(jobDir, JOB_ID, settings.render);
console.log("動画を書き出し中…（初回は書き出し用の Chrome のダウンロードで数分かかります）");
let last = -1;
await renderer.video(output, (r) => {
  const pct = Math.floor(r * 10) * 10;
  if (pct > last) {
    last = pct;
    console.log(`  ${pct}%`);
  }
});
await renderer.cleanup();
console.log(`\n完了：${output}`);
