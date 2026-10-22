// 動画づくりの流れ：台本 → ナレーション → 映像のコード → 書き出し → 確認待ち。
// 1本ずつ順番に作る（PCの負荷を抑えるため）。
import { copyFile, cp, mkdir, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { CODE_PRODUCIBLE, type Account } from "../config/accounts.js";
import type { AccountDayState, ProductionState } from "../domain.js";
import type { Store } from "../store/store.js";
import { Mutex } from "../util/concurrency.js";
import { computeTimeline, DEFAULT_TIMELINE, type JobData } from "../../video/kit/job.js";
import { writeJobFiles } from "./jobFiles.js";
import { JobRenderer, type RenderSettings } from "./renderer.js";
import { factsToCheck, runScriptAgent, type VideoScript } from "./scriptAgent.js";
import { runVideoAgent } from "./videoAgent.js";
import { narrate, type VoicevoxClient } from "./voicevox.js";

const PROJECT = process.cwd();
export const JOBS_DIR = join(PROJECT, "video", "jobs");
export const BGM_DIR = join(PROJECT, "public", "bgm");
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg)$/i;
const IN_PROGRESS: ProductionState["status"][] = ["queued", "scripting", "voicing", "coding", "rendering"];

export type Revision = { instruction: string; mode: "script" | "visual" };

export interface ProductionNotifier {
  productionUpdated(date: string, account: Account, state: AccountDayState): Promise<void>;
}

export interface ProductionDeps {
  store: Store;
  notifier: ProductionNotifier;
  voicevox: VoicevoxClient;
  render: RenderSettings;
  /** 完成した mp4 の置き場所 */
  videosDir: string;
}

export const isProducing = (p: ProductionState | undefined): boolean => !!p && IN_PROGRESS.includes(p.status);

