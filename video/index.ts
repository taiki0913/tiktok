// 動画（Remotion）の入口。
//   npm run video:studio … ブラウザでプレビュー
//   npm run video:render … out/ に mp4 を書き出す
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
