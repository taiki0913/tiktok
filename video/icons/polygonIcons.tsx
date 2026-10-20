// プロフィール画像：ポリゴン調3Dで作るもの（日本史・都市伝説・宇宙と深海・未来の日本）。
// TikTok では丸く切り抜かれるので、大事なものは中央の円の中に収める。
import { useThree } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo } from "react";
import { AbsoluteFill } from "remotion";
import * as THREE from "three";
import {
  Atmosphere,
  Building,
  CameraRig,
  EdoHouse,
  FONT_FAMILY,
  Ground,
  House,
  Jellyfish,
  Fish,
  Lights,
  Mountain,
  Particles,
  Planet,
  Road,
  Stars,
  ThreeCanvas,
  Tree,
  useFontsReady,
  type Vec3,
} from "../kit";

export const ICON_SIZE = 1080;

/** 背景を透明にして霧だけかける（後ろの HTML のグラデーションを空にする） */
const Fog: React.FC<{ color: string; near: number; far: number }> = ({ color, near, far }) => {
  const { scene } = useThree();
  useLayoutEffect(() => {
    scene.background = null;
    scene.fog = new THREE.Fog(color, near, far);
  }, [scene, color, near, far]);
  return null;
};

const Std: React.FC<{ color: string; emissive?: string; emissiveIntensity?: number }> = ({ color, emissive, emissiveIntensity = 0 }) => (
  <meshStandardMaterial color={color} flatShading roughness={0.9} emissive={emissive ?? "#000000"} emissiveIntensity={emissiveIntensity} />
);

/** 四角すい台（石垣・天守の屋根）。w は一辺の長さ */
const Frustum: React.FC<{ y: number; bottom: number; top: number; height: number; color: string }> = ({ y, bottom, top, height, color }) => (
  <mesh position={[0, y + height / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
    <cylinderGeometry args={[top / Math.SQRT2, bottom / Math.SQRT2, height, 4]} />
    <Std color={color} />
  </mesh>
);

/** 正面の三角の飾り屋根（破風） */
const Gable: React.FC<{ y: number; z: number; width: number; height: number }> = ({ y, z, width, height }) => {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-width / 2, 0);
    s.lineTo(width / 2, 0);
    s.lineTo(0, height);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false });
  }, [width, height]);
  return (
    <group position={[0, y, z]}>
      <mesh geometry={geo}>
        <Std color="#f1ece2" />
      </mesh>
      <mesh position={[0, height * 0.42, 0.52]} rotation={[0, 0, 0]}>
        <circleGeometry args={[height * 0.16, 6]} />
        <Std color="#c9a24a" />
      </mesh>
    </group>
  );
};

/** お城（石垣＋3層の天守） */
const Castle: React.FC<{ position: Vec3; scale?: number }> = ({ position, scale = 1 }) => {
  const base = 2.4;
  const tiers = [
    { w: 5.2, h: 1.7, roof: 6.6 },
    { w: 4.0, h: 1.4, roof: 5.2 },
    { w: 2.8, h: 1.2, roof: 4.0 },
  ];
  let y = base;
  const parts: React.ReactNode[] = [];
  tiers.forEach((t, i) => {
    parts.push(
      <mesh key={`w${i}`} position={[0, y + t.h / 2, 0]}>
        <boxGeometry args={[t.w, t.h, t.w * 0.85]} />
        <Std color="#f1ece2" />
      </mesh>,
    );
    // 窓（黒い格子の帯）
    parts.push(
      <mesh key={`m${i}`} position={[0, y + t.h * 0.55, (t.w * 0.85) / 2 + 0.01]}>
        <planeGeometry args={[t.w * 0.7, t.h * 0.22]} />
        <Std color="#2a2c33" emissive="#ffb35c" emissiveIntensity={0.25} />
      </mesh>,
    );
    y += t.h;
    const last = i === tiers.length - 1;
    parts.push(<Frustum key={`r${i}`} y={y - 0.1} bottom={t.roof} top={last ? 0.6 : t.w * 0.8} height={last ? 1.5 : 0.75} color="#2f3542" />);
    if (i === 1) parts.push(<Gable key="g" y={y - 0.1} z={(t.roof * 0.85) / 2 - 0.9} width={2.2} height={1.0} />);
    y += last ? 1.4 : 0.55;
  });
  return (
    <group position={position} scale={scale}>
      <Frustum y={0} bottom={8.2} top={6.6} height={base} color="#6f6a63" />
      {parts}
      {/* 屋根の上の金のしゃちほこ */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.45, y - 0.05, 0]} rotation={[0, 0, s * 0.4]}>
          <coneGeometry args={[0.16, 0.6, 4]} />
          <meshStandardMaterial color="#f2c14e" emissive="#a8741c" emissiveIntensity={0.5} flatShading metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
};

