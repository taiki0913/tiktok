// YouTube Data API v3（公式API）で、ジャンルごとに直近で伸びているショート動画を集める。
// 無料枠は1日10,000ユニット。search.list が1回100ユニットなので、1日あたり約90回まで検索できる。

const API = "https://www.googleapis.com/youtube/v3";
const SHORTS_MAX_SEC = 180;

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  durationSec: number;
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
  /** 公開からの1日あたり再生数（伸びの勢い） */
  viewsPerDay: number;
  url: string;
}

/** ISO 8601 の動画時間（例: PT1M5S）を秒に変換する */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return NaN;
  const [, d, h, min, s] = m.map((v) => (v ? Number(v) : 0)) as number[];
  return d! * 86400 + h! * 3600 + min! * 60 + s!;
}

interface SearchResponse {
  items?: { id?: { videoId?: string } }[];
}

interface VideosResponse {
  items?: {
    id: string;
    snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
}

async function getJson<T>(url: URL): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API エラー ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const toNum = (v: string | undefined): number | null => (v === undefined ? null : Number(v));

export function toVideos(data: VideosResponse, now: Date): YouTubeVideo[] {
  return (data.items ?? [])
    .map((v) => {
      const publishedAt = v.snippet?.publishedAt ?? now.toISOString();
      const ageDays = Math.max((now.getTime() - Date.parse(publishedAt)) / 86_400_000, 0.5);
      const viewCount = toNum(v.statistics?.viewCount) ?? 0;
      return {
        id: v.id,
        title: v.snippet?.title ?? "",
        channelTitle: v.snippet?.channelTitle ?? "",
        publishedAt,
        durationSec: parseIsoDuration(v.contentDetails?.duration ?? ""),
        viewCount,
        likeCount: toNum(v.statistics?.likeCount),
        commentCount: toNum(v.statistics?.commentCount),
        viewsPerDay: Math.round(viewCount / ageDays),
        url: `https://www.youtube.com/shorts/${v.id}`,
      };
    })
    .filter((v) => v.durationSec > 0 && v.durationSec <= SHORTS_MAX_SEC);
}

/** 1つの検索語で、直近 days 日に公開された日本語ショートを再生数順に取得する */
export async function searchRecentShorts(
  apiKey: string,
  query: string,
  { days = 7, maxResults = 15, now = new Date() } = {},
): Promise<YouTubeVideo[]> {
  const search = new URL(`${API}/search`);
  search.search = new URLSearchParams({
    part: "id",
    q: query,
    type: "video",
    videoDuration: "short",
    order: "viewCount",
    regionCode: "JP",
    relevanceLanguage: "ja",
    publishedAfter: new Date(now.getTime() - days * 86_400_000).toISOString(),
    maxResults: String(maxResults),
    key: apiKey,
  }).toString();
  const ids = ((await getJson<SearchResponse>(search)).items ?? [])
    .map((i) => i.id?.videoId)
    .filter((id): id is string => !!id);
  if (ids.length === 0) return [];

  const videos = new URL(`${API}/videos`);
  videos.search = new URLSearchParams({
    part: "snippet,contentDetails,statistics",
    id: ids.join(","),
    key: apiKey,
  }).toString();
  return toVideos(await getJson<VideosResponse>(videos), now);
}

/** タイトルにひらがな・カタカナ・漢字を含むか（日本語の動画かどうかの目安） */
export function isJapaneseTitle(title: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(title);
}

/** 複数の検索語の結果をまとめ、重複を除いて勢い順に上位 limit 件を返す */
export async function collectTrendingShorts(
  apiKey: string,
  queries: readonly string[],
  { limit = 15, japaneseOnly = true } = {},
): Promise<YouTubeVideo[]> {
  const byId = new Map<string, YouTubeVideo>();
  for (const q of queries) {
    for (const v of await searchRecentShorts(apiKey, q)) {
      if (!japaneseOnly || isJapaneseTitle(v.title)) byId.set(v.id, v);
    }
  }
  return [...byId.values()].sort((a, b) => b.viewsPerDay - a.viewsPerDay).slice(0, limit);
}
