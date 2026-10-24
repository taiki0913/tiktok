// お試し実行（--dry-run）用：Slack の代わりにコンソールへ企画を表示する。
import { PRODUCTION_LABELS, type Account } from "../config/accounts.js";
import type { AccountDayState, DayState } from "../domain.js";
import { proposalLetter } from "../slack/blocks.js";
import type { PlanNotifier } from "./planning.js";

export class ConsoleNotifier implements PlanNotifier {
  async prepareDay(day: DayState): Promise<void> {
    console.log(`\n===== ${day.date} の企画づくりを開始 =====`);
  }

  async accountUpdated(_date: string, account: Account, state: AccountDayState): Promise<void> {
    const head = `\n■ ${account.name}（${PRODUCTION_LABELS[account.production]}）`;
    if (state.status === "planning") {
      console.log(`${head}：作成中…`);
      return;
    }
    if (state.status === "awaiting_choice") {
      console.log(`${head}：第${state.seriesAsk?.episode}話のコメントの結果待ち（Slack で選んでください）`);
      return;
    }
    if (state.status === "error") {
      console.log(`${head}：失敗 — ${state.error}`);
      return;
    }
    console.log(head);
    if (state.research) console.log(`  調査メモ: ${state.research.trendSummary}`);
    state.proposals?.forEach((p, i) => {
      console.log(`  [案${proposalLetter(i)}] ${p.title}（約${p.lengthSec}秒）`);
      console.log(`     つかみ: ${p.hook}`);
      console.log(`     内容: ${p.summary}`);
      console.log(`     構成: ${p.outline.join(" → ")}`);
      console.log(`     根拠: ${p.basedOn}`);
    });
  }

  async summaryUpdated(day: DayState): Promise<void> {
    const n = Object.values(day.accounts).filter((s) => s.status === "awaiting_approval").length;
    console.log(`\n===== 完了：${n}アカウントの企画ができました =====`);
  }
}
