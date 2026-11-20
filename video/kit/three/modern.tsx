// 近代（明治・大正・昭和初期）の部品：煉瓦の洋館・蒸気機関車・人力車・ガス灯。
// すべて単純な立体の組み合わせ（ポリゴン調）。position は地面に置く位置（足元）。
import React from "react";
import { random } from "remotion";
import * as THREE from "three";
import type { Vec3 } from "./camera";

const Std: React.FC<{ color: string; emissive?: string; emissiveIntensity?: number; opacity?: number }> = ({
  color,
  emissive,
  emissiveIntensity = 0,
  opacity,
}) => (
  <meshStandardMaterial
    color={color}
    flatShading
    roughness={0.85}
    emissive={emissive ?? "#000000"}
    emissiveIntensity={emissiveIntensity}
    transparent={opacity !== undefined}
    opacity={opacity ?? 1}
    depthWrite={opacity === undefined}
  />
);

/** アーチ窓（四角の上に半円）。正面（+Z）に貼る */
const ArchWindow: React.FC<{ position: Vec3; width: number; height: number; lights: number }> = ({ position, width, height, lights }) => (
  <group position={position}>
    <mesh position={[0, -width / 4, 0]}>
      <planeGeometry args={[width, height - width / 2]} />
      <Std color="#2f3d4c" emissive="#ffd88a" emissiveIntensity={lights * 1.6} />
    </mesh>
    <mesh position={[0, height / 2 - width / 2 - width / 4, 0]}>
      <circleGeometry args={[width / 2, 10, 0, Math.PI]} />
      <Std color="#2f3d4c" emissive="#ffd88a" emissiveIntensity={lights * 1.6} />
    </mesh>
  </group>
);

/**
 * 明治の煉瓦造りの洋館（駅舎・銀行・役所など）。白い帯とアーチ窓。
 * tower で正面中央に時計塔、lights（0〜1）で夜の窓明かり
 */
export const BrickBuilding: React.FC<{
  position: Vec3;
  rotationY?: number;
  width?: number;
  depth?: number;
  floors?: number;
  color?: string;
  trimColor?: string;
  roofColor?: string;
  tower?: boolean;
  lights?: number;
}> = ({
  position,
  rotationY = 0,
  width = 10,
  depth = 5,
  floors = 2,
  color = "#a4473a",
  trimColor = "#ece3cf",
  roofColor = "#4a5058",
  tower = false,
  lights = 0,
}) => {
  const floorH = 3;
  const height = floors * floorH;
  const cols = Math.max(2, Math.floor(width / 1.6));
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <Std color={color} />
      </mesh>
      {/* 階ごとの白い帯と、軒の帯 */}
      {Array.from({ length: floors + 1 }, (_, f) => (
        <mesh key={f} position={[0, f * floorH + (f === floors ? 0.1 : 0.05), 0]}>
          <boxGeometry args={[width + 0.12, f === floors ? 0.35 : 0.18, depth + 0.12]} />
          <Std color={trimColor} />
        </mesh>
      ))}
      {/* 寄棟風の屋根 */}
      {/* 4角すいの形を45°回してから、建物の幅と奥行きに合わせて伸ばす */}
      <group position={[0, height + 0.9, 0]} scale={[width / 2 + 0.3, 1.6, depth / 2 + 0.3]}>
        <mesh rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.35, 1.41, 1, 4]} />
          <Std color={roofColor} />
        </mesh>
      </group>
      {/* 正面のアーチ窓 */}
      {Array.from({ length: floors * cols }, (_, i) => {
        const f = Math.floor(i / cols);
        const c = i % cols;
        if (tower && f === 0 && Math.abs(c - (cols - 1) / 2) < 0.6) return null; // 時計塔の下は入口
        return (
          <ArchWindow
            key={i}
            position={[-width / 2 + (c + 0.5) * (width / cols), f * floorH + floorH * 0.55, depth / 2 + 0.01]}
            width={(width / cols) * 0.45}
            height={floorH * 0.6}
            lights={random(`brick-${i}`) < 0.7 ? lights : 0}
          />
        );
      })}
      {tower && (
        <group position={[0, 0, depth / 2 + 0.6]}>
          <mesh position={[0, (height + 3) / 2, 0]}>
            <boxGeometry args={[2.4, height + 3, 2]} />
            <Std color={color} />
          </mesh>
          <mesh position={[0, height + 3 + 0.9, 0]}>
            <coneGeometry args={[1.7, 1.8, 4, 1]} />
            <Std color={roofColor} />
          </mesh>
          {/* 時計 */}
          <mesh position={[0, height + 1.6, 1.01]}>
            <circleGeometry args={[0.75, 16]} />
            <Std color="#f4efe2" />
          </mesh>
          <mesh position={[0, height + 1.85, 1.02]}>
            <boxGeometry args={[0.07, 0.5, 0.01]} />
            <Std color="#222" />
          </mesh>
          <mesh position={[0.18, height + 1.6, 1.02]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.06, 0.38, 0.01]} />
            <Std color="#222" />
          </mesh>
          {/* 入口 */}
          <mesh position={[0, 1.2, 1.01]}>
            <planeGeometry args={[1.3, 2.4]} />
            <Std color="#3b2a1f" emissive="#ffc46b" emissiveIntensity={lights * 1.2} />
          </mesh>
        </group>
      )}
    </group>
  );
};

