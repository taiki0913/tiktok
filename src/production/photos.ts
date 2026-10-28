// 本物の写真を探す。台本エージェントが「本物の写真があると強い」とした場面について、
// Wikimedia Commons の公式APIで、自由に使える（パブリックドメイン・CC0・CC BY）と明記された写真だけを集め、
// Claude が説明と画像を見て、本当にその写真か確かめてから選ぶ。取り違えそうなら使わない（CGだけで作る）。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { generateStructured } from "../llm/claude.js";
import type { JobPhoto } from "../../video/kit/job.js";
import type { VideoScript } from "./scriptAgent.js";

const API = "https://commons.wikimedia.org/w/api.php";
/** Wikimedia の決まりで、問い合わせ元が分かる User-Agent を付ける */
const USER_AGENT = "tiktok-agents/0.1 (https://github.com/taiki0913/tiktok)";
const CANDIDATES_PER_NEED = 6;
const PREVIEW_WIDTH = 400;
const VIDEO_WIDTH = 1280;

export type PhotoNeed = VideoScript["photoNeeds"][number];

/** 動画に使った写真と、その出典 */
export interface PhotoAsset extends JobPhoto {
  /** 写真のページ（出典として投稿文に書く） */
  sourceUrl: string;
  /** ライセンス（例：Public domain、CC BY 4.0） */
  license: string;
  /** "pd"（パブリックドメイン・CC0）か "by"（作者の表示が必要） */
  kind: "pd" | "by";
  author: string;
}

export interface PhotoCandidate {
  title: string;
  pageUrl: string;
  previewUrl: string;
  url: string;
  width: number;
  height: number;
  mime: string;
  license: string;
  /** "pd"（パブリックドメイン・CC0）か "by"（作者の表示が必要） */
  kind: "pd" | "by";
  author: string;
  description: string;
  date: string;
}

type Fetch = typeof fetch;

/** extmetadata の値（HTMLのことがある）を、短い文字列にする */
function plain(v: unknown, max = 200): string {
  const s = typeof v === "string" ? v : "";
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * 自由に使えるライセンスか。パブリックドメイン・CC0・CC BY だけを使う
 * （CC BY-SA は動画全体に同じライセンスが及ぶおそれ、NC は収益化と合わない、ND は加工できないため使わない）。
 */
export function licenseKind(meta: Record<string, { value?: unknown } | undefined>): "pd" | "by" | null {
  const code = plain(meta.License?.value).toLowerCase();
  const name = plain(meta.LicenseShortName?.value).toLowerCase();
  const restrictions = plain(meta.Restrictions?.value)
    .split("|")
    .map((r) => r.trim())
    .filter((r) => r && r !== "personality");
  if (restrictions.length > 0) return null;
  if (code === "pd" || code === "cc0" || (!code && (name === "public domain" || name === "cc0"))) return "pd";
  if (/^cc-by-\d(\.\d)?$/.test(code)) return "by";
  return null;
}

/** Wikimedia Commons で写真を探す（自由に使えるものだけ） */
export async function searchCommons(query: string, fetchImpl: Fetch = fetch, limit = 10): Promise<PhotoCandidate[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(VIDEO_WIDTH),
    iiextmetadatafilter: "License|LicenseShortName|Restrictions|Artist|ImageDescription|DateTimeOriginal|ObjectName",
    iiextmetadatalanguage: "ja",
  });
  const res = await fetchImpl(`${API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikimedia Commons の検索に失敗しました（${res.status}）`);
  const data = (await res.json()) as {
    query?: {
      pages?: {
        title: string;
        index?: number;
        imageinfo?: {
          url: string;
          descriptionurl: string;
          thumburl?: string;
          thumbwidth?: number;
          thumbheight?: number;
          width: number;
          height: number;
          mime: string;
          extmetadata?: Record<string, { value?: unknown }>;
        }[];
      }[];
    };
  };
  const pages = [...(data.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out: PhotoCandidate[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !/^image\/(jpeg|png)$/.test(info.mime)) continue;
    const meta = info.extmetadata ?? {};
    const kind = licenseKind(meta);
    if (!kind) continue;
    const url = info.thumburl ?? info.url;
    const width = info.thumbwidth ?? info.width;
    const height = info.thumbheight ?? info.height;
    if (Math.max(width, height) < 500) continue; // 小さすぎて動画で粗くなる
    out.push({
      title: page.title.replace(/^File:/, ""),
      pageUrl: info.descriptionurl,
      // サムネイルのURLは「…/1280px-名前」の形。数字を変えると小さい画像になる
      previewUrl: info.thumburl ? info.thumburl.replace(/\/\d+px-/, `/${PREVIEW_WIDTH}px-`) : info.url,
      url,
      width,
      height,
      mime: info.mime,
      license: kind === "pd" && plain(meta.License?.value).toLowerCase() !== "cc0" ? "パブリックドメイン" : plain(meta.LicenseShortName?.value, 40),
      kind,
      author: plain(meta.Artist?.value, 60) || "作者不明",
      description: plain(meta.ImageDescription?.value, 300) || plain(meta.ObjectName?.value, 300),
      date: plain(meta.DateTimeOriginal?.value, 40),
    });
  }
  return out;
}

