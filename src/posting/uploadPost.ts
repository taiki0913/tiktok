// TikTok への投稿は、TikTok の審査を通った投稿サービス Upload-Post を通して行う。
// （自作のアプリで TikTok の API を使うと、審査を通るまで「自分だけ見られる」投稿しかできないため）
// プロフィール名は config/accounts.yaml のアカウントID（history など）と同じにする。
import { UploadPost } from "upload-post";

export type PrivacyLevel = "PUBLIC_TO_EVERYONE" | "SELF_ONLY";

export interface PublishRequest {
  /** Upload-Post のプロフィール名（= アカウントID） */
  profile: string;
  videoFile: string;
  caption: string;
  /** 予約する時刻。省略するとすぐに投稿する */
  scheduledAt?: Date;
  /** AIで作った本物そっくりの映像なら true（TikTok の「AI生成」表示） */
  aigc: boolean;
  /** 同じキーの投稿は24時間以内なら1回にまとめられる（やり直しで二重投稿しないため） */
  idempotencyKey: string;
  privacy?: PrivacyLevel;
  /** 表紙にする位置（ミリ秒） */
  coverMs?: number;
}

export interface PublishRef {
  jobId?: string;
  requestId?: string;
}

export interface PostCheck {
  state: "pending" | "posted" | "failed";
  url?: string;
  error?: string;
}

export interface PostingService {
  publish(req: PublishRequest): Promise<PublishRef>;
  check(ref: PublishRef): Promise<PostCheck>;
  cancel(jobId: string): Promise<void>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** 応答のどこかにある値を、よく使われる名前の順に探す */
function pick(o: Obj, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = str(o[k]) ?? (isObj(o.data) ? str(o.data[k]) : undefined);
    if (v) return v;
  }
  return undefined;
}

/** 投稿の受付番号を、アップロードの応答から取り出す */
export function readPublishRef(res: unknown): PublishRef {
  if (!isObj(res)) return {};
  return { jobId: pick(res, ["job_id", "jobId"]), requestId: pick(res, ["request_id", "requestId"]) };
}

/** 応答の中から TikTok の結果を探す（results / platforms / data.results などの形に対応） */
function findTikTokResult(res: Obj): Obj | undefined {
  const lists = [res.results, res.platforms, isObj(res.data) ? res.data.results : undefined, isObj(res.data) ? res.data.platforms : undefined];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((r) => isObj(r) && String(r.platform ?? r.name ?? "").toLowerCase() === "tiktok");
    if (isObj(hit)) return hit;
  }
  const keyed = isObj(res.results) ? res.results.tiktok : isObj(res.data) ? res.data.tiktok : undefined;
  return isObj(keyed) ? keyed : undefined;
}

/**
 * 投稿の状況（GET /uploadposts/status）の応答を読む。
 * 応答の形が少し違っても読めるように、TikTok の結果を探して success / url / error を見る。
 */
export function interpretStatus(res: unknown): PostCheck {
  if (!isObj(res)) return { state: "pending" };
  const status = String(res.status ?? (isObj(res.data) ? res.data.status : "") ?? "").toLowerCase();
  const r = findTikTokResult(res);
  if (r) {
    const url = str(r.url) ?? str(r.post_url) ?? str(r.platform_post_url) ?? str(r.permalink);
    const error = str(r.error) ?? str(r.error_message);
    if (r.success === false || error) return { state: "failed", error: error ?? str(r.message) ?? "投稿に失敗しました" };
    if (url) return { state: "posted", url };
    // 「受付済み（Queued）」なども success: true で返るので、全体が終わっているときだけ投稿済みとみなす
    const waiting = /queue|pending|process|schedul|progress/i;
    if (r.success === true && !waiting.test(status) && !waiting.test(str(r.message) ?? "")) return { state: "posted" };
  }
  if (["failed", "error", "canceled", "cancelled"].includes(status)) {
    return { state: "failed", error: pick(res, ["error", "message"]) ?? `投稿サービスの状態：${status}` };
  }
  return { state: "pending" };
}

export class UploadPostService implements PostingService {
  private readonly client: UploadPost;

  constructor(apiKey: string) {
    this.client = new UploadPost(apiKey);
  }

  async publish(req: PublishRequest): Promise<PublishRef> {
    const res = await this.client.upload(req.videoFile, {
      user: req.profile,
      platforms: ["tiktok"],
      title: req.caption,
      ...(req.scheduledAt ? { scheduledDate: req.scheduledAt.toISOString() } : {}),
      tiktokPrivacyLevel: req.privacy ?? "PUBLIC_TO_EVERYONE",
      tiktokIsAigc: req.aigc,
      ...(req.coverMs !== undefined ? { tiktokCoverTimestamp: req.coverMs } : {}),
      idempotencyKey: req.idempotencyKey,
    });
    if (isObj(res) && res.success === false) throw new Error(str(res.message) ?? "投稿サービスがアップロードを受け付けませんでした");
    const ref = readPublishRef(res);
    if (!ref.jobId && !ref.requestId) {
      // すぐに結果が返ってきた場合（同期アップロード）
      const now = interpretStatus(res);
      if (now.state === "failed") throw new Error(now.error);
    }
    return ref;
  }

  async check(ref: PublishRef): Promise<PostCheck> {
    return interpretStatus(await this.status(ref));
  }

  /** 投稿の状況（応答そのまま） */
  async status(ref: PublishRef): Promise<unknown> {
    if (ref.requestId) return this.client.getStatus(ref.requestId);
    if (ref.jobId) return this.client.getJobStatus(ref.jobId);
    return null;
  }

  async cancel(jobId: string): Promise<void> {
    await this.client.cancelScheduled(jobId);
  }

  // ---- 初期設定（npm run posting:setup）で使う ----

  /** プロフィール名 → つないでいる TikTok アカウント名（つないでいなければ null） */
  async profiles(): Promise<Map<string, string | null>> {
    const res = await this.client.listUsers();
    const map = new Map<string, string | null>();
    for (const p of res.profiles ?? []) {
      const tiktok = p.social_accounts?.tiktok as unknown;
      const name = isObj(tiktok) ? (str(tiktok.display_name) ?? str(tiktok.username) ?? "接続済み") : str(tiktok) ? String(tiktok) : null;
      map.set(p.username, name);
    }
    return map;
  }

  async createProfile(name: string): Promise<void> {
    await this.client.createUser(name);
  }

  /** TikTok アカウントをつなぐためのページの URL */
  async connectUrl(profile: string, title: string): Promise<string> {
    const res = await this.client.generateJwt(profile, {
      platforms: ["tiktok"],
      connectTitle: title,
      connectDescription: "このプロフィールにつなぐ TikTok アカウントでログインしてください",
    });
    const url = res.connection_url ?? str((res as Obj).access_url);
    if (!url) throw new Error("接続用のURLを受け取れませんでした");
    return url;
  }

  async tiktokSettings(profile: string): Promise<unknown> {
    return this.client.getTiktokPublishingSettings(profile);
  }
}
