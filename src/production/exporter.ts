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

/** 動画と投稿文を <exportDir>/<日付>/ に書き出し、保存したファイルの場所を返す */
export async function writeExport(opts: {
  exportDir: string;
  date: string;
  account: Account;
  videoFile: string;
  text: string;
}): Promise<{ videoFile: string; textFile: string }> {
  const dir = resolve(opts.exportDir, opts.date);
  const base = exportBaseName(opts.account);
  await mkdir(dir, { recursive: true });
  const videoFile = join(dir, `${base}.mp4`);
  const textFile = join(dir, `${base}.txt`);
  await copyFile(opts.videoFile, videoFile);
  await writeFile(textFile, `${opts.text}\n`, "utf8");
  return { videoFile, textFile };
}

/** 公開OKの動画と投稿文を保存し、結果を記録して知らせる（例外は投げない） */
export async function saveApprovedVideo(deps: SaveDeps, account: Account, date: string): Promise<void> {
  const s = (await deps.store.getDay(date))?.accounts[account.id];
  const p = s?.production;
  const proposal = s?.proposals?.[s.selectedIndex ?? -1];
  if (!p || p.status !== "approved" || !p.videoFile || !proposal) return;

  const text = postTextFor(proposal, p.script);
  let saved: SavedState;
  try {
    const files = await writeExport({ exportDir: deps.exportDir, date, account, videoFile: p.videoFile, text });
    saved = { status: "saved", ...files, text };
  } catch (e) {
    console.error(`[save] ${account.id}：保存に失敗`, e);
    saved = { status: "failed", text, error: e instanceof Error ? e.message : String(e) };
  }
  const state = await deps.store.updateAccount(date, account.id, (st) => {
    if (st.production) st.production.saved = saved;
  });
  await deps.notifier.productionUpdated(date, account, state);
}
