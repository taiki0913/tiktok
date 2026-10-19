// 宇宙の部品：惑星・恒星（光る球）。星空は environment.tsx の Stars を使う。
import React, { useMemo } from "react";
import { random } from "remotion";
import * as THREE from "three";
import type { Vec3 } from "./camera";

/** 惑星。detail が小さいほど角ばったポリゴン調。ring で土星のような輪 */
export const Planet: React.FC<{
  position: Vec3;
  radius: number;
  color: string;
  /** 2色目（表面のまだら模様） */
  color2?: string;
  detail?: number;
  rotationY?: number;
  ring?: { inner: number; outer: number; color: string };
  seed?: string;
}> = ({ position, radius, color, color2, detail = 2, rotationY = 0, ring, seed = "planet" }) => {
  const geometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(radius, detail).toNonIndexed();
    if (color2) {
      // 三角形ごとに色を塗り分けて、まだら模様にする
      const c1 = new THREE.Color(color);
      const c2 = new THREE.Color(color2);
      const colors = new Float32Array(g.attributes.position!.count * 3);
      for (let f = 0; f < g.attributes.position!.count / 3; f++) {
        const c = random(`${seed}-${f}`) > 0.6 ? c2 : c1;
        for (let v = 0; v < 3; v++) colors.set([c.r, c.g, c.b], (f * 3 + v) * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    return g;
  }, [radius, detail, color, color2, seed]);
  return (
    <group position={position} rotation={[0.2, rotationY, 0.1]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color2 ? "#ffffff" : color} vertexColors={!!color2} flatShading roughness={0.9} />
      </mesh>
      {ring && (
        <mesh rotation={[Math.PI / 2 - 0.35, 0, 0]}>
          <ringGeometry args={[ring.inner, ring.outer, 48]} />
          <meshStandardMaterial color={ring.color} side={THREE.DoubleSide} transparent opacity={0.8} flatShading />
        </mesh>
      )}
    </group>
  );
};

/** 恒星・太陽（自分で光る球と、周りを照らす光） */
export const Sun: React.FC<{ position: Vec3; radius: number; color?: string; intensity?: number }> = ({
  position,
  radius,
  color = "#ffd36b",
  intensity = 3,
}) => (
  <group position={position}>
    <mesh>
      <icosahedronGeometry args={[radius, 2]} />
      <meshBasicMaterial color={color} />
    </mesh>
    <mesh>
      <icosahedronGeometry args={[radius * 1.25, 2]} />
      <meshBasicMaterial color={color} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    <pointLight color={color} intensity={intensity} decay={0} distance={radius * 200} />
  </group>
);
