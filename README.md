# FF14 Craft & Market Tracker (FF14 クラフト・相場トラッカー)

<p align="center">
  <a href="#japanese"><strong>🇯🇵 日本語 (Japanese)</strong></a> | 
  <a href="#english"><strong>🇺🇸 English</strong></a>
</p>

---

<a name="japanese"></a>
## 🇯🇵 日本語 (Japanese)

FF14（ファイナルファンタジーXIV）の日本全データセンター（Meteor / Gaia / Mana / Elemental）32ワールドのマーケット相場データとクラフトレシピツリーを統合し、**「市場相場の動向分析」「ワールド間のサヤ取り金策」「クラフト原価・中間素材調達ルートの最適化」**を支援する高機能トラッカーです。

PCのワイド画面での本格的な分析はもちろん、**スマートフォン（モバイル）専用のフルスクリーン・スワイプ操作UI**にも完全対応しています。

---

### 🌟 主な機能

#### 1. 📊 市場分析 (Market Analysis)
- **7日間取引トレンドチャート**: 各ワールドの加重平均価格推移と販売数量を視覚的なグラフで表示。
- **直近売買履歴カードリスト**: 直近の取引履歴をHQ/NQバッジ、単価、数量、合計額、購入者名とともに表示。
- **DC内出品リスト・最安値比較**: 自ワールドだけでなく、所属DC全ワールドおよび全DCのリアルタイム出品状況を横断比較。
- **柔軟なフィルター・ソート**:
  - 日当たり販売数（日販）足切りフィルター（指定なし / 1件+ / 5件+ / 10件+ / 50件+）
  - ソート（販売速度 / 流通ギル総額 / 高額取引）
  - クリスタル素材の除外トグル、カテゴリー絞り込み、品名インクリメンタル検索

#### 2. 🪙 金策ナビ (Arbitrage / サヤ取り)
- **ワールド間価格差の自動検出**: 「他ワールドで安く仕入れ、ホームワールドで高く売る」サヤ取り機会を瞬時に抽出。
- **利益重視のランキング**: 「日商利益（価格差 × 日販速度）」および「単体利益」によるソート。
- **仕入元・販売先の同時分析**: 仕入先ワールドと販売先ワールドの取引履歴および出品状況を、画面切り替えやスワイプでワンタップ比較。
- **割安 / 割高リアルタイムガイド**: 想定仕入価格と比較し、各出品の単価横に `[● 割安 -xx%]` / `[× 割高 +xx%]` チップを自動表示。

#### 3. 🔨 クラフト原価計算・買い物リスト (Craft Optimizer)
- **再帰的レシピツリー展開**: 完成品から中間素材・末端素材へと自動でツリー分解。
- **調達ルート自動最適化**: 「中間素材の自作」「マケボ購入」「NPCショップ販売価格」を比較し、最も安上がりなルートを自動判定。
- **仕入れスコープ切り替え**: 原価計算の仕入れ基準を「全DC最安」「同DC最安」「自ワールドのみ」から選択可能。
- **中間素材製作ステップ & 調達お買い物リスト**:
  - ステップごとの製作回数・必要素材・担当クラフター職・節約金額を算出。
  - 末端素材のチェックリスト、およびゲーム内で利用しやすいクリップボードコピー機能付き。
- **製作個数スケーリング**: 製作個数（1〜99個）の変更に応じて、必要素材数・想定総原価・想定日当利益をリアルタイムに自動再計算。

#### 4. 📱 モバイル完全対応 & スマート連携 (Mobile UI & Navigation)
- **ネイティブライクなフルスクリーン体験**: アドレスバーやスクロールバウンスを制御し、スマホにジャストフィット（100dvh）。
- **水平スワイプジェスチャー**: アイテム一覧 ⇄ 詳細分析 ⇄ 出品・履歴リストを指先のスワイプでシームレスに移動（`SwipeContainer`）。
- **クラフト ⇄ 市場ダイレクト連携（出品タブ直行）**:
  - 製作画面の完成品や必要素材をタップすると、市場の出品一覧タブへ直接ジャンプ。
  - 画面最上部に**スマート復帰バー（【クラフトに戻る】）**を表示し、素材の**必要数**（買い物リストでは残り必要数）と**目標仕入額**を常時ガイド。
  - 市場出品一覧の単価横に**割安/割高ガイドチップ**を自動表示し、予算内で買える出品を一目で判別可能。
  - 4大消滅トリガーによる自然なリセット制御（復帰タップ / メインタブ切替 / 一覧戻り / 閉じるボタン）。
