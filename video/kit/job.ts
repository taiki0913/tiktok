// 1本の動画の設計図（ジョブ）。台本・ナレーションの長さから作られ、動画のコードに渡される。
// Node 側（src/production）からも使うので、remotion などには依存させない。

export interface JobScene {
  index: number;
  /** この場面が始まるフレーム */
  from: number;
  durationInFrames: number;
  /** 画面下の字幕（[ ] で囲んだ語を強調） */
  caption: string;
  narration: string;
  /** 映像の指示（台本エージェントが書いたもの） */
  visual: string;
  /** 画面に出す数字・ラベル */
  onScreen: string[];
  /** ナレーション音声（public/ からの相対パス）。空文字なら音声なし */
  audio: string;
  /** ナレーションが始まるフレーム */
  audioFrom: number;
  /** 場面の雰囲気（calm・wonder・tension・danger・sad・hope）。BGM の切り替えと、映像の明るさ・色の参考に使う */
  mood?: string;
}

/** 場面の雰囲気ごとに切り替える BGM の1区間 */
export interface BgmCue {
  from: number;
  durationInFrames: number;
  /** public/ からの相対パス */
  src: string;
  mood: string;
}

/** 場面の雰囲気が変わったときに、BGM を切り替える（クロスフェードの長さ） */
export const BGM_CROSSFADE_FRAMES = 24;
/** これより短い雰囲気の区間は、前の区間にまとめる（細かく切り替えすぎない） */
export const MIN_BGM_CUE_FRAMES = 150;

/**
 * 場面ごとの雰囲気から、BGM の区間を作る。同じ雰囲気が続く場面はまとめ、短すぎる区間は前（先頭なら次）にまとめる。
 * 区間の境目では BGM_CROSSFADE_FRAMES だけ重ねて、クロスフェードさせる。files に曲のない雰囲気の場面は、前の区間に含める。
 */
export function computeBgmCues(
  scenes: { from: number; mood?: string }[],
  totalFrames: number,
  files: Record<string, string>,
): BgmCue[] {
  const groups: { start: number; mood: string }[] = [];
  for (const s of scenes) {
    const mood = s.mood && files[s.mood] ? s.mood : groups.at(-1)?.mood;
    if (!mood) continue;
    if (groups.at(-1)?.mood !== mood) groups.push({ start: groups.length === 0 ? 0 : s.from, mood });
  }
  if (groups.length === 0) return [];
  // 短い区間を前（先頭なら次）にまとめる
  for (let i = 0; i < groups.length; i++) {
    const end = groups[i + 1]?.start ?? totalFrames;
    if (groups.length > 1 && end - groups[i]!.start < MIN_BGM_CUE_FRAMES) {
      if (i === 0) groups[1]!.start = 0;
      groups.splice(i, 1);
      i = -1; // 最初から見直す
    }
  }
  // まとめた結果、同じ雰囲気が隣り合ったらつなげる
  const merged = groups.filter((g, i) => i === 0 || groups[i - 1]!.mood !== g.mood);
  const half = BGM_CROSSFADE_FRAMES / 2;
  return merged.map((g, i) => {
    const from = i === 0 ? 0 : g.start - half;
    const to = i === merged.length - 1 ? totalFrames : merged[i + 1]!.start + half;
    return { from, durationInFrames: to - from, src: files[g.mood]!, mood: g.mood };
  });
}

/** 本物の写真（パブリックドメインなど、自由に使えるもの）。ArchivePhoto で出す */
export interface JobPhoto {
  /** public/ からの相対パス */
  src: string;
  width: number;
  height: number;
  /** 何の写真か（画面に出す短い説明） */
  caption: string;
  /** 画面に小さく出す出典（例：写真：Wikimedia Commons（パブリックドメイン）） */
  credit: string;
  /** この写真を使う場面（scenes の index） */
  sceneIndex: number;
}

export interface JobData {
  id: string;
  accountId: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  /** 締めの画面を含む全体の長さ */
  durationInFrames: number;
  scenes: JobScene[];
  endCard: { from: number; question: string; sources: string[] };
  /** BGM（public/ からの相対パス）。無ければ null */
  bgm: string | null;
  /** 場面の雰囲気ごとに切り替える BGM（あれば bgm の代わりに使う） */
  bgmCues?: BgmCue[];
  /** 画面に出すクレジット（例: VOICEVOX:青山龍星） */
  credits: string[];
  /** 字幕の強調色 */
  accent: string;
  /** 見た目の方針（アカウント設定の visual） */
  visual: string;
  /** 0フレーム目から画面上部に大きく出す、つかみの文字（[ ] で強調） */
  hook?: string;
  /** 本物の写真（見つかったときだけ） */
  photos?: JobPhoto[];
}

/** つかみの文字を出しておく長さ（フレーム） */
export const HOOK_FRAMES = 78;

export interface TimelineOptions {
  fps: number;
  /** 場面と場面の間の間（秒） */
  gapSec: number;
  /** 動画の最初の間（秒） */
  leadSec: number;
  /** 締めの画面の長さ（秒） */
  endCardSec: number;
  /** 動画全体の最低の長さ（秒）。足りなければ場面の間を広げる */
  minTotalSec: number;
}

export const DEFAULT_TIMELINE: TimelineOptions = {
  fps: 30,
  gapSec: 0.35,
  leadSec: 0.3,
  endCardSec: 4,
  minTotalSec: 61,
};

/** ナレーションの長さから、各場面の開始フレームと長さを決める */
export function computeTimeline(
  narrationSec: number[],
  opts: TimelineOptions = DEFAULT_TIMELINE,
): { scenes: { from: number; durationInFrames: number; audioFrom: number }[]; endCardFrom: number; durationInFrames: number } {
  const speech = narrationSec.reduce((a, b) => a + b, 0);
  const base = opts.leadSec + speech + opts.gapSec * narrationSec.length + opts.endCardSec;
  // 最低の長さに届かなければ、足りない分を場面の間に均等に足す
  const extraGap = base < opts.minTotalSec ? (opts.minTotalSec - base) / narrationSec.length : 0;
  const gap = opts.gapSec + extraGap;

  const scenes: { from: number; durationInFrames: number; audioFrom: number }[] = [];
  let t = 0;
  for (const [i, sec] of narrationSec.entries()) {
    const lead = i === 0 ? opts.leadSec : 0;
    const len = Math.ceil((lead + sec + gap) * opts.fps);
    scenes.push({ from: t, durationInFrames: len, audioFrom: t + Math.round(lead * opts.fps) });
    t += len;
  }
  const endCardFrom = t;
  return { scenes, endCardFrom, durationInFrames: endCardFrom + Math.ceil(opts.endCardSec * opts.fps) };
}