/** 車輪（スポークの代わりに色の違う輪） */
const Wheel: React.FC<{ position: Vec3; radius: number; spin: number; color?: string; width?: number }> = ({
  position,
  radius,
  spin,
  color = "#b8312f",
  width = 0.18,
}) => (
  <group position={position} rotation={[spin, 0, Math.PI / 2]}>
    <mesh>
      <cylinderGeometry args={[radius, radius, width, 12]} />
      <Std color="#1b1c1f" />
    </mesh>
    <mesh position={[0, width / 2 + 0.005, 0]}>
      <cylinderGeometry args={[radius * 0.75, radius * 0.75, 0.01, 12]} />
      <Std color={color} />
    </mesh>
    <mesh position={[0, width / 2 + 0.012, 0]}>
      <boxGeometry args={[radius * 1.4, 0.01, radius * 0.18]} />
      <Std color="#1b1c1f" />
    </mesh>
  </group>
);

/**
 * 明治の蒸気機関車と客車。+Z 方向が前。frame を渡すと煙が上がり、車輪が回る
 * （走らせるときは position を frame で動かす）。cars で客車の数
 */
export const SteamTrain: React.FC<{
  position: Vec3;
  rotationY?: number;
  frame?: number;
  cars?: number;
  color?: string;
  carColor?: string;
  /** 0〜1。客車の窓明かり */
  lights?: number;
  /** 煙を出すか */
  smoke?: boolean;
}> = ({ position, rotationY = 0, frame = 0, cars = 2, color = "#1f2124", carColor = "#6e3b2a", lights = 0, smoke = true }) => {
  const spin = -frame * 0.25;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 機関車：台枠・ボイラー・運転室・煙突 */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[1.5, 0.35, 5]} />
        <Std color="#2a2c30" />
      </mesh>
      <mesh position={[0, 1.55, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 3.4, 12]} />
        <Std color={color} />
      </mesh>
      <mesh position={[0, 1.55, 2.52]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.06, 12]} />
        <Std color="#8a6b3a" />
      </mesh>
      <mesh position={[0, 2.65, 2]}>
        <cylinderGeometry args={[0.28, 0.2, 0.9, 8]} />
        <Std color={color} />
      </mesh>
      <mesh position={[0, 2.3, 0.6]}>
        <icosahedronGeometry args={[0.3, 0]} />
        <Std color="#8a6b3a" />
      </mesh>
      <mesh position={[0, 1.9, -1.6]}>
        <boxGeometry args={[1.6, 1.9, 1.6]} />
        <Std color={color} />
      </mesh>
      <mesh position={[0, 2.95, -1.6]}>
        <boxGeometry args={[1.8, 0.15, 1.9]} />
        <Std color="#2a2c30" />
      </mesh>
      {/* 前照灯 */}
      <mesh position={[0, 2.05, 2.56]}>
        <circleGeometry args={[0.18, 10]} />
        <meshBasicMaterial color="#ffe6a8" />
      </mesh>
      {[-1, 1].flatMap((side) =>
        [1.6, 0.4, -0.8].map((z) => <Wheel key={`${side}${z}`} position={[side * 0.7, 0.55, z]} radius={0.55} spin={spin} />),
      )}
      {/* 客車 */}
      {Array.from({ length: cars }, (_, k) => {
        const z = -3.6 - k * 4.4;
        return (
          <group key={k} position={[0, 0, z]}>
            <mesh position={[0, 1.55, 0]}>
              <boxGeometry args={[1.8, 1.7, 4]} />
              <Std color={carColor} />
            </mesh>
            <mesh position={[0, 2.5, 0]}>
              <boxGeometry args={[1.95, 0.18, 4.15]} />
              <Std color="#3a3d42" />
            </mesh>
            {[-1, 1].flatMap((side) =>
              Array.from({ length: 4 }, (_, w) => (
                <mesh key={`${side}${w}`} position={[side * 0.91, 1.75, -1.5 + w]} rotation={[0, (side * Math.PI) / 2, 0]}>
                  <planeGeometry args={[0.6, 0.55]} />
                  <Std color="#2f3d4c" emissive="#ffd88a" emissiveIntensity={lights * 1.5} />
                </mesh>
              )),
            )}
            {[-1, 1].flatMap((side) =>
              [-1.3, 1.3].map((wz) => <Wheel key={`${side}${wz}`} position={[side * 0.75, 0.42, wz]} radius={0.42} spin={spin} color="#2a2c30" />),
            )}
          </group>
        );
      })}
      {/* 煙：煙突から上がって後ろへ流れ、薄くなる */}
      {smoke &&
        Array.from({ length: 7 }, (_, i) => {
          const t = ((frame + i * 9) % 63) / 63;
          return (
            <mesh key={i} position={[(random(`smoke-${i}`) - 0.5) * 0.6, 3.2 + t * 2.6, 2 - t * 3.5]} scale={0.35 + t * 1.1}>
              <icosahedronGeometry args={[1, 0]} />
              <Std color="#d8d6d2" opacity={0.75 * (1 - t)} />
            </mesh>
          );
        })}
    </group>
  );
};

