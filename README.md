# TikTok 自動運用エージェント

方向性の違う6つのTikTokアカウントについて、**競合調査 → 企画 → 毎朝の承認 → 動画作成 → 投稿**を自動化するプロジェクトです。

いま動くのは次のところまでです（[設計メモ](docs/design.md)）。
- **フェーズ1**：競合調査・企画・Slackでの承認
- **フェーズ2**：動画作成（ポリゴン調3D・モーショングラフィックスの4アカウント）。漫画・AI映像のアカウントは準備中です。
- 投稿（フェーズ3）はこれからです。

## 毎日の流れ

1. 毎朝6:30に、6アカウント分の競合調査と企画づくりが始まります（時刻は変更可）。
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
   - **✅ 公開OK**：投稿待ちになります（投稿の自動化はフェーズ3）
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
  声はアカウントごとに `config/accounts.yaml` の `voice` で決めています。キャラクターごとに利用規約があるので、[公式サイト](https://voicevox.hiroshiba.jp/)で確認してください。動画には「VOICEVOX:キャラ名」のクレジットが自動で入ります。
- **BGM**：`public\bgm\<アカウントID>\` に、商用利用できるフリー音源を2〜3曲入れてください（詳しくは `public\bgm\README.md`）。

### 7. お試し実行（Slackには送りません）
```powershell
npm run plan:dry -- --account cosmos       # 企画を3案作る（Claude API 約$0.2）
npm run video:sample                       # 見本の動画を書き出す（Claude API は使わない）
npm run produce:dry -- --account cosmos    # お試しで作った案Aから動画を1本作る（Claude API 約$1）
```
- `video:sample` は、VOICEVOX・BGM・動画の書き出しがPCで動くかの確認用です。`out\sample-future.mp4` ができれば成功です。初回は、書き出し用のChromeが自動でダウンロードされます（数分かかります）。
- `produce:dry` の動画は `data\videos\` にできます。`--index 1` で案Bから作れます。

### 8. 本番起動
```powershell
npm start
```
起動しておくと、毎朝決まった時刻にSlackへ企画が届き、ボタン操作を受け付けます。
- 予定時刻（6:30）より後にPCを起動した日は、起動時に今日の分を作ります（15時まで）。
- 作りかけの動画があった場合は、起動時に続きから作ります。

### 9. PC起動時に自動で立ち上げる
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
| Web検索で今週の話題も調べる（費用が約3倍になります） | `.env` の `RESEARCH_WEB_SEARCH=true` |

## 費用の目安
- 企画づくり（Claude API）：6アカウント×毎日で、月 $30〜50 程度
- 動画づくり（Claude API）：1本あたり約$1。4アカウント×毎日で月 $120 前後（作り直しの回数で変わります）
- YouTube Data API・VOICEVOX：無料

> **Remotion のライセンス**：動画づくりに使っている Remotion は、個人と従業員3人以下の会社は無料、それより大きい会社は有料のライセンスが必要です。詳しくは https://www.remotion.dev/license を確認してください。

## 開発者向け

```powershell
npm run check          # 型チェック
npm test               # テスト
npm run video:studio   # 深海の試作をブラウザでプレビュー
```

| フォルダ | 中身 |
|---|---|
| `src/research/` | 競合調査エージェント（YouTube公式API・TikTok公式oEmbed。Web検索は既定で無効） |
| `src/planning/` | 企画エージェント |
| `src/production/` | 動画づくり（台本エージェント・VOICEVOX・動画作成エージェント・書き出し・順番待ち） |
| `src/slack/` | Slackボット（企画の承認・修正指示・参考動画の登録・動画の確認） |
| `src/jobs/` | 毎朝の一括実行 |
| `src/store/` | 企画と承認状況の保存（`data/` フォルダにJSONで保存） |
| `config/accounts.yaml` | 6アカウントの設定 |
| `video/kit/` | 動画の部品集（3D・計器・グラフ・字幕・共通の外枠）。使い方は `video/kit/KIT.md` |
| `video/examples/` | 動画作成エージェントのお手本 |
| `video/jobs/` | 1本ごとの作業フォルダ（自動で作られる） |
| `public/bgm/` | アカウントごとのBGM |
