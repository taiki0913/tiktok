// 動画作成エージェント。台本とナレーションの長さが入ったジョブから、映像のコード（Video.tsx）を書く。
// 静止画を書き出して自分で見た目を確かめ、直してから finish する。
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PRODUCTION_LABELS, type Account } from "../config/accounts.js";
import { env } from "../config/env.js";
import { assertUsableStop, estimateCostUsd, FALLBACK_BETA, getClient } from "../llm/claude.js";
import type { JobData } from "../../video/kit/job.js";
import type { JobRenderer } from "./renderer.js";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
/** エージェントが読んでよい場所（部品集・お手本） */
const READABLE_DIRS = ["video/kit", "video/examples", "video/deepsea"];
const MAX_FRAMES_PER_RENDER = 6;
const MAX_TEXT = 60_000;

export interface VideoAgentResult {
  finished: boolean;
  summary: string;
  costUsd: number | null;
}

const isInside = (dir: string, target: string): boolean => {
  const rel = relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/** ジョブのフォルダ内の書き込み先。entry.tsx・job.json は書き換えさせない */
function resolveWritable(jobDir: string, path: string): string {
  const full = resolve(jobDir, normalize(path));
  if (!isInside(jobDir, full)) throw new Error(`ジョブのフォルダの外には書けません: ${path}`);
  if (!/\.(tsx|ts)$/.test(full)) throw new Error("書けるのは .tsx / .ts のファイルだけです");
  const name = relative(jobDir, full);
  if (name === "entry.tsx" || name.startsWith("public")) throw new Error(`${name} は書き換えられません`);
  return full;
}

function resolveReadable(jobDir: string, path: string): string {
  const full = resolve(ROOT, normalize(path));
  const ok = isInside(jobDir, full) || READABLE_DIRS.some((d) => isInside(resolve(ROOT, d), full));
  if (!ok) throw new Error(`読めるのは ${READABLE_DIRS.join("・")} とジョブのフォルダだけです: ${path}`);
  return full;
}

async function typecheck(jobId: string): Promise<string[]> {
  const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
  try {
    await execFileAsync(process.execPath, [tsc, "--noEmit", "-p", "video"], { cwd: ROOT, maxBuffer: 10_000_000 });
    return [];
  } catch (e) {
    const out = String((e as { stdout?: string }).stdout ?? (e as Error).message);
    // ほかのジョブのエラーは無視して、このジョブのものだけを返す
    return out.split(/\r?\n/).filter((l) => l.includes(jobId));
  }
}

function systemPrompt(kitGuide: string): string {
  return `あなたはTikTok動画の映像を作るエンジニア兼アートディレクターです。Remotion と three.js で、縦長動画の映像部分（Video.tsx）を書きます。

# 進め方
1. まずお手本（video/examples/future-population/Video.tsx）を read_file で読み、書き方を確認する。必要なら部品のソースも読む。
2. write_file で Video.tsx を書く（同じフォルダに部品のファイルを分けてもよい）。
3. check で型と組み立てのエラーを確認し、エラーがなくなるまで直す。
4. render_frames で各場面の中ほどと見せ場のフレームを静止画にして、見た目を確認する（1回${MAX_FRAMES_PER_RENDER}枚まで）。
   文字の重なり・はみ出し・真っ暗や真っ白・何も映っていない・物が近すぎる/遠すぎる・方針と違う色、などを直す。
5. 納得できたら finish を呼ぶ。render_frames での確認は3回までを目安にする。

# 部品集の説明書
${kitGuide}`;
}

function jobPrompt(account: Account, job: JobData, jobRel: string, revision?: string): string {
  const fps = job.fps;
  const scenes = job.scenes
    .map(
      (s) =>
        `${s.index + 1}. フレーム ${s.from}〜${s.from + s.durationInFrames - 1}（${(s.durationInFrames / fps).toFixed(1)}秒）\n` +
        `   字幕: ${s.caption}\n   読み上げ: ${s.narration}\n   映像の指示: ${s.visual}\n` +
        `   画面に出すもの: ${s.onScreen.length ? s.onScreen.join(" / ") : "なし"}`,
    )
    .join("\n");
  return [
    `# アカウント\n${account.name}（${PRODUCTION_LABELS[account.production]}）\n見た目の方針: ${job.visual || "特になし"}\n強調色: ${job.accent}`,
    `# 動画\n${job.title}（全${job.durationInFrames}フレーム、${fps}fps）`,
    `# 場面\n${scenes}\n締めの画面: フレーム ${job.endCard.from}〜（外枠が出すので作らない）`,
    revision
      ? `# 作り直しの指示\n「${revision}」\n前回の Video.tsx が同じフォルダにあります。read_file で読み、指示に合わせて直してください。`
      : "",
    `# 依頼\n${jobRel}/Video.tsx を書き、確認してから finish してください。`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** エージェントが使う道具。テストからも直接呼べるように外に出している */
export function createVideoTools(ctx: {
  jobDir: string;
  jobId: string;
  renderer: Pick<JobRenderer, "invalidate" | "ensureBundle" | "stills">;
  onFinish: (summary: string) => void;
}) {
  const jobRel = relative(ROOT, ctx.jobDir).split("\\").join("/");
  return [
    betaZodTool({
      name: "read_file",
      description: `ファイルを読む。読めるのは ${READABLE_DIRS.join("・")} と、このジョブのフォルダ（${jobRel}）。パスはプロジェクトのルートから。`,
      inputSchema: z.object({ path: z.string() }),
      run: async ({ path }) => {
        const text = await readFile(resolveReadable(ctx.jobDir, path), "utf8");
        return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…（以下省略）` : text;
      },
    }),
    betaZodTool({
      name: "write_file",
      description: `このジョブのフォルダ（${jobRel}）に .tsx/.ts を書く（上書き）。path はジョブのフォルダからの相対パス（例: Video.tsx）。`,
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      run: async ({ path, content }) => {
        await writeFile(resolveWritable(ctx.jobDir, path), content, "utf8");
        ctx.renderer.invalidate();
        return `${path} を書きました（${content.length}文字）。check で確認してください。`;
      },
    }),
    betaZodTool({
      name: "check",
      description: "型チェックと動画の組み立てを行い、エラーを返す。エラーがなければ OK。",
      inputSchema: z.object({}),
      run: async () => {
        const errors = await typecheck(ctx.jobId);
        if (errors.length > 0) return `型エラー:\n${errors.slice(0, 40).join("\n")}`;
        try {
          await ctx.renderer.ensureBundle();
        } catch (e) {
          return `組み立てエラー:\n${String((e as Error).message).slice(0, 4000)}`;
        }
        return "OK（型エラー・組み立てエラーなし）";
      },
    }),
    betaZodTool({
      name: "render_frames",
      description: `指定したフレームを静止画（実際の半分の大きさ）にして返す。1回${MAX_FRAMES_PER_RENDER}枚まで。字幕と締めの画面も外枠が描いた状態で写る。`,
      inputSchema: z.object({ frames: z.array(z.number().int().min(0)).min(1).max(MAX_FRAMES_PER_RENDER) }),
      run: async ({ frames }) => {
        try {
          const stills = await ctx.renderer.stills(frames, 0.5);
          const blocks: (
            | { type: "text"; text: string }
            | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
          )[] = [];
          for (const s of stills) {
            blocks.push({ type: "text", text: `フレーム ${s.frame}` });
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: (await readFile(s.file)).toString("base64") },
            });
          }
          return blocks;
        } catch (e) {
          return `書き出しエラー:\n${String((e as Error).message).slice(0, 4000)}`;
        }
      },
    }),
    betaZodTool({
      name: "finish",
      description: "映像が完成したら呼ぶ。summary には工夫した点と、気になる点があれば書く。",
      inputSchema: z.object({ summary: z.string() }),
      run: async (input) => {
        const errors = await typecheck(ctx.jobId);
        if (errors.length > 0) return `まだ型エラーがあります。直してから finish してください:\n${errors.slice(0, 20).join("\n")}`;
        ctx.onFinish(input.summary);
        return "完了を受け付けました。";
      },
    }),
  ].map((t) => ({ ...t, eager_input_streaming: true }));
}

export async function runVideoAgent(opts: {
  account: Account;
  job: JobData;
  jobDir: string;
  renderer: JobRenderer;
  revision?: string;
}): Promise<VideoAgentResult> {
  const { account, job, jobDir, renderer } = opts;
  const jobRel = relative(ROOT, jobDir).split("\\").join("/");
  const kitGuide = await readFile(join(ROOT, "video", "kit", "KIT.md"), "utf8");
  let finished = false;
  let summary = "";

  const tools = createVideoTools({
    jobDir,
    jobId: job.id,
    renderer,
    onFinish: (text) => {
      finished = true;
      summary = text;
    },
  });

  const runner = getClient().beta.messages.toolRunner({
    model: env.CLAUDE_MODEL,
    max_tokens: 64000,
    stream: true,
    max_iterations: 30,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    cache_control: { type: "ephemeral" },
    system: systemPrompt(kitGuide),
    tools,
    messages: [{ role: "user", content: jobPrompt(account, job, jobRel, opts.revision) }],
  });

  let costUsd: number | null = 0;
  let turn = 0;
  for await (const stream of runner) {
    const message = await stream.finalMessage();
    turn++;
    const cost = estimateCostUsd(env.CLAUDE_MODEL, message.usage);
    costUsd = cost === null || costUsd === null ? null : costUsd + cost;
    const used = message.content
      .filter((b) => b.type === "tool_use")
      .map((b) => (b as { name: string }).name)
      .join(", ");
    console.log(`[video-agent:${job.id}] ${turn}回目 ${used || message.stop_reason}${cost !== null ? ` 約$${cost.toFixed(3)}` : ""}`);
    assertUsableStop(message, `映像:${job.id}`);
    if (finished) break;
  }
  return { finished, summary, costUsd };
}
