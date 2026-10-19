// 町の部品：家・ビル・江戸の町家・人・木・道路・車・提灯・古墳・山・岩。
// すべて単純な立体の組み合わせ（ポリゴン調）。position は地面に置く位置（足元）。
import React, { useMemo } from "react";
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
    roughness={0.9}
    emissive={emissive ?? "#000000"}
    emissiveIntensity={emissiveIntensity}
    transparent={opacity !== undefined}
    opacity={opacity ?? 1}
  />
);

/** 三角屋根（切妻）の形。幅・高さ・奥行きから作る */
function useGableRoof(width: number, height: number, depth: number): THREE.ExtrudeGeometry {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [width, height, depth]);
}

/** 一戸建ての家 */
export const House: React.FC<{
  position: Vec3;
  rotationY?: number;
  width?: number;
  depth?: number;
  height?: number;
  wallColor?: string;
  roofColor?: string;
  roof?: "gable" | "flat";
  /** 0〜1。窓の明かり（夜の場面で使う） */
  lights?: number;
  /** 傾き（地震などの被害表現。ラジアン） */
  tilt?: number;
}> = ({ position, rotationY = 0, width = 3, depth = 3, height = 2.4, wallColor = "#e8dcc8", roofColor = "#8a4b3a", roof = "gable", lights = 0, tilt = 0 }) => {
  const roofGeo = useGableRoof(width * 1.15, height * 0.55, depth * 1.1);
  return (
    <group position={position} rotation={[0, rotationY, tilt]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <Std color={wallColor} />
      </mesh>
      {roof === "gable" ? (
        <mesh geometry={roofGeo} position={[0, height, 0]}>
          <Std color={roofColor} />
        </mesh>
      ) : (
        <mesh position={[0, height + 0.08, 0]}>
          <boxGeometry args={[width * 1.05, 0.16, depth * 1.05]} />
          <Std color={roofColor} />
        </mesh>
      )}
      {/* 正面の窓とドア */}
      <mesh position={[-width * 0.22, height * 0.55, depth / 2 + 0.01]}>
        <planeGeometry args={[width * 0.25, height * 0.25]} />
        <Std color="#3a5068" emissive="#ffd27a" emissiveIntensity={lights * 1.5} />
      </mesh>
      <mesh position={[width * 0.25, height * 0.3, depth / 2 + 0.01]}>
        <planeGeometry args={[width * 0.2, height * 0.55]} />
        <Std color="#6b4a32" />
      </mesh>
    </group>
  );
};

/** ビル。windowsLit（0〜1）で夜の窓明かりの割合 */
export const Building: React.FC<{
  position: Vec3;
  width?: number;
  depth?: number;
  height?: number;
  color?: string;
  windowsLit?: number;
  seed?: string;
}> = ({ position, width = 5, depth = 5, height = 16, color = "#b8c2cc", windowsLit = 0, seed = "b" }) => {
  const rows = Math.max(2, Math.floor(height / 1.6));
  const cols = Math.max(2, Math.floor(width / 1.3));
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <Std color={color} />
      </mesh>
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const lit = random(`${seed}-w-${i}`) < windowsLit;
        return (
          <mesh
            key={i}
            position={[-width / 2 + (c + 0.5) * (width / cols), 1 + r * ((height - 1.5) / rows), depth / 2 + 0.01]}
          >
            <planeGeometry args={[(width / cols) * 0.55, 0.7]} />
            <Std color="#40556b" emissive="#ffe0a0" emissiveIntensity={lit ? 1.6 : 0} />
          </mesh>
        );
      })}
    </group>
  );
};

