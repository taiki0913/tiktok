// 動画作成エージェント。台本とナレーションの長さが入ったジョブから、映像のコード（Video.tsx）を書く。
// 静止画を書き出して自分で見た目を確かめ、直してから finish する。
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PRODUCTION_LABELS, type Account } from "../config/accounts.js";
import { env } from "../config/env.js";
import { assertUsableStop, estimateCostUsd, FALLBACK_BETA, getClient } from "../llm/claude.js";
import { HOOK_FRAMES, type JobData } from "../../video/kit/job.js";
import type { JobRenderer } from "./renderer.js";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
/** エージェントが読んでよい場所（部品集・お手本） */
const READABLE_DIRS = ["video/kit", "video/examples", "video/deepsea"];
const MAX_FRAMES_PER_RENDER = 6;
const MAX_TEXT = 60_000;

export interface VideoAgentResult {
  finished: boolean;
  /** finish を呼ばずに終わったとき：no_finish＝自分で返事を終えた、limit＝やりとりの上限に達した */
  stop: "finished" | "no_finish" | "limit";
  summary: string;
  costUsd: number | null;
}

/** エージェントとのやりとりの上限 */
const MAX_ITERATIONS = 30;
/** finish を呼ばずに返事を終えたときに、何回まで促すか */
const MAX_NUDGES = 2;
const NUDGE =
  "まだ finish が呼ばれていないので、作業が終わったと判断できません。今の Video.tsx で問題がなければ、すぐに finish を呼んでください。" +
  "直すところがあれば直して check してから finish を呼んでください。テキストの返事だけで終えないでください。";

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

/** 映像のコードが型チェックと組み立てを通るか。通らなければエラーの内容を返す */
export async function verifyJobCode(
  jobId: string,
  renderer: Pick<JobRenderer, "ensureBundle">,
): Promise<string | null> {
  const errors = await typecheck(jobId);
  if (errors.length > 0) return `型エラー:\n${errors.slice(0, 40).join("\n")}`;
  try {
    await renderer.ensureBundle();
  } catch (e) {
    return `組み立てエラー:\n${String((e as Error).message).slice(0, 4000)}`;
  }
  return null;
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
5. 納得できたら、必ず finish を呼んで終える。テキストの返事だけで終えると、未完成として扱われる。render_frames での確認は3回までを目安にする。

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
        (s.mood ? `   雰囲気: ${s.mood}（BGMもこの雰囲気。明るさ・色・カメラの動きを合わせる）\n` : "") +
        `   画面に出すもの: ${s.onScreen.length ? s.onScreen.join(" / ") : "なし"}`,
    )
    .join("\n");
  return [
    `# アカウント\n${account.name}（${PRODUCTION_LABELS[account.production]}）\n見た目の方針: ${job.visual || "特になし"}\n強調色: ${job.accent}`,
    `# 動画\n${job.title}（全${job.durationInFrames}フレーム、${fps}fps）`,
    job.hook ? `# つかみの文字\n「${job.hook}」を、外枠が0〜${HOOK_FRAMES}フレームの間、画面上部（y 230〜560）に大きく出す。この文字を目で裏付ける主役を、0フレーム目から画面中央に大きく明るく映す。` : "",
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
      run: async () => (await verifyJobCode(ctx.jobId, ctx.renderer)) ?? "OK（型エラー・組み立てエラーなし）",
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
  /** これまでのレビューからの学び（映像） */
  lessons?: string;
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
    max_iterations: MAX_ITERATIONS,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    cache_control: { type: "ephemeral" },
    system: systemPrompt(kitGuide),
    tools,
    messages: [{ role: "user", content: [jobPrompt(account, job, jobRel, opts.revision), opts.lessons ?? ""].filter(Boolean).join("\n\n") }],
  });

  let costUsd: number | null = 0;
  let turn = 0;
  let nudges = 0;
  let stop: VideoAgentResult["stop"] = "no_finish";
  let lastText = "";
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
    // finish を呼んだら、その場で道具を動かして確かめる（受け付けられたら、もう1回やりとりせずに終える）
    if (message.content.some((b) => b.type === "tool_use" && b.name === "finish")) await runner.generateToolResponse();
    if (finished) {
      stop = "finished";
      break;
    }
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    if (text) lastText = text;
    if (message.stop_reason === "end_turn") {
      // finish を呼ばずに返事を終えた：促して続けさせる（自分で履歴に足すと、今の返事は自動では足されない）
      if (nudges >= MAX_NUDGES) {
        stop = "no_finish";
        break;
      }
      nudges++;
      console.log(`[video-agent:${job.id}] finish が呼ばれていないので、呼ぶよう促します（${nudges}回目）`);
      runner.pushMessages(
        { role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] },
        { role: "user", content: NUDGE },
      );
    }
  }
  if (!finished && turn >= MAX_ITERATIONS) stop = "limit";
  return { finished, stop, summary: summary || lastText, costUsd };
}
