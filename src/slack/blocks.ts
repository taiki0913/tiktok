// Slack に表示するメッセージ（Block Kit）の組み立て。副作用のない関数だけを置く。
import type { types as Slack } from "@slack/bolt";
import { z } from "zod";
import { PRODUCTION_LABELS, type Account } from "../config/accounts.js";
import type { AccountDayState, DayState, Proposal } from "../domain.js";
import { formatJpDate } from "../util/date.js";

export const ACTIONS = {
  approve: "approve_proposal",
  openRevise: "open_revise_modal",
  skip: "skip_account",
  undo: "undo_decision",
  retry: "retry_account",
  saveReference: "save_reference",
} as const;
export const REVISE_CALLBACK = "revise_submit";

/** ボタンに埋め込む値。d=日付, a=アカウントID, i=案の番号 */
export const ButtonValueSchema = z.object({
  d: z.string(),
  a: z.string(),
  i: z.number().int().optional(),
});
export type ButtonValue = z.infer<typeof ButtonValueSchema>;

export const ReferenceValueSchema = z.object({
  a: z.string(),
  u: z.string(),
  c: z.string(),
  n: z.string(),
});

const LETTERS = ["A", "B", "C", "D", "E"];
export const proposalLetter = (i: number): string => LETTERS[i] ?? String(i + 1);

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function button(
  text: string,
  actionId: string,
  value: object,
  style?: "primary" | "danger",
): Slack.Button {
  return {
    type: "button",
    text: { type: "plain_text", text, emoji: true },
    action_id: actionId,
    value: JSON.stringify(value),
    ...(style ? { style } : {}),
  };
}

const mrkdwn = (text: string): Slack.SectionBlock => ({
  type: "section",
  text: { type: "mrkdwn", text: truncate(text, 3000) },
});

const context = (text: string): Slack.ContextBlock => ({
  type: "context",
  elements: [{ type: "mrkdwn", text: truncate(text, 3000) }],
});

function proposalText(p: Proposal, i: number): string {
  return [
    `*案${proposalLetter(i)}：${p.title}*`,
    `*つかみ*：${p.hook}`,
    p.summary,
    `*構成*：${p.outline.join(" → ")}`,
    `*根拠*：${p.basedOn}`,
    `*独自性*：${p.originality}`,
  ].join("\n");
}

export function accountBlocks(
  date: string,
  account: Account,
  accountIndex: number,
  state: AccountDayState,
): Slack.KnownBlock[] {
  const v = { d: date, a: account.id };
  const blocks: Slack.KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: truncate(`${accountIndex + 1}. ${account.name}`, 150), emoji: true },
    },
    context(`${PRODUCTION_LABELS[account.production]} ・ 投稿予定 ${account.postTime} ・ ${formatJpDate(date)}`),
  ];

  switch (state.status) {
    case "planning":
      blocks.push(mrkdwn("⏳ 競合調査と企画づくりをしています…"));
      break;

    case "error":
      blocks.push(
        mrkdwn(`⚠️ 企画の作成に失敗しました\n\`\`\`${truncate(state.error ?? "不明なエラー", 1500)}\`\`\``),
        { type: "actions", elements: [button("🔄 もう一度作る", ACTIONS.retry, v, "primary")] },
      );
      break;

    case "skipped":
      blocks.push(mrkdwn("⏭ 今日はこのアカウントの投稿をスキップします"), {
        type: "actions",
        elements: [button("↩️ 取り消す", ACTIONS.undo, v)],
      });
      break;

    case "approved": {
      const i = state.selectedIndex ?? 0;
      const p = state.proposals?.[i];
      blocks.push(
        mrkdwn(p ? `✅ *案${proposalLetter(i)}「${p.title}」に決定*\n${p.summary}` : "✅ 決定済み"),
        context("この企画で動画を作成します"),
        { type: "actions", elements: [button("↩️ 決定を取り消す", ACTIONS.undo, v)] },
      );
      break;
    }

    case "awaiting_approval": {
      if (state.research) {
        blocks.push(context(`🔎 *競合調査メモ*：${truncate(state.research.trendSummary, 600)}`));
      }
      blocks.push({ type: "divider" });
      (state.proposals ?? []).forEach((p, i) => {
        blocks.push(
          {
            ...mrkdwn(proposalText(p, i)),
            accessory: button(`案${proposalLetter(i)}で決定`, ACTIONS.approve, { ...v, i }, "primary"),
          },
          context(`尺 約${p.lengthSec}秒 ・ ${p.hashtags.map((h) => `#${h}`).join(" ")}`),
        );
      });
      blocks.push(
        { type: "divider" },
        {
          type: "actions",
          elements: [
            button("✏️ 修正を指示する", ACTIONS.openRevise, v),
            button("⏭ 今日はスキップ", ACTIONS.skip, v),
          ],
        },
      );
      break;
    }
  }
  return blocks;
}

