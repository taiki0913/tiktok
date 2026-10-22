// TikTok に投稿するときの説明文（投稿文＋ハッシュタグ）。
import type { Proposal } from "../domain.js";
import type { VideoScript } from "./scriptAgent.js";

/** 説明文とハッシュタグを、そのまま貼り付けられる1つの文章にする（TikTok の上限は2200文字） */
export function formatPostText(caption: string, hashtags: string[]): string {
  const tags = [...new Set(hashtags.map((h) => h.replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean))].map((h) => `#${h}`);
  return [caption.trim(), tags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2200);
}

/** 完成した台本の投稿文を使う（投稿文のない古い台本なら、企画の投稿文を使う） */
export function postTextFor(proposal: Proposal, script?: VideoScript): string {
  const caption = script?.postCaption || proposal.caption;
  const hashtags = script?.hashtags?.length ? script.hashtags : proposal.hashtags;
  return formatPostText(caption, hashtags);
}
