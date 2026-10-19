// カメラと空気感（背景色・霧）。毎フレームの位置はキーフレームから補間する。
import { useThree } from "@react-three/fiber";
import React, { useLayoutEffect } from "react";
import { Easing, interpolate } from "remotion";
import * as THREE from "three";

export type Vec3 = [number, number, number];

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const CAMERA_FOV = 75;

export interface CameraKey {
  frame: number;
  position: Vec3;
  target: Vec3;
}

/** キーフレームの間をなめらかにつないだカメラ位置 */
export function cameraPath(frame: number, keys: CameraKey[]): { position: Vec3; target: Vec3 } {
  if (keys.length === 0) throw new Error("カメラのキーフレームがありません");
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (frame <= first.frame) return { position: first.position, target: first.target };
  if (frame >= last.frame) return { position: last.position, target: last.target };
  const i = keys.findIndex((k) => k.frame > frame);
  const a = keys[i - 1]!;
  const b = keys[i]!;
  const t = interpolate(frame, [a.frame, b.frame], [0, 1], { easing: Easing.inOut(Easing.sin) });
  const mix = (p: Vec3, q: Vec3): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  return { position: mix(a.position, b.position), target: mix(a.target, b.target) };
}

/** カメラを指定の位置に置き、target を向かせる。shake で揺れ（地震など）を足せる */
export const CameraRig: React.FC<{ position: Vec3; target: Vec3; shake?: number; frame?: number }> = ({
  position,
  target,
  shake = 0,
  frame = 0,
}) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const dx = shake * Math.sin(frame * 1.7) * 0.6;
    const dy = shake * Math.sin(frame * 2.3 + 1) * 0.4;
    camera.position.set(position[0] + dx, position[1] + dy, position[2]);
    camera.lookAt(target[0] + dx * 0.5, target[1] + dy * 0.5, target[2]);
  }, [camera, position, target, shake, frame]);
  return null;
};

/** 背景色と霧。霧で遠くを背景色に溶かすと、ポリゴン調の奥行きが出る */
export const Atmosphere: React.FC<{ color: string; fogNear?: number; fogFar?: number }> = ({
  color,
  fogNear = 10,
  fogFar = 80,
}) => {
  const { scene } = useThree();
  useLayoutEffect(() => {
    scene.background = new THREE.Color(color);
    scene.fog = new THREE.Fog(color, fogNear, fogFar);
  }, [scene, color, fogNear, fogFar]);
  return null;
};

/** 3D座標 → 画面上のピクセル座標（ラベルを3Dの物に合わせるときに使う） */
export function projectToScreen(point: Vec3, camera: { position: Vec3; target: Vec3 }, fov = CAMERA_FOV): { x: number; y: number } {
  const cam = new THREE.PerspectiveCamera(fov, WIDTH / HEIGHT, 0.1, 2000);
  cam.position.set(...camera.position);
  cam.lookAt(...camera.target);
  cam.updateMatrixWorld();
  const v = new THREE.Vector3(...point).project(cam);
  return { x: ((v.x + 1) / 2) * WIDTH, y: ((1 - v.y) / 2) * HEIGHT };
}
