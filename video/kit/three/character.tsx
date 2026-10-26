// 顔のある主人公（ポリゴン調）。表情・まばたき・口の動き・目線を変えられる。
// 原点は足元（stand）またはいすの座面の高さの真下（sit）。顔は +Z を向く。頭の中心は立ちで y≈1.55、座りで y≈1.2。
import React from "react";
import * as THREE from "three";
import type { Vec3 } from "./camera";

export type Expression = "neutral" | "smile" | "worried" | "scared" | "surprised" | "determined" | "sad" | "relieved";

export interface CharacterColors {
  skin: string;
  hair: string;
  eyes: string;
  suit: string;
  /** スーツの差し色（胸のライン・ヘッドセット） */
  accent: string;
}

const DEFAULT_COLORS: CharacterColors = {
  skin: "#f3d2b8",
  hair: "#1f2233",
  eyes: "#3b2f5c",
  suit: "#f07b2a",
  accent: "#ffd23f",
};

/** 頭の半径 */
const R = 0.24;

const Mat: React.FC<{ color: string; glow?: number; opacity?: number; side?: THREE.Side }> = ({ color, glow = 0, opacity, side }) => (
  <meshStandardMaterial
    color={color}
    flatShading
    roughness={0.85}
    emissive={color}
    emissiveIntensity={glow}
    transparent={opacity !== undefined}
    opacity={opacity ?? 1}
    side={side ?? THREE.FrontSide}
  />
);

/** 顔の表面（x, y は顔の正面から見た位置）に部品を貼る */
const OnFace: React.FC<{ x: number; y: number; lift?: number; children: React.ReactNode }> = ({ x, y, lift = 0.004, children }) => {
  const z = Math.sqrt(Math.max(0, R * R - x * x - y * y)) + lift;
  return (
    <group position={[x, y, z]} rotation={[-Math.atan2(y, z), Math.atan2(x, z), 0]}>
      {children}
    </group>
  );
};

/** 表情ごとの目・まゆ・口の形 */
function face(expression: Expression) {
  switch (expression) {
    case "smile":
      return { eyeOpen: 0.55, eyeSize: 1, brow: 0.05, browY: 0, mouth: "smile" as const, blush: true };
    case "relieved":
      return { eyeOpen: 0.45, eyeSize: 1, brow: -0.2, browY: 0, mouth: "smile" as const, blush: true };
    case "worried":
      return { eyeOpen: 0.9, eyeSize: 1, brow: -0.35, browY: 0.008, mouth: "frown" as const, blush: false };
    case "sad":
      return { eyeOpen: 0.6, eyeSize: 1, brow: -0.4, browY: 0, mouth: "frown" as const, blush: false };
    case "scared":
      return { eyeOpen: 1.1, eyeSize: 1.1, brow: -0.45, browY: 0.02, mouth: "open" as const, blush: false };
    case "surprised":
      return { eyeOpen: 1.15, eyeSize: 1.12, brow: 0.05, browY: 0.03, mouth: "open" as const, blush: false };
    case "determined":
      return { eyeOpen: 0.75, eyeSize: 1, brow: 0.35, browY: -0.008, mouth: "line" as const, blush: false };
    default:
      return { eyeOpen: 0.95, eyeSize: 1, brow: 0, browY: 0, mouth: "line" as const, blush: false };
  }
}

