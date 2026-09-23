# Project: FF14 Craft & Market Tracker

FF14（ファイナルファンタジーXIV）日本全32ワールドのリアルタイムマーケット相場・7日間取引履歴・クラフトレシピツリーを統合した高機能トラッカーです。

## Architecture & Conventions

### 1. Project Structure
- `frontend/`: React 19, TypeScript, Vite, Tailwind CSS (PC ワイド画面 & モバイル 100dvh スワイプUI)
- `backend/`: Python 3.12, Asyncio, HTTPX, SQLite (高速統合データパイプライン)
- `.github/workflows/`:
  - `market_listings_pipeline.yml`: 30分間隔の自動データ収集・集計
  - `deploy.yml`: GitHub Pages への自動デプロイ
- `data/`: アイテムマスター及びキャッシュ用 SQLite DB (`ff14_craft.db`)

### 2. Core Guidelines
詳細なコーディング・設計規約は `DEVELOPMENT_RULES.md` を参照してください。

- **パフォーマンスの最優先**:
  - `marketData` やアイテム走査に O(N) の多重ループを禁止。必ず `Map` や `Set` による O(1) 参照を徹底すること。
  - レシピツリー計算のメモ化と状態の局所化（State Colocation）。
- **ダークサイバー調デザインシステムの維持**:
  - 配色（`#0b0f19` 基調、グラスモーフィズム、シアン・エメラルド・パープルのアクセント）。
- **データパイプラインの安定性**:
  - 差分検知（`lastUploadTime`）による負荷軽減を維持。
  - Universalis への同時接続数は安全な範囲に制限し、HTTP 504 過負荷バックオフとスマート分割救済を維持すること。
