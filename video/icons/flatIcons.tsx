// プロフィール画像：平面の絵で作るもの（深夜コンビニ物語・心理学のあるある）。
// TikTok では丸く切り抜かれるので、大事なものは中央の円の中に収める。
import React from "react";
import { AbsoluteFill, random } from "remotion";
import { FONT_FAMILY, useFontsReady } from "../kit";
import { ICON_SIZE } from "./polygonIcons";

const C = ICON_SIZE / 2;

/** 漫画の集中線（中心から外へ向かう細いくさび） */
const FocusLines: React.FC<{ color: string; inner: number; count?: number }> = ({ color, inner, count = 150 }) => (
  <g>
    {Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + random(`fl-a-${i}`) * 0.03;
      const r0 = inner + random(`fl-r-${i}`) * 120;
      const w = 0.004 + random(`fl-w-${i}`) * 0.012;
      const r1 = 820;
      const p = (r: number, d: number) => `${C + Math.cos(a + d) * r} ${C + Math.sin(a + d) * r}`;
      return <path key={i} d={`M ${p(r0, 0)} L ${p(r1, w)} L ${p(r1, -w)} Z`} fill={color} />;
    })}
  </g>
);

/** 深夜コンビニ物語：夜の集中線の中に、明かりのついたコンビニ */
export const MangaStoryIcon: React.FC = () => {
  useFontsReady(["24h"]);
  const yellow = "#ffd84a";
  const x0 = 250;
  const x1 = 830;
  const top = 470;
  const bottom = 790;
  const panes = [x0 + 30, x0 + 210, x0 + 390];
  return (
    <AbsoluteFill style={{ background: "#0b0b0f" }}>
      <svg width={ICON_SIZE} height={ICON_SIZE}>
        <defs>
          <pattern id="tone" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="3.2" fill="#ffffff" />
          </pattern>
          <radialGradient id="glow" cx="50%" cy="60%" r="50%">
            <stop offset="0%" stopColor={yellow} stopOpacity="0.55" />
            <stop offset="100%" stopColor={yellow} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pane" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff6c8" />
            <stop offset="100%" stopColor={yellow} />
          </linearGradient>
        </defs>
        <FocusLines color="#ffffff" inner={380} />
        {/* 店の明かりがあふれる */}
        <ellipse cx={C} cy={650} rx={430} ry={300} fill="url(#glow)" />
        {/* 三日月 */}
        <circle cx={760} cy={250} r={58} fill="#fff6d8" />
        <circle cx={786} cy={232} r={52} fill="#0b0b0f" />
        {/* 地面のトーン */}
        <rect x={120} y={bottom} width={840} height={120} fill="url(#tone)" opacity={0.35} />
        {/* 看板 */}
        <rect x={x0 - 20} y={top - 92} width={x1 - x0 + 40} height={92} fill="#ffffff" stroke="#0b0b0f" strokeWidth={10} />
        <rect x={x0 - 20} y={top - 30} width={x1 - x0 + 40} height={18} fill={yellow} />
        <text x={C} y={top - 40} textAnchor="middle" fontFamily={FONT_FAMILY} fontWeight={900} fontSize={58} fill="#0b0b0f">
          24h
        </text>
        {/* 店の壁とガラス */}
        <rect x={x0} y={top} width={x1 - x0} height={bottom - top} fill="#ffffff" stroke="#0b0b0f" strokeWidth={10} />
        {panes.map((px) => (
          <rect key={px} x={px} y={top + 28} width={160} height={bottom - top - 28} fill="url(#pane)" stroke="#0b0b0f" strokeWidth={8} />
        ))}
        {/* 棚 */}
        {[panes[0]!, panes[2]!].map((px) =>
          [0, 1, 2].map((r) => (
            <rect key={`${px}-${r}`} x={px + 18} y={top + 70 + r * 72} width={124} height={34} fill="#0b0b0f" opacity={0.85} rx={4} />
          )),
        )}
        {/* レジに立つ店員（ミナト）の影 */}
        <circle cx={panes[1]! + 80} cy={top + 120} r={36} fill="#0b0b0f" />
        <path d={`M ${panes[1]! + 22} ${top + 236} Q ${panes[1]! + 22} ${top + 166} ${panes[1]! + 80} ${top + 166} Q ${panes[1]! + 138} ${top + 166} ${panes[1]! + 138} ${top + 236} Z`} fill="#0b0b0f" />
        <rect x={panes[1]!} y={top + 230} width={160} height={bottom - top - 230} fill="#0b0b0f" />
        {/* 地面の線 */}
        <line x1={150} y1={bottom + 4} x2={930} y2={bottom + 4} stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
      </svg>
    </AbsoluteFill>
  );
};

/** 顔のない人型（胸から上）。下は画面の外まで伸ばす */
const Bust: React.FC<{ cx: number; headY: number; color: string; scale?: number }> = ({ cx, headY, color, scale = 1 }) => {
  const r = 92 * scale;
  const sw = 170 * scale; // 肩幅の半分
  const shoulder = headY + r + 30 * scale;
  return (
    <g fill={color}>
      <circle cx={cx} cy={headY} r={r} />
      <path d={`M ${cx - sw} ${ICON_SIZE} L ${cx - sw} ${shoulder + 110 * scale} Q ${cx - sw} ${shoulder} ${cx} ${shoulder} Q ${cx + sw} ${shoulder} ${cx + sw} ${shoulder + 110 * scale} L ${cx + sw} ${ICON_SIZE} Z`} />
    </g>
  );
};

/** 心理学のあるある：向かい合う2人と、頭の中の「？」 */
export const PsychologyIcon: React.FC = () => {
  useFontsReady(["?!"]);
  const teal = "#12a89a";
  const yellow = "#f2b632";
  return (
    <AbsoluteFill style={{ background: "#f6f0e6" }}>
      <svg width={ICON_SIZE} height={ICON_SIZE}>
        <circle cx={C} cy={C} r={470} fill="#efe5d4" />
        <Bust cx={360} headY={600} color={teal} />
        <Bust cx={735} headY={640} color={yellow} scale={0.9} />
        {/* 考えごとの吹き出し */}
        <g style={{ filter: "drop-shadow(0 8px 0 rgba(60,50,30,0.12))" }}>
          <circle cx={300} cy={470} r={18} fill="#ffffff" />
          <circle cx={330} cy={410} r={30} fill="#ffffff" />
          <ellipse cx={440} cy={290} rx={175} ry={140} fill="#ffffff" />
          <circle cx={760} cy={505} r={16} fill="#ffffff" />
          <circle cx={772} cy={452} r={26} fill="#ffffff" />
          <ellipse cx={740} cy={330} rx={105} ry={95} fill="#ffffff" />
        </g>
        <text x={440} y={350} textAnchor="middle" fontFamily={FONT_FAMILY} fontWeight={900} fontSize={190} fill={teal}>
          ?
        </text>
        <text x={740} y={378} textAnchor="middle" fontFamily={FONT_FAMILY} fontWeight={900} fontSize={140} fill={yellow}>
          !
        </text>
      </svg>
    </AbsoluteFill>
  );
};
