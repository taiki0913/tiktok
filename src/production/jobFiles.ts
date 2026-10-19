// 1本の動画（ジョブ）のフォルダを用意する。
//   video/jobs/<ジョブID>/job.json   … 台本とナレーションの長さから作った設計図
//   video/jobs/<ジョブID>/entry.tsx  … Remotion の入口（自動生成。Video.tsx を共通の外枠に入れる）
//   video/jobs/<ジョブID>/Video.tsx  … 動画作成エージェントが書く映像
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobData } from "../../video/kit/job.js";

export const ENTRY_TEMPLATE = `// 自動生成ファイル（編集しない）。Video.tsx の映像を共通の外枠（字幕・ナレーション・BGM・締めの画面）に入れる。
import React from "react";
import { Composition, registerRoot } from "remotion";
import { JobFrame, type JobData } from "../../kit";
import jobJson from "./job.json";
import { Video } from "./Video";

const job = jobJson as JobData;

const Main: React.FC = () => (
  <JobFrame job={job}>
    <Video job={job} />
  </JobFrame>
);

registerRoot(() => (
  <Composition
    id="Main"
    component={Main}
    durationInFrames={job.durationInFrames}
    fps={job.fps}
    width={job.width}
    height={job.height}
  />
));
`;

export async function writeJobFiles(jobDir: string, job: JobData): Promise<void> {
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, "job.json"), JSON.stringify(job, null, 2), "utf8");
  await writeFile(join(jobDir, "entry.tsx"), ENTRY_TEMPLATE, "utf8");
}
