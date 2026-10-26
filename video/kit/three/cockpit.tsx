// 潜水艇の操縦席（球形の耐圧殻の中）。Character を原点に座らせ（pose="sit"）、+Z の窓のほうを向かせて使う。
// 殻の中心は y=0.9・半径1.5。カメラは殻の中（中心から1.3以内）に置く。
import React from "react";
import * as THREE from "three";
import type { Vec3 } from "./camera";

const HULL_RADIUS = 1.5;
const HULL_CENTER: Vec3 = [0, 0.9, 0];

const Mat: React.FC<{ color: string; glow?: number; emissive?: string }> = ({ color, glow = 0, emissive }) => (
  <meshStandardMaterial color={color} flatShading roughness={0.8} metalness={0.2} emissive={emissive ?? color} emissiveIntensity={glow} />
);

/** 殻の内側の、方向 dir の位置（中心から r の距離） */
function onHull(dir: Vec3, r = HULL_RADIUS - 0.04): Vec3 {
  const v = new THREE.Vector3(...dir).normalize().multiplyScalar(r);
  return [HULL_CENTER[0] + v.x, HULL_CENTER[1] + v.y, HULL_CENTER[2] + v.z];
}

/** 操縦盤（画面と小さなボタン）。power が 0 なら消える */
const Panel: React.FC<{ position: Vec3; rotationY: number; tilt: number; screen: string; frame: number; power: number; seed: number }> = ({
  position,
  rotationY,
  tilt,
  screen,
  frame,
  power,
  seed,
}) => (
  <group position={position} rotation={[tilt, rotationY, 0]}>
    <mesh>
      <boxGeometry args={[0.44, 0.3, 0.06]} />
      <Mat color="#2a3038" />
    </mesh>
    <mesh position={[-0.06, 0.03, 0.032]}>
      <planeGeometry args={[0.26, 0.17]} />
      <Mat color="#0d1a22" emissive={screen} glow={1.4 * power} />
    </mesh>
    {Array.from({ length: 6 }, (_, i) => {
      const on = power > 0.2 && (frame + seed * 13 + i * 17) % (40 + i * 7) > 8;
      const colors = ["#3cff8a", "#ffd23f", "#ff5a4f"];
      const c = colors[(i + seed) % 3]!;
      return (
        <mesh key={i} position={[0.15 + (i % 2) * 0.05, 0.08 - Math.floor(i / 2) * 0.06, 0.035]}>
          <boxGeometry args={[0.025, 0.025, 0.01]} />
          <Mat color="#1a1d22" emissive={c} glow={on ? 1.6 * power : 0} />
        </mesh>
      );
    })}
  </group>
);

/**
 * 潜水艇の操縦席。power で照明と画面の明るさ（0で真っ暗）、alarm で赤い警告灯が点滅、
 * windowGlow で窓の外の青い明るさ（外のライトを点けた場面など）。
 */
export const Cockpit: React.FC<{ frame: number; power?: number; alarm?: boolean; windowGlow?: number }> = ({
  frame,
  power = 1,
  alarm = false,
  windowGlow = 0.5,
}) => {
  const alarmOn = alarm && frame % 30 < 15;
  const windowPos = onHull([0, -0.28, 1]);
  const windowRot = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.28, -1).normalize()),
  );
  const panels = [-1.0, -0.5, 0.5, 1.0].map((a, i) => ({ a, i }));
  return (
    <group>
      {/* 殻（内側の面だけ描く） */}
      <mesh position={HULL_CENTER}>
        <sphereGeometry args={[HULL_RADIUS, 22, 14]} />
        <meshStandardMaterial color="#46515c" flatShading roughness={0.9} metalness={0.3} side={THREE.BackSide} />
      </mesh>
      {/* 殻のつなぎ目のリング */}
      {[0.35, 0.9, 1.45].map((y) => {
        const r = Math.sqrt(HULL_RADIUS ** 2 - (y - HULL_CENTER[1]) ** 2) - 0.03;
        return (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.025, 4, 32]} />
            <Mat color="#2f363e" />
          </mesh>
        );
      })}
      {/* 床 */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[Math.sqrt(HULL_RADIUS ** 2 - HULL_CENTER[1] ** 2), 24]} />
        <Mat color="#23282e" />
      </mesh>
      {/* いす */}
      <mesh position={[0, 0.22, -0.05]}>
        <boxGeometry args={[0.5, 0.44, 0.5]} />
        <Mat color="#30353c" />
      </mesh>
      <mesh position={[0, 0.78, -0.33]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[0.52, 0.75, 0.1]} />
        <Mat color="#30353c" />
      </mesh>
      {/* 窓（のぞき窓） */}
      <group position={windowPos} rotation={windowRot}>
        <mesh>
          <circleGeometry args={[0.17, 24]} />
          <meshStandardMaterial color="#04101f" emissive="#0b4f8a" emissiveIntensity={windowGlow} />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <torusGeometry args={[0.18, 0.035, 6, 24]} />
          <Mat color="#8a939c" />
        </mesh>
      </group>
      {/* 操縦盤 */}
      {panels.map(({ a, i }) => {
        const p = onHull([Math.sin(a), -0.05, Math.cos(a)], 1.2);
        return (
          <Panel
            key={a}
            position={[p[0], p[1] - 0.15, p[2]]}
            rotationY={a + Math.PI}
            tilt={0.35}
            screen={["#3fd2ff", "#ffd23f", "#3cff8a", "#3fd2ff"][i]!}
            frame={frame}
            power={power}
            seed={i}
          />
        );
      })}
      <mesh position={onHull([0, 1, 0.35], 1.32)} rotation={[0.9, 0, 0]}>
        <boxGeometry args={[0.6, 0.06, 0.3]} />
        <Mat color="#2a3038" />
      </mesh>
      {/* 照明 */}
      <pointLight position={[0, 1.95, 0.35]} intensity={1.8 * power} distance={4} decay={0} color="#ffe8c8" />
      <pointLight position={[0, 0.8, 1.0]} intensity={0.45 * power} distance={2.5} decay={0} color="#5fd6ff" />
      {/* 顔を照らすやわらかい光（暗い場面でも表情が見えるように） */}
      <pointLight position={[0.3, 1.45, 0.95]} intensity={0.9 * Math.max(power, 0.35)} distance={2.2} decay={0} color="#ffd9b8" />
      <pointLight position={[0, 0.5, 1.2]} intensity={0.6 * windowGlow} distance={2} decay={0} color="#2a7fd4" />
      {alarm && (
        <>
          <mesh position={onHull([0.6, 0.8, -0.2], 1.42)}>
            <icosahedronGeometry args={[0.06, 1]} />
            <meshBasicMaterial color={alarmOn ? "#ff3b30" : "#4a1412"} />
          </mesh>
          <pointLight position={[0.6, 1.9, -0.2]} intensity={alarmOn ? 2.4 : 0.2} distance={4} decay={0} color="#ff3b30" />
        </>
      )}
    </group>
  );
};
