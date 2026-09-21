# FF14 Craft & Market Tracker (FF14 クラフト・相場トラッカー)

<p align="center">
  <a href="#japanese"><strong>🇯🇵 日本語 (Japanese)</strong></a> | 
  <a href="#english"><strong>🇺🇸 English</strong></a>
</p>

---

<a name="japanese"></a>
## 🇯🇵 日本語 (Japanese)

FF14（ファイナルファンタジーXIV）の日本全データセンター（Elemental / Gaia / Mana / Meteor）32ワールドのマーケット相場データとクラフトレシピツリーを統合し、**「市場相場の動向分析」「ワールド間のサヤ取り金策」「クラフト原価・中間素材調達ルートの最適化」**を支援する次世代の高速トラッカーです。

PCのワイド画面での本格的な分析はもちろん、**スマートフォン（モバイル）専用のフルスクリーン・スワイプ操作UI**にも完全対応しています。

---

### 🚀 最新アーキテクチャ：高速統合マーケットパイプライン (Unified Pipeline)

本プロジェクトでは、Universalis API の特性を最大限に活かした**次世代の高速統合ETLパイプライン**を搭載しています。

- **出品 ＋ 7日間売買履歴の完全1本化**:
  従来の「出品取得」と「重い履歴取得」の2重構造を解消。出品エンドポイント（Redisインメモリキャッシュ）のスキャンと同時に各アイテムの更新日時（`lastUploadTime`）を解析し、取引データに動きのあった品目のみを狙い撃ちして 7日間の完全な売買履歴を同期します。
- **圧倒的な収集速度**:
  全32ワールド・約17,000品目（出品データ＋過去7日間の取引履歴）の完全自動更新を **わずか 2〜3 分台** で完走。
- **堅牢な耐障害性とリアルタイム監視**:
  秒単位のリアルタイム進捗ログ出力、Universalis過負荷時の自動息継ぎバックオフ、および一時的なエラー時のスマート分割フォールバックにより、エラーやタイムアウトによる停滞を防止。
- **完全自動更新 ＆ ゼロコスト運用**:
  GitHub Actions による定期実行（30分間隔）と GitHub Pages への自動再デプロイにより、完全サーバーレスで最新データを常時配信。

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

#### 2. 🪙 金策ナビ (Arbitrage Navigator / サヤ取り)
- **ワールド間価格差の自動検出**: 「他ワールドで安く仕入れ、ホームワールドで高く売る」サヤ取り機会を瞬時に抽出。
- **出品データ完全連動**: 履歴相場だけでなく、現実に並んでいる各ワールドの最安出品価格・在庫数をリアルタイムに反映。
- **高精度ノイズフィルター**: 突発的な単発処分（ポツン半値）や捨て値出品、ギル移動による異常値を自動除外。
- **逆算型利益計算**: 手数料（購入税5% ＋ 販売税5%）を控除した上で目標仕入上限額と日当純利益を自動算出。
- **仕入元・販売先の2窓比較**: 仕入先ワールドと販売先ワールドの取引履歴および出品状況を、画面切り替えやスワイプでワンタップ比較。

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
  - 市場出品一覧の単価横に**割安/割高ガイドチップ**（`[● 割安 -xx%]` / `[× 割高 +xx%]`）を自動表示し、予算内で買える出品を一目で判別可能。
  - 4大消滅トリガーによる自然なリセット制御（復帰タップ / メインタブ切替 / 一覧戻り / 閉じるボタン）。
- **統合フィルターバー**: 画面切り替えタブ（一覧/詳細/出品等）と現在の検索・フィルター条件、展開メニューを1行に凝縮し、スマホの表示領域を最大限に活用。
- **PC版 ⇄ モバイル版の相互切り替え**: ヘッダーのボタンからいつでもPC表示とスマホ表示を切り替え可能。

---

## 🛠 技術スタック

| レイヤー | 技術 / ツール |
| :--- | :--- |
| **フロントエンド** | React 19, TypeScript, Vite, Tailwind CSS, Font Awesome |
| **データパイプライン** | Python 3.12, Asyncio, HTTPX, SQLite |
| **データソース** | Universalis API (リアルタイム相場・取引履歴), Teamcraft Open Data (アイテム/レシピマスター) |
| **CI / CD / ホスティング** | GitHub Actions (30分間隔データ自動更新) ＆ GitHub Pages |

---

## 🚀 クイックスタート

### ローカル開発・起動

#### 1. 依存関係のインストール
```bash
cd frontend
npm install
```

#### 2. 開発サーバーの起動
```bash
npm run dev
```
ブラウザで `http://localhost:5173` にアクセスしてください。最新データ（`data.json.gz`, `listings.json.gz`, `recipes.json`）が自動的に読み込まれます。

---

## 📂 プロジェクト構成

