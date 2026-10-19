// 試作：「魚が絶対に行けない深さ」の冒頭15秒（ポリゴン調の3D＋計器＋字幕）。
import { ThreeCanvas } from "@remotion/three";
import React from "react";
import { AbsoluteFill } from "remotion";
import { Caption } from "../kit/Caption";
import { useFontsReady } from "../kit/fonts";
import { CAMERA_FOV, HEIGHT, WIDTH } from "./camera";
import { DeepSeaHud, HIGHLIGHT } from "./Hud";
import { DeepSeaScene } from "./Scene";
import { CAPTIONS, GAUGE_MARKS } from "./timeline";

const ALL_TEXT = [
  ...CAPTIONS.map((c) => c.text),
  ...GAUGE_MARKS.map((m) => m.label),
  "水深m水圧約気圧太陽光届くほぼ届かない0123456789,CGによる再現",
  "シンカイクサウオの仲間2022年伊豆・小笠原海溝で撮影西オーストラリア大学東京海洋大学（2023年発表）",
];

export const DeepSea: React.FC = () => {
  useFontsReady(ALL_TEXT);
  return (
    <AbsoluteFill style={{ backgroundColor: "#01060e" }}>
      <ThreeCanvas width={WIDTH} height={HEIGHT} camera={{ fov: CAMERA_FOV, near: 0.1, far: 1000 }}>
        <DeepSeaScene />
      </ThreeCanvas>
      <DeepSeaHud />
      <Caption items={CAPTIONS} accent={HIGHLIGHT} top={1250} />
    </AbsoluteFill>
  );
};