export function accountFallbackText(account: Account, state: AccountDayState): string {
  const status: Record<AccountDayState["status"], string> = {
    planning: "企画を作成中",
    awaiting_approval: "企画の承認待ち",
    approved: "企画が決定しました",
    skipped: "今日はスキップ",
    error: "企画の作成に失敗しました",
  };
  return `${account.name}：${status[state.status]}`;
}

export function countDecided(day: DayState, accounts: Account[]): { decided: number; total: number } {
  const states = accounts.map((a) => day.accounts[a.id]).filter((s) => s !== undefined);
  return {
    decided: states.filter((s) => s.status === "approved" || s.status === "skipped").length,
    total: states.length,
  };
}

export function summaryBlocks(day: DayState, accounts: Account[]): Slack.KnownBlock[] {
  const lines = accounts
    .filter((a) => day.accounts[a.id])
    .map((a) => {
      const s = day.accounts[a.id]!;
      switch (s.status) {
        case "planning":
          return `⏳ ${a.name}：作成中…`;
        case "awaiting_approval":
          return `🟡 ${a.name}：承認待ち`;
        case "approved": {
          const i = s.selectedIndex ?? 0;
          return `✅ ${a.name}：案${proposalLetter(i)}「${s.proposals?.[i]?.title ?? ""}」`;
        }
        case "skipped":
          return `⏭ ${a.name}：スキップ`;
        case "error":
          return `⚠️ ${a.name}：エラー`;
      }
    });
  const { decided, total } = countDecided(day, accounts);
  return [
    { type: "header", text: { type: "plain_text", text: `☀️ ${formatJpDate(day.date)} の企画`, emoji: true } },
    mrkdwn(lines.join("\n") || "（対象アカウントなし）"),
    context(
      decided === total && total > 0
        ? `全${total}アカウントの決定が完了しました`
        : `決定 ${decided}/${total} ・ 下の各メッセージから案を選んでください`,
    ),
  ];
}

export function reviseModal(date: string, account: Account): Slack.View {
  return {
    type: "modal",
    callback_id: REVISE_CALLBACK,
    private_metadata: JSON.stringify({ d: date, a: account.id }),
    title: { type: "plain_text", text: "企画の修正指示" },
    submit: { type: "plain_text", text: "作り直す" },
    close: { type: "plain_text", text: "キャンセル" },
    blocks: [
      mrkdwn(`*${account.name}* の企画を作り直します。`),
      {
        type: "input",
        block_id: "instruction",
        optional: true,
        label: { type: "plain_text", text: "どう直してほしいですか？（空欄なら全体的に作り直し）" },
        element: {
          type: "plain_text_input",
          action_id: "text",
          multiline: true,
          placeholder: { type: "plain_text", text: "例：案Aの方向性で、もっと身近な題材にしてほしい" },
        },
      },
    ],
  };
}

export function referencePromptBlocks(
  caption: string,
  authorName: string,
  url: string,
  accounts: Account[],
): Slack.KnownBlock[] {
  const c = truncate(caption, 300);
  return [
    mrkdwn(`🔗 参考動画を受け取りました\n>${c || "（キャプションなし）"}\n>@${authorName}\nどのアカウントの参考にしますか？`),
    {
      type: "actions",
      elements: accounts.map((a) =>
        button(a.name, `${ACTIONS.saveReference}:${a.id}`, { a: a.id, u: url, c, n: authorName }),
      ),
    },
  ];
}
