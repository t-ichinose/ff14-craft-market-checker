import React from 'react';
import type { CraftCardItem } from './craftTypes';
import { getJobBadgeStyle } from './craftTreeUtils';

export interface MiniTrendSparklineProps {
  trend?: { date: string; weighted_avg: number; volume: number }[];
  trendPct?: number;
}

export const MiniTrendSparkline: React.FC<MiniTrendSparklineProps> = React.memo(({ trend, trendPct }) => {
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
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
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
});

export interface CraftCardProps {
  item: CraftCardItem;
  idx: number;
  isSelected: boolean;
  isSelectedInBatch: boolean;
  batchCraftCount?: number;
  hasCustomHq: boolean;
  salesScopeName: string;
  sourcingScope: string;
  onSelect: (cardKey: string, item: CraftCardItem) => void;
  onToggleBatch: (cardKey: string, item: CraftCardItem) => void;
  onOpenModal?: (itemId: number, worldName: string, isHq: boolean) => void;
}

export const CraftCard: React.FC<CraftCardProps> = React.memo(({
  item,
  idx,
  isSelected,
  isSelectedInBatch,
  batchCraftCount,
  hasCustomHq,
  salesScopeName,
  sourcingScope,
  onSelect,
  onToggleBatch,
  onOpenModal,
}) => {
  const cardKey = `${item.item_id}_${item.is_hq ? 'hq' : 'nq'}`;
  const cleanTitle = item.name || `Item #${item.item_id}`;
  const jobStyle = getJobBadgeStyle(item.job || '', item.is_company);
  const lodestoneUrl = `https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/?patch=&db_search_category=item&category2=&q=${encodeURIComponent(cleanTitle)}`;
  const isLoss = item.profit <= 0;

  return (
    <div
      onClick={() => {
        if (isSelected && onOpenModal) {
          onOpenModal(item.item_id, salesScopeName, Boolean(item.is_hq));
        } else {
          onSelect(cardKey, item);
        }
      }}
      title={isSelected ? 'クリックして全32ワールド相場モニターを開く' : undefined}
      style={{
        borderRadius: '12px',
        padding: '8px 10px',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        position: 'relative',
        ...(isSelected
          ? {
              background: isLoss
                ? 'linear-gradient(135deg, rgba(248, 113, 113, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)'
                : isSelectedInBatch
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(15, 23, 42, 0.95) 100%)'
                : 'linear-gradient(135deg, rgba(0, 210, 255, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: isLoss ? '1px solid #f87171' : isSelectedInBatch ? '1px solid #f59e0b' : '1px solid #00d2ff',
              boxShadow: isLoss
                ? '0 0 16px rgba(248, 113, 113, 0.45)'
                : isSelectedInBatch
                ? '0 0 16px rgba(245, 158, 11, 0.45)'
                : '0 0 16px rgba(0, 210, 255, 0.45)',
            }
          : {
              background: 'rgba(22, 30, 49, 0.85)',
              border: isLoss ? '1px solid rgba(248, 113, 113, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }),
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <img
          src={item.icon || 'https://xivapi.com/i/000000/000000.png'}
          alt={cleanTitle}
          loading="lazy"
          decoding="async"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: '#0b111e',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', lineHeight: 1.2 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>
              #{idx + 1}
            </span>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#ffffff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={cleanTitle}
            >
              {cleanTitle}
            </span>
            {item.is_hq ? (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(202, 138, 4, 0.35))',
                  border: '1px solid rgba(234, 179, 8, 0.6)',
                  color: '#ffb703',
                  fontFamily: 'Outfit, sans-serif',
                  marginLeft: '2px',
                  flexShrink: 0,
                }}
              >
                HQ
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(148, 163, 184, 0.12)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  color: '#94a3b8',
                  fontFamily: 'Outfit, sans-serif',
                  marginLeft: '2px',
                  flexShrink: 0,
                }}
              >
                NQ
              </span>
            )}

            {hasCustomHq && (
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(245, 158, 11, 0.25)',
                  border: '1px solid rgba(245, 158, 11, 0.6)',
                  color: '#f59e0b',
                  fontFamily: 'Outfit, sans-serif',
                  marginLeft: '2px',
                  flexShrink: 0,
                }}
                title="素材の一部または全てをHQに指定して原価計算中"
              >
                ★HQ素材
              </span>
            )}

            <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {/* 複数選択 追加/解除ボタン */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBatch(cardKey, item);
                }}
                className={`px-1.5 py-0.5 rounded text-[0.62rem] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  isSelectedInBatch
                    ? 'bg-amber-500/25 hover:bg-rose-500/25 text-amber-300 hover:text-rose-300 border border-amber-500/40 hover:border-rose-500/40 shadow-[0_0_6px_rgba(245,158,11,0.2)]'
                    : 'bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-400/40'
                }`}
                title={isSelectedInBatch ? 'バッチ製作から除外' : 'バッチ製作に追加'}
              >
                <i className={`fa-solid ${isSelectedInBatch ? 'fa-check text-amber-400' : 'fa-plus text-cyan-400'} text-[0.6rem]`}></i>
                <span>{isSelectedInBatch ? (batchCraftCount && batchCraftCount > 1 ? `選択中(${batchCraftCount})` : '選択中') : '追加'}</span>
              </button>

              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenModal) onOpenModal(item.item_id, salesScopeName, Boolean(item.is_hq));
                }}
                style={{ color: '#94a3b8', fontSize: '0.7rem', padding: '2px', cursor: 'pointer' }}
                title="全32ワールド相場モニターを開く"
              >
                <i className="fa-solid fa-chart-line"></i>
              </span>
              <a
                href={lodestoneUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: '#94a3b8', fontSize: '0.7rem', padding: '2px' }}
                title="Lodestoneで確認"
              >
                <i className="fa-solid fa-arrow-up-right-from-square"></i>
              </a>
            </div>
          </div>

          {/* Subtitle: Job Badge + IL & Category */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
            <span className={`px-1.5 py-0.2 rounded border ${jobStyle}`} style={{ fontSize: '0.62rem', fontWeight: 700 }}>
              {item.is_company ? '⚓ カンパニークラフト' : `${item.job} Lv${item.lvl || 1}`}
            </span>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
              IL{item.ilvl || 1} · {item.cat}
            </span>
          </div>
        </div>
      </div>

      {/* Middle: 2-Column Split (仕入先 vs 販売先) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
        {/* Left: 仕入れ先 */}
        <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)', borderLeft: '3px solid #10b981', borderRadius: '7px', padding: '5px 7px' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
              <i className="fa-solid fa-boxes-packing" style={{ color: '#10b981', fontSize: '0.65rem' }}></i> 仕入: <strong style={{ color: '#10b981' }}>{sourcingScope === 'all_dc' ? '全DC' : sourcingScope === 'dc' ? '同DC' : '単ワールド'}</strong>
            </span>
            <span style={{ fontSize: '0.58rem', color: item.amt > 1 ? '#34d399' : '#64748b', fontFamily: 'Outfit, sans-serif' }}>
              {item.amt > 1 ? `${item.amt}個完成` : '1個'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ fontSize: '0.63rem', color: '#94a3b8' }}>目標原価:</span>
            <strong style={{ color: '#10b981', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>
              {item.craft_cost.toLocaleString()}G
            </strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.60rem', color: '#64748b' }}>
              {item.amt > 1 ? '総素材費:' : '素材原価:'} <strong style={{ color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>{item.batch_cost.toLocaleString()}G</strong>
            </span>
            {item.amt > 1 && (
              <span style={{ color: '#34d399', fontSize: '0.58rem', fontFamily: 'Outfit, sans-serif' }}>
                (@{item.craft_cost.toLocaleString()}G)
              </span>
            )}
          </div>
        </div>

        {/* Right: 販売先 */}
        <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderLeft: '3px solid #38bdf8', borderRadius: '7px', padding: '5px 7px' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
              <i className="fa-solid fa-store" style={{ color: '#38bdf8', fontSize: '0.65rem' }}></i> 販売: <strong style={{ color: '#38bdf8' }}>{salesScopeName}</strong>
            </span>
            <span style={{ fontSize: '0.58rem', color: '#64748b', fontFamily: 'Outfit, sans-serif' }}>{(item.daily_sales_qty || 0).toFixed(1)}個/日</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ fontSize: '0.63rem', color: '#94a3b8' }}>目標販売:</span>
            <strong style={{ color: '#38bdf8', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>{item.sell_price.toLocaleString()}G</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.60rem', color: '#64748b' }}>推移:</span>
            <MiniTrendSparkline trend={item.daily_trend} trendPct={item.trend_pct} />
          </div>
        </div>
      </div>

      {/* Bottom: Common Profit Summary (単価利益 + 日当利益) */}
      <div style={{ background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '7px', padding: '5px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <i className="fa-solid fa-coins" style={{ color: isLoss ? '#f87171' : '#10b981', fontSize: '0.72rem' }}></i>
          <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>単価利益:</span>
          <strong style={{ color: isLoss ? '#f87171' : '#10b981', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>
            {item.profit > 0 ? '+' : ''}{item.profit.toLocaleString()}G
          </strong>
          <span style={{ color: isLoss ? '#f87171' : '#34d399', fontSize: '0.64rem', fontFamily: 'Outfit, sans-serif' }}>
            ({item.profit > 0 ? '+' : ''}{item.profit_rate.toFixed(1)}%)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <i className="fa-solid fa-sack-dollar" style={{ color: isLoss ? '#f87171' : '#ffb703', fontSize: '0.72rem' }}></i>
          <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>日当利益:</span>
          <strong style={{ color: isLoss ? '#f87171' : '#ffb703', fontSize: '0.80rem', fontFamily: 'Outfit, sans-serif' }}>
            {item.daily_profit > 0 ? '+' : ''}{item.daily_profit.toLocaleString()}G/日
          </strong>
        </div>
      </div>
    </div>
  );
});
