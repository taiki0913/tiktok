// 画面下部の字幕。[ ] で囲んだ語を強調色で表示し、切り替わり時にふわっと出す。
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { FONT_FAMILY } from "./fonts";

export interface CaptionItem {
  from: number;
  to: number;
  text: string;
}

/** "通常[強調]通常" を部品に分ける */
export function splitHighlights(text: string): { text: string; strong: boolean }[] {
  return text
    .split(/(\[[^\]]+\])/)
    .filter((s) => s.length > 0)
    .map((s) => (s.startsWith("[") ? { text: s.slice(1, -1), strong: true } : { text: s, strong: false }));
}

export const Caption: React.FC<{ items: CaptionItem[]; accent: string; top: number }> = ({
  items,
  accent,
  top,
}) => {
  const frame = useCurrentFrame();
  const item = items.find((c) => frame >= c.from && frame < c.to);
  if (!item) return null;
  // 動画の最初の字幕は、0フレーム目から出しておく（冒頭で文字がない時間をつくらない）
  const local = item.from <= 0 ? 99 : frame - item.from;
  const opacity = interpolate(local, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  const lift = interpolate(local, [0, 8], [24, 0], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 70,
        right: 70,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        lang="ja"
        style={{
          // 日本語を文節の切れ目で改行する（「深 / さ」のような途中改行を防ぐ）
          wordBreak: "auto-phrase" as React.CSSProperties["wordBreak"],
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: 62,
          lineHeight: 1.35,
          color: "#ffffff",
          textAlign: "center",
          padding: "22px 34px",
          borderRadius: 22,
          background: "rgba(2, 10, 22, 0.62)",
          textShadow: "0 3px 10px rgba(0,0,0,0.6)",
        }}
      >
        {splitHighlights(item.text).map((part, i) => (
          <span key={i} style={part.strong ? { color: accent } : undefined}>
            {part.text}
          </span>
        ))}
      </div>
    </div>
  );
};
