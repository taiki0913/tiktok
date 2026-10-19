// 画面に重ねる計器・ラベル類（HTMLで描く）。座標は 1080×1920 のピクセル。
import React from "react";
import { Easing, interpolate } from "remotion";
import { FONT_FAMILY } from "./fonts";

export const PANEL_BG = "rgba(2, 12, 26, 0.6)";
export const PANEL_BORDER = "1px solid rgba(255,255,255,0.16)";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 数字を「12,345」の形にする */
export const formatNumber = (n: number, digits = 0): string =>
  n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** startFrame から durationFrames かけて from → to に増える数（なめらかに減速） */
export function countUp(frame: number, from: number, to: number, startFrame: number, durationFrames: number): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [from, to], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
}

/** startFrame から 0 → 1 に変わる出現の度合い（フェード・スライドに使う） */
export function appear(frame: number, startFrame: number, durationFrames = 10): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], clamp);
}

/** 半透明の板。子要素を好きに入れられる */
export const Panel: React.FC<{
  x: number;
  y: number;
  width?: number;
  padding?: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ x, y, width, padding = "20px 26px", opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      padding,
      borderRadius: 18,
      background: PANEL_BG,
      border: PANEL_BORDER,
      color: "#fff",
      fontFamily: FONT_FAMILY,
      opacity,
    }}
  >
    {children}
  </div>
);

/** 大きな数字の表示（例：水深 8,336 m / 人口 1億2,400万 人） */
export const BigNumber: React.FC<{
  x: number;
  y: number;
  label: string;
  value: string;
  unit?: string;
  color?: string;
  size?: number;
}> = ({ x, y, label, value, unit, color = "#3fe0ff", size = 150 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      color: "#fff",
      fontFamily: FONT_FAMILY,
      textShadow: "0 4px 18px rgba(0, 10, 30, 0.55)",
    }}
  >
    <div
      style={{
        display: "inline-block",
        fontSize: Math.round(size * 0.24),
        fontWeight: 900,
        color,
        letterSpacing: 2,
        padding: "4px 16px",
        borderRadius: 10,
        background: PANEL_BG,
        textShadow: "none",
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1 }}>
      <span style={{ fontSize: size, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {unit && <span style={{ fontSize: Math.round(size * 0.43), fontWeight: 900 }}>{unit}</span>}
    </div>
  </div>
);

/** 小さなラベル付きの値（例：水圧 約835気圧） */
export const Chip: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color = "#3fe0ff",
}) => (
  <div
    style={{
      display: "inline-flex",
      gap: 14,
      alignItems: "baseline",
      padding: "10px 20px",
      borderRadius: 999,
      background: PANEL_BG,
      border: PANEL_BORDER,
      fontFamily: FONT_FAMILY,
    }}
  >
    <span style={{ fontSize: 30, fontWeight: 700, color }}>{label}</span>
    <span style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>{value}</span>
  </div>
);

/** 小さな札（例：「CGによる再現」「想像図」「通説」） */
export const Tag: React.FC<{ text: string; x: number; y: number; color?: string; opacity?: number }> = ({
  text,
  x,
  y,
  color = "#fff",
  opacity = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      padding: "8px 20px",
      borderRadius: 10,
      fontSize: 28,
      fontWeight: 700,
      fontFamily: FONT_FAMILY,
      color,
      background: PANEL_BG,
      border: `1px solid ${color === "#fff" ? "rgba(255,255,255,0.25)" : color}`,
      opacity,
    }}
  >
    {text}
  </div>
);

/** 画面上の点 (targetX, targetY) を指し示すラベル。progress 0→1 で出現する */
export const Callout: React.FC<{
  targetX: number;
  targetY: number;
  title: string;
  lines?: string[];
  color?: string;
  progress?: number;
  /** ラベルの置き場所（指し示す点の上 or 下） */
  side?: "above" | "below";
  width?: number;
}> = ({ targetX, targetY, title, lines = [], color = "#ffcf3f", progress = 1, side = "above", width = 480 }) => {
  if (progress <= 0) return null;
  const lineLen = 110;
  const boxLeft = Math.max(60, Math.min(targetX - width / 2, 1080 - 60 - width));
  const lineTop = side === "above" ? targetY - lineLen : targetY;
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT_FAMILY, opacity: progress }}>
      <div
        style={{
          position: "absolute",
          left: targetX - 1.5,
          top: lineTop,
          width: 3,
          height: lineLen * progress,
          background: color,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: boxLeft,
          ...(side === "above" ? { bottom: 1920 - (targetY - lineLen) } : { top: targetY + lineLen }),
          width,
          padding: "18px 24px",
          borderRadius: 16,
          background: "rgba(2, 12, 26, 0.78)",
          border: `2px solid ${color}`,
          color: "#fff",
          transform: `scale(${0.9 + progress * 0.1})`,
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 900, color }}>{title}</div>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: i === 0 ? "#fff" : "rgba(255,255,255,0.75)" }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
};

/** 縦の目盛り（深度計・年表・高さ比べなど）。toRatio で値 → 0〜1 の位置を決める */
export const VerticalGauge: React.FC<{
  x: number;
  y: number;
  height: number;
  value: number;
  marks: { value: number; label: string; highlight?: boolean }[];
  toRatio: (v: number) => number;
  formatValue?: (v: number) => string;
  color?: string;
  highlightColor?: string;
}> = ({ x, y, height, value, marks, toRatio, formatValue = (v) => formatNumber(v), color = "#3fe0ff", highlightColor = "#ffcf3f" }) => {
  const pos = (v: number): number => Math.max(0, Math.min(1, toRatio(v))) * height;
  const current = pos(value);
  return (
    <div style={{ position: "absolute", left: x, top: y, height, width: 520, fontFamily: FONT_FAMILY }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 6, height, borderRadius: 3, background: "rgba(255,255,255,0.18)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: current, borderRadius: 3, background: color }} />
      {marks.map((m) => {
        const passed = value >= m.value;
        return (
          <div key={m.value} style={{ position: "absolute", top: pos(m.value) - 18, left: 0, display: "flex", alignItems: "center" }}>
            <div style={{ width: 22, height: 3, background: passed ? color : "rgba(255,255,255,0.45)" }} />
            <div
              style={{
                marginLeft: 12,
                fontSize: 26,
                fontWeight: 700,
                color: m.highlight ? highlightColor : passed ? "#fff" : "rgba(255,255,255,0.6)",
                textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                whiteSpace: "nowrap",
              }}
            >
              {formatValue(m.value)}　{m.label}
            </div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          top: current - 13,
          left: -10,
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 24px 8px ${color}88`,
        }}
      />
    </div>
  );
};
