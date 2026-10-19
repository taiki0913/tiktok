// 日本語フォント（Noto Sans JP）を同梱し、書き出し前に読み込みが終わるまで待つ。
// PCに日本語フォントが入っていなくても、同じ見た目で書き出せる。
import "@fontsource/noto-sans-jp/700.css";
import "@fontsource/noto-sans-jp/900.css";
import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

export const FONT_FAMILY = '"Noto Sans JP", sans-serif';

/** texts に含まれる文字のフォントを読み込み終えるまで、書き出しを待たせる */
export function useFontsReady(texts: string[]): void {
  const [handle] = useState(() => delayRender("日本語フォントの読み込み"));
  const sample = texts.join("");
  useEffect(() => {
    Promise.all(
      [700, 900].map((w) => document.fonts.load(`${w} 48px "Noto Sans JP"`, sample)),
    )
      .then(() => continueRender(handle))
      .catch((e) => cancelRender(e));
  }, [handle, sample]);
}
