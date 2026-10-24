# TikTok 自動運用エージェント

方向性の違う6つのTikTokアカウントについて、**競合調査 → 企画 → 毎朝の承認 → 動画作成 → 投稿**を自動化するプロジェクトです。

いま動くのは次のところまでです（[設計メモ](docs/design.md)）。
- **フェーズ1**：競合調査・企画・Slackでの承認
- **フェーズ2**：動画作成（ポリゴン調3D・モーショングラフィックス）。いまは日本史を毎日、宇宙と深海と心理学を1日おきに交互に作ります（1日2本）。都市伝説・20XX年の日本は休止中、漫画のアカウントは準備中です。
- **フェーズ3**：公開OKにした動画と投稿文を、指定のフォルダ（Googleドライブなど）に保存。投稿はスマホから行います（自動投稿も使えますが任意）。再生数を企画に生かすしくみはこれからです。

## 毎日の流れ

1. 毎朝6:30に、その日の担当アカウントの競合調査と企画づくりが始まります（時刻は変更可）。
   - 毎日作るか、2日に1回作るかは、アカウントごとに `config/accounts.yaml` の `schedule` で決めています。
2. 7時ごろ、Slackに「今日の企画一覧」と、アカウントごとに3案ずつ届きます。
3. 各アカウントについて、次のどれかを押します。
   - **案Aで決定 / 案Bで決定 / 案Cで決定**：その場で動画づくりが始まります
   - **✏️ 修正を指示する**：「もっと怖く」「案Aの方向で別ネタ」などを書くと、3案を作り直します
   - **⏭ 今日はスキップ**
4. 決定した企画は、1本ずつ順番に動画になります。1本あたり10〜20分ほどかかります。
   1. 台本エージェントが台本を書く
   2. VOICEVOXでナレーションを作る
   3. 動画作成エージェントが映像のコードを書き、静止画で見た目を確かめながら直す
   4. 動画に書き出す
5. 完成すると、企画のメッセージのスレッドに動画が届きます。
   - **✅ 公開OK**：動画と投稿文（説明文＋ハッシュタグ）が、保存先のフォルダ（`.env` の `EXPORT_DIR`）に保存されます。スレッドにも投稿文だけのメッセージが届くので、長押しでコピーできます
   - **✏️ 作り直す**：「映像だけ直す」か「台本から作り直す」を選び、直してほしいことを書きます
   - 台本エージェントが「自信なし」とした事実は、**⚠️ 確認してほしい事実**として一緒に届きます

そのほかの使い方：
- **参考動画の登録**：伸びているTikTok動画のURLをチャンネルに貼ると、「どのアカウントの参考にするか」を聞かれます。選ぶと、翌日以降の競合調査に反映されます。
- **今すぐ作る**：チャンネルに `企画作成` と書くと、その場で今日の企画づくりを始めます（すでにできている分は作り直しません）。

## セットアップ（Windows）

