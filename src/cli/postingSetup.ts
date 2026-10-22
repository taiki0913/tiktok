// 投稿サービス（Upload-Post）の初期設定と確認。何度実行しても大丈夫。
//   npm run posting:setup                     … 動画を作れる4アカウント分
//   npm run posting:setup -- --account cosmos … 1アカウントだけ
// アカウントごとにプロフィール（名前はアカウントID）を作り、TikTok とつながっていなければ、つなぐためのURLを表示する。
import { parseArgs } from "node:util";
import { CODE_PRODUCIBLE, loadAccounts } from "../config/accounts.js";
import { env } from "../config/env.js";
import { requireUploadPost } from "../posting/settings.js";

const { values } = parseArgs({ options: { account: { type: "string" } } });
const service = requireUploadPost();
const all = await loadAccounts(env.ACCOUNTS_FILE);
const accounts = values.account ? all.filter((a) => a.id === values.account) : all.filter((a) => CODE_PRODUCIBLE.includes(a.production));
if (accounts.length === 0) {
  console.error(`--account のアカウントIDが見つかりません：${values.account}（使えるID: ${all.map((a) => a.id).join(", ")}）`);
  process.exit(1);
}

const profiles = await service.profiles();
let waiting = 0;
for (const account of accounts) {
  console.log(`\n■ ${account.name}（プロフィール名：${account.id}）`);
  if (!profiles.has(account.id)) {
    try {
      await service.createProfile(account.id);
      console.log("  プロフィールを作りました");
    } catch (e) {
      console.error(`  ⚠ プロフィールを作れませんでした：${e instanceof Error ? e.message : e}`);
      console.error("    料金プランのプロフィール数の上限を超えていないか、Upload-Post の画面で確認してください");
      continue;
    }
  }
  const tiktok = profiles.get(account.id);
  if (tiktok) {
    console.log(`  ✅ TikTok とつながっています（${tiktok}）`);
    const settings = await service.tiktokSettings(account.id).catch((e: unknown) => `取得できませんでした：${e instanceof Error ? e.message : e}`);
    console.log(`  TikTok の投稿設定：${JSON.stringify(settings)}`);
  } else {
    waiting++;
    const url = await service.connectUrl(account.id, `${account.name} の TikTok をつなぐ`);
    console.log("  🔗 まだ TikTok とつながっていません。次のURLを開き、TikTok を選んで、");
    console.log(`     「${account.name}」の TikTok アカウントでログインしてください：`);
    console.log(`     ${url}`);
  }
}

console.log(
  waiting > 0
    ? `\nURLを開いて ${waiting} アカウントをつないだら、もう一度 npm run posting:setup を実行して ✅ になったか確かめてください。`
    : "\nすべてつながっています。npm run posting:test -- --account <ID> で、自分だけに見える投稿を試せます。",
);