/** 知られざる日本史：夕焼けのお城と城下町 */
export const HistoryIcon: React.FC = () => (
  <AbsoluteFill style={{ background: "linear-gradient(180deg, #2c2150 0%, #8e3b5c 38%, #e8664a 62%, #ffb169 80%)" }}>
    {/* 沈む夕日 */}
    <div
      style={{
        position: "absolute",
        left: 540 - 230,
        top: 560 - 230,
        width: 460,
        height: 460,
        borderRadius: "50%",
        background: "radial-gradient(circle, #ffe2a0 0%, #ffc56e 55%, rgba(255,160,90,0) 72%)",
      }}
    />
    <ThreeCanvas width={ICON_SIZE} height={ICON_SIZE} camera={{ fov: 34 }}>
      <Fog color="#e0715a" near={30} far={90} />
      <CameraRig position={[0, 3.2, 27]} target={[0, 6.2, 0]} />
      <Lights preset="dusk" intensity={1.15} />
      <directionalLight position={[8, 10, 20]} intensity={0.9} color="#ffd2a8" />
      <Mountain position={[-26, -1, -45]} radius={22} height={16} color="#4a2f52" seed="h1" />
      <Mountain position={[22, -1, -50]} radius={26} height={20} color="#41294c" seed="h2" />
      <Ground size={160} color="#3b2a36" y={-0.2} />
      <Castle position={[0, 0, 0]} scale={1.05} />
      {[-7.5, -4.5, 4.5, 7.5].map((x, i) => (
        <Tree key={x} position={[x, 0, -1 + (i % 2)]} height={4.2} color="#2f4a35" kind="pine" />
      ))}
      {[-9, -5.4, -1.8, 1.8, 5.4, 9].map((x, i) => (
        <EdoHouse key={x} position={[x, 0, 7 + (i % 2) * 0.8]} width={3.3} height={1.8} lights={0.9} roofColor="#2b2f38" />
      ))}
    </ThreeCanvas>
  </AbsoluteFill>
);

/** 顔のない黒い人影 */
const Shadow: React.FC<{ position: Vec3; height?: number }> = ({ position, height = 2 }) => (
  <group position={position} scale={height / 2}>
    <mesh position={[0, 0.8, 0]}>
      <cylinderGeometry args={[0.2, 0.3, 1.6, 7]} />
      <meshStandardMaterial color="#020203" flatShading roughness={1} />
    </mesh>
    <mesh position={[0, 1.78, 0]} scale={[1, 1.15, 1]}>
      <icosahedronGeometry args={[0.2, 1]} />
      <meshStandardMaterial color="#020203" flatShading roughness={1} />
    </mesh>
  </group>
);

/** 鳥居 */
const Torii: React.FC<{ position: Vec3; color: string; scale?: number }> = ({ position, color, scale = 1 }) => (
  <group position={position} scale={scale}>
    {[-1.3, 1.3].map((x) => (
      <mesh key={x} position={[x, 1.8, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 3.6, 8]} />
        <Std color={color} />
      </mesh>
    ))}
    <mesh position={[0, 3.75, 0]}>
      <boxGeometry args={[4.0, 0.28, 0.4]} />
      <Std color={color} />
    </mesh>
    <mesh position={[0, 3.1, 0]}>
      <boxGeometry args={[3.2, 0.18, 0.3]} />
      <Std color={color} />
    </mesh>
  </group>
);