/** 江戸の町家・長屋（白壁と瓦屋根、格子） */
export const EdoHouse: React.FC<{
  position: Vec3;
  rotationY?: number;
  width?: number;
  depth?: number;
  height?: number;
  wallColor?: string;
  roofColor?: string;
  /** 0〜1。障子の明かり（夜の場面で使う） */
  lights?: number;
}> = ({ position, rotationY = 0, width = 4, depth = 3, height = 2.2, wallColor = "#efe6d2", roofColor = "#3d3f45", lights = 0 }) => {
  const roofGeo = useGableRoof(width * 1.2, height * 0.5, depth * 1.3);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <Std color={wallColor} />
      </mesh>
      {/* 腰板（下半分の木の板） */}
      <mesh position={[0, height * 0.22, depth / 2 + 0.01]}>
        <planeGeometry args={[width, height * 0.44]} />
        <Std color="#6e4a2e" />
      </mesh>
      {/* 格子窓（障子の明かり） */}
      <mesh position={[0, height * 0.66, depth / 2 + 0.02]}>
        <planeGeometry args={[width * 0.6, height * 0.3]} />
        <Std color="#d9c9a3" emissive="#ffb35c" emissiveIntensity={lights * 1.8} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-width * 0.3 + (i + 0.5) * (width * 0.6) / 6, height * 0.66, depth / 2 + 0.03]}>
          <boxGeometry args={[0.04, height * 0.3, 0.02]} />
          <Std color="#4a3322" />
        </mesh>
      ))}
      <mesh geometry={roofGeo} position={[0, height, 0]}>
        <Std color={roofColor} />
      </mesh>
    </group>
  );
};

/** 人（顔のない単純な立体）。walk（フレーム数）を渡すと手足が動く */
export const Person: React.FC<{
  position: Vec3;
  rotationY?: number;
  color?: string;
  height?: number;
  walk?: number;
  /** 着物風（すそが広がった形）にする */
  kimono?: boolean;
}> = ({ position, rotationY = 0, color = "#e05a47", height = 1.7, walk, kimono = false }) => {
  const s = height / 1.7;
  const swing = walk === undefined ? 0 : Math.sin(walk * 0.3) * 0.5;
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={s}>
      {kimono ? (
        <mesh position={[0, 0.65, 0]}>
          <cylinderGeometry args={[0.2, 0.32, 1.1, 6]} />
          <Std color={color} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, 0.95, 0]}>
            <boxGeometry args={[0.42, 0.6, 0.26]} />
            <Std color={color} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.11, 0.33, 0]} rotation={[side * swing, 0, 0]}>
              <boxGeometry args={[0.15, 0.66, 0.18]} />
              <Std color="#3a3f4a" />
            </mesh>
          ))}
        </>
      )}
      {[-1, 1].map((side) => (
        <mesh key={`arm${side}`} position={[side * 0.28, 0.98, 0]} rotation={[-side * swing, 0, side * 0.08]}>
          <boxGeometry args={[0.11, 0.55, 0.13]} />
          <Std color={color} />
        </mesh>
      ))}
      <mesh position={[0, 1.45, 0]}>
        <icosahedronGeometry args={[0.2, 0]} />
        <Std color="#f1d3b5" />
      </mesh>
    </group>
  );
};

/** 木（幹＋葉のかたまり） */
export const Tree: React.FC<{ position: Vec3; height?: number; color?: string; kind?: "round" | "pine" }> = ({
  position,
  height = 3,
  color = "#4f8a3c",
  kind = "round",
}) => (
  <group position={position}>
    <mesh position={[0, height * 0.25, 0]}>
      <cylinderGeometry args={[0.12, 0.18, height * 0.5, 5]} />
      <Std color="#6b4a2f" />
    </mesh>
    {kind === "round" ? (
      <mesh position={[0, height * 0.7, 0]}>
        <icosahedronGeometry args={[height * 0.33, 0]} />
        <Std color={color} />
      </mesh>
    ) : (
      <mesh position={[0, height * 0.7, 0]}>
        <coneGeometry args={[height * 0.3, height * 0.75, 6]} />
        <Std color={color} />
      </mesh>
    )}
  </group>
);

/** まっすぐな道路（中央線つき）。from → to の向きに敷く */
export const Road: React.FC<{ from: Vec3; to: Vec3; width?: number; color?: string }> = ({ from, to, width = 6, color = "#4a4d52" }) => {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const mid: Vec3 = [(from[0] + to[0]) / 2, from[1] + 0.02, (from[2] + to[2]) / 2];
  return (
    <group position={mid} rotation={[0, angle, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, length]} />
        <Std color={color} />
      </mesh>
      {Array.from({ length: Math.floor(length / 4) }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -length / 2 + 2 + i * 4]}>
          <planeGeometry args={[0.18, 1.8]} />
          <Std color="#f2f2f2" />
        </mesh>
      ))}
    </group>
  );
};

