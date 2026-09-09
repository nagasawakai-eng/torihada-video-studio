# TORIHADA 研修動画スタジオ

研修資料(PPTX)をもとに、スライドごとの台本を編集し、音声読み上げ(Fish Audio)を載せて
1本のMP4動画として書き出すための社内ツールです。

既存の `torihada-pptx-editor`（テキスト内容の編集・イラスト差し込みツール）とは別プロジェクトです。
資料そのものの編集は行わず、「台本入力 → 音声化 → 動画化」に特化しています。

## できること

- 週(week1〜week4)ごとにPPTX資料を登録
- スライド画像を自動生成してプレビュー表示
- スライドごとに台本テキストを入力・保存
- 台本を1枚だけ試聴（Fish Audio TTS）してから確定できる
- 全スライド分をまとめてMP4として書き出し・ダウンロード
- 台本や声・速度を変えていない場合は音声/動画の再生成をスキップ（キャッシュ）して高速化

## セットアップ

```bash
npm install
cp .env.example .env
# .env に FISHAUDIO_API_KEY を設定
npm start
```

ローカル実行には以下が必要です。

- LibreOffice（`soffice`コマンド）: PPTX→PDF変換に使用
- ffmpeg: 動画の合成に使用

Windowsの場合は LibreOffice を通常のインストーラでインストールしてください
(`C:\Program Files\LibreOffice\program\soffice.exe` を自動検出します)。

## 資料(PPTX)の登録

`materials/week1.pptx` 〜 `materials/week4.pptx` に配置するか、画面上の「資料を差し替え」から
アップロードしてください。week4はまだ資料が無い状態で初期化されています。

## Railwayへのデプロイ

このリポジトリには `Dockerfile` が含まれており、Railwayが自動でDockerビルドします。

1. GitHubに新規リポジトリを作成しこのフォルダをpush
2. Railwayで「New Project」→「Deploy from GitHub repo」で選択
3. Railwayの Variables に以下を設定
   - `FISHAUDIO_API_KEY`
   - `GOOGLE_CLIENT_ID` / `ALLOWED_DOMAIN` / `SESSION_SECRET`（社内限定公開用。下記手順で取得）
4. デプロイ完了後に発行されるURLが新しいエディターのリンクになります

既存の `torihada-pptx-editor` サービスとは別のRailwayサービスとして作成してください
（同じサービスを上書きしないよう注意）。

## 社内限定公開（Googleログイン）の設定手順

このアプリは `GOOGLE_CLIENT_ID` を設定すると、`@torihada.co.jp` のGoogleアカウントを
持つ人だけがログインして使えるようになります（未設定なら誰でも認証なしでアクセスできます）。

1. https://console.cloud.google.com/ にアクセスし、プロジェクトを作成（既存のものでも可）
2. 左メニュー「APIとサービス」→「OAuth同意画面」で、ユーザータイプを「内部」に設定
   （Google Workspaceのドメイン内アカウントに公開範囲を限定できます）
3. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」
   - アプリケーションの種類: 「ウェブ アプリケーション」
   - 承認済みのJavaScript生成元: RailwayのURL（例 `https://xxxx.up.railway.app`）と
     ローカル確認用に `http://localhost:3000` を追加
   - リダイレクトURIの設定は不要（Googleのポップアップ方式のログインのため）
4. 発行された「クライアントID」を Railway の環境変数 `GOOGLE_CLIENT_ID` に設定
5. `SESSION_SECRET` に適当なランダム文字列を設定（`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` で生成可能）
6. `ALLOWED_DOMAIN` は既定で `torihada.co.jp`。変更する場合のみ設定

設定後は `/`にアクセスすると自動的に `/login` へ案内され、Googleログインボタンから
社内アカウントでログインするとそのまま使えます。ログアウトは画面右上のボタンから。

## ディレクトリ構成

```
server/           Expressサーバー本体
  lib/pptx.js     PPTXからスライドごとのテキストを抽出（参照表示用）
  lib/render.js   PPTX→PDF(LibreOffice)→PNG(pdf-to-img) でスライド画像を生成
  lib/tts.js      Fish Audio 音声合成
  lib/video.js    台本+スライド画像 → 動画セグメント → 結合 のジョブ管理
  lib/store.js    週設定・台本(JSON)・資料ファイルの読み書き
public/           フロントエンド（素のHTML/CSS/JS）
data/weeks.json   週の一覧設定
data/scripts/     週ごとの台本(JSON)。week1は旧エディターの台本を引き継ぎ済み
materials/        週ごとのPPTX資料
preview/          生成したスライドPNGのキャッシュ（gitignore対象）
```

## 今後AIによる台本自動生成を追加する場合

`.env` に `ANTHROPIC_API_KEY` を設定した上で、`server/lib/` に生成ロジックを追加し、
台本編集画面に「AI下書き生成」ボタンを追加する形で拡張できます（現時点では未実装）。
