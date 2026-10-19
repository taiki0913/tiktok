# TikTok 自動運用エージェント

方向性の違う6つのTikTokアカウントについて、**競合調査 → 企画 → 毎朝の承認 → 動画作成 → 投稿**を自動化するプロジェクトです。

いま動くのは**フェーズ1（競合調査・企画・Slackでの承認）**です。動画作成と投稿はフェーズ2・3で追加します（[設計メモ](docs/design.md)）。

## 毎朝の流れ（フェーズ1）

1. 毎朝6:30に、6アカウント分の競合調査と企画づくりが始まります（時刻は変更可）。
2. 7時ごろ、Slackに「今日の企画一覧」と、アカウントごとに3案ずつ届きます。
3. 各アカウントについて、次のどれかを押します。
   - **案Aで決定 / 案Bで決定 / 案Cで決定**
   - **✏️ 修正を指示する**：「もっと怖く」「案Aの方向で別ネタ」などを書くと、3案を作り直します
   - **⏭ 今日はスキップ**
4. 6アカウントすべて決まると、Slackに通知が届きます。

そのほかの使い方：
- **参考動画の登録**：伸びているTikTok動画のURLをチャンネルに貼ると、「どのアカウントの参考にするか」を聞かれます。選ぶと、翌日以降の競合調査に反映されます。
- **今すぐ作る**：チャンネルに `企画作成` と書くと、その場で今日の企画づくりを始めます（すでにできている分は作り直しません）。

## セットアップ（Windows）

### 1. 必要なものをインストール
- [Node.js](https://nodejs.org/ja)（LTS版、バージョン22以上）
- [Git for Windows](https://gitforwindows.org/)

### 2. コードを取得
PowerShell で次を実行します。
```powershell
git clone https://github.com/<オーナー名>/<リポジトリ名>.git tiktok-agents
cd tiktok-agents
npm install
copy .env.example .env
```

### 3. Claude の APIキー
1. https://console.anthropic.com/ にログインし、APIキーを発行します。
2. `.env` の `ANTHROPIC_API_KEY=` に貼り付けます。

### 4. Slack アプリ
1. 企画を受け取るチャンネルを作ります（例：`#tiktok-企画`）。
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

### 6. お試し実行（Slackには送りません）
```powershell
npm run plan:dry -- --account history
```
「知られざる日本史」の調査結果と3案が画面に表示されれば成功です。

### 7. 本番起動
```powershell
npm start
```
起動しておくと、毎朝決まった時刻にSlackへ企画が届き、ボタン操作を受け付けます。予定時刻（6:30）より後にPCを起動した日は、起動時に今日の分を作ります（15時まで）。

### 8. PC起動時に自動で立ち上げる
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
| 企画が届く時刻 | `.env` の `MORNING_CRON`（例：`0 6 * * *` で6:00開始） |
| Web検索で今週の話題も調べる（費用が約3倍になります） | `.env` の `RESEARCH_WEB_SEARCH=true` |

## 費用の目安（フェーズ1）
- Claude API：6アカウント×毎日で、月 $30〜50 程度（修正指示の回数で変わります。Web検索を有効にすると月 $120 前後）
- YouTube Data API：無料枠内

## 開発者向け

```powershell
npm run check   # 型チェック
npm test        # テスト
```

| フォルダ | 中身 |
|---|---|
| `src/research/` | 競合調査エージェント（YouTube公式API・Web検索・TikTok公式oEmbed） |
| `src/planning/` | 企画エージェント |
| `src/slack/` | Slackボット（承認ボタン・修正指示・参考動画の登録） |
| `src/jobs/` | 毎朝の一括実行 |
| `src/store/` | 企画と承認状況の保存（`data/` フォルダにJSONで保存） |
| `config/accounts.yaml` | 6アカウントの設定 |