async function download(url: string, fetchImpl: Fetch): Promise<Buffer> {
  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`写真をダウンロードできませんでした（${res.status}）`);
  return Buffer.from(await res.arrayBuffer());
}

const PickSchema = z.object({
  picks: z.array(
    z.object({
      need: z.number().int().describe("探した場面の番号（# 探している写真 の番号）"),
      candidate: z
        .number()
        .int()
        .nullable()
        .describe("使う候補の番号。説明・撮影者・年と画像の両方から、探しているものだと確かに言える候補がなければ null"),
      caption: z.string().describe("画面に出す、何の写真かの短い説明（20字以内。例：晩年の徳川慶喜（1900年ごろ））。確かなことだけ書く"),
      reason: z.string().describe("その候補だと判断した根拠（または使わない理由）"),
    }),
  ),
});
export type PhotoPicks = z.infer<typeof PickSchema>["picks"];

export type PhotoPicker = (
  needs: PhotoNeed[],
  candidates: { need: number; list: (PhotoCandidate & { preview?: string })[] }[],
) => Promise<PhotoPicks>;

/** Claude に、候補が本当に探している写真かを確かめて選ばせる */
const claudePicker: PhotoPicker = async (needs, candidates) => {
  const images: { mediaType: "image/jpeg" | "image/png"; data: string; label: string }[] = [];
  const lines: string[] = [];
  for (const { need, list } of candidates) {
    lines.push(`## 写真${need + 1}：${needs[need]!.subject}`);
    list.forEach((c, i) => {
      lines.push(`- 候補${i + 1}「${c.title}」 説明：${c.description || "なし"} ／ 撮影者：${c.author} ／ 年：${c.date || "不明"}`);
      if (c.preview) images.push({ mediaType: c.mime === "image/png" ? "image/png" : "image/jpeg", data: c.preview, label: `写真${need + 1}の候補${i + 1}` });
    });
  }
  return (
    await generateStructured({
      label: "写真選び",
      schema: PickSchema,
      effort: "medium",
      system: `あなたは歴史ドキュメンタリーの写真リサーチャーです。動画に使う本物の写真を、候補から選びます。
- 取り違え（別人・別の場所・別の時代の写真）は絶対に避ける。説明・撮影者・年と画像の両方から、探しているものだと確かに言える候補だけを選ぶ。少しでも怪しければ null にする。
- 絵画・浮世絵・後世の想像図・現代の写真は「写真」として選ばない（探しているものが絵なら別）。
- 透かしや現代の文字が大きく入ったもの、ほとんど見えないほど傷んだものは選ばない。
- caption には、説明から確かに言えることだけを書く。`,
      prompt: `# 探している写真\n${needs.map((n, i) => `${i + 1}. ${n.subject}`).join("\n")}\n\n# 候補（Wikimedia Commons。どれも自由に使えるライセンス）\n${lines.join("\n")}\n\n探している写真ごとに、使う候補を1つ選ぶか null にしてください。need と candidate は、上の番号から1を引いた数（0から数える）で答えてください。`,
      images,
    })
  ).picks;
};