/** 人力車（+Z 方向が前。前に Person を置くと引き手になる）。hood で幌、frame で車輪が回る */
export const Rickshaw: React.FC<{ position: Vec3; rotationY?: number; frame?: number; color?: string; hood?: boolean }> = ({
  position,
  rotationY = 0,
  frame = 0,
  color = "#26282c",
  hood = true,
}) => (
  <group position={position} rotation={[0, rotationY, 0]}>
    {[-1, 1].map((side) => (
      <Wheel key={side} position={[side * 0.55, 0.6, 0]} radius={0.6} spin={-frame * 0.3} color="#9a2a24" width={0.06} />
    ))}
    <mesh position={[0, 0.85, -0.05]}>
      <boxGeometry args={[0.95, 0.12, 0.7]} />
      <Std color={color} />
    </mesh>
    <mesh position={[0, 1.2, -0.4]} rotation={[-0.2, 0, 0]}>
      <boxGeometry args={[0.95, 0.7, 0.1]} />
      <Std color="#7a2420" />
    </mesh>
    {hood && (
      <mesh position={[0, 1.45, -0.2]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.9]}>
        <cylinderGeometry args={[0.55, 0.55, 1, 10, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color={color} flatShading roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    )}
    {/* 引き手の柄（かじ棒） */}
    {[-1, 1].map((side) => (
      <mesh key={side} position={[side * 0.42, 0.75, 0.9]} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.8, 5]} />
        <Std color="#5a3a24" />
      </mesh>
    ))}
  </group>
);

/** ガス灯（明治の街路灯）。glow で明るさ、flicker にフレームを渡すと炎のようにゆらぐ */
export const GasLamp: React.FC<{ position: Vec3; height?: number; glow?: number; flicker?: number; color?: string }> = ({
  position,
  height = 3.4,
  glow = 1,
  flicker,
  color = "#ffcf7a",
}) => {
  const g = glow * (flicker === undefined ? 1 : 0.85 + 0.15 * Math.sin(flicker * 0.7) * Math.sin(flicker * 0.23));
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.1, height, 6]} />
        <Std color="#2c3a33" />
      </mesh>
      <mesh position={[0, height + 0.25, 0]}>
        <cylinderGeometry args={[0.2, 0.13, 0.5, 4]} />
        <Std color="#fff2cf" emissive={color} emissiveIntensity={g * 2} />
      </mesh>
      <mesh position={[0, height + 0.6, 0]}>
        <coneGeometry args={[0.28, 0.25, 4]} />
        <Std color="#2c3a33" />
      </mesh>
      <pointLight position={[0, height + 0.25, 0]} color={color} intensity={g * 1.6} distance={7} decay={0} />
    </group>
  );
};
