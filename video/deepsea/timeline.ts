// 深海潜航シーンの台本データ。いつ・どの水深にいて・どの字幕を出すかをここで決める。
// 将来は、動画作成エージェントがこの形のデータ（シナリオ）を毎日書き出す想定。
import { Easing, interpolate } from "remotion";

export const FPS = 30;
export const DURATION_IN_FRAMES = 15 * FPS;
/** 潜航を終えて最深部で止まるフレーム */
export const DESCENT_END = Math.round(12.5 * FPS);

/** 試作で潜る最深点：魚が撮影された最も深い記録（2022年撮影・2023年発表） */
export const MAX_DEPTH = 8336;
/** 深度計の一番下：チャレンジャー海淵（約10,920m） */
export const GAUGE_BOTTOM = 10920;

// 進み具合（0〜1）と水深の対応。浅い所はゆっくり、深い所は速く進むように累乗でつなぐ
const POWER = 2.2;
export const depthFromProgress = (u: number): number => MAX_DEPTH * Math.pow(u, POWER);
export const progressFromDepth = (depth: number): number => Math.pow(depth / MAX_DEPTH, 1 / POWER);

export function progressAt(frame: number): number {
  return interpolate(frame, [0, DESCENT_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
}

export const depthAt = (frame: number): number => depthFromProgress(progressAt(frame));

/** その水深に初めて達するフレーム */
export function frameReaching(depth: number): number {
  for (let f = 0; f <= DESCENT_END; f++) {
    if (depthAt(f) >= depth) return f;
  }
  return DESCENT_END;
}

/** 3D空間での高さ。進み具合に比例させ、カメラが一定のテンポで物の横を通り過ぎるようにする */
export const WORLD_LENGTH = 160;
export const worldY = (depth: number): number => -progressFromDepth(depth) * WORLD_LENGTH;

/** 水圧：10m潜るごとに約1気圧増える（海面の1気圧を含む） */
export const pressureAtm = (depth: number): number => Math.round(depth / 10) + 1;

export function lightLabel(depth: number): string {
  if (depth < 200) return "届く";
  if (depth < 1000) return "ほぼ届かない";
  return "届かない";
}

/** 字幕。[強調] で囲んだ部分を色付きで表示する */
export interface Caption {
  from: number;
  to: number;
  text: string;
}

const at = (depth: number): number => frameReaching(depth);

export const CAPTIONS: Caption[] = [
  { from: 0, to: at(200), text: "魚には、[これ以上は潜れない]深さがある。" },
  { from: at(200), to: at(1000), text: "水深200m。太陽の光が、[ほぼ届かなくなる]。" },
  { from: at(1000), to: at(3000), text: "水深1,000m。ここから先は[完全な暗闇]。" },
  { from: at(3000), to: at(6000), text: "水深3,000m。指先ほどの面積に、[約300kg]の重さ。" },
  { from: at(6000), to: at(8200), text: "水深6,000m。ここからが[超深海]。" },
  { from: at(8200), to: DESCENT_END + 40, text: "水深8,336m。魚が撮影された、[最も深い場所]。" },
  { from: DESCENT_END + 40, to: DURATION_IN_FRAMES, text: "なぜ魚は、[これより深く]行けないのか？" },
];

/** 深度計の目盛り */
export const GAUGE_MARKS = [
  { depth: 0, label: "海面" },
  { depth: 200, label: "光がほぼ届かない" },
  { depth: 1000, label: "完全な暗闇" },
  { depth: 6000, label: "超深海" },
  { depth: 8336, label: "魚の最深記録" },
  { depth: GAUGE_BOTTOM, label: "最深部（チャレンジャー海淵）" },
];
