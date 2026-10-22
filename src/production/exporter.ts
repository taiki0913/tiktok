// 公開OKにした動画を、指定のフォルダ（.env の EXPORT_DIR。Googleドライブのフォルダなど）に保存する。
//   <EXPORT_DIR>/<日付>/<投稿時刻>_<アカウント名>.mp4 … 動画
//   <EXPORT_DIR>/<日付>/<投稿時刻>_<アカウント名>.txt … 投稿文（説明文＋ハッシュタグ。そのまま貼り付けられる）
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Account } from "../config/accounts.js";
import type { SavedState } from "../domain.js";
import type { Store } from "../store/store.js";
import type { ProductionNotifier } from "./pipeline.js";
import { postTextFor } from "./postText.js";

export interface SaveDeps {
  store: Store;
  notifier: ProductionNotifier;
  exportDir: string;
}

/** 保存するファイルの名前（拡張子なし）。投稿時刻の順に並ぶよう、時刻を先頭にする */
export function exportBaseName(account: Account): string {
  return `${account.postTime.replace(":", "")}_${account.name.replace(/[\\/:*?"<>|]/g, "_")}`;
}

/** 公開OKの動画と投稿文を保存し、結果を記録して知らせる（例外は投げない） */
export async function saveApprovedVideo(deps: SaveDeps, account: Account, date: string): Promise<void> {
  const s = (await deps.store.getDay(date))?.accounts[account.id];
  const p = s?.production;
  const proposal = s?.proposals?.[s.selectedIndex ?? -1];
  if (!p || p.status !== "approved" || !p.videoFile || !proposal) return;

  const text = postTextFor(proposal, p.script);
  const dir = resolve(deps.exportDir, date);
  const base = exportBaseName(account);
  let saved: SavedState;
  try {
    await mkdir(dir, { recursive: true });
    const videoFile = join(dir, `${base}.mp4`);
    const textFile = join(dir, `${base}.txt`);
    await copyFile(p.videoFile, videoFile);
    await writeFile(textFile, `${text}\n`, "utf8");
    saved = { status: "saved", videoFile, textFile, text };
  } catch (e) {
    console.error(`[save] ${account.id}：保存に失敗`, e);
    saved = { status: "failed", text, error: e instanceof Error ? e.message : String(e) };
  }
  const state = await deps.store.updateAccount(date, account.id, (st) => {
    if (st.production) st.production.saved = saved;
  });
  await deps.notifier.productionUpdated(date, account, state);
}