export interface FindPhotosOptions {
  /** 写真を保存するフォルダ（ジョブの public/） */
  publicDir: string;
  fetch?: Fetch;
  pick?: PhotoPicker;
}

/** 台本の photoNeeds から本物の写真を探して保存する。見つからなかった場面は CG だけで作る */
export async function findPhotos(needs: PhotoNeed[], sceneCount: number, opts: FindPhotosOptions): Promise<PhotoAsset[]> {
  const fetchImpl = opts.fetch ?? fetch;
  const valid = needs.filter((n) => n.sceneIndex >= 0 && n.sceneIndex < sceneCount).slice(0, 3);
  if (valid.length === 0) return [];

  // 1. 検索（検索語ごとに探し、重複を除いて上位から）
  const candidates: { need: number; list: (PhotoCandidate & { preview?: string })[] }[] = [];
  for (const [i, need] of valid.entries()) {
    const seen = new Set<string>();
    const list: PhotoCandidate[] = [];
    for (const q of need.queries.slice(0, 3)) {
      for (const c of await searchCommons(q, fetchImpl).catch(() => [] as PhotoCandidate[])) {
        if (!seen.has(c.pageUrl)) {
          seen.add(c.pageUrl);
          list.push(c);
        }
      }
    }
    const top = list.slice(0, CANDIDATES_PER_NEED);
    // 2. 小さい画像を取ってきて、Claude に見せる
    const withPreview = await Promise.all(
      top.map(async (c) => ({ ...c, preview: (await download(c.previewUrl, fetchImpl).catch(() => null))?.toString("base64") })),
    );
    if (withPreview.length > 0) candidates.push({ need: i, list: withPreview });
  }
  if (candidates.length === 0) return [];

  // 3. 本当にその写真かを確かめて選ぶ
  const picks = await (opts.pick ?? claudePicker)(valid, candidates);

  // 4. 選んだ写真を保存する
  await mkdir(join(opts.publicDir, "photos"), { recursive: true });
  const assets: PhotoAsset[] = [];
  const used = new Set<string>();
  for (const p of picks) {
    if (p.candidate === null) continue;
    const c = candidates.find((x) => x.need === p.need)?.list[p.candidate];
    const need = valid[p.need];
    if (!c || !need || used.has(c.pageUrl)) continue;
    used.add(c.pageUrl);
    const file = `photos/p${assets.length + 1}.${c.mime === "image/png" ? "png" : "jpg"}`;
    try {
      await writeFile(join(opts.publicDir, file), await download(c.url, fetchImpl));
    } catch {
      continue;
    }
    assets.push({
      src: file,
      width: c.width,
      height: c.height,
      caption: p.caption,
      credit: c.kind === "pd" ? `写真：Wikimedia Commons（${c.license}）` : `写真：${c.author}／${c.license}（Wikimedia Commons）`,
      sceneIndex: need.sceneIndex,
      sourceUrl: c.pageUrl,
      license: c.license,
      kind: c.kind,
      author: c.author,
    });
  }
  return assets;
}

/** 投稿文に書く、写真の出典 */
export function photoCreditsText(photos: PhotoAsset[] | undefined): string | null {
  if (!photos || photos.length === 0) return null;
  // パブリックドメインは出典の表示だけ。CC BY は作者・ライセンス・元のページを書く決まり
  return [
    "写真出典：Wikimedia Commons",
    ...photos.map((p) => (p.kind === "pd" ? `・${p.caption}（${p.license}）` : `・${p.caption}：${p.author}／${p.license} ${p.sourceUrl}`)),
  ].join("\n");
}