const Eye: React.FC<{ side: -1 | 1; open: number; size: number; look: [number, number]; colors: CharacterColors }> = ({
  side,
  open,
  size,
  look,
  colors,
}) => (
  <OnFace x={side * 0.08} y={0.0}>
    <group scale={[size, size * Math.max(0.08, open), size]}>
      <mesh scale={[1, 1.18, 1]}>
        <circleGeometry args={[0.04, 18]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.25} />
      </mesh>
      <group position={[look[0] * 0.012, look[1] * 0.012, 0.002]}>
        <mesh scale={[1, 1.15, 1]}>
          <circleGeometry args={[0.034, 18]} />
          <meshStandardMaterial color={colors.eyes} emissive={colors.eyes} emissiveIntensity={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <circleGeometry args={[0.015, 14]} />
          <meshBasicMaterial color="#0b0b12" />
        </mesh>
        <mesh position={[side * 0.01, 0.014, 0.002]}>
          <circleGeometry args={[0.009, 10]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
    {/* 上まつげ（目の上のふち） */}
    <mesh position={[0, 0.048 * size * Math.max(0.08, open), 0.003]} rotation={[0, 0, -side * 0.12]}>
      <boxGeometry args={[0.092, 0.012, 0.004]} />
      <meshBasicMaterial color="#14131c" />
    </mesh>
  </OnFace>
);

const Mouth: React.FC<{ shape: "smile" | "frown" | "open" | "line"; talk: number }> = ({ shape, talk }) => {
  // しゃべっているときは、口を開け閉めする
  if (talk > 0.05 || shape === "open") {
    const open = shape === "open" ? Math.max(0.9, talk) : talk;
    return (
      <OnFace x={0} y={-0.115}>
        <mesh scale={[1, 0.35 + open * 0.9, 1]}>
          <circleGeometry args={[0.024, 14]} />
          <meshBasicMaterial color="#6b2b33" />
        </mesh>
      </OnFace>
    );
  }
  if (shape === "line") {
    return (
      <OnFace x={0} y={-0.115}>
        <mesh>
          <boxGeometry args={[0.05, 0.008, 0.004]} />
          <meshBasicMaterial color="#8a3b3b" />
        </mesh>
      </OnFace>
    );
  }
  return (
    <OnFace x={0} y={shape === "smile" ? -0.105 : -0.125}>
      <mesh rotation={[0, 0, shape === "smile" ? Math.PI : 0]}>
        <torusGeometry args={[0.026, 0.006, 4, 14, Math.PI]} />
        <meshBasicMaterial color="#8a3b3b" />
      </mesh>
    </OnFace>
  );
};

/** 頭（顔・髪・耳・ヘッドセット） */
const Head: React.FC<{
  expression: Expression;
  frame: number;
  talking: boolean;
  look: [number, number];
  headset: boolean;
  colors: CharacterColors;
}> = ({ expression, frame, talking, look, headset, colors }) => {
  const f = face(expression);
  // まばたき：だいたい3.5秒に1回、3フレームだけ閉じる
  const blinking = frame % 107 < 3 || (frame + 40) % 233 < 3;
  const open = blinking ? 0.08 : f.eyeOpen;
  const talk = talking ? Math.abs(Math.sin(frame * 0.55)) * (0.6 + 0.4 * Math.abs(Math.sin(frame * 0.21))) : 0;
  return (
    <group>
      {/* 顔 */}
      <mesh scale={[1, 1.06, 0.96]}>
        <icosahedronGeometry args={[R, 3]} />
        <Mat color={colors.skin} glow={0.22} />
      </mesh>
      {/* 耳 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.235, -0.01, 0]} scale={[0.5, 1, 0.8]}>
          <icosahedronGeometry args={[0.05, 1]} />
          <Mat color={colors.skin} />
        </mesh>
      ))}
      {/* 目・まゆ・鼻・口・ほお */}
      {([-1, 1] as const).map((s) => (
        <React.Fragment key={s}>
          <Eye side={s} open={open} size={f.eyeSize} look={look} colors={colors} />
          <OnFace x={s * 0.082} y={0.075 + f.browY}>
            <mesh rotation={[0, 0, s * f.brow]}>
              <boxGeometry args={[0.062, 0.01, 0.004]} />
              <meshBasicMaterial color={colors.hair} />
            </mesh>
          </OnFace>
          {f.blush && (
            <OnFace x={s * 0.135} y={-0.06}>
              <mesh scale={[1.3, 0.8, 1]}>
                <circleGeometry args={[0.03, 12]} />
                <meshBasicMaterial color="#ff8a8a" transparent opacity={0.35} />
              </mesh>
            </OnFace>
          )}
        </React.Fragment>
      ))}
      <OnFace x={0} y={-0.045} lift={0.006}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.014, 0.03, 4]} />
          <Mat color="#e7b89a" />
        </mesh>
      </OnFace>
      <Mouth shape={f.mouth} talk={talk} />
      {/* 髪：頭頂（額の生えぎわまで）＋顔の前だけあいたボブ＋前髪 */}
      <group scale={[1, 1.06, 0.96]}>
        <mesh>
          <sphereGeometry args={[R + 0.018, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.34]} />
          <Mat color={colors.hair} glow={0.08} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <sphereGeometry args={[R + 0.022, 20, 10, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, Math.PI * 0.32, Math.PI * 0.33]} />
          <Mat color={colors.hair} glow={0.08} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {[-0.1, -0.035, 0.035, 0.1].map((x, i) => (
        <OnFace key={x} x={x} y={0.105} lift={0.012}>
          <mesh rotation={[0, 0, (i % 2 ? -1 : 1) * 0.18 + x * 1.5]}>
            <boxGeometry args={[0.075, 0.075, 0.02]} />
            <Mat color={colors.hair} glow={0.08} />
          </mesh>
        </OnFace>
      ))}
      {/* ヘッドセット */}
      {headset && (
        <group>
          <mesh>
            <torusGeometry args={[R + 0.045, 0.016, 6, 24, Math.PI]} />
            <Mat color="#3a3f48" />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * (R + 0.04), -0.02, 0]}>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.065, 0.065, 0.05, 12]} />
                <Mat color="#2b2f36" />
              </mesh>
              <mesh position={[s * 0.027, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <torusGeometry args={[0.045, 0.008, 4, 16]} />
                <Mat color={colors.accent} glow={0.4} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
};

/** 腕（肩から手まで）。angle は前に上げる角度、spread は横に開く角度 */
const Arm: React.FC<{ side: -1 | 1; angle: number; spread: number; bend: number; colors: CharacterColors }> = ({
  side,
  angle,
  spread,
  bend,
  colors,
}) => (
  <group rotation={[-angle, 0, side * spread]}>
    <mesh position={[0, -0.16, 0]}>
      <capsuleGeometry args={[0.062, 0.22, 3, 8]} />
      <Mat color={colors.suit} />
    </mesh>
    <group position={[0, -0.32, 0]} rotation={[-bend, 0, 0]}>
      <mesh position={[0, -0.14, 0]}>
        <capsuleGeometry args={[0.055, 0.2, 3, 8]} />
        <Mat color={colors.suit} />
      </mesh>
      <mesh position={[0, -0.3, 0]}>
        <icosahedronGeometry args={[0.058, 1]} />
        <Mat color="#4a4f58" />
      </mesh>
    </group>
  </group>
);

/** 顔のある主人公。expression で表情、talking でしゃべる口、look で目線、pose で立ち／座り */
export const Character: React.FC<{
  position: Vec3;
  rotationY?: number;
  scale?: number;
  expression?: Expression;
  /** 今のフレーム（まばたき・口・呼吸に使う） */
  frame?: number;
  /** true のあいだ口が動く */
  talking?: boolean;
  /** 目線。[左右, 上下]（-1〜1） */
  look?: [number, number];
  /** 頭の向き。[うなずき, 首振り]（ラジアン） */
  headTurn?: [number, number];
  pose?: "stand" | "sit";
  headset?: boolean;
  colors?: Partial<CharacterColors>;
}> = ({
  position,
  rotationY = 0,
  scale = 1,
  expression = "neutral",
  frame = 0,
  talking = false,
  look = [0, 0],
  headTurn = [0, 0],
  pose = "stand",
  headset = true,
  colors: colorOverrides,
}) => {
  const colors = { ...DEFAULT_COLORS, ...colorOverrides };
  const sit = pose === "sit";
  const hip = sit ? 0.45 : 0.82;
  const breathe = 1 + Math.sin(frame / 22) * 0.012;
  const shoulderY = hip + 0.5;
  const headY = shoulderY + 0.3;
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* 胴体（パイロットスーツ） */}
      <group position={[0, hip + 0.26, 0]} scale={[1, breathe, 1]}>
        <mesh scale={[1.15, 1, 0.72]}>
          <capsuleGeometry args={[0.2, 0.22, 4, 10]} />
          <Mat color={colors.suit} />
        </mesh>
        <mesh position={[0, 0.02, 0.146]}>
          <boxGeometry args={[0.012, 0.42, 0.01]} />
          <Mat color="#3a3f48" />
        </mesh>
        <mesh position={[0.1, 0.1, 0.143]} rotation={[0.05, 0.25, 0]}>
          <planeGeometry args={[0.09, 0.06]} />
          <Mat color="#ffffff" glow={0.2} />
        </mesh>
        <mesh position={[0, -0.04, 0.142]}>
          <boxGeometry args={[0.44, 0.03, 0.01]} />
          <Mat color={colors.accent} glow={0.3} />
        </mesh>
      </group>
      {/* 首と襟 */}
      <mesh position={[0, shoulderY + 0.06, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.1, 8]} />
        <Mat color={colors.skin} glow={0.15} />
      </mesh>
      <mesh position={[0, shoulderY + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.1, 0.03, 6, 14]} />
        <Mat color="#3a3f48" />
      </mesh>
      {/* 頭 */}
      <group position={[0, headY, 0.01]} rotation={[headTurn[0], headTurn[1], 0]}>
        <Head expression={expression} frame={frame} talking={talking} look={look} headset={headset} colors={colors} />
      </group>
      {/* 腕：座りは操縦盤に手を伸ばす、立ちは下ろす */}
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[s * 0.27, shoulderY, 0]}>
          <Arm side={s} angle={sit ? 0.9 : 0.1} spread={sit ? 0.12 : 0.18} bend={sit ? 0.5 : 0.15} colors={colors} />
        </group>
      ))}
      {/* 脚 */}
      {([-1, 1] as const).map((s) =>
        sit ? (
          <group key={s} position={[s * 0.11, hip, 0.05]}>
            <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
              <capsuleGeometry args={[0.08, 0.3, 3, 8]} />
              <Mat color={colors.suit} />
            </mesh>
            <mesh position={[0, -0.22, 0.42]}>
              <capsuleGeometry args={[0.07, 0.3, 3, 8]} />
              <Mat color={colors.suit} />
            </mesh>
            <mesh position={[0, -0.44, 0.47]}>
              <boxGeometry args={[0.12, 0.08, 0.22]} />
              <Mat color="#2b2f36" />
            </mesh>
          </group>
        ) : (
          <group key={s} position={[s * 0.11, 0, 0]}>
            <mesh position={[0, 0.45, 0]}>
              <capsuleGeometry args={[0.08, 0.62, 3, 8]} />
              <Mat color={colors.suit} />
            </mesh>
            <mesh position={[0, 0.05, 0.04]}>
              <boxGeometry args={[0.13, 0.1, 0.24]} />
              <Mat color="#2b2f36" />
            </mesh>
          </group>
        ),
      )}
    </group>
  );
};
