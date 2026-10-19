// 海の部品：魚・クラゲ・潜水艇（試作「魚が絶対に行けない深さ」から取り出したもの）。
import React from "react";
import * as THREE from "three";
import type { Vec3 } from "./camera";

/** ひし形の胴体と三角の尾びれの魚。+X 方向が頭 */
export const Fish: React.FC<{ position: Vec3; rotationY?: number; color?: string; scale?: number; frame?: number }> = ({
  position,
  rotationY = 0,
  color = "#9fb8d0",
  scale = 1,
  frame = 0,
}) => (
  <group position={position} rotation={[0, rotationY, Math.sin(frame / 8) * 0.08]} scale={scale}>
    <mesh scale={[1.6, 0.6, 0.35]}>
      <octahedronGeometry args={[0.3, 0]} />
      <meshStandardMaterial color={color} flatShading roughness={0.5} metalness={0.3} />
    </mesh>
    <mesh position={[-0.55, 0, 0]} rotation={[0, Math.sin(frame / 4) * 0.4, Math.PI / 2]} scale={[1, 1, 0.3]}>
      <coneGeometry args={[0.18, 0.32, 3]} />
      <meshStandardMaterial color={color} flatShading roughness={0.5} metalness={0.3} />
    </mesh>
  </group>
);

/** 光るクラゲ */
export const Jellyfish: React.FC<{ position: Vec3; frame: number; color?: string; scale?: number }> = ({
  position,
  frame,
  color = "#7ef3ff",
  scale = 1,
}) => {
  const pulse = 0.9 + Math.sin(frame / 7) * 0.25;
  return (
    <group position={[position[0], position[1] + Math.sin(frame / 20) * 0.4, position[2]]} scale={scale}>
      <mesh scale={[1, pulse, 1]}>
        <sphereGeometry args={[0.6, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} transparent opacity={0.8} flatShading side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: 6 }, (_, t) => (
        <mesh key={t} position={[Math.cos(t) * 0.35, -0.6, Math.sin(t) * 0.35]} rotation={[Math.sin(frame / 10 + t) * 0.2, 0, Math.cos(frame / 12 + t) * 0.2]}>
          <cylinderGeometry args={[0.02, 0.01, 1.2, 3]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
};

/** 潜水艇。lightPower（0〜1）で前方のライトと光の帯が点く。lightTarget はライトが照らす先 */
export const Submersible: React.FC<{
  position: Vec3;
  frame: number;
  lightPower?: number;
  lightTarget?: Vec3;
  scale?: number;
  rotationY?: number;
}> = ({ position, frame, lightPower = 0, lightTarget, scale = 0.7, rotationY = -0.35 }) => {
  const targetObj = React.useMemo(() => new THREE.Object3D(), []);
  const pos = new THREE.Vector3(...position);
  const lightPos = pos.clone().add(new THREE.Vector3(0.9, -0.35, -0.3).multiplyScalar(scale));
  const target = new THREE.Vector3(...(lightTarget ?? [position[0] + 3, position[1] - 2, position[2] - 4]));
  const dir = target.clone().sub(lightPos);
  const beamLength = dir.length() * 1.8;
  const beamQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate());
  const beamCenter = lightPos.clone().add(dir.clone().normalize().multiplyScalar(beamLength / 2));
  const bob = Math.sin(frame / 18) * 0.06;
  return (
    <>
      <group position={[pos.x, pos.y + bob, pos.z]} rotation={[0.1, rotationY, -0.08]} scale={scale}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.42, 1.2, 2, 8]} />
          <meshStandardMaterial color="#f3f0e6" flatShading roughness={0.6} />
        </mesh>
        <mesh position={[0.1, 0.48, 0]} scale={[0.7, 0.35, 0.35]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#f3f0e6" flatShading />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} scale={[1.02, 0.25, 1.02]}>
          <cylinderGeometry args={[0.43, 0.43, 1, 8]} />
          <meshStandardMaterial color="#ff8a1f" flatShading />
        </mesh>
        <mesh position={[0.95, 0.05, 0]}>
          <icosahedronGeometry args={[0.16, 0]} />
          <meshStandardMaterial color="#1b3f66" emissive="#3fa0ff" emissiveIntensity={0.2 + lightPower * 0.3} flatShading />
        </mesh>
        <group position={[-1.05, 0, 0]} rotation={[frame * 0.5, 0, 0]}>
          {[0, 1, 2].map((b) => (
            <mesh key={b} rotation={[(b * Math.PI * 2) / 3, 0, 0]}>
              <boxGeometry args={[0.06, 0.5, 0.12]} />
              <meshStandardMaterial color="#9aa3ad" flatShading />
            </mesh>
          ))}
        </group>
        <mesh position={[0.9, -0.35, -0.3]}>
          <icosahedronGeometry args={[0.09, 0]} />
          <meshBasicMaterial color={lightPower > 0.05 ? "#fffbe0" : "#8a8f96"} />
        </mesh>
      </group>
      <pointLight position={[pos.x + 0.9, pos.y + 1.9, pos.z + 3]} intensity={0.9} distance={7} decay={0} color="#cfe6ff" />
      <primitive object={targetObj} position={target} />
      <spotLight position={lightPos} target={targetObj} angle={0.5} penumbra={0.6} decay={0} distance={30} intensity={lightPower * 10} color="#fff6dc" />
      {lightPower > 0 && (
        <mesh position={beamCenter} quaternion={beamQuat}>
          <coneGeometry args={[2.4, beamLength, 20, 1, true]} />
          <meshBasicMaterial color="#fff3c4" transparent opacity={lightPower * 0.05} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
};
