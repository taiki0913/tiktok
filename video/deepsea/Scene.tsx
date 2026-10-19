// 深海の3Dシーン（ポリゴン調）。カメラが海面から水深8,336mまで潜っていく。
import { useThree } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo } from "react";
import { interpolate, interpolateColors, random, useCurrentFrame } from "remotion";
import * as THREE from "three";
import { cameraPose } from "./camera";
import { depthAt, MAX_DEPTH, worldY } from "./timeline";

/** 最深記録のシンカイクサウオの仲間の位置（画面のラベルもこの位置に合わせる） */
export const snailfishPosition = (): THREE.Vector3 => new THREE.Vector3(1.0, worldY(MAX_DEPTH) - 2.4, 0);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 水深ごとの水の色（明るい青 → 群青 → ほぼ黒） */
function waterColor(depth: number): string {
  return interpolateColors(
    depth,
    [0, 80, 200, 500, 1000, 3000],
    ["#4fb3ea", "#2378b8", "#0e4479", "#06264b", "#020d1c", "#01060e"],
  );
}

/** 毎フレーム、カメラ位置・背景色・霧を水深に合わせる */
const CameraRig: React.FC<{ depth: number }> = ({ depth }) => {
  const { camera, scene } = useThree();
  const color = waterColor(depth);
  const fogFar = interpolate(depth, [0, 200, 1000], [48, 30, 16], clamp);

  useLayoutEffect(() => {
    const { position, target } = cameraPose(depth);
    camera.position.copy(position);
    camera.lookAt(target);
    scene.background = new THREE.Color(color);
    scene.fog = new THREE.Fog(color, 3, fogFar);
  }, [camera, scene, depth, color, fogFar]);
  return null;
};

/** 潜水艇の位置（カメラはこの少し後ろ上から追いかける） */
const subPosition = (depth: number): THREE.Vector3 => new THREE.Vector3(-0.9, worldY(depth) - 0.4, 4.0);
/** ライトが照らす先（最深部では魚のいる辺り） */
const beamTarget = (depth: number): THREE.Vector3 => new THREE.Vector3(1.0, worldY(depth) - 2.4, 0);