/** 夜更けの都市伝説：霧の夜道、街灯の下に立つ人影、奥に鳥居 */
export const UrbanLegendIcon: React.FC = () => {
  const lampHead: Vec3 = [-1.25, 4.2, -2.2];
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 42%, #1c2230 0%, #0a0c12 70%)" }}>
      <ThreeCanvas width={ICON_SIZE} height={ICON_SIZE} camera={{ fov: 38 }}>
        <Atmosphere color="#262c3a" fogNear={4} fogFar={24} />
        <CameraRig position={[0.7, 1.5, 5.2]} target={[-0.3, 1.9, -2.6]} />
        <Lights preset="night" intensity={0.7} />
        <Ground size={80} color="#14161c" y={-0.02} roughness={0.15} />
        <Road from={[0.2, 0, 12]} to={[0.2, 0, -40]} width={4.2} color="#1c1f26" />
        {/* 街灯 */}
        <mesh position={[-1.6, 2.15, -2.2]}>
          <cylinderGeometry args={[0.07, 0.09, 4.3, 6]} />
          <Std color="#3a3d44" />
        </mesh>
        <mesh position={[-1.42, 4.28, -2.2]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.45, 6]} />
          <Std color="#3a3d44" />
        </mesh>
        <mesh position={lampHead}>
          <boxGeometry args={[0.42, 0.12, 0.3]} />
          <meshBasicMaterial color="#fff1cf" />
        </mesh>
        <primitive object={target} position={[-0.4, 0, -2.5]} />
        <spotLight position={lampHead} target={target} angle={0.6} penumbra={0.8} intensity={16} decay={0} distance={14} color="#ffe2b0" />
        <mesh position={[-0.85, 2.05, -2.35]} rotation={[0, 0, -0.18]}>
          <coneGeometry args={[1.9, 4.3, 24, 1, true]} />
          <meshBasicMaterial color="#ffe9c2" transparent opacity={0.045} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <Shadow position={[-0.35, 0, -2.6]} height={2.05} />
        {/* 奥の鳥居（霧にかすむ） */}
        <Torii position={[1.1, 0, -12]} color="#d2465a" scale={1.15} />
        <pointLight position={[1.1, 3, -9.5]} intensity={2.4} distance={8} decay={0} color="#ff5a6e" />
        <Particles count={500} box={{ center: [0, 2.5, -3], size: [10, 6, 14] }} color="#cfd8e8" size={0.03} opacity={0.5} seed="mist" />
      </ThreeCanvas>
      {/* 周りを暗く落とす */}
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 46%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.45) 75%)" }} />
    </AbsoluteFill>
  );
};

/** 宇宙と深海のふしぎ：上半分は宇宙（輪のある惑星）、下半分は深海（光るクラゲ） */
export const CosmosIcon: React.FC = () => {
  const half = ICON_SIZE / 2;
  return (
    <AbsoluteFill style={{ background: "#020611" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: ICON_SIZE, height: half }}>
        <ThreeCanvas width={ICON_SIZE} height={half} camera={{ fov: 40 }}>
          <Atmosphere color="#040a1c" fogNear={200} fogFar={600} />
          <CameraRig position={[0, 0, 13]} target={[0, -0.3, 0]} />
          <Lights preset="space" />
          <Stars count={900} radius={120} size={0.9} />
          <group position={[0.6, -0.5, 0]} rotation={[0.45, 0, -0.25]}>
            <Planet position={[0, 0, 0]} radius={2.7} color="#f0b84a" color2="#c98236" detail={2} rotationY={0.6} ring={{ inner: 3.4, outer: 5.0, color: "#ffe39a" }} seed="icon" />
          </group>
          <Planet position={[-6.2, 1.7, -6]} radius={0.55} color="#9bb7d6" detail={1} seed="moon" />
        </ThreeCanvas>
      </div>
      <div style={{ position: "absolute", left: 0, top: half, width: ICON_SIZE, height: half }}>
        <ThreeCanvas width={ICON_SIZE} height={half} camera={{ fov: 40 }}>
          <Atmosphere color="#031a33" fogNear={11} fogFar={30} />
          <CameraRig position={[0, 0, 9]} target={[0, 0.2, 0]} />
          <Lights preset="underwater" intensity={0.35} />
          <Jellyfish position={[0.2, 0.9, 0]} frame={12} scale={2.1} />
          <Jellyfish position={[-4.2, 0.2, -4]} frame={40} scale={0.9} color="#b49bff" />
          <Fish position={[3.6, -0.6, -1]} rotationY={Math.PI} color="#7fa8c8" scale={1.6} />
          <Fish position={[4.6, 0.3, -3]} rotationY={Math.PI} color="#7fa8c8" scale={1.2} />
          <Particles count={600} box={{ center: [0, 0, -2], size: [16, 8, 10] }} color="#d8f1ff" size={0.04} opacity={0.6} seed="snow" />
        </ThreeCanvas>
      </div>
      {/* 宇宙と深海の境目（水面） */}
      <svg width={ICON_SIZE} height={60} style={{ position: "absolute", left: 0, top: half - 30 }}>
        <path
          d={`M0 30 ${Array.from({ length: 13 }, (_, i) => `Q ${i * 90 + 45} ${i % 2 === 0 ? 14 : 46} ${(i + 1) * 90} 30`).join(" ")}`}
          fill="none"
          stroke="#7fe3ff"
          strokeWidth={7}
          style={{ filter: "drop-shadow(0 0 10px #7fe3ff)" }}
        />
      </svg>
    </AbsoluteFill>
  );
};

