# 動画の部品集（video/kit）の使い方

動画作成エージェントが `Video.tsx` を書くための説明書です。

## あなたが書くもの
- `video/jobs/<ジョブID>/Video.tsx` に `export const Video: React.FC<{ job: JobData }>` を書く。
  - 同じフォルダに部品のファイル（例: `Scene.tsx`）を追加してもよい。
- **字幕・ナレーション・BGM・クレジット・締めの画面は、共通の外枠（JobFrame）が出す。** Video では描かない。
- `job.endCard.from` 以降は、外枠が黒い締めの画面で覆う。映像は `job.endCard.from` までを作り込めばよい。

## job（JobData）の中身
- `job.scenes[i]`：`from`（開始フレーム）・`durationInFrames`・`caption`（字幕）・`narration`（読み上げ）・`visual`（映像の指示）・`onScreen`（画面に出す数字やラベル）
- `job.accent`：強調色（字幕と同じ色。数字やラベルの強調に使う）
- `job.visual`：アカウントの見た目の方針。**必ずこれに合わせる**
- `job.fps` は 30、画面は 1080×1920（縦長）

## 画面の配置（TikTok の表示に隠れない範囲）
- 上端 y < 140：TikTok の上部の表示に隠れる。重要なものを置かない（y=108 に外枠のクレジットが出る）
- **y 1250〜1460：外枠の字幕が出る。** ここには何も置かない
- 下端 y > 1460：TikTok の説明文やアカウント名に隠れる
- 右端 x > 960（y 700〜1700）：いいね等のボタンに隠れる
- → **重要な文字・数字・グラフは x 60〜960、y 140〜1230 に置く**

## 必ず守ること
1. **アニメーションは `useCurrentFrame()` のフレーム番号だけで決める。** `Math.random()`・`Date`・`setTimeout`・`useFrame`（react-three-fiber）は使わない。乱数は remotion の `random("シード文字列")` を使う（毎回同じ値になる）。
2. **HTMLの文字や板は必ず重ね合わせの層に置く。** 3D（ThreeCanvas）の後に置く要素は `<AbsoluteFill>`（remotion）で包むか、`position: "absolute"` を付ける。そうしないと画面の外に押し出されて映らない。`Panel`・`BigNumber`・`Tag`・`Callout`・グラフは x, y を渡せば自動で absolute になる（`Chip` だけは包む必要がある）。
3. 外部のURL・画像・フォント・ネットワークは使わない。形はすべて部品か three.js の基本形状で作る。
4. 文字は `FONT_FAMILY`（Noto Sans JP）で、太さは 700 か 900 だけを使う。
5. 画面に出す数字・事実は `job.scenes[].onScreen` と `narration` にあるものだけ。新しい数字を作らない。
6. ポリゴン調のアカウントでは、CGで再現した映像であることを `Tag`（例：「CGによる再現」「想像図」）で示す。
7. 3Dの物は合計 600 個程度までにする（多すぎると書き出しが遅くなる）。

## 良い動画にするために
- 最初の2秒で目を引く（大きな数字・意外な絵・カメラの急な動き）。
- 2〜3秒ごとに何かが変わる（カメラが動く・物が現れる・数字が動く・グラフが伸びる）。
- 場面ごとに見た目をはっきり変える。場面の切り替わり（`scene.from`）に合わせて演出を切り替える。
- 数字は大きく、ラベルは短く。1画面で伝えることは1つ。

## 部品一覧（`import { ... } from "../../kit";`）

