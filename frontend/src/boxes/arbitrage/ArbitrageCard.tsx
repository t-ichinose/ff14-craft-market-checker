import React from 'react';
import type { ArbitrageOpportunity } from './arbitrageTypes';

// Sparkline SVG + % Badge generator for arbitrage cards
const renderMiniTrend = (trend?: { date: string; weighted_avg: number; volume: number }[], trendPct?: number) => {
  if (!trend || trend.length === 0) {
    return <span style={{ color: '#64748b', fontSize: '0.62rem' }}>-</span>;
  }
  const validPoints = trend.map((d) => d.weighted_avg || 0);
  const nonZero = validPoints.filter((p) => p > 0);

  const w = 42;
  const h = 13;

  let polylinePoints = '';
  const pct = trendPct || 0;
  let strokeColor = '#94a3b8';

  if (nonZero.length >= 2) {
    const minP = Math.min(...nonZero);
    const maxP = Math.max(...nonZero);
    const range = maxP - minP || 1;

    polylinePoints = validPoints
      .map((p, idx) => {
        const x = (idx / (validPoints.length - 1)) * (w - 4) + 2;
        const val = p > 0 ? p : minP;
        const y = h - 2 - ((val - minP) / range) * (h - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    strokeColor = pct >= 0 ? '#4ade80' : '#f87171';
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
      {polylinePoints && (
        <svg width={w} height={h} style={{ overflow: 'visible', verticalAlign: 'middle' }}>
          <polyline fill="none" stroke={strokeColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" points={polylinePoints} />
        </svg>
      )}
      {pct > 0 ? (
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.62rem', fontFamily: 'Outfit, sans-serif' }}>
          <i className="fa-solid fa-arrow-trend-up" style={{ fontSize: '0.55rem' }}></i> +{pct}%
        </span>
      ) : pct < 0 ? (
        <span style={{ color: '#f87171', fontWeight: 700, fontSize: '0.62rem', fontFamily: 'Outfit, sans-serif' }}>
          <i className="fa-solid fa-arrow-trend-down" style={{ fontSize: '0.55rem' }}></i> {pct}%
        </span>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: '0.62rem', fontFamily: 'Outfit, sans-serif' }}>
          ➡️ 0%
        </span>
      )}
    </span>
  );
};

export interface ArbitrageCardProps {
  op: ArbitrageOpportunity;
  index: number;
  isSelected: boolean;
  onSelect: (op: ArbitrageOpportunity) => void;
}

export const ArbitrageCard: React.FC<ArbitrageCardProps> = React.memo(({
  op,
  index,
  isSelected,
  onSelect,
}) => {
  return (
    <div
      onClick={() => onSelect(op)}
      style={{
        borderRadius: '12px',
        padding: '8px 10px',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        position: 'relative',
        ...(isSelected
          ? {
              background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid #00d2ff',
              boxShadow: '0 0 16px rgba(0, 210, 255, 0.45)'
            }
          : {
              background: 'rgba(22, 30, 49, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
            })
      }}
    >
      {/* Card Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <img
          src={op.itemIcon}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '38px', height: '38px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#0b111e', objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace', flexShrink: 0 }}>#{index + 1}</span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.itemName}</span>
            {op.isHq && (
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
                  boxShadow: '0 0 6px rgba(255, 183, 3, 0.2)',
                  fontFamily: 'Outfit, sans-serif',
                  flexShrink: 0
                }}
              >
                HQ
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {op.categoryName}
          </div>
        </div>
      </div>

      {/* Middle: 2-Column Split (仕入先 vs 販売先) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
        {/* Left: 仕入れ先 */}
        <div style={{ background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.25)', borderLeft: '3px solid #4ade80', borderRadius: '7px', padding: '5px 7px' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
              <i className="fa-solid fa-cart-shopping" style={{ color: '#4ade80', fontSize: '0.65rem' }}></i> 仕入: <strong style={{ color: '#4ade80' }}>{op.sourceWorld}</strong>
            </span>
            <span style={{ fontSize: '0.58rem', color: '#64748b', fontFamily: 'Outfit, sans-serif' }}>{op.sourceDc}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ fontSize: '0.63rem', color: '#94a3b8' }}>目標仕入額:</span>
            <strong style={{ color: '#4ade80', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>{op.buyPrice.toLocaleString()}G</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.60rem', color: '#64748b' }}>推移:</span>
            {renderMiniTrend(op.sourceTrend, op.sourceTrendPct)}
          </div>
        </div>

        {/* Right: 販売先 */}
        <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderLeft: '3px solid #38bdf8', borderRadius: '7px', padding: '5px 7px' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
              <i className="fa-solid fa-store" style={{ color: '#38bdf8', fontSize: '0.65rem' }}></i> 販売: <strong style={{ color: '#38bdf8' }}>{op.homeWorld}</strong>
            </span>
            <span style={{ fontSize: '0.58rem', color: '#64748b', fontFamily: 'Outfit, sans-serif' }}>{op.homeDc}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ fontSize: '0.63rem', color: '#94a3b8' }}>目標販売額:</span>
            <strong style={{ color: '#38bdf8', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>{op.sellPrice.toLocaleString()}G</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.60rem', color: '#64748b' }}>推移:</span>
            {renderMiniTrend(op.homeTrend, op.homeTrendPct)}
          </div>
        </div>
      </div>

      {/* Bottom: Common Profit Summary (純利益 + 想定日当利益) */}
      <div style={{ background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '7px', padding: '5px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <i className="fa-solid fa-coins" style={{ color: '#ffb703', fontSize: '0.72rem' }}></i>
          <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>純利益:</span>
          <strong style={{ color: '#ffb703', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>+{op.unitProfit.toLocaleString()}G</strong>
          <span style={{ color: '#fbbf24', fontSize: '0.64rem', fontFamily: 'Outfit, sans-serif' }}>(+{op.roiPercent}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <i className="fa-solid fa-sack-dollar" style={{ color: '#4ade80', fontSize: '0.72rem' }}></i>
          <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>想定日当利益:</span>
          <strong style={{ color: '#4ade80', fontSize: '0.80rem', fontFamily: 'Outfit, sans-serif' }}>+{op.dailyProfit.toLocaleString()}G/日</strong>
        </div>
      </div>
    </div>
  );
});