/** 20XX年の日本：青い時間帯の町と高層ビル、大きな「20XX」 */
export const FutureIcon: React.FC = () => {
  useFontsReady(["20XX"]);
  const buildings = [
    { x: -4, z: -6, h: 10, w: 3.2 },
    { x: 0.2, z: -9, h: 15, w: 3.8 },
    { x: 4.4, z: -6.5, h: 9, w: 3.0 },
    { x: -8.6, z: -10, h: 8, w: 3.4 },
    { x: 9, z: -11, h: 12, w: 3.6 },
    { x: 3.2, z: -15, h: 19, w: 3.4 },
    { x: -3.4, z: -16, h: 14, w: 3.0 },
  ];
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #071431 0%, #10305c 45%, #2b6f9c 70%, #6fc7e6 100%)" }}>
      <ThreeCanvas width={ICON_SIZE} height={ICON_SIZE} camera={{ fov: 42 }}>
        <Fog color="#2e6f98" near={30} far={75} />
        <CameraRig position={[0, 13, 32]} target={[0, 7.5, -5]} />
        <Lights preset="night" intensity={1.6} />
        <directionalLight position={[-10, 14, 12]} intensity={0.8} color="#bfe9ff" />
        <Ground size={160} color="#1c3247" />
        <Road from={[0, 0, 20]} to={[0, 0, -40]} width={3.6} color="#2b3442" />
        <Road from={[-30, 0, 2.5]} to={[30, 0, 2.5]} width={3} color="#2b3442" />
        {buildings.map((b, i) => (
          <Building key={i} position={[b.x, 0, b.z]} height={b.h} width={b.w} depth={b.w} color="#9fb4c9" windowsLit={0.55} seed={`f${i}`} />
        ))}
        {[-9, -5.5, 5.5, 9].flatMap((x, i) =>
          [6.5, 10.5].map((z, j) => (
            <House key={`${i}-${j}`} position={[x, 0, z]} width={2.6} depth={2.6} height={2} lights={0.9} wallColor="#dfe6ee" roofColor={(i + j) % 2 ? "#3b5f86" : "#5c6f86"} />
          )),
        )}
        {[-3, 3].map((x) => (
          <Tree key={x} position={[x, 0, 9]} height={2.2} color="#2f6a5a" />
        ))}
      </ThreeCanvas>
      <div
        style={{
          position: "absolute",
          top: 168,
          width: "100%",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: 250,
          letterSpacing: 6,
          color: "#ffffff",
          textShadow: "0 0 28px #3fd2ff, 0 6px 0 #0a6f99",
        }}
      >
        20XX
      </div>
    </AbsoluteFill>
  );
};