### 3D（`<ThreeCanvas width={WIDTH} height={HEIGHT} camera={{ fov: CAMERA_FOV, near: 0.1, far: 500 }}>` の中に置く）
| 部品 | 主な props | 説明 |
|---|---|---|
| `CameraRig` | position, target, shake?, frame? | カメラを置いて target を向く。shake で揺れ（地震など） |
| `cameraPath(frame, keys)` | keys: `{ frame, position, target }[]` | キーフレームの間をなめらかに補間した position/target を返す関数 |
| `Atmosphere` | color, fogNear?, fogFar? | 背景色と霧（遠くを背景色に溶かす） |
| `Lights` | preset: "day"/"dusk"/"night"/"underwater"/"space", intensity? | 光のセット |
| `Ground` | size?, color?, y?, roughness? | 少し凸凹した地面 |
| `Water` | frame, size?, color?, y?, waveHeight? | 波打つ水面 |
| `Stars` | count?, radius?, size? | 星空 |
| `Particles` | box: {center,size}, count?, color?, size?, drift?, frame? | 漂う粒子（雪・マリンスノー・ほこり・火の粉） |
| `House` | position, rotationY?, width?, depth?, height?, wallColor?, roofColor?, roof?, lights?, tilt? | 一戸建て。lights=窓明かり、tilt=傾き |
| `Building` | position, width?, depth?, height?, color?, windowsLit? | ビル（窓つき） |
| `EdoHouse` | position, rotationY?, width?, depth?, height?, wallColor?, roofColor?, lights? | 江戸の町家・長屋 |
| `Person` | position, rotationY?, color?, height?, walk?, kimono? | 顔のない人。walk にフレームを渡すと歩く |
| `Tree` | position, height?, color?, kind?: "round"/"pine" | 木 |
| `Road` | from, to, width?, color? | 中央線つきの道路 |
| `Car` | position, rotationY?, color? | 車 |
| `Lantern` | position, color?, glow?, kind?: "chochin"/"andon" | 光る提灯・行灯 |
| `Kofun` | position, rotationY?, size?, color? | 前方後円墳 |
| `Mountain` | position, radius?, height?, color?, snow? | 山 |
| `Rock` | position, size?, color?, seed? | 岩 |
| `Fish` | position, rotationY?, color?, scale?, frame? | 魚（+X 方向が頭） |
| `Jellyfish` | position, frame, color?, scale? | 光るクラゲ |
| `Submersible` | position, frame, lightPower?, lightTarget?, scale? | 潜水艇とライト |
| `Planet` | position, radius, color, color2?, detail?, ring? | 惑星（ポリゴン調・輪も可） |
| `Sun` | position, radius, color?, intensity? | 光る恒星 |

単純な形は three.js の要素を直接使ってよい（例：`<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="#888" flatShading /></mesh>`）。ポリゴン調にするため `flatShading` を付ける。

### 画面の部品（HTML。座標は 1080×1920 のピクセル）
| 部品 | 主な props | 説明 |
|---|---|---|
| `BigNumber` | x, y, label, value, unit?, color?, size? | 大きな数字（ラベル付き） |
| `Chip` | label, value, color? | 小さな値の表示（`<AbsoluteFill>` や absolute の div で包む） |
| `Tag` | text, x, y, color?, opacity? | 小さな札（「CGによる再現」「通説」など） |
| `Panel` | x, y, width?, children | 半透明の板（自由に中身を入れる） |
| `Callout` | targetX, targetY, title, lines?, color?, progress?, side? | 画面上の点を指すラベル |
| `VerticalGauge` | x, y, height, value, marks, toRatio | 縦の目盛り（深度計・年表・高さ比べ） |
| `BarChart` | x, y, width, height, items, max?, unit?, progress?, title?, source? | 棒グラフ（progress で伸びる） |
| `LineChart` | x, y, width, height, series, xMin, xMax, yMin, yMax, xTicks?, yTicks?, progress?, title?, source? | 折れ線グラフ |

### 便利な関数
- `countUp(frame, from, to, startFrame, durationFrames)`：数が増えていく（減速つき）
- `appear(frame, startFrame, durationFrames?)`：0→1 の出現度合い（フェード・スライドに使う）
- `formatNumber(n, digits?)`：「12,345」の形
- `projectToScreen(point3D, { position, target })`：3Dの点が画面のどこに映るか（Callout を3Dの物に合わせる）
- remotion の `interpolate`・`interpolateColors`・`Easing`・`random`・`AbsoluteFill`・`Sequence`

## お手本
- `video/examples/future-population/Video.tsx`：町・人・人口カウンター・折れ線グラフ（外枠 JobFrame を使う形。**この形で書く**）
- `video/deepsea/`：深海の試作（外枠を使わない古い形。3Dの演出・計器の参考に）
