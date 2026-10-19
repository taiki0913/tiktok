// グラフ（棒・折れ線）。progress 0→1 で伸びるアニメーション。座標は 1080×1920 のピクセル。
import React from "react";
import { FONT_FAMILY } from "./fonts";
import { formatNumber, PANEL_BORDER } from "./hud";

/** グラフは文字が多いので、通常の板より濃い背景にする */
const CHART_BG = "rgba(2, 12, 26, 0.85)";

interface ChartFrameProps {
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  source?: string;
}

const ChartFrame: React.FC<ChartFrameProps & { children: React.ReactNode }> = ({ x, y, width, height, title, source, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      borderRadius: 20,
      background: CHART_BG,
      border: PANEL_BORDER,
      fontFamily: FONT_FAMILY,
      color: "#fff",
      padding: 28,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
    }}
  >
    {title && <div style={{ fontSize: 36, fontWeight: 900, marginBottom: 14 }}>{title}</div>}
    <div style={{ position: "relative", flex: 1 }}>{children}</div>
    {source && <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.65)", marginTop: 10 }}>出典：{source}</div>}
  </div>
);

/** 棒グラフ。highlight の棒だけ強調色にする */
export const BarChart: React.FC<
  ChartFrameProps & {
    items: { label: string; value: number; highlight?: boolean }[];
    max?: number;
    unit?: string;
    progress?: number;
    color?: string;
    highlightColor?: string;
    digits?: number;
  }
> = ({ items, max, unit = "", progress = 1, color = "#7fb8ff", highlightColor = "#ffcf3f", digits = 0, ...frame }) => {
  const top = max ?? Math.max(...items.map((i) => i.value)) * 1.1;
  return (
    <ChartFrame {...frame}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 18, paddingBottom: 46 }}>
        {items.map((item, i) => {
          const h = (item.value / top) * progress;
          const c = item.highlight ? highlightColor : color;
          return (
            <div key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: c, marginBottom: 8, opacity: progress }}>
                {formatNumber(item.value * progress, digits)}
                {unit}
              </div>
              <div style={{ width: "80%", height: `${h * 100}%`, background: c, borderRadius: "10px 10px 0 0" }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", gap: 18 }}>
        {items.map((item, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 24, fontWeight: 700, whiteSpace: "nowrap" }}>
            {item.label}
          </div>
        ))}
      </div>
    </ChartFrame>
  );
};

/** 折れ線グラフ。progress に合わせて左から線が伸びる */
export const LineChart: React.FC<
  ChartFrameProps & {
    series: { label: string; color: string; points: { x: number; y: number }[] }[];
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    xTicks?: number[];
    yTicks?: number[];
    formatX?: (v: number) => string;
    formatY?: (v: number) => string;
    progress?: number;
  }
> = ({ series, xMin, xMax, yMin, yMax, xTicks = [], yTicks = [], formatX = String, formatY = (v) => formatNumber(v), progress = 1, ...frame }) => {
  const W = frame.width - 56 - 90;
  const H = frame.height - 56 - (frame.title ? 60 : 0) - (frame.source ? 40 : 0) - 50;
  const px = (v: number): number => 90 + ((v - xMin) / (xMax - xMin)) * W;
  const py = (v: number): number => H - ((v - yMin) / (yMax - yMin)) * H;
  const cutX = xMin + (xMax - xMin) * progress;
  return (
    <ChartFrame {...frame}>
      <svg width={W + 90} height={H + 50} style={{ overflow: "visible" }}>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={90} x2={90 + W} y1={py(t)} y2={py(t)} stroke="rgba(255,255,255,0.15)" strokeWidth={2} />
            <text x={78} y={py(t) + 8} fill="rgba(255,255,255,0.8)" fontSize={22} fontWeight={700} textAnchor="end">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={px(t)} y={H + 38} fill="rgba(255,255,255,0.8)" fontSize={22} fontWeight={700} textAnchor="middle">
            {formatX(t)}
          </text>
        ))}
        {series.map((s) => {
          const pts = s.points.filter((p) => p.x <= cutX);
          const last = pts[pts.length - 1];
          return (
            <g key={s.label}>
              <polyline
                points={pts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={7}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {last && <circle cx={px(last.x)} cy={py(last.y)} r={11} fill={s.color} />}
              {last && (
                // 右端に近いときは点の左側に書いて、枠からはみ出さないようにする
                <text
                  x={px(last.x) > 90 + W * 0.7 ? px(last.x) - 16 : px(last.x) + 16}
                  y={py(last.y) - 18}
                  fill={s.color}
                  fontSize={28}
                  fontWeight={900}
                  textAnchor={px(last.x) > 90 + W * 0.7 ? "end" : "start"}
                >
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
};