### 1. 必要なものをインストール
- [Node.js](https://nodejs.org/ja)（LTS版、バージョン22以上）
- [Git for Windows](https://gitforwindows.org/)
- [VOICEVOX](https://voicevox.hiroshiba.jp/)（ナレーション用の無料ソフト）

### 2. コードを取得
PowerShell で次を実行します。
```powershell
git clone https://github.com/taiki0913/tiktok.git
cd tiktok
npm install
copy .env.example .env
```

### 3. Claude の APIキー
1. https://console.anthropic.com/ にログインし、APIキーを発行します。
2. `.env` の `ANTHROPIC_API_KEY=` に貼り付けます。

### 4. Slack アプリ
1. 企画を受け取るチャンネルを作ります（例：`#tiktok-plans`）。
2. https://api.slack.com/apps →「Create New App」→「From a manifest」→ ワークスペースを選び、このリポジトリの `slack-app-manifest.yaml` の中身を貼り付けて作成します。
3. 「Install to Workspace」でインストールします。
4. 「OAuth & Permissions」の **Bot User OAuth Token**（`xoxb-`で始まる）を、`.env` の `SLACK_BOT_TOKEN` に貼ります。
5. 「Basic Information」→「App-Level Tokens」→「Generate Token and Scopes」で、`connections:write` を付けてトークンを作ります。**`xapp-`で始まるトークン**を `SLACK_APP_TOKEN` に貼ります。
6. 手順1のチャンネルで `/invite @tiktok-agent` と送り、ボットを招待します（候補に「TikTok企画エージェント」と表示されます）。
7. チャンネル名を右クリック →「リンクをコピー」。URLの末尾にある `C` で始まる文字列を `SLACK_CHANNEL_ID` に貼ります。
8. `npm run slack:test` を実行し、チャンネルに「接続テスト」のメッセージが届けば完了です。

### 5. YouTube の APIキー（競合調査用・無料）
1. https://console.cloud.google.com/ でプロジェクトを作ります。
2. 「APIとサービス」→「ライブラリ」で **YouTube Data API v3** を有効にします。
3. 「認証情報」→「認証情報を作成」→「APIキー」で作ったキーを、`.env` の `YOUTUBE_API_KEY` に貼ります。
   キーの制限で「YouTube Data API v3」だけを許可しておくと安全です。

### 6. VOICEVOX と BGM（動画づくり用）
- **VOICEVOX**：アプリを起動しておくだけで使えます（起動していないと、ナレーションなしの動画になります）。
  声はアカウントごとに `config/accounts.yaml` の `voice` で決めています。キャラクターごとに利用規約があるので、[公式サイト](https://voicevox.hiroshiba.jp/)で確認してください。クレジット（「VOICEVOX:キャラ名」）は動画の中には入れず、投稿文の最後に自動で入ります。
- **BGM**：アカウントごとに、プログラムで作曲したオリジナル曲が2曲ずつ入っています（`public\bgm\`）。利用規約やクレジット表記を気にせず使えます。曲を足したいときは `public\bgm\README.md` を見てください。

### 7. お試し実行（Slackには送りません）
```powershell
npm run plan:dry -- --account cosmos       # 企画を3案作る（Claude API 約$0.2）
npm run video:sample                       # 見本の動画を書き出す（Claude API は使わない）
npm run produce:dry -- --account cosmos    # お試しで作った案Aから動画を1本作る（Claude API 約$1）
```
- `video:sample` は、VOICEVOX・BGM・動画の書き出しがPCで動くかの確認用です。`out\sample-future.mp4` ができれば成功です。初回は、書き出し用のChromeが自動でダウンロードされます（数分かかります）。
- `produce:dry` の動画は `data\videos\` にできます。`--index 1` で案Bから作れます。
- `npm run export -- --account cosmos` で、そのアカウントのいちばん新しい動画の投稿文（説明文＋ハッシュタグ）を表示し、動画と投稿文を保存先（`EXPORT_DIR`）に保存します。お試しで作った動画を投稿したいときに使います。`--rerender` を付けると、今の設定で書き出し直してから保存します（以前の動画からクレジット表記を消すときなど。Claude API は使いません）。

### 8. TikTokアカウントを作る
6アカウント分のプロフィール（名前・ID・自己紹介・写真）の案と、収益化のための注意点を [docs/tiktok-accounts.md](docs/tiktok-accounts.md) にまとめています。写真は画像生成AIで作ります（プロンプトは [docs/icon-prompts.md](docs/icon-prompts.md)）。

### 9. 動画の保存先（Googleドライブ）
公開OKにした動画は、日付ごとのフォルダに保存されます。
```
<保存先>\2026-10-22\1900_知られざる日本史.mp4   … 動画
<保存先>\2026-10-22\1900_知られざる日本史.txt   … 投稿文（説明文＋ハッシュタグ。そのまま貼り付けられる）
```
ファイル名の先頭の4桁は、投稿の目安の時刻（`config/accounts.yaml` の `postTime`）です。

保存先をGoogleドライブにすると、スマホのGoogleドライブアプリからすぐ使えます。
1. [パソコン版 Google ドライブ](https://www.google.com/intl/ja/drive/download/) を入れてログインします。エクスプローラーに「Google Drive（G:）」が出てきます。
2. 「マイドライブ」の中に `TikTok` フォルダを作ります。
3. `.env` に保存先を書きます（ドライブの文字や名前は、エクスプローラーで見えているとおりにしてください）。
   ```
   EXPORT_DIR=G:\マイドライブ\TikTok
   ```
   空のときは、このフォルダの中の `export` に保存されます。

**スマホからの投稿**：Googleドライブアプリで動画を開き、「︙」→「コピーを送信」→「ビデオを保存」で写真アプリに保存します。TikTokアプリでその動画を選び、Slackの投稿文（または .txt の中身）を貼り付けて投稿します。

### 10. （任意）TikTokへの自動投稿（Upload-Post）
使わなくても大丈夫です。`UPLOAD_POST_API_KEY` を設定したときだけ、公開OKの動画を投稿時刻に自動で予約投稿します（保存もこれまでどおり行います）。
TikTok への自動投稿は、TikTok の審査を通った投稿サービス **Upload-Post** を通して行います（自作のアプリでは、TikTok の審査を通るまで「自分だけに公開」の投稿しかできないため）。

1. https://www.upload-post.com/ に登録し、TikTok に投稿できる有料プランを選びます（無料プランでは TikTok に投稿できません）。料金とプロフィール数（つなげる TikTok アカウントの数）は料金ページで確認してください。
2. Upload-Post の画面で API キーを発行し、`.env` の `UPLOAD_POST_API_KEY` に貼ります。
3. 次を実行します。アカウントごとに Upload-Post のプロフィールを作り、TikTok をつなぐためのURLを表示します。
   ```powershell
   npm run posting:setup
   ```
4. 表示されたURLをアカウントごとに開き、TikTok を選んで、**そのアカウントの TikTok** でログインします。
   - 別のアカウントと取り違えないよう、URLは1つずつ**シークレットウィンドウ**（Ctrl+Shift+N）で開いてください。
   - ログインは「QRコード」を選び、スマホの TikTok アプリ（そのアカウントに切り替えておく）で読み取るのが簡単です。
5. もう一度 `npm run posting:setup` を実行し、すべて ✅ になれば完了です。
6. （試したいとき）`npm run posting:test -- --account cosmos` で、`data\videos\` のいちばん新しい動画を「自分だけに公開」で投稿します。確認したら TikTok アプリから削除してください。

### 11. 本番起動
```powershell
npm start
```
起動しておくと、毎朝決まった時刻にSlackへ企画が届き、ボタン操作を受け付けます。
- 予定時刻（6:30）より後にPCを起動した日は、起動時に今日の分を作ります（15時まで）。
- 作りかけの動画があった場合は、起動時に続きから作ります。

### 12. PC起動時に自動で立ち上げる
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\register-task.ps1
```
ログは `logs\agent.log` に記録されます。

> **スリープに注意**：PCがスリープすると止まります。「設定 → システム → 電源」で、電源接続時はスリープしない設定にしてください。
> また、Windows Update などで再起動したあとは、Windowsにログオンするまで起動しません。

## 設定を変える

| 変えたいもの | 場所 |
|---|---|
| アカウントのジャンル・トーン・ルール・競合調査の検索語 | `config/accounts.yaml` |
| 動画の見た目の方針・強調色・ナレーションの声 | `config/accounts.yaml` の `visual`・`accent`・`voice` |
| 企画が届く時刻 | `.env` の `MORNING_CRON`（例：`0 6 * * *` で6:00開始） |
| 投稿の目安の時刻（ファイル名の先頭） | `config/accounts.yaml` の `postTime` |
| 動画と投稿文の保存先 | `.env` の `EXPORT_DIR` |
| 企画を作る日（毎日・2日に1回など）・休止 | `config/accounts.yaml` の `schedule`・`active` |
| Web検索で今週の話題も調べる（費用が約3倍になります） | `.env` の `RESEARCH_WEB_SEARCH=true` |

## 費用の目安
- 企画づくり（Claude API）：1アカウントあたり約$0.2。いまの回し方（1日2アカウント）で月 $10〜15 程度
- 動画づくり（Claude API）：1本あたり約$2.5〜3.5。いまの回し方（1日2本）で月 $150〜210 程度（作り直しの回数で変わります）
- （任意）自動投稿（Upload-Post）：TikTok に投稿できる有料プランが必要です。比較記事では、5プロフィールまでのプランが月 $24 前後とされています（2026年7月時点。最新の料金は公式の料金ページで確認してください）
- YouTube Data API・VOICEVOX：無料

> **Remotion のライセンス**：動画づくりに使っている Remotion は、個人と従業員3人以下の会社は無料、それより大きい会社は有料のライセンスが必要です。詳しくは https://www.remotion.dev/license を確認してください。

## プログラムを最新にする
PowerShellで `tiktok` フォルダに移動し、次を実行します（動いている `npm start` は Ctrl+C で止めてから）。
```powershell
.\update
npm start
```
`git pull` で「package-lock.json would be overwritten」と出て止まるときも、これで直ります。

## 開発者向け

```powershell
npm run check          # 型チェック
npm test               # テスト
npm run video:studio   # 深海の試作をブラウザでプレビュー
npm run icons          # プロフィール写真を assets/profile-icons/ に書き出す
```

| フォルダ | 中身 |
|---|---|
| `src/research/` | 競合調査エージェント（YouTube公式API・TikTok公式oEmbed。Web検索は既定で無効） |
| `src/planning/` | 企画エージェント |
| `src/production/` | 動画づくり（台本エージェント・VOICEVOX・動画作成エージェント・書き出し・順番待ち） |
| `src/slack/` | Slackボット（企画の承認・修正指示・参考動画の登録・動画の確認・投稿予約の取り消し） |
| `src/posting/` | TikTokへの投稿（Upload-Post での予約投稿・結果の確認） |
| `src/jobs/` | 毎朝の一括実行 |
| `src/store/` | 企画と承認状況の保存（`data/` フォルダにJSONで保存） |
| `config/accounts.yaml` | 6アカウントの設定 |
| `video/kit/` | 動画の部品集（3D・計器・グラフ・字幕・共通の外枠）。使い方は `video/kit/KIT.md` |
| `video/examples/` | 動画作成エージェントのお手本 |
| `video/icons/` | アカウントのプロフィール写真の絵（書き出し先は `assets/profile-icons/`） |
| `video/jobs/` | 1本ごとの作業フォルダ（自動で作られる） |
| `public/bgm/` | アカウントごとのBGM |