/** 車 */
export const Car: React.FC<{ position: Vec3; rotationY?: number; color?: string }> = ({ position, rotationY = 0, color = "#d9483b" }) => (
  <group position={position} rotation={[0, rotationY, 0]}>
    <mesh position={[0, 0.45, 0]}>
      <boxGeometry args={[1.7, 0.5, 3.6]} />
      <Std color={color} />
    </mesh>
    <mesh position={[0, 0.9, -0.2]}>
      <boxGeometry args={[1.5, 0.45, 1.9]} />
      <Std color="#d6e6f2" />
    </mesh>
    {[
      [-0.85, 1.2],
      [0.85, 1.2],
      [-0.85, -1.2],
      [0.85, -1.2],
    ].map(([x, z], i) => (
      <mesh key={i} position={[x!, 0.3, z!]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.25, 8]} />
        <Std color="#222428" />
      </mesh>
    ))}
  </group>
);

/** 提灯・行灯（光る）。glow で明るさ */
export const Lantern: React.FC<{ position: Vec3; color?: string; glow?: number; kind?: "chochin" | "andon" }> = ({
  position,
  color = "#ffb35c",
  glow = 1,
  kind = "chochin",
}) => (
  <group position={position}>
    {kind === "chochin" ? (
      <mesh scale={[1, 1.3, 1]}>
        <icosahedronGeometry args={[0.3, 1]} />
        <Std color="#f4e1c1" emissive={color} emissiveIntensity={glow * 1.6} />
      </mesh>
    ) : (
      <mesh>
        <boxGeometry args={[0.45, 0.7, 0.45]} />
        <Std color="#f4e1c1" emissive={color} emissiveIntensity={glow * 1.4} />
      </mesh>
    )}
    <pointLight color={color} intensity={glow * 1.5} distance={6} decay={0} />
  </group>
);

/** 前方後円墳（鍵穴の形の古墳） */
export const Kofun: React.FC<{ position: Vec3; rotationY?: number; size?: number; color?: string }> = ({
  position,
  rotationY = 0,
  size = 10,
  color = "#5e8a4a",
}) => (
  <group position={position} rotation={[0, rotationY, 0]}>
    {/* 後円部 */}
    <mesh position={[0, size * 0.12, -size * 0.25]}>
      <cylinderGeometry args={[size * 0.38, size * 0.5, size * 0.24, 10]} />
      <Std color={color} />
    </mesh>
    {/* 前方部（台形） */}
    <mesh position={[0, size * 0.08, size * 0.35]} scale={[1, 1, 1]}>
      <cylinderGeometry args={[size * 0.35, size * 0.42, size * 0.16, 4, 1]} />
      <Std color={color} />
    </mesh>
    {/* 周りの堀 */}
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.5, 1]}>
      <circleGeometry args={[size * 0.75, 16]} />
      <Std color="#3d6f8a" />
    </mesh>
  </group>
);

/** 山（頂上に雪をのせられる） */
export const Mountain: React.FC<{ position: Vec3; radius?: number; height?: number; color?: string; snow?: boolean; seed?: string }> = ({
  position,
  radius = 20,
  height = 18,
  color = "#6f7d5a",
  snow = false,
  seed = "m",
}) => {
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(radius, height, 7, 3);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < height / 2 - 0.01) {
        pos.setX(i, pos.getX(i) * (0.85 + random(`${seed}-x-${i}`) * 0.3));
        pos.setZ(i, pos.getZ(i) * (0.85 + random(`${seed}-z-${i}`) * 0.3));
      }
    }
    g.computeVertexNormals();
    return g;
  }, [radius, height, seed]);
  return (
    <group position={position}>
      <mesh geometry={geo} position={[0, height / 2, 0]}>
        <Std color={color} />
      </mesh>
      {snow && (
        <mesh position={[0, height * 0.85, 0]}>
          <coneGeometry args={[radius * 0.32, height * 0.3, 7]} />
          <Std color="#f4f6f8" />
        </mesh>
      )}
    </group>
  );
};

/** 岩 */
export const Rock: React.FC<{ position: Vec3; size?: number; color?: string; seed?: string }> = ({
  position,
  size = 1,
  color = "#6b655c",
  seed = "r",
}) => (
  <mesh position={position} scale={[size, size * 0.7, size]} rotation={[random(`${seed}-a`) * 3, random(`${seed}-b`) * 3, 0]}>
    <icosahedronGeometry args={[1, 0]} />
    <Std color={color} />
  </mesh>
);
