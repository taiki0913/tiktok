// .env から動画づくりの設定を組み立てる。
import { join } from "node:path";
import { env } from "../config/env.js";
import type { ProductionDeps } from "./pipeline.js";
import { VoicevoxClient } from "./voicevox.js";

export function productionSettings(): Omit<ProductionDeps, "store" | "notifier"> {
  return {
    voicevox: new VoicevoxClient(env.VOICEVOX_URL),
    render: {
      browserExecutable: env.REMOTION_BROWSER_EXECUTABLE,
      gl: env.REMOTION_GL,
      concurrency: env.RENDER_CONCURRENCY,
    },
    videosDir: join(env.DATA_DIR, "videos"),
  };
}