- **統合フィルターバー**: 画面切り替えタブ（一覧/詳細/出品等）と現在の検索・フィルター条件、展開メニューを1行に凝縮し、スマホの表示領域を最大限に活用。
- **PC版 ⇄ モバイル版の相互切り替え**: ヘッダーのボタンからいつでもPC表示とスマホ表示を切り替え可能。

---

## 🛠 技術スタック

| レイヤー | 技術 / ツール |
| :--- | :--- |
| **フロントエンド** | React 19, TypeScript, Vite, Tailwind CSS, Font Awesome |
| **バックエンド** | Python 3.12, FastAPI, SQLAlchemy, HTTPX, SQLite, Pydantic v2 |
| **データソース** | Universalis API (リアルタイム相場・取引履歴), Teamcraft Open Data (アイテム/レシピマスター) |
| **CI / CD** | GitHub Actions (データ収集パイプライン & GitHub Pages / Vercel デプロイ) |

---

## 🚀 クイックスタート

### ワンクリック起動 (Windows)
ルートディレクトリの `start.bat` をダブルクリックするだけで、バックエンドとフロントエンドが自動起動し、ブラウザ（`http://localhost:3000`）が開きます。

### 手動起動
#### 1. バックエンド（FastAPI）
```bash
# 仮想環境の有効化と起動
backend\venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### 2. フロントエンド（React / Vite）
```bash
cd frontend
npm install
npm run dev
```
ブラウザで `http://localhost:3000` にアクセスしてください。

---

## 📂 プロジェクト構成

```text
ff14-craft-market-checker/
├── .github/workflows/          # GitHub Actions (データ更新パイプライン & デプロイ)
├── backend/                    # Python FastAPI バックエンド & データ収集スクリプト
│   ├── app/
│   │   ├── api/                # APIエンドポイント定義
│   │   ├── pipeline/           # Universalisデータ収集・集計パイプライン
│   │   └── services/           # レシピ計算・原価最適化ロジック
├── data/                       # アイテムマスター & 相場データ (gzip圧縮)
├── frontend/                   # React + TypeScript フロントエンド
│   ├── public/                 # 静的アセット & データ配信ファイル
│   └── src/
│       ├── boxes/              # PC版 UI コンポーネント (Market, Arbitrage, Craft)
│       ├── mobile/             # モバイル専用 UI コンポーネント (スワイプ、統合フィルター)
│       ├── shared/             # 共通定数・共通コンポーネント (カテゴリ、グラフ、フィルター)
│       └── services/           # データ取得・APIクライアント
├── README.md                   # プロジェクト概要ドキュメント
└── start.bat                   # ローカル一括起動スクリプト
```

---

<a name="english"></a>
## 🇺🇸 English

A high-performance market tracker and craft cost optimizer for **Final Fantasy XIV (FFXIV)** across all 32 Japanese Data Center worlds (Meteor, Gaia, Mana, Elemental). 

It integrates real-time market board data with crafting recipe trees to empower players with **Market Trend Analytics**, **Cross-World Arbitrage Navigation**, and **Craft Cost & Procurement Route Optimization**.

Designed for both comprehensive widescreen desktop displays and **native-like, swipe-driven mobile web experiences**.

---

### 🌟 Key Features

#### 1. 📊 Market Analysis
- **7-Day Price Trend Charts**: Interactive visualization of weighted average prices and transaction volumes per world.
- **Recent Sales History Cards**: Real-time sales feeds detailed with HQ/NQ status, unit price, quantity, total price, and buyer names.
- **Cross-World Listings & DC Price Comparison**: Compare real-time listings and lowest prices across your home world, current DC, and all Japanese DCs.
- **Flexible Filters & Sorting**:
  - Velocity filter (No min / 1+ / 5+ / 10+ / 50+ sales per day)
  - Sorting options (Sales Velocity / Gil Volume / High-value transactions)
  - Crystal exclusion toggle, category filtering, and instant fuzzy name search.

#### 2. 🪙 Arbitrage Navigator (Cross-World Trading)
- **Automatic Price Gap Detection**: Discovers lucrative arbitrage opportunities: buy low on other worlds and sell high on your home world.
- **Profit-Driven Rankings**: Sort candidates by "Daily Projected Profit" (Margin × Daily Velocity) or "Per-Item Margin".
- **Dual Source/Target Analysis**: One-tap cross-reference between source and destination worlds for transaction histories and active listings.
- **Bargain / Overpriced Real-Time Badges**: Compares listing prices against target acquisition costs with color-coded chips (`[● Bargain -xx%]` / `[× Overpriced +xx%]`) right next to unit prices.

