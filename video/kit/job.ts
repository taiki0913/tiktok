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
  /** 画面に出すクレジット（例: VOICEVOX:青山龍星） */
  credits: string[];
  /** 字幕の強調色 */
  accent: string;
  /** 見た目の方針（アカウント設定の visual） */
  visual: string;
}

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
