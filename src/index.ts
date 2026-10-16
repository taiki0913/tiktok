// 常駐プロセス：Slack ボットを起動し、毎朝決まった時刻に企画づくりを実行する。
//   npm start
import cron from "node-cron";
import { loadAccounts } from "./config/accounts.js";
import { env, requireClaudeEnv, requireSlackEnv } from "./config/env.js";
import { runMorningPlanning } from "./jobs/planning.js";
import { createSlackBot } from "./slack/app.js";
import { Store } from "./store/store.js";
import { dateInTz, hourInTz } from "./util/date.js";

/** これより遅い時刻に起動した日は、取り戻し実行をしない（夜に企画が届いても使えないため） */
const CATCH_UP_UNTIL_HOUR = 15;

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
});
await bot.app.start();
console.log(`[slack] 接続しました（アカウント数: ${accounts.length}）`);

const task = cron.schedule(env.MORNING_CRON, () => runToday("定時実行"), {
  timezone: env.TIMEZONE,
  noOverlap: true,
});
const next = task.getNextRun();
console.log(`[cron] 次回の企画づくり: ${next?.toLocaleString("ja-JP", { timeZone: env.TIMEZONE }) ?? "不明"}`);

// PCの起動が予定時刻より遅れた日は、起動した時点で今日の分を作る
const nextIsToday = next !== null && dateInTz(next, env.TIMEZONE) === today();
const early = hourInTz(new Date(), env.TIMEZONE) < CATCH_UP_UNTIL_HOUR;
if (!nextIsToday && early && !(await store.getDay(today()))) {
  await runToday("起動時の取り戻し");
}
