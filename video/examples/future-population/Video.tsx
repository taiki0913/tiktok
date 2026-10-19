// 見本：「あなたが70歳の年、日本は何人？」（短縮版）。部品集（../../kit）だけで作った映像。
// 字幕・ナレーション・締めの画面は共通の外枠（JobFrame）が出すので、ここでは映像と計器だけを描く。
import React from "react";
import { AbsoluteFill, interpolate, interpolateColors, random, useCurrentFrame } from "remotion";
import {
  appear,
  Atmosphere,
  BigNumber,
  Building,
  CAMERA_FOV,
  cameraPath,
  CameraRig,
  Chip,
  Ground,
  HEIGHT,
  House,
  LineChart,
  Lights,
  Person,
  Road,
  Tag,
  ThreeCanvas,
  Tree,
  WIDTH,
  type JobData,
} from "../../kit";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 日本の総人口（万人）。2020年は国勢調査、2024年は人口推計、それ以降は社人研の令和5年推計（出生中位） */
const POPULATION = [
  { x: 2020, y: 12615 },
  { x: 2024, y: 12380 },
  { x: 2030, y: 12012 },
  { x: 2040, y: 11284 },
  { x: 2050, y: 10469 },
  { x: 2056, y: 9965 },
  { x: 2060, y: 9615 },
  { x: 2070, y: 8700 },
];

function populationAt(year: number): number {
  return interpolate(
    year,
    POPULATION.map((p) => p.x),
    POPULATION.map((p) => p.y),
    clamp,
  );
}

/** 万人の数を「1億2,380万」の形にする */
function formatOku(man: number): string {
  const v = Math.round(man);
  const oku = Math.floor(v / 10000);
  const rest = v % 10000;
  return oku > 0 ? `${oku}億${rest.toLocaleString("ja-JP")}万` : `${rest.toLocaleString("ja-JP")}万`;
}

/** 町の区画：道路で区切られた4つのブロックに家を並べる */
const HOUSES = Array.from({ length: 40 }, (_, i) => {
  const qx = i % 2 === 0 ? 1 : -1;
  const qz = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
  const k = Math.floor(i / 4);
  return {
    position: [qx * (8 + (k % 5) * 5), 0, qz * (8 + Math.floor(k / 5) * 6)] as [number, number, number],
    wall: ["#efe4d0", "#dfe8ef", "#f2dcc9", "#e6e6e0"][i % 4]!,
    roof: ["#8a4b3a", "#3f5a7a", "#5a5f66", "#7a6a3a"][Math.floor(random(`roof-${i}`) * 4)]!,
    rot: random(`rot-${i}`) > 0.5 ? 0 : Math.PI,
  };
});

const PEOPLE = Array.from({ length: 36 }, (_, i) => ({
  x: (random(`px-${i}`) > 0.5 ? 1 : -1) * (3.6 + random(`pxo-${i}`) * 0.8),
  z: -40 + random(`pz-${i}`) * 80,
  dir: random(`pd-${i}`) > 0.5 ? 1 : -1,
  color: ["#e05a47", "#3f7fd9", "#f2b84b", "#5aa868", "#9b6bd1"][i % 5]!,
}));

export const Video: React.FC<{ job: JobData }> = ({ job }) => {
  const frame = useCurrentFrame();
  const s1 = job.scenes[1]!;
  const s2 = job.scenes[2]!;

  // 年：最初の場面は2024年のまま、2つ目で2056年、3つ目で2070年まで進める
  const year = interpolate(
    frame,
    [s1.from, s1.from + s1.durationInFrames * 0.8, s2.from, s2.from + s2.durationInFrames * 0.7],
    [2024, 2056, 2056, 2070],
    clamp,
  );
  const population = populationAt(year);
  // 町を歩く人の数を人口に比例させる
  const peopleShown = Math.round(PEOPLE.length * (population / 12380));

  const cam = cameraPath(frame, [
    { frame: 0, position: [0, 36, 44], target: [0, 0, 0] },
    { frame: s1.from + 90, position: [20, 20, 26], target: [0, 0, -4] },
    { frame: job.endCard.from, position: [-16, 14, 20], target: [0, 1, -6] },
  ]);
  const sky = interpolateColors(year, [2024, 2070], ["#bfe3ff", "#a9c4e6"]);
  const chart = appear(frame, s2.from + 8, 20);

  return (
    <>
      <ThreeCanvas width={WIDTH} height={HEIGHT} camera={{ fov: CAMERA_FOV, near: 0.1, far: 500 }}>
        <Atmosphere color={sky} fogNear={40} fogFar={120} />
        <Lights preset="day" />
        <CameraRig position={cam.position} target={cam.target} />
        <Ground size={180} color="#8fae6a" />
        <Road from={[0, 0, -70]} to={[0, 0, 70]} width={6} />
        <Road from={[-70, 0, 0]} to={[70, 0, 0]} width={6} />
        {HOUSES.map((h, i) => (
          <House key={i} position={h.position} rotationY={h.rot} wallColor={h.wall} roofColor={h.roof} />
        ))}
        <Building position={[-12, 0, -26]} width={6} depth={6} height={18} color="#c7cfd6" />
        <Building position={[13, 0, -30]} width={5} depth={5} height={24} color="#b3bcc6" />
        {Array.from({ length: 14 }, (_, i) => (
          <Tree key={i} position={[(random(`tx-${i}`) - 0.5) * 70, 0, -50 + random(`tz-${i}`) * 30]} height={2.5 + random(`th-${i}`) * 2} />
        ))}
        {PEOPLE.slice(0, peopleShown).map((p, i) => (
          <Person
            key={i}
            position={[p.x, 0, ((p.z + p.dir * frame * 0.05 + 40) % 80) - 40]}
            rotationY={p.dir > 0 ? 0 : Math.PI}
            color={p.color}
            walk={frame + i * 7}
          />
        ))}
      </ThreeCanvas>

      <BigNumber x={70} y={150} label="日本の人口" value={formatOku(population)} unit="人" color={job.accent} size={120} />
      <div style={{ position: "absolute", left: 70, top: 370 }}>
        <Chip label="年" value={`${Math.round(year)}年`} color={job.accent} />
      </div>
      <Tag text="推計：社人研（令和5年・出生中位）" x={70} y={460} />

      {chart > 0 && (
        <AbsoluteFill style={{ opacity: chart, transform: `translateY(${(1 - chart) * 40}px)` }}>
          <LineChart
            x={60}
            y={560}
            width={960}
            height={560}
            title="日本の総人口（万人）"
            source="総務省統計局／社人研（令和5年推計）"
            series={[{ label: `${formatOku(population)}人`, color: job.accent, points: POPULATION }]}
            xMin={2020}
            xMax={2070}
            yMin={8000}
            yMax={13000}
            xTicks={[2020, 2030, 2040, 2050, 2060, 2070]}
            yTicks={[8000, 10000, 12000]}
            formatX={(v) => `${v}`}
            progress={interpolate(year, [2056, 2070], [0.72, 1], clamp)}
          />
        </AbsoluteFill>
      )}
    </>
  );
};
