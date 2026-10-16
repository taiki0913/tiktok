import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";

export const PRODUCTION_STYLES = {
  ai_video: "全編AI映像（動画生成AI）＋ナレーション。1カット8秒前後の映像をつなぐ",
  kamishibai: "AI静止画にズーム・パン・奥行きのカメラワークを付けた「動く紙芝居」＋ナレーション",
  stock_footage: "NASAなどの公開映像を中心に構成し、要所だけAI映像を使う解説動画",
  manga: "見た目を固定したキャラのAIコマ画像を、コマ送り・吹き出し・効果音で動かす漫画動画",
  motion_graphics: "図解・アイコン・テキストアニメーションだけで構成するモーショングラフィックス",
  data_viz: "動くグラフ・地図などのデータ可視化と、未来の情景のAI静止画を組み合わせる",
} as const;

export type ProductionStyle = keyof typeof PRODUCTION_STYLES;

/** Slack などに表示する短い名前 */
export const PRODUCTION_LABELS: Record<ProductionStyle, string> = {
  ai_video: "全編AI映像",
  kamishibai: "動く紙芝居",
  stock_footage: "公開映像＋解説",
  manga: "漫画動画",
  motion_graphics: "モーショングラフィックス",
  data_viz: "データ可視化",
};

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
