// 全動画に共通の外枠：ナレーション・BGM・字幕・クレジット・締めの画面。
// 動画作成エージェントは、この中に入る映像（children）だけを作る。
import React from "react";
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Caption, splitHighlights } from "./Caption";
import { FONT_FAMILY, useFontsReady } from "./fonts";
import { BGM_CROSSFADE_FRAMES, HOOK_FRAMES, type JobData } from "./job";

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

/** 0フレーム目から画面上部に出す、つかみの文字（フェードインしない。最後だけ消える） */
const HookTitle: React.FC<{ text: string; accent: string }> = ({ text, accent }) => {
  const frame = useCurrentFrame();
  if (frame >= HOOK_FRAMES) return null;
  const opacity = interpolate(frame, [HOOK_FRAMES - 10, HOOK_FRAMES], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: 230,
        left: 0,
        right: 0,
        padding: "28px 70px 34px",
        opacity,
        background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.62) 18%, rgba(0,0,0,0.62) 82%, rgba(0,0,0,0) 100%)",
      }}
    >
      <div
        lang="ja"
        style={{
          wordBreak: "auto-phrase" as React.CSSProperties["wordBreak"],
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: 96,
          lineHeight: 1.25,
          color: "#ffffff",
          textAlign: "center",
          textShadow: "0 0 3px #000, 0 6px 18px rgba(0,0,0,0.9)",
        }}
      >
        {splitHighlights(text).map((p, i) => (
          <span key={i} style={p.strong ? { color: accent } : undefined}>
            {p.text}
          </span>
        ))}
      </div>
    </div>
  );
};

export const JobFrame: React.FC<{ job: JobData; children: React.ReactNode }> = ({ job, children }) => {
  useFontsReady([
    ...job.scenes.map((s) => s.caption + s.onScreen.join("")),
    job.endCard.question,
    job.hook ?? "",
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
      {job.hook && <HookTitle text={job.hook} accent={job.accent} />}
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
