// 光・地面・水面・星空・漂う粒子。
import React, { useMemo } from "react";
import { random } from "remotion";
import * as THREE from "three";
import type { Vec3 } from "./camera";

export type LightPreset = "day" | "dusk" | "night" | "underwater" | "space";

const PRESETS: Record<LightPreset, { sky: string; ground: string; hemi: number; sun: number; sunColor: string; sunPos: Vec3 }> = {
  day: { sky: "#cfe9ff", ground: "#5b6b4a", hemi: 1.1, sun: 2.2, sunColor: "#fff4e0", sunPos: [20, 40, 15] },
  dusk: { sky: "#ffb37a", ground: "#3a2a3a", hemi: 0.8, sun: 1.8, sunColor: "#ff9a52", sunPos: [-30, 12, 10] },
  night: { sky: "#3a4a7a", ground: "#0b0f1e", hemi: 0.35, sun: 0.5, sunColor: "#9fb6ff", sunPos: [10, 30, -10] },
  underwater: { sky: "#bfe8ff", ground: "#0a2540", hemi: 0.9, sun: 1.6, sunColor: "#e8f7ff", sunPos: [3, 20, 5] },
  space: { sky: "#ffffff", ground: "#000000", hemi: 0.15, sun: 2.6, sunColor: "#fff6e6", sunPos: [30, 10, 20] },
};

/** 光のセット。intensity で全体の明るさを調整（暗転・夜明けの演出に使う） */
export const Lights: React.FC<{ preset: LightPreset; intensity?: number }> = ({ preset, intensity = 1 }) => {
  const p = PRESETS[preset];
  return (
    <>
      <hemisphereLight args={[p.sky, p.ground, p.hemi * intensity]} />
      <directionalLight position={p.sunPos} intensity={p.sun * intensity} color={p.sunColor} />
    </>
  );
};

/** 少し凸凹した地面 */
export const Ground: React.FC<{ size?: number; color?: string; y?: number; roughness?: number; seed?: string }> = ({
  size = 200,
  color = "#7a8f5a",
  y = 0,
  roughness = 0.4,
  seed = "ground",
}) => {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, 40, 40);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, random(`${seed}-${i}`) * roughness);
    g.computeVertexNormals();
    return g;
  }, [size, roughness, seed]);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <meshStandardMaterial color={color} flatShading roughness={1} />
    </mesh>
  );
};

/** 波打つ水面（frame で動く） */
export const Water: React.FC<{ frame: number; size?: number; color?: string; y?: number; waveHeight?: number }> = ({
  frame,
  size = 200,
  color = "#2f7fbf",
  y = 0,
  waveHeight = 0.25,
}) => {
  const geometry = useMemo(() => new THREE.PlaneGeometry(size, size, 50, 50), [size]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yy = pos.getY(i);
    pos.setZ(i, Math.sin(x * 0.35 + frame * 0.08) * waveHeight + Math.cos(yy * 0.3 + frame * 0.06) * waveHeight);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <meshStandardMaterial color={color} flatShading roughness={0.3} metalness={0.1} transparent opacity={0.92} />
    </mesh>
  );
};

/** 星空（カメラを囲む球の上に点を散らす） */
export const Stars: React.FC<{ count?: number; radius?: number; size?: number; center?: Vec3 }> = ({
  count = 1500,
  radius = 400,
  size = 1.6,
  center = [0, 0, 0],
}) => {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = random(`star-u-${i}`) * 2 - 1;
      const th = random(`star-t-${i}`) * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      positions[i * 3] = center[0] + radius * r * Math.cos(th);
      positions[i * 3 + 1] = center[1] + radius * u;
      positions[i * 3 + 2] = center[2] + radius * r * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count, radius, center]);
  return (
    <points geometry={geometry}>
      <pointsMaterial color="#ffffff" size={size} sizeAttenuation fog={false} />
    </points>
  );
};

/** 漂う粒子（マリンスノー・雪・ほこり・火の粉など）。box の範囲に散らす */
export const Particles: React.FC<{
  count?: number;
  box: { center: Vec3; size: Vec3 };
  color?: string;
  size?: number;
  opacity?: number;
  /** 1フレームあたりの移動量（雪なら [0,-0.05,0] など） */
  drift?: Vec3;
  frame?: number;
  seed?: string;
}> = ({ count = 1500, box, color = "#ffffff", size = 0.08, opacity = 0.75, drift = [0, 0, 0], frame = 0, seed = "p" }) => {
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      const half = box.size[k]! / 2;
      // 範囲の外に出たら反対側から戻ってくる
      const raw = (random(`${seed}-${i}-${k}`) - 0.5) * box.size[k]! + drift[k]! * frame;
      const wrapped = ((((raw + half) % box.size[k]!) + box.size[k]!) % box.size[k]!) - half;
      positions[i * 3 + k] = box.center[k]! + wrapped;
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return (
    <points geometry={geometry}>
      <pointsMaterial color={color} size={size} transparent opacity={opacity} sizeAttenuation />
    </points>
  );
};
