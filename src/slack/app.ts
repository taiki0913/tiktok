// Slack ボット：毎朝の企画を投稿し、ボタンで承認・修正・スキップを受け付ける。
// Socket Mode を使うので、自宅PCでも外部公開のURLなしで動く。
import bolt from "@slack/bolt";
import type { App as BoltApp, BlockAction, ButtonAction } from "@slack/bolt";
import type { Account } from "../config/accounts.js";
import type { SlackEnv } from "../config/env.js";
import type { AccountDayState, DayState } from "../domain.js";
import { planAccount, type PlanNotifier, type PlanningDeps } from "../jobs/planning.js";
import { extractTikTokUrls, fetchTikTokEmbed } from "../research/tiktokOembed.js";
import type { Store } from "../store/store.js";
import { formatJpDate } from "../util/date.js";
import {
  ACTIONS,
  accountBlocks,
  accountFallbackText,
  ButtonValueSchema,
  countDecided,
  ReferenceValueSchema,
  referencePromptBlocks,
  REVISE_CALLBACK,
  reviseModal,
  summaryBlocks,
} from "./blocks.js";

const { App } = bolt;

/** Slack に企画の状態を反映する */
class SlackNotifier implements PlanNotifier {
  constructor(
    private readonly app: BoltApp,
    private readonly channel: string,
    private readonly store: Store,
    private readonly accounts: Account[],
  ) {}

  async prepareDay(day: DayState, accounts: Account[]): Promise<void> {
    if (!day.slackSummary) {
      const res = await this.app.client.chat.postMessage({
        channel: this.channel,
        text: `${formatJpDate(day.date)} の企画`,
        blocks: summaryBlocks(day, accounts),
      });
      await this.store.updateDay(day.date, (d) => {
        d.slackSummary = { channel: res.channel!, ts: res.ts! };
      });
    }
    for (const a of accounts) {
      const state = day.accounts[a.id];
      if (state && !state.slack) await this.postAccount(day.date, a, state);
    }
  }

  private async postAccount(date: string, account: Account, state: AccountDayState): Promise<void> {
    const res = await this.app.client.chat.postMessage({
      channel: this.channel,
      text: accountFallbackText(account, state),
      blocks: accountBlocks(date, account, this.accounts.indexOf(account), state),
    });
    await this.store.updateAccount(date, account.id, (s) => {
      s.slack = { channel: res.channel!, ts: res.ts! };
    });
  }

  async accountUpdated(date: string, account: Account, state: AccountDayState): Promise<void> {
    if (state.slack) {
      await this.app.client.chat.update({
        channel: state.slack.channel,
        ts: state.slack.ts,
        text: accountFallbackText(account, state),
        blocks: accountBlocks(date, account, this.accounts.indexOf(account), state),
      });
    } else {
      await this.postAccount(date, account, state);
    }
    await this.refreshSummary(date);
  }

  async summaryUpdated(day: DayState): Promise<void> {
    await this.refreshSummary(day.date);
  }

  /** 一覧メッセージを更新し、全アカウントが決まったら一度だけ知らせる */
  async refreshSummary(date: string): Promise<void> {
    const day = await this.store.getDay(date);
    if (!day?.slackSummary) return;
    await this.app.client.chat.update({
      channel: day.slackSummary.channel,
      ts: day.slackSummary.ts,
      text: `${formatJpDate(date)} の企画`,
      blocks: summaryBlocks(day, this.accounts),
    });

    const { decided, total } = countDecided(day, this.accounts);
    const allDecided = total > 0 && decided === total;
    if (allDecided && !day.allDecidedNotified) {
      const approved = Object.values(day.accounts).filter((s) => s.status === "approved").length;
      await this.app.client.chat.postMessage({
        channel: day.slackSummary.channel,
        thread_ts: day.slackSummary.ts,
        reply_broadcast: true,
        text: `🎬 ${formatJpDate(date)} の企画がすべて決まりました（制作 ${approved}本・スキップ ${total - approved}本）`,
      });
    }
    if (allDecided !== !!day.allDecidedNotified) {
      await this.store.updateDay(date, (d) => {
        d.allDecidedNotified = allDecided;
      });
    }
  }
}

export interface SlackBot {
  app: BoltApp;
  deps: PlanningDeps;
}

