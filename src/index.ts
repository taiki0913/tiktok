// 常駐プロセス：Slack ボットを起動し、毎朝決まった時刻に企画づくりを実行する。
//   npm start
import { resolve } from "node:path";
import cron from "node-cron";
import { loadAccounts } from "./config/accounts.js";
import { env, requireClaudeEnv, requireSlackEnv } from "./config/env.js";
import { runMorningPlanning } from "./jobs/planning.js";
import { postingSettings } from "./posting/settings.js";
import { productionSettings } from "./production/settings.js";
import { createSlackBot } from "./slack/app.js";
import { Store } from "./store/store.js";
import { dateInTz, daysBefore, hourInTz } from "./util/date.js";

/** これより遅い時刻に起動した日は、取り戻し実行をしない（夜に企画が届いても使えないため） */
const CATCH_UP_UNTIL_HOUR = 15;
/** 朝の実行を逃していないか・送れていない Slack の知らせがないかを確かめる間隔 */
const WATCH_INTERVAL_MS = 10 * 60_000;

requireClaudeEnv();
const accounts = await loadAccounts(env.ACCOUNTS_FILE);
const store = new Store(env.DATA_DIR);
const today = (): string => dateInTz(new Date(), env.TIMEZONE);

let running = false;
async function runToday(reason: string): Promise<void> {
  if (running) {
    console.log(`[morning] 実行中のためスキップ（${reason}）`);
    return;
  }
  running = true;
  try {
    console.log(`[morning] 企画づくりを開始（${reason}）`);
    await runMorningPlanning(bot.deps, today());
    console.log("[morning] 完了");
  } catch (e) {
    console.error("[morning] 失敗", e);
  } finally {
    running = false;
  }
}

const bot = createSlackBot({
  slack: requireSlackEnv(),
  accounts,
  store,
  onRunRequested: () => runToday("Slackで「企画作成」"),
  production: productionSettings(),
  exportDir: env.EXPORT_DIR,
  posting: postingSettings(),
});
await bot.app.start();
console.log(`[slack] 接続しました（アカウント数: ${accounts.length}）`);

// 昨日と今日のメッセージを、今のプログラムの表示に描き直す（更新で増えたボタンなどを出すため）
for (const date of [daysBefore(today(), 1), today()]) {
  await bot.refreshDay(date).catch((e) => console.warn(`[slack] ${date} のメッセージを描き直せませんでした`, e));
}

// 前回の終了時に作りかけだった動画があれば、続きから作る
const resumed = await bot.production.resume(today());
if (resumed > 0) console.log(`[produce] 作りかけの動画 ${resumed} 本の制作を再開します`);

// 投稿の結果を定期的に確かめる（公開OKの直後に止まった投稿の続きもここで行う）
bot.publisher.start();
console.log(`[save] 公開OKの動画と投稿文の保存先: ${resolve(env.EXPORT_DIR)}`);
if (env.UPLOAD_POST_API_KEY) console.log("[post] 公開OKの動画は Upload-Post で投稿予約します");

const task = cron.schedule(env.MORNING_CRON, () => runToday("定時実行"), {
  timezone: env.TIMEZONE,
  noOverlap: true,
});
const next = task.getNextRun();
console.log(`[cron] 次回の企画づくり: ${next?.toLocaleString("ja-JP", { timeZone: env.TIMEZONE }) ?? "不明"}`);

/** 予定時刻を過ぎても今日の企画がまだなら作る（起動が遅れた日や、スリープで朝の実行を逃した日のため） */
async function catchUp(reason: string): Promise<void> {
  const next = task.getNextRun();
  const nextIsToday = next !== null && dateInTz(next, env.TIMEZONE) === today();
  const early = hourInTz(new Date(), env.TIMEZONE) < CATCH_UP_UNTIL_HOUR;
  if (!nextIsToday && early && !(await store.getDay(today()))) await runToday(reason);
}

await catchUp("起動時の取り戻し");

setInterval(() => {
  void (async () => {
    await catchUp("朝の実行を逃したため（スリープなど）");
    // ネットが切れていた間に送れなかった、動画の完成・失敗の知らせを送り直す
    for (const date of [daysBefore(today(), 1), today()]) await bot.sendPending(date);
  })().catch((e) => console.warn("[watch] 確認に失敗", e));
}, WATCH_INTERVAL_MS);
