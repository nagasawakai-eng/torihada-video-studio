# TORIHADA 研修動画スタジオ

## 📒 プロジェクトノート（Obsidian）

作業を開始・再開する前に、以下のObsidianノートを読むこと。
現状・再開手順・次のステップ・作業ログがまとまっている。

- **このプロジェクトのノート:** `C:\Users\長澤開\Obsidian\project\torihada-video-studio.md`
- **プロジェクト索引:** `C:\Users\長澤開\Obsidian\project\_index.md`

作業を進めたら、上記ノートの「現在の状態」「次のステップ」「作業ログ」を更新すること。

## プロジェクト概要

研修資料(PPTX)をもとに、スライドごとの台本を編集し、Fish Audioの音声読み上げを載せて
1本のMP4動画として書き出すための社内ツール。

既存の `torihada-pptx-editor`（別リポジトリ、資料のテキスト内容編集・イラスト差し込み用）
とは別プロジェクト。資料そのものの編集は行わず「台本入力 → 音声化 → 動画化」に特化している。

## 技術スタック

- Node.js / Express
- LibreOffice（`soffice`、PPTX→PDF変換）+ `pdf-to-img`（PDF→PNG、Node製・poppler不要）
- ffmpeg（動画結合）
- Fish Audio API（TTS）
- google-auth-library（Googleログイン、`@torihada.co.jp`ドメイン限定の社内公開用）
- フロントエンドは素のHTML/CSS/JS（ビルド不要）

## デプロイ

- GitHubリポジトリ: https://github.com/nagasawakai-eng/torihada-video-studio （Public）
- Railway（Dockerfileベース）を想定。既存の`torihada-pptx-editor`とは別サービスとして作成すること
- **永続ボリュームを`/data-persist`にマウントし、`DATA_DIR=/data-persist/data` /
  `MATERIALS_DIR=/data-persist/materials` を設定すること。**未設定だと再デプロイ・再起動で
  台本編集・資料アップロードが消える（旧`torihada-pptx-editor`で実際に発生した不具合と同じ原因）
- 詳細な環境変数・Google OAuth設定手順は `README.md` 参照

## ファイル構成

```
torihada-video-studio/
├── CLAUDE.md
├── README.md
├── Dockerfile
├── server/
│   ├── index.js        # Expressルーティング・認証ミドルウェア組み込み
│   └── lib/
│       ├── auth.js      # Googleログイン検証・セッションCookie
│       ├── pptx.js       # PPTXテキスト抽出
│       ├── render.js     # PPTX→PNGスライド画像生成（同時実行ロック付き）
│       ├── tts.js        # Fish Audio連携
│       ├── video.js      # 台本+画像→動画セグメント→結合ジョブ管理
│       └── store.js      # 週設定・台本(JSON)・資料ファイルの読み書き
├── public/               # フロントエンド（index.html / login.html / app.js / styles.css）
├── data/weeks.json       # 週の一覧設定
├── data/scripts/         # 週ごとの台本(JSON)
└── materials/            # 週ごとのPPTX資料
```
