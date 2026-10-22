// Slack に表示するメッセージ（Block Kit）の組み立て。副作用のない関数だけを置く。
import type { types as Slack } from "@slack/bolt";
import { z } from "zod";
import { PRODUCTION_LABELS, type Account } from "../config/accounts.js";
import { env } from "../config/env.js";
import type { AccountDayState, DayState, PostState, ProductionState, Proposal, SavedState } from "../domain.js";
import { isPostLocked } from "../posting/publisher.js";
import { formatJpDate, formatJpDateTime } from "../util/date.js";

export const ACTIONS = {
  approve: "approve_proposal",
  openRevise: "open_revise_modal",
  skip: "skip_account",
  undo: "undo_decision",
  retry: "retry_account",
  saveReference: "save_reference",
  videoApprove: "video_approve",
  videoReviseOpen: "video_revise_open",
  videoRetry: "video_retry",
  postCancel: "post_cancel",
  postRetry: "post_retry",
  saveRetry: "save_retry",
} as const;
export const REVISE_CALLBACK = "revise_submit";
export const VIDEO_REVISE_CALLBACK = "video_revise_submit";

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

const BUSY: ProductionState["status"][] = ["queued", "scripting", "voicing", "coding", "rendering"];
export const isProductionBusy = (p?: ProductionState): boolean => !!p && BUSY.includes(p.status);

/** 決定したアカウントのメッセージに出す、動画づくりの進み具合 */
export function productionLine(p?: ProductionState): string {
  if (!p) return "🎬 この企画で動画を作成します";
  const v = p.version > 1 ? `（${p.version}回目）` : "";
  switch (p.status) {
    case "queued":
      return `🎬 動画：順番待ち${v}`;
    case "scripting":
      return `🎬 動画：台本を作成中…${v}`;
    case "voicing":
      return `🎬 動画：ナレーションを作成中…${v}`;
    case "coding":
      return `🎬 動画：映像を作成中…（数分〜十数分）${v}`;
    case "rendering":
      return `🎬 動画：書き出し中…${v}`;
    case "review":
      return "🎬 動画ができました。このメッセージのスレッドで確認してください";
    case "approved":
      return p.post ? postLine(p.post) : savedLine(p.saved);
    case "failed":
      return "⚠️ 動画の作成に失敗しました。スレッドを確認してください";
    case "unsupported":
      return "🎬 この作り方（漫画・AI映像）の動画づくりは準備中です";
  }
}

const postTime = (post: PostState): string => (post.scheduledAt ? formatJpDateTime(post.scheduledAt, env.TIMEZONE) : "");

/** 公開OKのあとの、保存の結果 */
function savedLine(saved?: SavedState): string {
  switch (saved?.status) {
    case undefined:
      return "✅ 動画：公開OK（保存中…）";
    case "saved":
      return "📁 動画：公開OK・保存しました（投稿文はスレッドにあります）";
    case "failed":
      return "⚠️ 動画の保存に失敗しました。スレッドを確認してください";
  }
}

/** 公開OKのあとの、自動投稿の進み具合 */
function postLine(post: PostState): string {
  switch (post.status) {
    case "scheduling":
      return "📤 TikTokへの投稿を準備中…";
    case "scheduled":
      return `📅 ${postTime(post)} にTikTokへ投稿予約済み`;
    case "posting":
      return "📤 TikTokに投稿中…";
    case "posted":
      return post.url ? `🎉 TikTokに投稿しました（<${post.url}|動画を見る>）` : "🎉 TikTokに投稿しました";
    case "failed":
      return "⚠️ TikTokへの投稿に失敗しました。スレッドを確認してください";
    case "canceled":
      return "⏹ 投稿予約を取り消しました";
    case "unknown":
      return "❔ 投稿の結果を確認できませんでした。TikTokアプリで確認してください";
  }
}

const POST_SHORT: Record<PostState["status"], string> = {
  scheduling: "📤投稿準備中",
  scheduled: "📅投稿予約済み",
  posting: "📤投稿中",
  posted: "🎉投稿済み",
  failed: "⚠️投稿失敗",
  canceled: "⏹予約取り消し",
  unknown: "❔投稿結果不明",
};

