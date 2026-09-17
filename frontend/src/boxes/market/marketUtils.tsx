import React from 'react';
import type { MarketItem } from '../../services/marketDataService';

/**
 * 過去7日間の日別推移・騰落率 (バックエンド集計済みデータを即座に返却)
 */
export function getOrComputeDailyTrend(item: MarketItem | null | undefined): {
  trend: Array<{ date: string; weighted_avg: number; volume: number }>;
  trendPct: number;
} {
  if (!item) return { trend: [], trendPct: 0 };
  if (item.daily_trend && item.daily_trend.length > 0) {
    return { trend: item.daily_trend, trendPct: (item as any).trend_pct || 0 };
  }
  return { trend: [], trendPct: 0 };
}

/**
 * 統一品質バッジ (HQ / NQ) の描画
 */
export function renderQualityBadge(isHq: boolean): React.ReactElement {
  if (isHq) {
    return (
      <span
        style={{
          fontSize: '0.62rem',
          fontWeight: 800,
          padding: '1px 5px',
          borderRadius: '4px',
          background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(202, 138, 4, 0.35))',
          border: '1px solid rgba(234, 179, 8, 0.6)',
          color: '#ffb703',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          boxShadow: '0 0 6px rgba(255, 183, 3, 0.2)',
          fontFamily: 'Outfit, sans-serif',
        }}
      >
        HQ
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: '0.62rem',
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: '4px',
        background: 'rgba(148, 163, 184, 0.12)',
        border: '1px solid rgba(148, 163, 184, 0.3)',
        color: '#94a3b8',
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      NQ
    </span>
  );
}

/**
 * スパークライン SVG と騰落率バッジの描画
 */
