// 公開OKになった動画を、アカウントの投稿時刻（accounts.yaml の postTime）に投稿予約し、結果を確かめる。
// 予約はアップロードした時点で投稿サービス側に入るので、投稿時刻に PC が止まっていても投稿される。
import type { Account } from "../config/accounts.js";
import type { PostState } from "../domain.js";
import type { ProductionNotifier } from "../production/pipeline.js";
import { postTextFor } from "../production/postText.js";
import type { Store } from "../store/store.js";
import { dateInTz, daysBefore, zonedTimeToUtc } from "../util/date.js";
import type { PostingService, PublishRequest } from "./uploadPost.js";

/** 予約の余裕。投稿時刻までこれより短ければ、すぐに投稿する */
const MIN_LEAD_MS = 10 * 60_000;
/** 予約時刻を過ぎても結果が分からないまま、これだけたったら「確認できず」にする */
const GIVE_UP_MS = 6 * 3600_000;
/** 表紙にする位置（冒頭のつかみの場面） */
const COVER_MS = 1500;
/** 投稿の結果を確かめる間隔 */
const CHECK_INTERVAL_MS = 5 * 60_000;

/** この状態の投稿があるうちは、新しく投稿しない（二重投稿を防ぐ） */
const LOCKED: PostState["status"][] = ["scheduling", "scheduled", "posting", "posted"];
/** やり直しボタンで、もう一度投稿してよい状態 */
const RETRYABLE: PostState["status"][] = ["failed", "canceled", "unknown"];

export const isPostLocked = (post?: PostState): boolean => !!post && LOCKED.includes(post.status);

/** いつ投稿するか。その日の投稿時刻が十分先ならその時刻、過ぎていれば null（すぐ投稿） */
export function decidePostTime(date: string, postTime: string, now: Date, timeZone: string): Date | null {
  const at = zonedTimeToUtc(date, postTime, timeZone);
  return at.getTime() - now.getTime() >= MIN_LEAD_MS ? at : null;
}

export interface PostingDeps {
  store: Store;
  notifier: ProductionNotifier;
  /** null なら投稿サービスが未設定（自動投稿しない） */
  service: PostingService | null;
  timeZone: string;
  now?: () => Date;
}

export class Publisher {
  /** この PC でアップロード中のもの（同じ動画を同時に2回アップロードしないため） */
  private readonly inFlight = new Set<string>();
  private ticking = false;

