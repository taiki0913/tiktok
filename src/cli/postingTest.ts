// 投稿のテスト：完成した動画を「自分だけに公開」で TikTok に投稿し、結果を表示する。
//   npm run posting:test -- --account cosmos                 … data/videos のそのアカウントの最新の動画
//   npm run posting:test -- --account cosmos --file 動画.mp4
// テストの投稿は TikTok アプリから削除してください。
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadAccounts } from "../config/accounts.js";
import { env } from "../config/env.js";
import { requireUploadPost } from "../posting/settings.js";
import { interpretStatus } from "../posting/uploadPost.js";

const { values } = parseArgs({ options: { account: { type: "string" }, file: { type: "string" } } });
const service = requireUploadPost();
const accounts = await loadAccounts(env.ACCOUNTS_FILE);
const account = accounts.find((a) => a.id === values.account);
if (!account) {
  console.error(`--account にアカウントIDを指定してください（${accounts.map((a) => a.id).join(", ")}）`);
  process.exit(1);
}

async function latestVideo(accountId: string): Promise<string | undefined> {
  const dir = join(env.DATA_DIR, "videos");
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".mp4") && f.includes(`-${accountId}-`));
  const withTime = await Promise.all(files.map(async (f) => ({ f, t: (await stat(join(dir, f))).mtimeMs })));
  const newest = withTime.sort((a, b) => b.t - a.t)[0];
  return newest && join(dir, newest.f);
}

const file = values.file ?? (await latestVideo(account.id));
if (!file) {
  console.error(`data/videos に ${account.id} の動画がありません。先に npm run produce:dry -- --account ${account.id} で作るか、--file で指定してください。`);
  process.exit(1);
}

console.log(`「${file}」を ${account.name} に、自分だけに公開で投稿します…`);
const ref = await service.publish({
  profile: account.id,
  videoFile: file,
  caption: "投稿テスト（自分だけに公開）",
  aigc: account.production === "ai_video",
  idempotencyKey: `test-${account.id}-${Date.now()}`,
  privacy: "SELF_ONLY",
});
console.log(`受け付けられました：${JSON.stringify(ref)}`);

// 結果が出るまで、15秒ごとに最大5分確かめる
let raw: unknown = null;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 15_000));
  raw = await service.status(ref);
  const result = interpretStatus(raw);
  if (result.state === "posted") {
    console.log(`\n✅ 投稿できました${result.url ? `：${result.url}` : ""}。TikTok アプリで確認し、テストの投稿は削除してください。`);
    break;
  }
  if (result.state === "failed") {
    console.error(`\n⚠ 投稿に失敗しました：${result.error}`);
    process.exitCode = 1;
    break;
  }
  console.log(`  まだ処理中です…（${(i + 1) * 15}秒）`);
}
console.log(`\n投稿サービスの応答（うまくいかないときは、これを開発者に送ってください）：\n${JSON.stringify(raw, null, 2)}`);
