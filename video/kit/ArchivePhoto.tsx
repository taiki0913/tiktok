// 本物の写真（job.photos）を、古い写真の紙焼きのように出す。背景は同じ写真をぼかして暗くしたもの。
// Sequence の中で使う（Sequence の始まりから durationInFrames のあいだ、ゆっくり寄る）。
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FONT_FAMILY } from "./fonts";
import type { JobPhoto } from "./job";

const BORDER = 18;

export const ArchivePhoto: React.FC<{
  photo: JobPhoto;
  /** この写真を映す長さ（フレーム）。寄る速さに使う */
  durationInFrames: number;
  /** 写真の上に出す札（既定：実際の写真） */
  label?: string;
  accent?: string;
  /** in=ゆっくり寄る、out=ゆっくり引く、none=動かない */
  zoom?: "in" | "out" | "none";
  /** 寄る中心（写真の中の位置。0〜1。顔に寄せるなど） */
  focus?: [number, number];
  /** 写真の中心の高さ（px）。上につかみの文字、下（1250〜）に字幕が出るので、既定は 740 */
  centerY?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** 傾き（度） */
  tilt?: number;
}> = ({
  photo,
  durationInFrames,
  label = "実際の写真",
  accent = "#ffcf3f",
  zoom = "in",
  focus = [0.5, 0.4],
  centerY = 740,
  maxWidth = 900,
  maxHeight = 840,
  tilt = -1.2,
}) => {
  const frame = useCurrentFrame();
  const ratio = photo.width / photo.height;
  const w = Math.min(maxWidth, maxHeight * ratio);
  const h = w / ratio;
  const t = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = zoom === "in" ? 1 + 0.12 * t : zoom === "out" ? 1.12 - 0.12 * t : 1;
  // 最初の数フレームだけ、置かれるように少し縮む（透明からは始めない）
  const settle = interpolate(frame, [0, 5], [1.035, 1], { extrapolateRight: "clamp" });
  const src = staticFile(photo.src);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0906", overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          inset: -80,
          width: "calc(100% + 160px)",
          height: "calc(100% + 160px)",
          objectFit: "cover",
          filter: "blur(28px) brightness(0.32) sepia(0.35)",
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.65) 100%)" }} />
      <div
        style={{
          position: "absolute",
          left: 540 - w / 2 - BORDER,
          top: centerY - h / 2 - BORDER,
          padding: BORDER,
          background: "#efe6d2",
          boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
          transform: `rotate(${tilt}deg) scale(${settle})`,
        }}
      >
        <div style={{ width: w, height: h, overflow: "hidden", position: "relative" }}>
          <Img
            src={src}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${scale})`,
              transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`,
            }}
          />
        </div>
      </div>
      {/* 札とクレジットは傾けず、画面からはみ出さないように置く */}
      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          // 札が2行になっても写真に重ならないよう、下端をそろえる
          bottom: 1920 - (centerY - h / 2 - BORDER - 14),
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            padding: "6px 20px",
            background: accent,
            color: "#111",
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 34,
            lineHeight: 1.3,
            textAlign: "center",
          }}
        >
          {label}｜{photo.caption}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: Math.max(40, 540 - w / 2 - BORDER),
          top: centerY + h / 2 + BORDER + 10,
          fontFamily: FONT_FAMILY,
          fontWeight: 700,
          fontSize: 22,
          color: "rgba(255,255,255,0.8)",
          whiteSpace: "nowrap",
          textShadow: "0 0 4px #000",
        }}
      >
        {photo.credit}
      </div>
    </AbsoluteFill>
  );
};