export function createSlackBot(opts: {
  slack: SlackEnv;
  accounts: Account[];
  store: Store;
  /** チャンネルで「企画作成」と書かれたときに呼ぶ */
  onRunRequested: () => Promise<void>;
}): SlackBot {
  const { slack, accounts, store } = opts;
  const app = new App({ token: slack.botToken, appToken: slack.appToken, socketMode: true });
  const notifier = new SlackNotifier(app, slack.channelId, store, accounts);
  const deps: PlanningDeps = { store, notifier, accounts };

  const findAccount = (id: string): Account => {
    const a = accounts.find((x) => x.id === id);
    if (!a) throw new Error(`不明なアカウント: ${id}`);
    return a;
  };

  /** 時間のかかる処理はボタンへの応答（ack）のあとで裏で動かす */
  const background = (label: string, task: Promise<unknown>): void => {
    task.catch((e) => console.error(`[slack] ${label} に失敗`, e));
  };

  /** ボタンの値を読み取り、そのアカウントの状態を書き換えて Slack に反映する */
  const handleDecision = (
    actionId: string,
    change: (s: AccountDayState, i: number | undefined) => void,
  ): void => {
    app.action<BlockAction<ButtonAction>>(actionId, async ({ ack, action }) => {
      await ack();
      const v = ButtonValueSchema.parse(JSON.parse(action.value ?? "{}"));
      const account = findAccount(v.a);
      const state = await store.updateAccount(v.d, v.a, (s) => change(s, v.i));
      await notifier.accountUpdated(v.d, account, state);
    });
  };

  handleDecision(ACTIONS.approve, (s, i) => {
    if (s.status !== "awaiting_approval" || i === undefined || !s.proposals?.[i]) return;
    s.status = "approved";
    s.selectedIndex = i;
  });

  handleDecision(ACTIONS.skip, (s) => {
    if (s.status === "awaiting_approval" || s.status === "error") s.status = "skipped";
  });

  handleDecision(ACTIONS.undo, (s) => {
    if ((s.status === "approved" || s.status === "skipped") && s.proposals) {
      s.status = "awaiting_approval";
      delete s.selectedIndex;
    } else if (s.status === "skipped") {
      s.status = "error";
      s.error = "企画がまだありません。「もう一度作る」を押してください";
    }
  });

  app.action<BlockAction<ButtonAction>>(ACTIONS.retry, async ({ ack, action }) => {
    await ack();
    const v = ButtonValueSchema.parse(JSON.parse(action.value ?? "{}"));
    background("再作成", planAccount(deps, findAccount(v.a), v.d));
  });

  app.action<BlockAction<ButtonAction>>(ACTIONS.openRevise, async ({ ack, action, body, client }) => {
    await ack();
    const v = ButtonValueSchema.parse(JSON.parse(action.value ?? "{}"));
    await client.views.open({ trigger_id: body.trigger_id, view: reviseModal(v.d, findAccount(v.a)) });
  });

  app.view(REVISE_CALLBACK, async ({ ack, view }) => {
    await ack();
    const v = ButtonValueSchema.parse(JSON.parse(view.private_metadata));
    const instruction = view.state.values.instruction?.text?.value?.trim() ?? "";
    background("修正", planAccount(deps, findAccount(v.a), v.d, instruction));
  });

  app.action<BlockAction<ButtonAction>>(
    new RegExp(`^${ACTIONS.saveReference}:`),
    async ({ ack, action, body, client }) => {
      await ack();
      const v = ReferenceValueSchema.parse(JSON.parse(action.value ?? "{}"));
      const account = findAccount(v.a);
      await store.addReference({
        accountId: v.a,
        url: v.u,
        caption: v.c,
        authorName: v.n,
        addedAt: new Date().toISOString(),
      });
      if (body.channel?.id && body.message?.ts) {
        const text = `✅ 「${account.name}」の参考動画に登録しました`;
        await client.chat.update({
          channel: body.channel.id,
          ts: body.message.ts,
          text,
          blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
        });
      }
    },
  );

  app.message(async ({ message, client }) => {
    // 編集・削除などの通知や、ボット自身の投稿には反応しない
    if (message.subtype !== undefined || message.bot_id || message.channel !== slack.channelId) return;
    const text = message.text ?? "";

    if (text.trim() === "企画作成") {
      background("企画作成", opts.onRunRequested());
      return;
    }

    for (const url of extractTikTokUrls(text)) {
      const info = await fetchTikTokEmbed(url).catch((e) => {
        console.warn(`[slack] oEmbed 取得に失敗: ${url}`, e);
        return { caption: "", authorName: "不明" };
      });
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: "どのアカウントの参考にしますか？",
        blocks: referencePromptBlocks(info.caption, info.authorName, url, accounts),
      });
    }
  });

  app.error(async (e) => {
    console.error("[slack] エラー", e);
  });

  return { app, deps };
}
