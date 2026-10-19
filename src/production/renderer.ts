// 1本の動画（ジョブ）を Remotion で組み立て、静止画や mp4 に書き出す。
// コードを書き換えるたびに組み立て直す（invalidate）。
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, type ChromiumOptions } from "@remotion/renderer";

export interface RenderSettings {
  /** 書き出しに使う Chrome の場所（省略時は Remotion が自動で用意する） */
  browserExecutable?: string;
  /** WebGL の描き方（GPUのないクラウドでは "swangle"） */
  gl?: ChromiumOptions["gl"];
  /** mp4 を書き出すときの並列数（省略時は Remotion におまかせ） */
  concurrency?: number;
}

export class JobRenderer {
  private serveUrl: string | null = null;
  private readonly bundleDir: string;

  constructor(
    private readonly jobDir: string,
    private readonly jobId: string,
    private readonly settings: RenderSettings,
  ) {
    this.bundleDir = join(tmpdir(), "tiktok-agents-bundles", jobId);
  }

  /** コードを書き換えたら呼ぶ。次の書き出しで組み立て直す */
  invalidate(): void {
    this.serveUrl = null;
  }

  /** コードを組み立てる。文法エラーや import の間違いはここで例外になる */
  async ensureBundle(): Promise<string> {
    if (this.serveUrl) return this.serveUrl;
    await rm(this.bundleDir, { recursive: true, force: true });
    await mkdir(this.bundleDir, { recursive: true });
    this.serveUrl = await bundle({
      entryPoint: join(this.jobDir, "entry.tsx"),
      publicDir: join(this.jobDir, "public"),
      outDir: this.bundleDir,
      enableCaching: true,
    });
    return this.serveUrl;
  }

  private async composition(serveUrl: string) {
    return selectComposition({
      serveUrl,
      id: "Main",
      browserExecutable: this.settings.browserExecutable ?? null,
      chromiumOptions: { gl: this.settings.gl ?? null },
      logLevel: "error",
    });
  }

  /** 指定したフレームを静止画（JPEG）で書き出し、ファイルの場所を返す */
  async stills(frames: number[], scale = 0.5): Promise<{ frame: number; file: string }[]> {
    const serveUrl = await this.ensureBundle();
    const composition = await this.composition(serveUrl);
    const outDir = join(this.jobDir, "stills");
    await mkdir(outDir, { recursive: true });
    const results: { frame: number; file: string }[] = [];
    for (const f of frames) {
      const frame = Math.max(0, Math.min(composition.durationInFrames - 1, Math.round(f)));
      const file = join(outDir, `frame-${String(frame).padStart(5, "0")}.jpg`);
      await renderStill({
        composition,
        serveUrl,
        frame,
        output: file,
        imageFormat: "jpeg",
        jpegQuality: 80,
        scale,
        browserExecutable: this.settings.browserExecutable ?? null,
        chromiumOptions: { gl: this.settings.gl ?? null },
        logLevel: "error",
        overwrite: true,
      });
      results.push({ frame, file });
    }
    return results;
  }

  async durationInFrames(): Promise<number> {
    return (await this.composition(await this.ensureBundle())).durationInFrames;
  }

  /** mp4 に書き出す */
  async video(output: string, onProgress?: (ratio: number) => void): Promise<void> {
    const serveUrl = await this.ensureBundle();
    const composition = await this.composition(serveUrl);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: output,
      browserExecutable: this.settings.browserExecutable ?? null,
      chromiumOptions: { gl: this.settings.gl ?? null },
      concurrency: this.settings.concurrency ?? null,
      onProgress: ({ progress }) => onProgress?.(progress),
      logLevel: "error",
      overwrite: true,
    });
  }

  async cleanup(): Promise<void> {
    await rm(this.bundleDir, { recursive: true, force: true });
  }
}
