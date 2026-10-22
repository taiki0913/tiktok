// .env から投稿の設定を組み立てる。
import { env } from "../config/env.js";
import type { PostingDeps } from "./publisher.js";
import { UploadPostService } from "./uploadPost.js";

export function postingSettings(): Omit<PostingDeps, "store" | "notifier"> {
  return {
    service: env.UPLOAD_POST_API_KEY ? new UploadPostService(env.UPLOAD_POST_API_KEY) : null,
    timeZone: env.TIMEZONE,
  };
}

export function requireUploadPost(): UploadPostService {
  if (!env.UPLOAD_POST_API_KEY) {
    throw new Error(".env に UPLOAD_POST_API_KEY が設定されていません（Upload-Post の画面の「API Keys」で発行できます）");
  }
  return new UploadPostService(env.UPLOAD_POST_API_KEY);
}
