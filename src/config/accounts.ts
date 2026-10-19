import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";

export const PRODUCTION_STYLES = {
  polygon: "ポリゴン調の3D空間（建物・人物・乗り物・地形などを単純な立体で表現）に、数字・計器・地図・グラフ・字幕を重ねる",
  motion_graphics: "図解・アイコン・テキストアニメーション・グラフだけで構成するモーショングラフィックス",
  manga: "見た目を固定したキャラのAIコマ画像を、コマ送り・吹き出し・効果音で動かす漫画動画",
  ai_video: "全編AI映像（動画生成AI）＋ナレーション。1カット8秒前後の映像をつなぐ",
} as const;

export type ProductionStyle = keyof typeof PRODUCTION_STYLES;

/** Slack などに表示する短い名前 */
export const PRODUCTION_LABELS: Record<ProductionStyle, string> = {
  polygon: "ポリゴン調3D",
  motion_graphics: "モーショングラフィックス",
  manga: "漫画動画",
  ai_video: "全編AI映像",
};

/** 外部の生成AIを使わず、コードだけで動画を作れる作り方 */
export const CODE_PRODUCIBLE: readonly ProductionStyle[] = ["polygon", "motion_graphics"];

const productionStyleKeys = Object.keys(PRODUCTION_STYLES) as [ProductionStyle, ...ProductionStyle[]];

const AccountSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, "id は半角英小文字・数字・_ のみ"),
  name: z.string(),
  genre: z.string(),
  concept: z.string(),
  target: z.string(),
  tone: z.string(),
  production: z.enum(productionStyleKeys),
  lengthSec: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  research: z.object({
    youtubeQueries: z.array(z.string()).default([]),
    /** true なら日本語タイトルの動画だけを調査対象にする */
    japaneseOnly: z.boolean().default(true),
    webSearchHint: z.string().optional(),
  }),
  rules: z.array(z.string()).default([]),
  /** 動画の見た目の方針（色・世界観など）。動画作成エージェントが毎回そろえる */
  visual: z.string().default(""),
  /** 字幕や数字の強調色 */
  accent: z.string().default("#ffcf3f"),
  /** ナレーションの声（VOICEVOX のキャラクター名とスタイル名） */
  voice: z.object({
    speaker: z.string(),
    style: z.string().default("ノーマル"),
    /** 読み上げの速さ（1.0 が標準） */
    speed: z.number().positive().default(1.15),
  }),
  postTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export type Account = z.infer<typeof AccountSchema>;

const AccountsFileSchema = z.object({
  accounts: z.array(AccountSchema).min(1),
});

export async function loadAccounts(path: string): Promise<Account[]> {
  const text = await readFile(path, "utf8");
  const { accounts } = AccountsFileSchema.parse(parse(text));
  const ids = new Set<string>();
  for (const a of accounts) {
    if (ids.has(a.id)) throw new Error(`アカウントIDが重複しています: ${a.id}`);
    ids.add(a.id);
  }
  return accounts;
}
