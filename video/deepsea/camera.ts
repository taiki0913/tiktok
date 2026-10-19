// 3Dシーンと画面上の文字（ラベル）で共有するカメラ設定。
// ラベルを3D上の物の位置に合わせるため、同じ計算で画面座標を求める。
import * as THREE from "three";
import { worldY } from "./timeline";

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const CAMERA_FOV = 75;

export function cameraPose(depth: number): { position: THREE.Vector3; target: THREE.Vector3 } {
  const y = worldY(depth);
  return {
    position: new THREE.Vector3(0, y + 0.6, 9),
    target: new THREE.Vector3(0, y - 1.6, 0),
  };
}

/** 3D座標 → 画面上のピクセル座標 */
export function projectToScreen(point: THREE.Vector3, depth: number): { x: number; y: number } {
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV, WIDTH / HEIGHT, 0.1, 1000);
  const { position, target } = cameraPose(depth);
  cam.position.copy(position);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  const v = point.clone().project(cam);
  return { x: ((v.x + 1) / 2) * WIDTH, y: ((1 - v.y) / 2) * HEIGHT };
}