/** ポリゴン調の潜水艇。暗くなると前方のライトが点灯し、光の帯が見える */
const Submersible: React.FC<{ depth: number; frame: number }> = ({ depth, frame }) => {
  const pos = subPosition(depth);
  const SCALE = 0.7;
  const lightPos = pos.clone().add(new THREE.Vector3(0.9, -0.35, -0.3).multiplyScalar(SCALE));
  const target = beamTarget(depth);
  const targetObj = useMemo(() => new THREE.Object3D(), []);
  const power = interpolate(depth, [250, 900], [0, 1], clamp);

  // 光の帯（円すい）をライトから照らす先へ向ける
  const dir = target.clone().sub(lightPos);
  const length = dir.length();
  const beamQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate());
  // 光の帯は照らす先よりも奥まで伸ばし、霧で自然に消えるようにする
  const beamLength = length * 1.8;
  const beamCenter = lightPos.clone().add(dir.clone().normalize().multiplyScalar(beamLength / 2));
  const bob = Math.sin(frame / 18) * 0.06;

  return (
    <>
      <group position={[pos.x, pos.y + bob, pos.z]} rotation={[0.1, -0.35, -0.08]} scale={SCALE}>
        {/* 船体 */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.42, 1.2, 2, 8]} />
          <meshStandardMaterial color="#f3f0e6" flatShading roughness={0.6} />
        </mesh>
        {/* 上部のセイルと帯 */}
        <mesh position={[0.1, 0.48, 0]} scale={[0.7, 0.35, 0.35]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#f3f0e6" flatShading />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} scale={[1.02, 0.25, 1.02]}>
          <cylinderGeometry args={[0.43, 0.43, 1, 8]} />
          <meshStandardMaterial color="#ff8a1f" flatShading />
        </mesh>
        {/* のぞき窓 */}
        <mesh position={[0.95, 0.05, 0]}>
          <icosahedronGeometry args={[0.16, 0]} />
          <meshStandardMaterial color="#1b3f66" emissive="#3fa0ff" emissiveIntensity={0.2 + power * 0.3} flatShading />
        </mesh>
        {/* スクリュー */}
        <group position={[-1.05, 0, 0]} rotation={[frame * 0.5, 0, 0]}>
          {[0, 1, 2].map((b) => (
            <mesh key={b} rotation={[(b * Math.PI * 2) / 3, 0, 0]} position={[0, 0, 0]}>
              <boxGeometry args={[0.06, 0.5, 0.12]} />
              <meshStandardMaterial color="#9aa3ad" flatShading />
            </mesh>
          ))}
        </group>
        {/* ライト本体 */}
        <mesh position={[0.9, -0.35, -0.3]}>
          <icosahedronGeometry args={[0.09, 0]} />
          <meshBasicMaterial color={power > 0.05 ? "#fffbe0" : "#8a8f96"} />
        </mesh>
      </group>
      <pointLight position={[0, pos.y + 1.5, 7]} intensity={0.9} distance={7} decay={0} color="#cfe6ff" />
      <primitive object={targetObj} position={target} />
      <spotLight
        position={lightPos}
        target={targetObj}
        angle={0.5}
        penumbra={0.6}
        decay={0}
        distance={30}
        intensity={power * 10}
        color="#fff6dc"
      />
      {power > 0 && (
        <mesh position={beamCenter} quaternion={beamQuat}>
          <coneGeometry args={[2.4, beamLength, 20, 1, true]} />
          <meshBasicMaterial
            color="#fff3c4"
            transparent
            opacity={power * 0.05}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </>
  );
};

/** マリンスノー（漂う粒子）。カメラが潜ると上へ流れて見え、潜っている感覚が出る */
const MarineSnow: React.FC = () => {
  const geometry = useMemo(() => {
    const count = 2600;
    const bottom = worldY(MAX_DEPTH) - 6;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random(`snow-x-${i}`) - 0.5) * 26;
      positions[i * 3 + 1] = 2 + random(`snow-y-${i}`) * (bottom - 2);
      positions[i * 3 + 2] = -24 + random(`snow-z-${i}`) * 30;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);
  return (
    <points geometry={geometry}>
      <pointsMaterial color="#e8f6ff" size={0.09} transparent opacity={0.75} sizeAttenuation />
    </points>
  );
};

/** 海面付近の光の筋 */
const LightRays: React.FC<{ depth: number }> = ({ depth }) => {
  const opacity = interpolate(depth, [0, 150], [0.05, 0], clamp);
  if (opacity <= 0) return null;
  return (
    <group>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[(i - 3) * 2.6 + random(`ray-${i}`), -8, -6 - random(`rayz-${i}`) * 8]}
          rotation={[0, 0, 0.25 + random(`rayr-${i}`) * 0.15]}
        >
          <planeGeometry args={[0.15 + random(`rayw-${i}`) * 0.35, 36]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

/** ひし形の胴体と三角の尾びれでできたポリゴンの魚 */
const Fish: React.FC<{ color: string; scale?: number }> = ({ color, scale = 1 }) => (
  <group scale={scale}>
    <mesh scale={[1.6, 0.6, 0.35]}>
      <octahedronGeometry args={[0.3, 0]} />
      <meshStandardMaterial color={color} flatShading roughness={0.5} metalness={0.3} />
    </mesh>
    <mesh position={[-0.55, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.3]}>
      <coneGeometry args={[0.18, 0.32, 3]} />
      <meshStandardMaterial color={color} flatShading roughness={0.5} metalness={0.3} />
    </mesh>
  </group>
);

/** 浅い海を泳ぐ魚の群れ */
const FishSchool: React.FC<{ frame: number }> = ({ frame }) => {
  const baseY = worldY(40);
  return (
    <group>
      {Array.from({ length: 34 }, (_, i) => {
        const speed = 0.035 + random(`fs-${i}`) * 0.02;
        const x = ((random(`fx-${i}`) * 30 + frame * speed) % 30) - 15;
        const y = baseY + (random(`fy-${i}`) - 0.5) * 9 + Math.sin(frame / 12 + i) * 0.15;
        const z = -10 + random(`fz-${i}`) * 12;
        const color = random(`fc-${i}`) > 0.5 ? "#c9d9e8" : "#7fa6c8";
        return (
          <group key={i} position={[x, y, z]} rotation={[0, 0, Math.sin(frame / 8 + i) * 0.08]}>
            <Fish color={color} scale={0.9 + random(`fsc-${i}`) * 0.5} />
          </group>
        );
      })}
    </group>
  );
};

/** 光るクラゲ（中深層） */
const Jellyfish: React.FC<{ frame: number }> = ({ frame }) => (
  <group>
    {Array.from({ length: 6 }, (_, i) => {
      const y = worldY(500 + i * 150) + Math.sin(frame / 20 + i * 2) * 0.4;
      const x = (random(`jx-${i}`) - 0.5) * 12;
      const z = -8 + random(`jz-${i}`) * 9;
      const pulse = 0.9 + Math.sin(frame / 7 + i) * 0.25;
      return (
        <group key={i} position={[x, y, z]} scale={0.8 + random(`js-${i}`) * 0.5}>
          <mesh scale={[1, pulse, 1]}>
            <sphereGeometry args={[0.6, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color="#7ef3ff"
              emissive="#38d9ff"
              emissiveIntensity={1.2}
              transparent
              opacity={0.8}
              flatShading
              side={THREE.DoubleSide}
            />
          </mesh>
          {Array.from({ length: 6 }, (_, t) => (
            <mesh
              key={t}
              position={[Math.cos(t) * 0.35, -0.6, Math.sin(t) * 0.35]}
              rotation={[Math.sin(frame / 10 + t) * 0.2, 0, Math.cos(frame / 12 + t) * 0.2]}
            >
              <cylinderGeometry args={[0.02, 0.01, 1.2, 3]} />
              <meshBasicMaterial color="#9ff6ff" transparent opacity={0.7} />
            </mesh>
          ))}
        </group>
      );
    })}
  </group>
);

/** 提灯のような光で獲物を誘う魚（深層） */
const Anglerfish: React.FC<{ frame: number }> = ({ frame }) => {
  const y = worldY(2000);
  const glow = 1.5 + Math.sin(frame / 5) * 0.5;
  return (
    <group position={[-2.6, y, -3]} rotation={[0, 0.5, 0]}>
      <mesh scale={[1.3, 1, 0.9]}>
        <icosahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color="#2f2a36" flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0.75, 0.75, 0]} rotation={[0, 0, -0.8]}>
        <cylinderGeometry args={[0.02, 0.02, 0.8, 3]} />
        <meshStandardMaterial color="#2f2a36" />
      </mesh>
      <mesh position={[1.1, 1.0, 0]}>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#fff3a0" emissive="#ffe066" emissiveIntensity={glow} />
      </mesh>
      <pointLight position={[1.1, 1.0, 0.2]} color="#ffe066" intensity={glow} distance={4} decay={0} />
    </group>
  );
};

/** 深い層を泳ぐ赤いエビと、尾の長い深海魚。潜水艇のライトに照らされて見える */
const DeepCreatures: React.FC<{ frame: number }> = ({ frame }) => (
  <group>
    {Array.from({ length: 10 }, (_, i) => {
      const y = worldY(2600 + i * 450) + (random(`shy-${i}`) - 0.5) * 2;
      const x = -3 + random(`shx-${i}`) * 7 + Math.sin(frame / 15 + i) * 0.3;
      const z = -2 + random(`shz-${i}`) * 6;
      return (
        <group key={`shrimp-${i}`} position={[x, y, z]} rotation={[0, random(`shr-${i}`) * 6, Math.sin(frame / 6 + i) * 0.15]}>
          <mesh scale={[1, 0.45, 0.4]}>
            <octahedronGeometry args={[0.28, 0]} />
            <meshStandardMaterial color="#d8322a" flatShading roughness={0.7} />
          </mesh>
          <mesh position={[0.32, 0.12, 0]} rotation={[0, 0, -0.6]}>
            <cylinderGeometry args={[0.008, 0.008, 0.7, 3]} />
            <meshBasicMaterial color="#ff6b5e" />
          </mesh>
        </group>
      );
    })}
    {Array.from({ length: 4 }, (_, i) => {
      const y = worldY(4200 + i * 900);
      const x = ((frame * 0.02 + random(`gx-${i}`) * 10) % 10) - 5;
      return (
        <group key={`grenadier-${i}`} position={[x, y, -1 + random(`gz-${i}`) * 4]} rotation={[0, 0, Math.sin(frame / 10 + i) * 0.05]}>
          <mesh scale={[1, 0.55, 0.45]}>
            <octahedronGeometry args={[0.45, 0]} />
            <meshStandardMaterial color="#8c8a93" flatShading roughness={0.8} />
          </mesh>
          <mesh position={[-0.75, -0.02, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.3]}>
            <coneGeometry args={[0.16, 1.0, 3]} />
            <meshStandardMaterial color="#8c8a93" flatShading roughness={0.8} />
          </mesh>
        </group>
      );
    })}
  </group>
);

/** 水深8,336mの海溝の底：岩と、最深記録のシンカイクサウオの仲間 */
const TrenchBottom: React.FC<{ frame: number }> = ({ frame }) => {
  const y = worldY(MAX_DEPTH);
  const floor = useMemo(() => {
    const g = new THREE.PlaneGeometry(50, 50, 24, 24);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, random(`floor-${i}`) * 0.9);
    g.computeVertexNormals();
    return g;
  }, []);
  const sway = Math.sin(frame / 9) * 0.25;
  return (
    <group>
      <mesh geometry={floor} position={[0, y - 3.4, -6]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#5b544c" flatShading roughness={1} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        return (
          <mesh
            key={i}
            position={[side * (4.5 + random(`rx-${i}`) * 4), y - 3 + random(`ry-${i}`) * 4, -12 + random(`rz-${i}`) * 12]}
            scale={1 + random(`rs-${i}`) * 2.2}
            rotation={[random(`rr1-${i}`) * 3, random(`rr2-${i}`) * 3, 0]}
          >
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#4a443d" flatShading roughness={1} />
          </mesh>
        );
      })}
      {/* シンカイクサウオの仲間：半透明の淡いピンクで、細長い体をくねらせて泳ぐ */}
      <group position={snailfishPosition()} rotation={[0, -0.35 + sway * 0.3, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} scale={[0.75, 1, 0.6]}>
          <capsuleGeometry args={[0.32, 1.3, 2, 6]} />
          <meshStandardMaterial color="#f2cfc8" flatShading roughness={0.4} transparent opacity={0.92} />
        </mesh>
        <mesh position={[-1.05, 0, 0]} rotation={[0, sway, Math.PI / 2]} scale={[1, 1, 0.25]}>
          <coneGeometry args={[0.3, 0.6, 3]} />
          <meshStandardMaterial color="#f6dcd6" flatShading transparent opacity={0.85} />
        </mesh>
        <mesh position={[0.62, 0.06, 0.18]}>
          <icosahedronGeometry args={[0.05, 0]} />
          <meshBasicMaterial color="#1a1a1a" />
        </mesh>
      </group>
    </group>
  );
};

export const DeepSeaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const depth = depthAt(frame);
  const ambient = interpolate(depth, [0, 200, 1000], [1.1, 0.35, 0.05], clamp);
  const sun = interpolate(depth, [0, 200, 800], [2.2, 0.5, 0], clamp);

  return (
    <>
      <CameraRig depth={depth} />
      <hemisphereLight args={["#bfe8ff", "#0a2540", ambient]} />
      <directionalLight position={[3, 20, 5]} intensity={sun} color="#e8f7ff" />
      <Submersible depth={depth} frame={frame} />
      <LightRays depth={depth} />
      <MarineSnow />
      <FishSchool frame={frame} />
      <Jellyfish frame={frame} />
      <Anglerfish frame={frame} />
      <DeepCreatures frame={frame} />
      <TrenchBottom frame={frame} />
    </>
  );
};
