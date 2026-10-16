// TikTok 公式の oEmbed API で、動画URLからキャプションと投稿者を取得する（ログイン不要・公式）。
// 再生数は取れないので、あなたが「伸びている」と判断して Slack に貼った動画の参考情報として使う。

export interface TikTokEmbedInfo {
  url: string;
  caption: string;
  authorName: string;
  thumbnailUrl: string | null;
}

const TIKTOK_URL = /https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s<>|]+/g;

/** テキスト中の TikTok URL を取り出す（Slack の <url|表示名> 形式にも対応） */
export function extractTikTokUrls(text: string): string[] {
  return [...new Set(text.match(TIKTOK_URL) ?? [])];
}

export async function fetchTikTokEmbed(url: string): Promise<TikTokEmbedInfo> {
  const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`TikTok oEmbed エラー ${res.status}`);
  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };
  return {
    url,
    caption: data.title ?? "",
    authorName: data.author_name ?? "",
    thumbnailUrl: data.thumbnail_url ?? null,
  };
}
