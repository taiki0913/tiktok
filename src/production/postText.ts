// TikTok に投稿するときの説明文（投稿文＋ハッシュタグ＋ナレーションと写真のクレジット）。
import type { Account } from "../config/accounts.js";
import type { ProductionState, Proposal } from "../domain.js";
import { photoCreditsText } from "./photos.js";

/** 説明文・ハッシュタグ・クレジットを、そのまま貼り付けられる1つの文章にする（TikTok の上限は2200文字） */
export function formatPostText(caption: string, hashtags: string[], credit?: string | null): string {
  const tags = [...new Set(hashtags.map((h) => h.replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean))].map((h) => `#${h}`);
  const tail = credit ? `\n\n${credit}` : "";
  return [caption.trim(), tags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2200 - tail.length) + tail;
}

/**
 * ナレーションのクレジット（VOICEVOX の利用規約で必要）。動画の中ではなく投稿文に入れる。
 * 記録のない古い動画は、アカウントの声で VOICEVOX を使ったものとみなす。
 */
export function voiceCreditFor(account: Account, p?: ProductionState): string | null {
  return p?.voiceCredit !== undefined ? p.voiceCredit : `VOICEVOX:${account.voice.speaker}`;
}

/** 完成した台本の投稿文を使う（投稿文のない古い台本なら、企画の投稿文を使う） */
export function postTextFor(account: Account, proposal: Proposal, p?: ProductionState): string {
  const script = p?.script;
  const caption = script?.postCaption || proposal.caption;
  const hashtags = script?.hashtags?.length ? script.hashtags : proposal.hashtags;
  const credits = [voiceCreditFor(account, p), photoCreditsText(p?.photos)].filter(Boolean).join("\n\n");
  return formatPostText(caption, hashtags, credits || null);
}
