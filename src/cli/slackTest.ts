// Slack の設定（.env の3項目）が正しいかを確かめ、チャンネルにテストメッセージを送る。
//   npm run slack:test
import bolt from "@slack/bolt";
import { requireSlackEnv } from "../config/env.js";

const { WebClient } = bolt.webApi;

const HINTS: Record<string, string> = {
  invalid_auth: "トークンが正しくありません。貼り付けミス（前後の空白など）がないか確認してください",
  not_authed: "トークンが空です",
  channel_not_found: "SLACK_CHANNEL_ID が見つかりません。C から始まるIDか確認してください",
  not_in_channel: "ボットがチャンネルに招待されていません。チャンネルで /invite @tiktok-agent を送ってください",
  missing_scope: "権限が足りません。マニフェストで作り直すか、アプリを再インストールしてください",
};

function explain(e: unknown): string {
  const code = (e as { data?: { error?: string } }).data?.error ?? (e as Error).message;
  return `${code}${HINTS[code] ? ` → ${HINTS[code]}` : ""}`;
}

const slack = requireSlackEnv();
let ok = true;

if (!slack.botToken.startsWith("xoxb-")) {
  console.error("✗ SLACK_BOT_TOKEN は xoxb- で始まるトークンです（OAuth & Permissions の Bot User OAuth Token）");
  ok = false;
}
if (!slack.appToken.startsWith("xapp-")) {
  console.error("✗ SLACK_APP_TOKEN は xapp- で始まるトークンです（Basic Information の App-Level Tokens）");
  ok = false;
}

if (ok) {
  // 失敗時に何分も再試行し続けないよう、再試行は1回まで
  const options = { retryConfig: { retries: 1 } };
  const bot = new WebClient(slack.botToken, options);
  try {
    const auth = await bot.auth.test();
    console.log(`✓ ボットトークン OK（ワークスペース: ${auth.team}、ボット: ${auth.user}）`);
  } catch (e) {
    console.error(`✗ ボットトークン: ${explain(e)}`);
    ok = false;
  }

  try {
    await new WebClient(slack.appToken, options).apps.connections.open();
    console.log("✓ アプリレベルトークン OK（Socket Mode で接続できます）");
  } catch (e) {
    console.error(`✗ アプリレベルトークン: ${explain(e)}`);
    ok = false;
  }

  if (ok) {
    try {
      await bot.chat.postMessage({
        channel: slack.channelId,
        text: "✅ 接続テスト：TikTok企画エージェントからのメッセージが届きました",
      });
      console.log("✓ チャンネルへの投稿 OK（Slack を確認してください）");
    } catch (e) {
      console.error(`✗ チャンネルへの投稿: ${explain(e)}`);
      ok = false;
    }
  }
}

console.log(ok ? "\nSlack の設定は完了です。" : "\n上の ✗ を直してから、もう一度 npm run slack:test を実行してください。");
process.exitCode = ok ? 0 : 1;