  constructor(
    private readonly deps: PostingDeps,
    private readonly accounts: Account[],
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private async notify(date: string, account: Account): Promise<void> {
    const state = (await this.deps.store.getDay(date))?.accounts[account.id];
    if (state) await this.deps.notifier.productionUpdated(date, account, state);
  }

  /**
   * 公開OKの動画を投稿予約する。retry=true のときは、失敗・取り消しのあとにもう一度投稿する。
   * アップロードの途中で止まったもの（scheduling）は、同じキーで続きから行う。
   */
  async publish(account: Account, date: string, opts: { retry?: boolean } = {}): Promise<void> {
    const key = `${date}:${account.id}`;
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    try {
      await this.publishOnce(account, date, !!opts.retry);
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async publishOnce(account: Account, date: string, retry: boolean): Promise<void> {
    const { store, service, timeZone } = this.deps;
    if (!service) return;
    // updateAccount の中で決めたことを外へ持ち出す
    const plan: { changed?: boolean; request?: PublishRequest } = {};
    await store.updateAccount(date, account.id, (s) => {
      const p = s.production;
      const proposal = s.proposals?.[s.selectedIndex ?? -1];
      if (!p || p.status !== "approved" || !p.videoFile || !p.jobId || !proposal) return;
      const prev = p.post;
      let attempt: number;
      if (!prev) attempt = 1;
      else if (prev.status === "scheduling") attempt = prev.attempt;
      else if (retry && RETRYABLE.includes(prev.status)) attempt = prev.attempt + 1;
      else return;
      plan.changed = true;
      const now = this.now();
      const at = decidePostTime(date, account.postTime, now, timeZone);
      p.post = { status: "scheduling", attempt, scheduledAt: (at ?? now).toISOString() };
      plan.request = {
        profile: account.id,
        videoFile: p.videoFile,
        caption: postTextFor(proposal, p.script),
        ...(at ? { scheduledAt: at } : {}),
        aigc: account.production === "ai_video",
        idempotencyKey: `${p.jobId}-post${attempt}`,
        coverMs: COVER_MS,
      };
    });
    if (!plan.changed) return;
    await this.notify(date, account);
    const request = plan.request;
    if (!request) return;
    const immediate = !request.scheduledAt;

    try {
      const ref = await service.publish(request);
      await store.updateAccount(date, account.id, (s) => {
        const post = s.production?.post;
        if (!post) return;
        post.status = immediate ? "posting" : "scheduled";
        if (ref.jobId) post.jobId = ref.jobId;
        if (ref.requestId) post.requestId = ref.requestId;
      });
      console.log(`[post] ${account.id}：${immediate ? "投稿しました（結果待ち）" : `${request.scheduledAt?.toISOString()} に予約しました`}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[post] ${account.id}：投稿に失敗`, e);
      await store.updateAccount(date, account.id, (s) => {
        const post = s.production?.post;
        if (!post) return;
        post.status = "failed";
        post.error = error;
      });
    }
    await this.notify(date, account);
  }

  /** 予約時刻を過ぎた投稿の結果を、投稿サービスに問い合わせる */
  async check(account: Account, date: string): Promise<void> {
    const { store, service } = this.deps;
    const post = (await store.getDay(date))?.accounts[account.id]?.production?.post;
    if (!service || !post || (post.status !== "scheduled" && post.status !== "posting")) return;
    const now = this.now().getTime();
    const due = post.scheduledAt ? new Date(post.scheduledAt).getTime() : now;
    if (post.status === "scheduled" && now < due + 60_000) return;

    let result;
    try {
      result = await service.check({ jobId: post.jobId, requestId: post.requestId });
    } catch (e) {
      console.warn(`[post] ${account.id}：投稿の結果を確かめられませんでした`, e);
      return;
    }
    const giveUp = result.state === "pending" && now - due > GIVE_UP_MS;
    if (result.state === "pending" && !giveUp) return;
    await store.updateAccount(date, account.id, (s) => {
      const p = s.production?.post;
      if (!p) return;
      if (result.state === "posted") {
        p.status = "posted";
        if (result.url) p.url = result.url;
      } else if (result.state === "failed") {
        p.status = "failed";
        p.error = result.error;
      } else {
        p.status = "unknown";
      }
    });
    await this.notify(date, account);
  }

  /** 投稿予約を取り消す */
  async cancel(account: Account, date: string): Promise<void> {
    const { store, service } = this.deps;
    const post = (await store.getDay(date))?.accounts[account.id]?.production?.post;
    if (!service || post?.status !== "scheduled" || !post.jobId) return;
    let error: string | undefined;
    try {
      await service.cancel(post.jobId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await store.updateAccount(date, account.id, (s) => {
      const p = s.production?.post;
      if (!p) return;
      if (error) p.error = `予約を取り消せませんでした：${error}`;
      else {
        p.status = "canceled";
        delete p.error;
      }
    });
    await this.notify(date, account);
  }

  /**
   * 定期的に呼ぶ：今日と昨日の分について、投稿の結果を確かめ、止まっていた投稿を続ける。
   * 公開OKなのにまだ投稿していないもの（公開OKの直後にPCが止まったなど）は、今日の分だけ投稿する。
   */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const today = dateInTz(this.now(), this.deps.timeZone);
      for (const date of [daysBefore(today, 1), today]) {
        const day = await this.deps.store.getDay(date);
        for (const account of this.accounts) {
          const p = day?.accounts[account.id]?.production;
          if (p?.status !== "approved") continue;
          if (p.post?.status === "scheduling" || (!p.post && date === today && this.deps.service)) {
            await this.publish(account, date);
          } else {
            await this.check(account, date);
          }
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  start(intervalMs = CHECK_INTERVAL_MS): void {
    const run = (): void => {
      this.tick().catch((e) => console.error("[post] 投稿の確認に失敗", e));
    };
    run();
    setInterval(run, intervalMs);
  }
}