/** 一覧メッセージ用の短い表示 */
function productionShort(p?: ProductionState): string {
  if (!p) return "";
  if (p.status === "approved" && p.post) return `　${POST_SHORT[p.post.status]}`;
  if (p.status === "approved" && p.saved) return p.saved.status === "saved" ? "　📁保存済み" : "　⚠️保存失敗";
  const label: Record<ProductionState["status"], string> = {
    queued: "🎬順番待ち",
    scripting: "🎬制作中",
    voicing: "🎬制作中",
    coding: "🎬制作中",
    rendering: "🎬制作中",
    review: "🎬確認待ち",
    approved: "🎬公開OK",
    failed: "⚠️動画失敗",
    unsupported: "🎬準備中",
  };
  return `　${label[p.status]}`;
}

/** スレッドに出す、完成した動画の確認メッセージ */
export function reviewBlocks(date: string, account: Account, p: ProductionState): Slack.KnownBlock[] {
  const v = { d: date, a: account.id };
  if (p.status === "approved") return approvedBlocks(v, account, p);
  const blocks: Slack.KnownBlock[] = [
    mrkdwn(`🎬 *動画ができました*（約${p.durationSec ?? "?"}秒・${p.version}回目）\n${p.agentSummary ?? ""}`),
  ];
  if (p.factsToCheck && p.factsToCheck.length > 0) {
    blocks.push(
      mrkdwn(
        `⚠️ *確認してほしい事実*（台本エージェントが自信なしとしたもの）\n${p.factsToCheck
          .map((f) => `• ${f.claim}（根拠：${f.basis}）`)
          .join("\n")}`,
      ),
    );
  }
  const notes = [...p.warnings, ...(p.costUsd != null ? [`映像づくりの費用の目安：約$${p.costUsd.toFixed(2)}`] : [])];
  if (notes.length > 0) blocks.push(context(notes.join("　/　")));
  blocks.push({
    type: "actions",
    elements: [button("✅ 公開OK", ACTIONS.videoApprove, v, "primary"), button("✏️ 作り直す", ACTIONS.videoReviseOpen, v)],
  });
  return blocks;
}

/** 公開OKにしたあとの確認メッセージ：保存先と、（自動投稿を使うときは）投稿の予約・結果 */
function approvedBlocks(v: { d: string; a: string }, account: Account, p: ProductionState): Slack.KnownBlock[] {
  const saved = p.saved;
  const blocks: Slack.KnownBlock[] = [];
  if (!saved) {
    blocks.push(mrkdwn("✅ *公開OKにしました*\n📁 動画を保存しています…"));
  } else if (saved.status === "saved") {
    blocks.push(
      mrkdwn(
        `✅ *公開OKにしました*\n📁 保存しました：\`${saved.videoFile ?? ""}\`\n🕖 投稿の目安：${account.postTime}\n📝 投稿文（説明文とハッシュタグ）は、同じ名前の .txt と、この下のメッセージにあります（長押しでコピーできます）`,
      ),
    );
  } else {
    blocks.push(
      mrkdwn(`✅ *公開OKにしました*\n⚠️ *動画を保存できませんでした*\n\`\`\`${truncate(saved.error ?? "不明なエラー", 1000)}\`\`\``),
      { type: "actions", elements: [button("📁 もう一度保存する", ACTIONS.saveRetry, v, "primary")] },
    );
  }
  if (p.post) blocks.push(...postBlocks(v, p.post));
  return blocks;
}