```text
ff14-craft-market-checker/
├── .github/workflows/
│   ├── market_listings_pipeline.yml # 統合マーケットデータ収集パイプライン (30分毎)
│   └── deploy.yml                   # フロントエンド GitHub Pages デプロイ
├── backend/
│   ├── app/
│   │   ├── pipeline/
│   │   │   ├── listings_pipeline.py # 統合高速マーケットパイプライン (出品＋差分履歴同期)
│   │   │   └── unified_pipeline.py  # データ集計・クレンジング・ノイズ除去エンジン
│   │   └── constants.py             # 日本DC/ワールド定義定数
│   └── requirements.txt             # パイプライン用 Python 依存関係
├── data/                            # アイテムマスター & キャッシュDB (SQLite)
├── frontend/                        # React + TypeScript フロントエンド
│   ├── public/                      # 静的アセット & 配信用データ (data.json.gz, listings.json.gz)
│   └── src/
│       ├── boxes/                   # PC版 UI コンポーネント (Market, Arbitrage, Craft)
│       ├── mobile/                  # モバイル専用 UI コンポーネント (スワイプ、統合フィルター)
│       ├── shared/                  # 共通定数・共通コンポーネント (カテゴリ、グラフ、フィルター)
│       └── services/                # データ取得・APIクライアント (Gzip非同期解凍)
├── README.md                        # プロジェクト概要ドキュメント
└── DEVELOPMENT_RULES.md             # 開発・設計規約
```

---

<a name="english"></a>
## 🇺🇸 English

A next-generation, high-performance market tracker and craft cost optimizer for **Final Fantasy XIV (FFXIV)** across all 32 Japanese Data Center worlds (Elemental, Gaia, Mana, Meteor). 

It integrates real-time market board listings and 7-day transaction histories with crafting recipe trees to empower players with **Market Trend Analytics**, **Cross-World Arbitrage Navigation**, and **Craft Cost & Procurement Route Optimization**.

Designed for both comprehensive widescreen desktop displays and **native-like, swipe-driven mobile web experiences**.

---

### 🚀 Architecture: High-Speed Unified Market Pipeline

Powered by a unified ETL pipeline specifically optimized for the Universalis API architecture:

- **Unified Listings & 7-Day Incremental History**:
  Seamlessly combines realtime listings scanning with smart diff detection. By tracking `lastUploadTime` across all marketable items, the pipeline fetches full 7-day transaction records only for items with new market activity, preventing redundant requests.
- **Blazing Fast Performance**:
  Syncs all 32 worlds and ~17,000 items (live listings + 7-day sales records) in **only 2 to 3 minutes**.
- **Resilient & Transparent**:
  Features real-time progress reporting, automatic server backoff on Gateway Timeouts (HTTP 504), and single-level split fallbacks to guarantee fault tolerance.
- **Fully Automated & Serverless**:
  Runs every 30 minutes via GitHub Actions and automatically deploys clean, compressed datasets to GitHub Pages.

---

### 🌟 Key Features

#### 1. 📊 Market Analysis
- **7-Day Price Trend Charts**: Interactive visualization of weighted average prices and transaction volumes per world.
- **Recent Sales History Cards**: Real-time sales feeds detailed with HQ/NQ status, unit price, quantity, total price, and buyer names.
- **Cross-World Listings & DC Price Comparison**: Compare real-time listings and lowest prices across your home world, current DC, and all Japanese DCs.
- **Flexible Filters & Sorting**: Velocity filter (1+ / 5+ / 10+ / 50+ sales per day), gil volume, crystal exclusion toggle, and instant search.

#### 2. 🪙 Arbitrage Navigator (Cross-World Trading)
- **Automatic Price Gap Detection**: Discovers lucrative arbitrage opportunities (buy low on other worlds, sell high on home world).
- **Listing-Driven Pricing**: Accurately computes margins using live listings instead of outdated averages.
- **Advanced Outlier Filtering**: Automatically filters out single-item liquidations, typo listings, and gil transfers.
- **Dual Source/Target Analysis**: One-tap cross-reference between source and destination worlds with side-by-side transaction histories and listings.

#### 3. 🔨 Craft Cost Optimizer & Shopping List
- **Recursive Recipe Tree Breakdown**: Automatically expands final products into intermediate crafts and raw materials.
- **Cheapest Route Optimization**: Automatically determines the cheapest path among self-crafting, market board purchase, and NPC vendors.
- **Intermediate Step Breakdown & Procurement Checklist**: Step-by-step required craft counts, assigned crafting jobs, gil savings, and quick "Copy to Clipboard" for in-game use.
- **Batch Scaling**: Adjust batch sizes (1–99) to instantly recalculate material requirements, total cost, and expected profit.

#### 4. 📱 Mobile Dedicated Experience & Seamless Integration
- **Native-Like Fullscreen UI**: Optimized for mobile devices (100dvh) with touch bounce prevention.
- **Horizontal Swipe Navigation**: Seamlessly glide between Item List, Trend Details, and Live Listings with natural swipe gestures.
- **Direct Craft-to-Market Navigation**: Tap any ingredient to jump straight to market listings with a slim Smart Return Bar displaying required quantity, target budget, and real-time Bargain/Overpriced badges.
- **PC ⇄ Mobile View Switcher**: Effortlessly toggle between desktop and mobile interfaces at any time.

---

## 📜 ライセンス / クレジット (License & Credits)

- 記載されている会社名・製品名・システム名などは、各社の商標、または登録商標です。  
  (Company names, product names, and system names listed are trademarks or registered trademarks of their respective companies.)
- Copyright (C) SQUARE ENIX CO., LTD. All Rights Reserved.
- マーケットデータ提供 (Market Data Source): [Universalis](https://universalis.app/)
- レシピ・アイテムマスター提供 (Recipe & Item Master Source): [Teamcraft](https://ffxivteamcraft.com/)
