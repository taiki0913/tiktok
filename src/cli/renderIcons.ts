// アカウントのプロフィール画像（1080×1080のPNG）を assets/profile-icons/ に書き出す。
//   npm run icons                     … 6アカウント分
//   npm run icons -- --account cosmos … 1アカウントだけ
// 絵は video/icons/ にある。Claude API は使わない。
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { loadAccounts } from "../config/accounts.js";
import { env } from "../config/env.js";
import { productionSettings } from "../production/settings.js";
import { iconCompositionId } from "../../video/icons/ids.js";

const OUT_DIR = join("assets", "profile-icons");

const { values } = parseArgs({ options: { account: { type: "string" } } });
const accounts = (await loadAccounts(env.ACCOUNTS_FILE)).filter((a) => !values.account || a.id === values.account);
if (accounts.length === 0) {
  console.error(`--account のアカウントIDが見つかりません：${values.account}`);
  process.exit(1);
}

const { render } = productionSettings();
const browser = { browserExecutable: render.browserExecutable ?? null, chromiumOptions: { gl: render.gl ?? null } };

console.log("絵を組み立て中…");
const serveUrl = await bundle({ entryPoint: join(process.cwd(), "video", "icons", "index.ts") });
await mkdir(OUT_DIR, { recursive: true });

for (const account of accounts) {
  const composition = await selectComposition({ serveUrl, id: iconCompositionId(account.id), ...browser, logLevel: "error" });
  const output = join(OUT_DIR, `${account.id}.png`);
  await renderStill({ serveUrl, composition, output, imageFormat: "png", ...browser, logLevel: "error" });
  console.log(`  ${account.name}：${output}`);
}
console.log("\n完了しました。");