/** 自動投稿（UPLOAD_POST_API_KEY を設定したときだけ）の予約・結果と、取り消し・やり直しのボタン */
function postBlocks(v: { d: string; a: string }, post: PostState): Slack.KnownBlock[] {
  switch (post.status) {
    case "scheduling":
      return [context("📤 投稿サービスにアップロードしています…")];
    case "scheduled":
      return [
        mrkdwn(`📅 *${postTime(post)} にTikTokへ投稿予約しました*（その時刻にPCが止まっていても投稿されます）`),
        ...(post.error ? [context(`⚠️ ${post.error}`)] : []),
        { type: "actions", elements: [button("⏹ 予約を取り消す", ACTIONS.postCancel, v, "danger")] },
      ];
    case "posting":
      return [mrkdwn("📤 投稿時刻を過ぎていたので、すぐにTikTokへ投稿しています…")];
    case "posted":
      return [mrkdwn(`🎉 *TikTokに投稿しました*${post.url ? `\n<${post.url}|投稿した動画を見る>` : ""}`)];
    case "failed":
      return [
        mrkdwn(`⚠️ *TikTokへの投稿に失敗しました*\n\`\`\`${truncate(post.error ?? "不明なエラー", 1500)}\`\`\``),
        { type: "actions", elements: [button("🔄 もう一度投稿する", ACTIONS.postRetry, v, "primary")] },
      ];
    case "canceled":
      return [
        mrkdwn("⏹ *投稿予約を取り消しました*"),
        { type: "actions", elements: [button("📅 もう一度予約する", ACTIONS.postRetry, v)] },
      ];
    case "unknown":
      return [mrkdwn("❔ *投稿の結果を確認できませんでした*\n二重に投稿しないよう、自動ではやり直しません。TikTokアプリで投稿されているか確認してください。")];
  }
}

export function failureBlocks(date: string, accountId: string, p: ProductionState): Slack.KnownBlock[] {
  return [
    mrkdwn(`⚠️ *動画の作成に失敗しました*（${p.version}回目）\n\`\`\`${truncate(p.error ?? "不明なエラー", 1500)}\`\`\``),
    { type: "actions", elements: [button("🔄 もう一度作る", ACTIONS.videoRetry, { d: date, a: accountId }, "primary")] },
  ];
}

export function videoReviseModal(date: string, account: Account): Slack.View {
  return {
    type: "modal",
    callback_id: VIDEO_REVISE_CALLBACK,
    private_metadata: JSON.stringify({ d: date, a: account.id }),
    title: { type: "plain_text", text: "動画の作り直し" },
    submit: { type: "plain_text", text: "作り直す" },
    close: { type: "plain_text", text: "キャンセル" },
    blocks: [
      mrkdwn(`*${account.name}* の動画を作り直します。`),
      {
        type: "input",
        block_id: "mode",
        label: { type: "plain_text", text: "どこから作り直しますか？" },
        element: {
          type: "radio_buttons",
          action_id: "value",
          initial_option: { text: { type: "plain_text", text: "映像だけ直す" }, value: "visual" },
          options: [
            { text: { type: "plain_text", text: "映像だけ直す" }, value: "visual" },
            { text: { type: "plain_text", text: "台本から作り直す" }, value: "script" },
          ],
        },
      },
      {
        type: "input",
        block_id: "instruction",
        label: { type: "plain_text", text: "どう直してほしいですか？" },
        element: {
          type: "plain_text_input",
          action_id: "text",
          multiline: true,
          placeholder: { type: "plain_text", text: "例：冒頭をもっと派手に。グラフの文字が小さい" },
        },
      },
    ],
  };
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
        context(productionLine(state.production)),
      );
      const actions: Slack.Button[] = [];
      // 失敗したときは、スレッドを開かなくてもやり直せるようにする
      if (state.production?.status === "failed") actions.push(button("🔄 動画をもう一度作る", ACTIONS.videoRetry, v, "primary"));
      // 動画づくりの途中や、投稿の予約・投稿のあとは取り消せない（作りかけ・予約済みのものと食い違わないように）
      if (!isProductionBusy(state.production) && !isPostLocked(state.production?.post)) {
        actions.push(button("↩️ 決定を取り消す", ACTIONS.undo, v));
      }
      if (actions.length > 0) blocks.push({ type: "actions", elements: actions });
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
          return `✅ ${a.name}：案${proposalLetter(i)}「${s.proposals?.[i]?.title ?? ""}」${productionShort(s.production)}`;
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
