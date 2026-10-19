// 画面に重ねる計器類：水深の数字、水圧・光のチップ、左の深度計、CG表記、最後の解説ラベル。
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { FONT_FAMILY } from "../kit/fonts";
import { projectToScreen } from "./camera";
import { snailfishPosition } from "./Scene";
import {
  depthAt,
  DESCENT_END,
  GAUGE_BOTTOM,
  GAUGE_MARKS,
  lightLabel,
  MAX_DEPTH,
  pressureAtm,
  progressFromDepth,
} from "./timeline";

export const ACCENT = "#3fe0ff";
export const HIGHLIGHT = "#ffcf3f";
const PANEL_BG = "rgba(2, 12, 26, 0.55)";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const formatDepth = (d: number): string => Math.round(d).toLocaleString("ja-JP");

const Chip: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      display: "flex",
      gap: 14,
      alignItems: "baseline",
      padding: "10px 20px",
      borderRadius: 999,
      background: PANEL_BG,
      border: "1px solid rgba(255,255,255,0.14)",
    }}
  >
    <span style={{ fontSize: 30, fontWeight: 700, color: ACCENT }}>{label}</span>
    <span style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>{value}</span>
  </div>
);

const DepthReadout: React.FC<{ depth: number }> = ({ depth }) => (
  <div style={{ position: "absolute", top: 150, left: 70, color: "#fff", textShadow: "0 4px 18px rgba(0, 10, 30, 0.55)" }}>
    <div style={{ fontSize: 40, fontWeight: 700, color: ACCENT, letterSpacing: 4 }}>水深</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1 }}>
      <span style={{ fontSize: 150, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{formatDepth(depth)}</span>
      <span style={{ fontSize: 64, fontWeight: 900 }}>m</span>
    </div>
    <div style={{ display: "flex", gap: 14, marginTop: 18 }}>
      <Chip label="水圧" value={`約${pressureAtm(depth).toLocaleString("ja-JP")}気圧`} />
      <Chip label="太陽光" value={lightLabel(depth)} />
    </div>
  </div>
);

/** 左側の深度計。目盛りの位置は3Dの潜るテンポと同じ縮尺にしている */
const DepthGauge: React.FC<{ depth: number }> = ({ depth }) => {
  const top = 520;
  const height = 640;
  const toY = (d: number): number => (progressFromDepth(Math.min(d, GAUGE_BOTTOM)) / progressFromDepth(GAUGE_BOTTOM)) * height;
  const current = toY(depth);
  return (
    <div style={{ position: "absolute", top, left: 84, height, width: 520 }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 6, height, borderRadius: 3, background: "rgba(255,255,255,0.18)" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 6,
          height: current,
          borderRadius: 3,
          background: `linear-gradient(${ACCENT}, #1f7cff)`,
        }}
      />
      {GAUGE_MARKS.map((m) => {
        const passed = depth >= m.depth;
        const record = m.depth === MAX_DEPTH;
        return (
          <div key={m.depth} style={{ position: "absolute", top: toY(m.depth) - 18, left: 0, display: "flex", alignItems: "center" }}>
            <div style={{ width: 22, height: 3, background: passed ? ACCENT : "rgba(255,255,255,0.45)" }} />
            <div
              style={{
                marginLeft: 12,
                fontSize: 26,
                fontWeight: 700,
                color: record ? HIGHLIGHT : passed ? "#fff" : "rgba(255,255,255,0.6)",
                textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                whiteSpace: "nowrap",
              }}
            >
              {formatDepth(m.depth)}m　{m.label}
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
          background: ACCENT,
          boxShadow: `0 0 24px 8px ${ACCENT}88`,
        }}
      />
    </div>
  );
};

const CgTag: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 160,
      right: 70,
      padding: "8px 20px",
      borderRadius: 10,
      fontSize: 28,
      fontWeight: 700,
      color: "#fff",
      background: PANEL_BG,
      border: "1px solid rgba(255,255,255,0.25)",
    }}
  >
    CGによる再現
  </div>
);

/** 最深部で魚を指し示すラベル */
const RecordLabel: React.FC<{ frame: number; depth: number }> = ({ frame, depth }) => {
  const appear = interpolate(frame, [DESCENT_END + 8, DESCENT_END + 20], [0, 1], clamp);
  if (appear <= 0) return null;
  const fish = projectToScreen(snailfishPosition(), depth);
  const boxBottom = fish.y - 150;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: fish.x - 1.5,
          top: boxBottom,
          width: 3,
          height: 110 * appear,
          background: HIGHLIGHT,
          opacity: appear,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 1080 - 60 - 480,
          top: boxBottom - 190,
          width: 480,
          padding: "18px 24px",
          borderRadius: 16,
          background: "rgba(2, 12, 26, 0.75)",
          border: `2px solid ${HIGHLIGHT}`,
          color: "#fff",
          opacity: appear,
          transform: `scale(${0.9 + appear * 0.1})`,
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 900, color: HIGHLIGHT }}>シンカイクサウオの仲間</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>2022年 伊豆・小笠原海溝で撮影</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "rgba(255,255,255,0.75)" }}>
          西オーストラリア大学・東京海洋大学（2023年発表）
        </div>
      </div>
    </>
  );
};

export const DeepSeaHud: React.FC = () => {
  const frame = useCurrentFrame();
  const depth = depthAt(frame);
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT_FAMILY }}>
      <DepthReadout depth={depth} />
      <DepthGauge depth={depth} />
      <CgTag />
      <RecordLabel frame={frame} depth={depth} />
    </div>
  );
};