/** BGM のフォルダから1曲選ぶ（同じジョブなら毎回同じ曲） */
export async function pickBgm(accountId: string, seed: string, bgmDir = BGM_DIR): Promise<string | null> {
  let files: string[];
  try {
    files = (await readdir(join(bgmDir, accountId))).filter((f) => AUDIO_EXT.test(f)).sort();
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return join(bgmDir, accountId, files[hash % files.length]!);
}

/**
 * 動画づくりを「順番待ち」にする。作り直しのときは版を1つ進め、前回の台本とジョブを引き継ぐ。
 */
export async function markQueued(store: Store, date: string, accountId: string, revision?: Revision): Promise<AccountDayState> {
  return store.updateAccount(date, accountId, (s) => {
    const prev = s.production;
    s.production = {
      status: "queued",
      version: prev ? prev.version + 1 : 1,
      warnings: [],
      revisions: [...(prev?.revisions ?? []), ...(revision ? [{ ...revision, at: new Date().toISOString() }] : [])],
      script: prev?.script,
      jobId: prev?.jobId,
    };
  });
}

/** 1本の動画を作る。失敗したら状態を failed にして通知する（例外は投げない） */
export async function produceVideo(deps: ProductionDeps, account: Account, date: string): Promise<void> {
  const { store, notifier } = deps;
  const setState = async (fn: (p: ProductionState) => void): Promise<AccountDayState> => {
    const state = await store.updateAccount(date, account.id, (s) => {
      s.production ??= { status: "queued", version: 1, warnings: [], revisions: [] };
      fn(s.production);
    });
    await notifier.productionUpdated(date, account, state);
    return state;
  };

  const day = await store.getDay(date);
  const acc = day?.accounts[account.id];
  const proposal = acc?.selectedIndex !== undefined ? acc.proposals?.[acc.selectedIndex] : undefined;
  if (!acc || acc.status !== "approved" || !proposal || !acc.production) {
    console.warn(`[produce:${account.id}] 企画が決定していないため動画づくりをやめます`);
    return;
  }
  if (!CODE_PRODUCIBLE.includes(account.production)) {
    await setState((p) => {
      p.status = "unsupported";
    });
    return;
  }

  const prev = acc.production;
  const revision = prev.revisions.at(-1) && prev.version > 1 ? prev.revisions.at(-1) : undefined;
  const jobId = `${date}-${account.id}-v${prev.version}`;
  const jobDir = join(JOBS_DIR, jobId);
  const renderer = new JobRenderer(jobDir, jobId, deps.render);

  try {
    // 1. 台本（映像だけの作り直しなら前回の台本を使う）
    await setState((p) => {
      p.status = "scripting";
      p.jobId = jobId;
      delete p.error;
    });
    let script: VideoScript;
    if (revision?.mode === "visual" && prev.script) {
      script = prev.script;
    } else {
      script = await runScriptAgent({
        account,
        proposal,
        revision: revision && prev.script ? { instruction: revision.instruction, previous: prev.script } : undefined,
      });
    }

    // 2. ナレーションとBGM
    await setState((p) => {
      p.status = "voicing";
      p.script = script;
      p.factsToCheck = factsToCheck(script).map(({ claim, basis }) => ({ claim, basis }));
    });
    const publicDir = join(jobDir, "public");
    await mkdir(publicDir, { recursive: true });
    const narration = await narrate(
      script.scenes.map((s) => s.narration),
      account.voice,
      { client: deps.voicevox, publicDir, relDir: "" },
    );
    const warnings = narration.warning ? [narration.warning] : [];
    const bgmSrc = await pickBgm(account.id, jobId);
    let bgm: string | null = null;
    if (bgmSrc) {
      bgm = `bgm${extname(bgmSrc).toLowerCase()}`;
      await copyFile(bgmSrc, join(publicDir, bgm));
    } else {
      warnings.push(`BGM がありません（public/bgm/${account.id}/ に音源を入れてください）`);
    }

    // 3. ジョブ（設計図）を書き出す
    const timeline = computeTimeline(narration.clips.map((c) => c.durationSec), DEFAULT_TIMELINE);
    const job: JobData = {
      id: jobId,
      accountId: account.id,
      title: script.title,
      fps: DEFAULT_TIMELINE.fps,
      width: 1080,
      height: 1920,
      durationInFrames: timeline.durationInFrames,
      scenes: script.scenes.map((s, i) => ({
        index: i,
        ...timeline.scenes[i]!,
        caption: s.caption,
        narration: s.narration,
        visual: s.visual,
        onScreen: s.onScreen,
        audio: narration.clips[i]!.file,
      })),
      endCard: { from: timeline.endCardFrom, question: script.endQuestion, sources: script.sources },
      bgm,
      // ナレーションのクレジットは動画には入れず、投稿文に入れる
      credits: [],
      accent: account.accent,
      visual: account.visual,
    };
    await writeJobFiles(jobDir, job);
    // 映像だけの作り直しは、前回のコードを引き継いでから直させる
    if (revision?.mode === "visual" && prev.jobId && prev.jobId !== jobId) {
      const prevDir = join(JOBS_DIR, prev.jobId);
      for (const f of await readdir(prevDir).catch(() => [] as string[])) {
        if (/\.tsx?$/.test(f) && f !== "entry.tsx") await cp(join(prevDir, f), join(jobDir, f));
      }
    }

    // 4. 映像のコード
    await setState((p) => {
      p.status = "coding";
      p.warnings = warnings;
      p.voiceCredit = narration.credit;
    });
    const agent = await runVideoAgent({ account, job, jobDir, renderer, revision: revision?.instruction });
    if (!agent.finished) throw new Error("映像が完成しませんでした（エージェントとのやりとりが上限に達しました）");

    // 5. 書き出し
    await setState((p) => {
      p.status = "rendering";
      p.agentSummary = agent.summary;
      p.costUsd = agent.costUsd;
    });
    await mkdir(deps.videosDir, { recursive: true });
    const videoFile = join(deps.videosDir, `${jobId}.mp4`);
    let lastLogged = -1;
    await renderer.video(videoFile, (ratio) => {
      const pct = Math.floor(ratio * 10) * 10;
      if (pct > lastLogged) {
        lastLogged = pct;
        console.log(`[produce:${account.id}] 書き出し ${pct}%`);
      }
    });

    await setState((p) => {
      p.status = "review";
      p.videoFile = videoFile;
      p.durationSec = Math.round(job.durationInFrames / job.fps);
    });
  } catch (e) {
    console.error(`[produce:${account.id}]`, e);
    await setState((p) => {
      p.status = "failed";
      p.error = (e as Error).message;
    });
  } finally {
    await renderer.cleanup();
  }
}

/** 動画づくりを1本ずつ順番に進める */
export class ProductionQueue {
  private readonly mutex = new Mutex();
  private readonly pending = new Set<string>();

  constructor(
    private readonly deps: ProductionDeps,
    private readonly accounts: Account[],
  ) {}

  /** 順番待ちに入れる。すでに入っていれば何もしない */
  enqueue(accountId: string, date: string): boolean {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) throw new Error(`不明なアカウント: ${accountId}`);
    const key = `${date}:${accountId}`;
    if (this.pending.has(key)) return false;
    this.pending.add(key);
    void this.mutex
      .run(() => produceVideo(this.deps, account, date))
      .catch((e) => console.error(`[queue] ${key}`, e))
      .finally(() => this.pending.delete(key));
    return true;
  }

  /** 起動時：途中で止まった動画づくりを再開する */
  async resume(date: string): Promise<number> {
    const day = await this.deps.store.getDay(date);
    let n = 0;
    for (const [id, s] of Object.entries(day?.accounts ?? {})) {
      if (s.status === "approved" && isProducing(s.production) && this.enqueue(id, date)) n++;
    }
    return n;
  }
}
