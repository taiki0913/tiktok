// 自動生成ファイル（編集しない）。Video.tsx の映像を共通の外枠（字幕・ナレーション・BGM・締めの画面）に入れる。
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
