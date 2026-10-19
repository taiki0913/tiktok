// 毎朝の企画づくりを今すぐ1回だけ実行する。
//   npm run plan:dry                       … Slackに送らずコンソールに表示（お試し）
//   npm run plan:dry -- --account history  … 1アカウントだけ試す
//   npm run plan:now                       … Slackに送る（ボタン操作には npm start が動いている必要あり）
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadAccounts } from "../config/accounts.js";
import { env, requireClaudeEnv, requireSlackEnv } from "../config/env.js";
import { ConsoleNotifier } from "../jobs/consoleNotifier.js";
import { runMorningPlanning, type PlanningDeps } from "../jobs/planning.js";
import { productionSettings } from "../production/settings.js";
import { createSlackBot } from "../slack/app.js";
import { Store } from "../store/store.js";
import { dateInTz } from "../util/date.js";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    account: { type: "string", multiple: true },
    force: { type: "boolean", default: false },
    date: { type: "string" },
  },
});

requireClaudeEnv();
const accounts = await loadAccounts(env.ACCOUNTS_FILE);
const date = values.date ?? dateInTz(new Date(), env.TIMEZONE);
const onlyAccountIds = values.account?.flatMap((a) => a.split(","));
const unknown = onlyAccountIds?.filter((id) => !accounts.some((a) => a.id === id)) ?? [];
if (unknown.length > 0) {
  console.error(`不明なアカウントID: ${unknown.join(", ")}（使えるID: ${accounts.map((a) => a.id).join(", ")}）`);
  process.exit(1);
}

let deps: PlanningDeps;
if (values["dry-run"]) {
  // お試し実行の結果は本番の履歴と混ざらないよう別フォルダに保存する
  deps = { store: new Store(join(env.DATA_DIR, "dry-run")), notifier: new ConsoleNotifier(), accounts };
} else {
  const store = new Store(env.DATA_DIR);
  deps = createSlackBot({
    slack: requireSlackEnv(),
    accounts,
    store,
    onRunRequested: async () => {},
    production: productionSettings(),
  }).deps;
}

// お試し実行は何度でも作り直せるよう、作成済みのアカウントも毎回作り直す
const force = values.force || values["dry-run"];
await runMorningPlanning(deps, date, { onlyAccountIds, force });
