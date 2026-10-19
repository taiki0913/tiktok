// VOICEVOX（無料の日本語音声合成）でナレーションを作る。
// PCで VOICEVOX アプリを起動しておくと、http://127.0.0.1:50021 で使える。
// 起動していない場合は無音の音声で代用し、字幕だけの動画として作れるようにする。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface VoiceSetting {
  speaker: string;
  style: string;
  speed: number;
}

export interface NarrationClip {
  /** public/ からの相対パス（動画の中で staticFile() に渡す） */
  file: string;
  durationSec: number;
}

export interface NarrationResult {
  clips: NarrationClip[];
  /** 画面に出すクレジット（例: VOICEVOX:青山龍星）。無音で代用した場合は null */
  credit: string | null;
  warning?: string;
}

const SAMPLE_RATE = 24000;
/** 無音で代用するときの、1秒あたりに読み上げる文字数の目安 */
const FALLBACK_CHARS_PER_SEC = 7;

/** WAV のヘッダーから再生時間（秒）を求める */
export function wavDurationSec(wav: Uint8Array): number {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (o: number): string => String.fromCharCode(wav[o]!, wav[o + 1]!, wav[o + 2]!, wav[o + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("WAV形式ではありません");
  let byteRate = 0;
  for (let o = 12; o + 8 <= wav.byteLength; ) {
    const id = tag(o);
    const size = view.getUint32(o + 4, true);
    if (id === "fmt ") byteRate = view.getUint32(o + 16, true);
    if (id === "data") {
      if (!byteRate) throw new Error("WAVのfmtチャンクが見つかりません");
      return size / byteRate;
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("WAVのdataチャンクが見つかりません");
}

/** 指定秒数の無音WAV（16bit・モノラル） */
export function silentWav(seconds: number): Uint8Array {
  const samples = Math.round(seconds * SAMPLE_RATE);
  const dataSize = samples * 2;
  const buf = new Uint8Array(44 + dataSize);
  const v = new DataView(buf.buffer);
  const write = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i);
  };
  write(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // モノラル
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, "data");
  v.setUint32(40, dataSize, true);
  return buf;
}

export function estimateDurationSec(text: string, speed: number): number {
  return Math.max(1.5, text.length / (FALLBACK_CHARS_PER_SEC * speed / 1.15));
}

interface Speaker {
  name: string;
  styles: { name: string; id: number }[];
}

export class VoicevoxClient {
  constructor(private readonly baseUrl: string) {}

  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/version`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** キャラクター名とスタイル名から、音声のIDを探す。スタイルが無ければそのキャラの最初のスタイルを使う */
  async resolveStyleId(speaker: string, style: string): Promise<number> {
    const res = await fetch(`${this.baseUrl}/speakers`);
    if (!res.ok) throw new Error(`VOICEVOX /speakers エラー ${res.status}`);
    const speakers = (await res.json()) as Speaker[];
    const found = speakers.find((s) => s.name === speaker);
    if (!found) {
      throw new Error(
        `VOICEVOX に「${speaker}」がいません。使える名前: ${speakers.map((s) => s.name).join("、")}`,
      );
    }
    const st = found.styles.find((s) => s.name === style) ?? found.styles[0];
    if (!st) throw new Error(`VOICEVOX の「${speaker}」にスタイルがありません`);
    if (st.name !== style) console.warn(`[voicevox] 「${speaker}」に「${style}」が無いため「${st.name}」を使います`);
    return st.id;
  }

  async synthesize(text: string, styleId: number, speed: number): Promise<Uint8Array> {
    const q = await fetch(
      `${this.baseUrl}/audio_query?${new URLSearchParams({ text, speaker: String(styleId) })}`,
      { method: "POST" },
    );
    if (!q.ok) throw new Error(`VOICEVOX audio_query エラー ${q.status}`);
    const query = (await q.json()) as Record<string, unknown>;
    query.speedScale = speed;
    query.prePhonemeLength = 0.05;
    query.postPhonemeLength = 0.1;
    const s = await fetch(`${this.baseUrl}/synthesis?speaker=${styleId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    if (!s.ok) throw new Error(`VOICEVOX synthesis エラー ${s.status}`);
    return new Uint8Array(await s.arrayBuffer());
  }
}

/**
 * 場面ごとの読み上げ文を音声にして publicDir/relDir に保存する。
 * VOICEVOX が起動していなければ、読み上げ時間を見積もった無音で代用する。
 */
export async function narrate(
  texts: string[],
  voice: VoiceSetting,
  opts: { client: VoicevoxClient; publicDir: string; relDir: string },
): Promise<NarrationResult> {
  await mkdir(join(opts.publicDir, opts.relDir), { recursive: true });
  const running = await opts.client.isRunning();
  const styleId = running ? await opts.client.resolveStyleId(voice.speaker, voice.style) : null;

  const clips: NarrationClip[] = [];
  for (const [i, text] of texts.entries()) {
    const wav =
      styleId === null
        ? silentWav(estimateDurationSec(text, voice.speed))
        : await opts.client.synthesize(text, styleId, voice.speed);
    const name = `narration-${String(i + 1).padStart(2, "0")}.wav`;
    const file = opts.relDir ? `${opts.relDir}/${name}` : name;
    await writeFile(join(opts.publicDir, file), wav);
    clips.push({ file, durationSec: wavDurationSec(wav) });
  }
  return styleId === null
    ? { clips, credit: null, warning: "VOICEVOX が起動していないため、ナレーションなし（無音）で作りました" }
    : { clips, credit: `VOICEVOX:${voice.speaker}` };
}