#### 3. 🔨 Craft Cost Optimizer & Shopping List
- **Recursive Recipe Tree Breakdown**: Automatically expands final products into intermediate crafts and raw materials.
- **Cost Route Optimization**: Automatically determines the cheapest path among "Self-crafting intermediate materials", "Market Board purchase", and "NPC Vendor purchase".
- **Sourcing Scope Selection**: Calculate costs based on "All-DC Lowest", "Same-DC Lowest", or "Home-World Only".
- **Intermediate Step Breakdown & Procurement Checklist**:
  - Step-by-step required craft counts, assigned crafting jobs, and gil savings.
  - Interactive checkbox shopping list with quick "Copy to Clipboard" for in-game use.
- **Batch Scaling**: Adjust batch sizes (1–99) to instantly recalculate material requirements, total cost, and expected daily profit.

#### 4. 📱 Mobile Dedicated Experience & Seamless Integration
- **Native-Like Fullscreen UI**: Optimized for mobile devices (100dvh) with touch bounce prevention and clean viewport handling.
- **Horizontal Swipe Navigation**: Seamlessly glide between Item List, Trend Details, and Live Listings with natural swipe gestures (`SwipeContainer`).
- **Direct Craft-to-Market Navigation**:
  - Tapping any material or finished item in the Craft view jumps directly to the Market **Listings Tab**.
  - Displays a slim **Smart Return Bar** with material **required quantity** (remaining needed count) and **target acquisition price**.
  - Automatically highlights listings with **Bargain / Overpriced** badges to ensure purchases stay within budget.
  - Automatic context cleanup with 4 smart triggers (Return tap / Main tab switch / List return / Close button).
- **Unified Compact Filter Bar**: Combines view switch tabs, current search/filter pills, and drawer triggers into a single slim row.
- **PC ⇄ Mobile View Switcher**: Effortlessly toggle between desktop and mobile interfaces at any time from the header.

---

### 🛠 Tech Stack

| Layer | Technologies / Tools |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Font Awesome |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy, HTTPX, SQLite, Pydantic v2 |
| **Data Sources** | Universalis API (Market Data), Teamcraft Open Data (Items & Recipes Master) |
| **CI / CD** | GitHub Actions (Data Collection Pipeline & Automated Deployments) |

---

### 🚀 Quick Start

#### One-Click Launch (Windows)
Double-click `start.bat` in the root folder. Both the backend and frontend servers will start automatically, and your browser will open `http://localhost:3000`.

#### Manual Setup
##### 1. Backend (FastAPI)
```bash
# Activate virtual environment and run server
backend\venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

##### 2. Frontend (React / Vite)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your web browser.

---

### 📂 Directory Structure

```text
ff14-craft-market-checker/
├── .github/workflows/          # GitHub Actions (Data update pipeline & deployment)
├── backend/                    # Python FastAPI backend & pipeline scripts
│   ├── app/
│   │   ├── api/                # API endpoints
│   │   ├── pipeline/           # Universalis ETL pipeline
│   │   └── services/           # Recipe calculation & cost optimization logic
│   ├── data/                   # Icon mapping assets
│   └── requirements.txt        # Python dependencies
├── data/                       # Compressed items master & market data (gzip)
├── frontend/                   # React + TypeScript frontend
│   ├── public/                 # Static assets & public data payloads
│   └── src/
│       ├── boxes/              # Desktop UI components (Market, Arbitrage, Craft)
│       ├── mobile/             # Mobile-dedicated UI components (Swipe, FilterBar)
│       ├── shared/             # Shared constants & components (Graphs, Filters)
│       └── services/           # Data services & API clients
├── README.md                   # Project documentation
└── start.bat                   # One-click Windows launch script
```

---

## 📜 ライセンス / クレジット (License & Credits)

- 記載されている会社名・製品名・システム名などは、各社の商標、または登録商標です。  
  (Company names, product names, and system names listed are trademarks or registered trademarks of their respective companies.)
- Copyright (C) SQUARE ENIX CO., LTD. All Rights Reserved.
- マーケットデータ提供 (Market Data Source): [Universalis](https://universalis.app/)
- レシピ・アイテムマスター提供 (Recipe & Item Master Source): [Teamcraft](https://ffxivteamcraft.com/)