export function renderSparklineAndBadge(item: MarketItem): React.ReactElement {
  const { trend, trendPct } = getOrComputeDailyTrend(item);
  const validPoints = trend.map((d) => d.weighted_avg || 0);
  const nonZero = validPoints.filter((p) => p > 0);

  const w = 48;
  const h = 14;

  let polylinePoints = '';
  let strokeColor = '#94a3b8';

  if (nonZero.length >= 2) {
    const minP = Math.min(...nonZero);
    const maxP = Math.max(...nonZero);
    const range = maxP - minP || 1;

    polylinePoints = validPoints
      .map((p, idx) => {
        const x = (idx / (validPoints.length - 1)) * (w - 6) + 3;
        const val = p > 0 ? p : minP;
        const y = h - 3 - ((val - minP) / range) * (h - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    strokeColor = trendPct >= 0 ? '#4ade80' : '#f87171';
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
      {polylinePoints && (
        <svg width={w} height={h} style={{ overflow: 'visible', verticalAlign: 'middle' }}>
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
        </svg>
      )}
      {trendPct > 0 ? (
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.65rem' }} title="7日平均価格推移">
          <i className="fa-solid fa-arrow-trend-up"></i> +{trendPct}%
        </span>
      ) : trendPct < 0 ? (
        <span style={{ color: '#f87171', fontWeight: 700, fontSize: '0.65rem' }} title="7日平均価格推移">
          <i className="fa-solid fa-arrow-trend-down"></i> {trendPct}%
        </span>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: '0.65rem' }} title="7日平均価格推移">
          ➡️ 0%
        </span>
      )}
    </span>
  );
}

/**
 * アイテムの販売履歴から中央値（または平均値）を算出（捨て値・桁ミスを排除）
 */
export function getRobustHistoryPrice(it: any): number {
  if (!it) return 0;
  const history = it.history || [];
  const validPrices = history.map((h: any) => h.price || 0).filter((p: number) => p > 0);

  const benchmark = it.region_median_price || it.avg_price || (validPrices.length > 0 ? validPrices[0] : 0);

  // 下限ノイズフィルター: 基準相場が 20,000G 以上の品目で、相場の 30% 未満の極端な安値 (捨て売り・桁間違い誤出品) を除外
  let filtered = validPrices;
  if (benchmark >= 20000 && validPrices.length > 0) {
    const minCutoff = benchmark * 0.30;
    const sanePrices = validPrices.filter((p: number) => p >= minCutoff);
    if (sanePrices.length > 0) {
      filtered = sanePrices;
    }
  }

  if (filtered.length > 0) {
    filtered.sort((a: number, b: number) => a - b);
    const mid = Math.floor(filtered.length / 2);
    return filtered.length % 2 === 0
      ? Math.round((filtered[mid - 1] + filtered[mid]) / 2)
      : filtered[mid];
  }
  return it.avg_price || it.min_price || benchmark || 0;
}

export interface MarketFilterOptions {
  selectedWorld: string;
  searchQuery: string;
  selectedCategories: string[];
  availableCategories: string[];
  excludeCrystals: boolean;
  minVelocity?: number;
  sortMode: 'velocity' | 'revenue' | 'max_price';
  limit?: number;
}

/**
 * マーケット一覧のフィルタリング＆ソート（検索時のマスターカタログマージ含む）
 */
export function filterAndSortMarketItems(
  allData: Record<string, MarketItem[]>,
  itemsCatalog: Record<string, any> | undefined,
  options: MarketFilterOptions
): MarketItem[] {
  const {
    selectedWorld,
    searchQuery,
    selectedCategories,
    availableCategories,
    excludeCrystals,
    minVelocity = 0,
    sortMode,
    limit,
  } = options;

  const rawList = allData[selectedWorld] || [];
  const q = searchQuery.trim().toLowerCase();

  // 検索クエリ処理: 検索時は全品目（35,000+マスター）を対象にし、履歴なし品目もプレースホルダーとして表示
  if (q) {
    const isFilterCat = selectedCategories.length > 0 && selectedCategories.length < availableCategories.length;
    const catSet = new Set(selectedCategories);

    // 1. 直近7日間に取引履歴のある品目を収集
    const existingKeySet = new Set<string>();
    let matchedActive: MarketItem[] = [];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (excludeCrystals && item.item_id >= 2 && item.item_id <= 19) continue;
      if (isFilterCat && !catSet.has(item.category_name || '')) continue;

      const name = (item.item_name || '').toLowerCase();
      const idStr = String(item.item_id);
      if (name.includes(q) || idStr.includes(q)) {
        matchedActive.push(item);
        existingKeySet.add(`${item.item_id}_${item.hq ? 'hq' : 'nq'}`);
      }
    }

    // 2. 直近7日間に取引履歴のないマスターカタログ品目も検索
    const matchedCatalog: MarketItem[] = [];
    if (itemsCatalog && Object.keys(itemsCatalog).length > 0) {
      for (const [idStr, meta] of Object.entries(itemsCatalog)) {
        const iid = Number(idStr);
        if (excludeCrystals && iid >= 2 && iid <= 19) continue;
        if (isFilterCat && !catSet.has(meta.category || '')) continue;

        const name = (meta.name || '').toLowerCase();
        if (name.includes(q) || idStr.includes(q)) {
          // NQプレースホルダーを追加
          if (!existingKeySet.has(`${iid}_nq`)) {
            matchedCatalog.push({
              item_id: iid,
              item_name: meta.name,
              category_name: meta.category,
              icon_url: meta.icon,
              hq: false,
              min_price: 0,
              avg_price: 0,
              max_price: 0,
              sale_velocity: 0,
              sale_trades: 0,
              daily_revenue: 0,
              daily_trend: [],
              trend_pct: 0,
              history: [],
              shop_price: meta.shop_price,
            });
          }
        }
      }
    }

    // 日販数足切り
    if (minVelocity > 0) {
      matchedActive = matchedActive.filter((it) => (it.sale_velocity || 0) >= minVelocity);
    }

    // ソート: 取引実績のあるアイテムを sortMode に従って並び替え、次にカタログ品目を五十音順
    if (sortMode === 'revenue') {
      matchedActive.sort(
        (a, b) =>
          (b.daily_revenue || (b.avg_price || 0) * (b.sale_velocity || 0)) -
          (a.daily_revenue || (a.avg_price || 0) * (a.sale_velocity || 0))
      );
    } else if (sortMode === 'max_price') {
      matchedActive.sort((a, b) => (b.max_price || 0) - (a.max_price || 0));
    } else {
      // デフォルト: 売買速度 (velocity)
      matchedActive.sort((a, b) => (b.sale_velocity || 0) - (a.sale_velocity || 0));
    }
    matchedCatalog.sort((a, b) => (a.item_name || '').localeCompare(b.item_name || ''));

    const combined = [...matchedActive, ...(minVelocity > 0 ? [] : matchedCatalog)];
    return limit ? combined.slice(0, limit) : combined;
  }

  if (rawList.length === 0) return [];
  let filtered = rawList;

  // カテゴリ絞り込み
  if (selectedCategories.length === 0) {
    return [];
  }
  if (selectedCategories.length < availableCategories.length) {
    const catSet = new Set(selectedCategories);
    filtered = filtered.filter((itm) => catSet.has(itm.category_name || ''));
  }

  // クリスタル除外 (IDs 2〜19)
  if (excludeCrystals) {
    filtered = filtered.filter((item) => !(item.item_id >= 2 && item.item_id <= 19));
  }

  // 取引実績あり（> 0）
  filtered = filtered.filter((item) => (item.sale_trades || 0) > 0);

  // 日販数足切り
  if (minVelocity > 0) {
    filtered = filtered.filter((item) => (item.sale_velocity || 0) >= minVelocity);
  }

  // ソート
  const sorted = [...filtered];
  if (sortMode === 'revenue') {
    sorted.sort(
      (a, b) =>
        (b.daily_revenue || (b.avg_price || 0) * (b.sale_velocity || 0)) -
        (a.daily_revenue || (a.avg_price || 0) * (a.sale_velocity || 0))
    );
  } else if (sortMode === 'max_price') {
    sorted.sort((a, b) => (b.max_price || 0) - (a.max_price || 0));
  } else {
    // デフォルト: velocity
    sorted.sort((a, b) => (b.sale_velocity || 0) - (a.sale_velocity || 0));
  }

  return limit ? sorted.slice(0, limit) : sorted;
}
