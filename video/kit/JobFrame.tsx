// 全動画に共通の外枠：ナレーション・BGM・字幕・クレジット・締めの画面。
// 動画作成エージェントは、この中に入る映像（children）だけを作る。
import React from "react";
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Caption, splitHighlights } from "./Caption";
import { FONT_FAMILY, useFontsReady } from "./fonts";
import { BGM_CROSSFADE_FRAMES, type JobData } from "./job";

const BGM_VOLUME = 0.12;

/** 締めの画面：問いかけ・出典・クレジット */
export const EndCard: React.FC<{ question: string; sources: string[]; credits: string[]; accent: string }> = ({
  question,
  sources,
  credits,
  accent,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#05070d", opacity, fontFamily: FONT_FAMILY, color: "#fff" }}>
      <div
        lang="ja"
        style={{
          position: "absolute",
          top: 640,
          left: 90,
          right: 90,
          textAlign: "center",
          fontSize: 76,
          fontWeight: 900,
          lineHeight: 1.4,
          wordBreak: "auto-phrase" as React.CSSProperties["wordBreak"],
        }}
      >
        {splitHighlights(question).map((p, i) => (
          <span key={i} style={p.strong ? { color: accent } : undefined}>
            {p.text}
          </span>
        ))}
      </div>
      <div style={{ position: "absolute", top: 1080, left: 90, right: 90, textAlign: "center", fontSize: 34, fontWeight: 700, color: accent }}>
        コメントで教えてください
      </div>
      <div style={{ position: "absolute", top: 1250, left: 90, right: 90, fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
        {sources.length > 0 && <div>出典：{sources.join("／")}</div>}
        {credits.length > 0 && <div>{credits.join("／")}</div>}
      </div>
    </AbsoluteFill>
  );
};

export const JobFrame: React.FC<{ job: JobData; children: React.ReactNode }> = ({ job, children }) => {
  useFontsReady([
    ...job.scenes.map((s) => s.caption + s.onScreen.join("")),
    job.endCard.question,
    job.endCard.sources.join(""),
    job.credits.join(""),
    "コメントで教えてください出典：0123456789,.%年月日万億人",
  ]);
  const frame = useCurrentFrame();
  const endFrames = job.durationInFrames - job.endCard.from;
  const bgmVolume = (f: number): number =>
    BGM_VOLUME * interpolate(f, [0, 20, job.durationInFrames - 30, job.durationInFrames], [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {children}
      <Caption
        items={job.scenes.map((s) => ({ from: s.from, to: s.from + s.durationInFrames, text: s.caption }))}
        accent={job.accent}
        top={1250}
      />
      {job.credits.length > 0 && frame < job.endCard.from && (
        <div
          style={{
            position: "absolute",
            top: 108,
            left: 70,
            fontFamily: FONT_FAMILY,
            fontSize: 22,
            fontWeight: 700,
            color: "rgba(255,255,255,0.75)",
            textShadow: "0 2px 6px rgba(0,0,0,0.8)",
          }}
        >
          {job.credits.join("／")}
        </div>
      )}
      <Sequence from={job.endCard.from} durationInFrames={endFrames} name="締めの画面">
        <EndCard question={job.endCard.question} sources={job.endCard.sources} credits={job.credits} accent={job.accent} />
      </Sequence>
      {job.scenes
        .filter((s) => s.audio)
        .map((s) => (
          <Sequence key={s.index} from={s.audioFrom} name={`ナレーション${s.index + 1}`}>
            <Html5Audio src={staticFile(s.audio)} />
          </Sequence>
        ))}
      {job.bgmCues && job.bgmCues.length > 0
        ? job.bgmCues.map((c, i) => (
            <Sequence key={i} from={c.from} durationInFrames={c.durationInFrames} name={`BGM ${c.mood}`}>
              <Html5Audio
                src={staticFile(c.src)}
                loop
                volume={(f) =>
                  BGM_VOLUME *
                  interpolate(f, [0, BGM_CROSSFADE_FRAMES, c.durationInFrames - BGM_CROSSFADE_FRAMES, c.durationInFrames], [0, 1, 1, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                }
              />
            </Sequence>
          ))
        : job.bgm && <Html5Audio src={staticFile(job.bgm)} volume={bgmVolume} loop />}
    </AbsoluteFill>
  );
};
