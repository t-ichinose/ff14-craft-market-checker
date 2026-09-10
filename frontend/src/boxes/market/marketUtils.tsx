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
