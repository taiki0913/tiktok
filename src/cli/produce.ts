// お試し実行（npm run plan:dry）で作った企画から、Slack を通さずに動画を1本作る。
//   npm run produce:dry -- --account cosmos            … 案A（1つ目）で作る
//   npm run produce:dry -- --account cosmos --index 1  … 案B で作る
// 台本・映像づくりで Claude API を使う（1本あたり約$1）。
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadAccounts, type Account } from "../config/accounts.js";
import { env, requireClaudeEnv } from "../config/env.js";
import type { AccountDayState } from "../domain.js";
import { markQueued, produceVideo, type ProductionNotifier } from "../production/pipeline.js";
import { productionSettings } from "../production/settings.js";
import { productionLine } from "../slack/blocks.js";
import { Store } from "../store/store.js";
import { dateInTz } from "../util/date.js";

const { values } = parseArgs({
  options: {
    account: { type: "string" },
    index: { type: "string", default: "0" },
    date: { type: "string" },
  },
});

requireClaudeEnv();
const accounts = await loadAccounts(env.ACCOUNTS_FILE);
const account = accounts.find((a) => a.id === values.account);
if (!account) {
  console.error(`--account にアカウントIDを指定してください（${accounts.map((a) => a.id).join(", ")}）`);
  process.exit(1);
}

const store = new Store(join(env.DATA_DIR, "dry-run"));
const date = values.date ?? dateInTz(new Date(), env.TIMEZONE);
const index = Number(values.index);
const day = await store.getDay(date);
const proposal = day?.accounts[account.id]?.proposals?.[index];
if (!proposal) {
  console.error(`${date} の ${account.id} の企画（${index + 1}つ目）がありません。先に npm run plan:dry -- --account ${account.id} を実行してください。`);
  process.exit(1);
}
console.log(`「${proposal.title}」の動画を作ります`);

await store.updateAccount(date, account.id, (s) => {
  s.status = "approved";
  s.selectedIndex = index;
  delete s.production;
});
await markQueued(store, date, account.id);

class ConsoleNotifier implements ProductionNotifier {
  private last = "";
  async productionUpdated(_date: string, _account: Account, state: AccountDayState): Promise<void> {
    const line = productionLine(state.production);
    if (line !== this.last) console.log(line);
    this.last = line;
  }
}

await produceVideo({ ...productionSettings(), store, notifier: new ConsoleNotifier() }, account, date);

const p = (await store.getDay(date))?.accounts[account.id]?.production;
if (p?.status === "review") {
  console.log(`\n✅ 完成：${p.videoFile}（約${p.durationSec}秒）`);
  if (p.agentSummary) console.log(`エージェントのメモ：${p.agentSummary}`);
  for (const f of p.factsToCheck ?? []) console.log(`⚠ 確認してほしい事実：${f.claim}（根拠：${f.basis}）`);
  for (const w of p.warnings) console.log(`⚠ ${w}`);
  if (p.costUsd != null) console.log(`映像づくりの費用の目安：約$${p.costUsd.toFixed(2)}`);
} else {
  console.error(`\n⚠ 完成しませんでした：${p?.error ?? p?.status}`);
  process.exitCode = 1;
}
