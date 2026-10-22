// 作った動画の投稿文（説明文＋ハッシュタグ）を表示し、動画と投稿文を保存先（EXPORT_DIR）に保存する。
// Slack を通さずに作った動画（npm run produce:dry）や、公開OKの前の動画にも使える。
//   npm run export -- --account cosmos                    … そのアカウントのいちばん新しい動画
//   npm run export -- --account cosmos --date 2026-10-22  … 日付を指定
//   npm run export -- --account cosmos --rerender         … 今の設定で書き出し直してから保存する
//                                                            （クレジット表記を消すなど。Claude は使わない）
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadAccounts } from "../config/accounts.js";
import { env } from "../config/env.js";
import type { DayState } from "../domain.js";
import { writeExport } from "../production/exporter.js";
import { JOBS_DIR } from "../production/pipeline.js";
import { postTextFor } from "../production/postText.js";
import { JobRenderer } from "../production/renderer.js";
import { productionSettings } from "../production/settings.js";
import type { JobData } from "../../video/kit/job.js";

const { values } = parseArgs({
  options: { account: { type: "string" }, date: { type: "string" }, rerender: { type: "boolean", default: false } },
});
const accounts = await loadAccounts(env.ACCOUNTS_FILE);
const account = accounts.find((a) => a.id === values.account);
if (!account) {
  console.error(`--account にアカウントIDを指定してください（${accounts.map((a) => a.id).join(", ")}）`);
  process.exit(1);
}

/** 本番（data/days）とお試し（data/dry-run/days）の両方から、このアカウントの動画を探す */
async function findVideos() {
  const found = [];
  for (const [label, dir] of [
    ["本番", join(env.DATA_DIR, "days")],
    ["お試し", join(env.DATA_DIR, "dry-run", "days")],
  ] as const) {
    for (const f of await readdir(dir).catch(() => [] as string[])) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f) || (values.date && f !== `${values.date}.json`)) continue;
      const day = JSON.parse(await readFile(join(dir, f), "utf8")) as DayState;
      const s = day.accounts[account!.id];
      const proposal = s?.proposals?.[s.selectedIndex ?? -1];
      if (s?.production?.videoFile && proposal) found.push({ label, date: day.date, state: s, proposal });
    }
  }
  return found.sort((a, b) => b.state.updatedAt.localeCompare(a.state.updatedAt));
}

const videos = await findVideos();
const latest = videos[0];
if (!latest) {
  console.error(`${account.name} の完成した動画が見つかりません${values.date ? `（${values.date}）` : ""}`);
  process.exit(1);
}

const p = latest.state.production!;

if (values.rerender) {
  // 作業フォルダに残っている映像のコードを、今の設定（ナレーションのクレジットを動画に入れない）で書き出し直す
  if (!p.jobId) throw new Error("この動画の作業フォルダが分かりません");
  const jobDir = join(JOBS_DIR, p.jobId);
  const jobFile = join(jobDir, "job.json");
  const job = JSON.parse(await readFile(jobFile, "utf8").catch(() => {
    throw new Error(`作業フォルダが見つかりません：${jobDir}`);
  })) as JobData;
  job.credits = [];
  await writeFile(jobFile, JSON.stringify(job, null, 2), "utf8");
  console.log(`書き出し直しています…（${p.videoFile}）`);
  const renderer = new JobRenderer(jobDir, p.jobId, productionSettings().render);
  let last = -1;
  await renderer.video(p.videoFile!, (r) => {
    const pct = Math.floor(r * 10) * 10;
    if (pct > last) console.log(`  ${(last = pct)}%`);
  });
  await renderer.cleanup();
}

const text = postTextFor(account, latest.proposal, p);
console.log(`${account.name}（${latest.label}・${latest.date}）「${latest.proposal.title}」`);
console.log(`動画：${p.videoFile}`);
console.log(`\n----- 投稿文（ここから） -----\n${text}\n----- 投稿文（ここまで） -----\n`);

try {
  const saved = await writeExport({ exportDir: env.EXPORT_DIR, date: latest.date, account, videoFile: p.videoFile!, text });
  console.log(`保存しました：\n  ${saved.videoFile}\n  ${saved.textFile}`);
} catch (e) {
  console.error(`⚠ 保存先に保存できませんでした（.env の EXPORT_DIR を確認してください）：${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}
if (videos.length > 1) {
  console.log(`\nほかにも ${videos.length - 1} 本あります：${videos.slice(1).map((v) => `${v.date}（${v.label}）「${v.proposal.title}」`).join("、")}`);
  console.log("別の日の動画は --date 2026-10-22 のように日付を指定してください。");
}
