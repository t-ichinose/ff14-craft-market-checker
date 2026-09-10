import React from 'react';
import { TrendChartCanvas } from '../../shared/TrendChartCanvas';
import { formatTimeJst } from './arbitrageUtils';
import type { MarketItem } from '../../services/marketDataService';
import type { ArbitrageOpportunity, ListingEntry, ArbitrageViewMode } from './arbitrageTypes';
import { WORLD_TO_DC } from '../../shared/marketConstants';

/**
 * 品質バッジ (HQ / NQ)
 */
const renderQualityBadge = (isHq: boolean) => {
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
          fontFamily: 'Outfit, sans-serif'
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
        fontFamily: 'Outfit, sans-serif'
      }}
    >
      NQ
    </span>
  );
};

const renderTrendBadge = (pct: number) => {
  if (pct > 0) {
    return (
      <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'Outfit, sans-serif', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        <i className="fa-solid fa-arrow-trend-up"></i> +{pct}%
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span style={{ color: '#f87171', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'Outfit, sans-serif', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        <i className="fa-solid fa-arrow-trend-down"></i> {pct}%
      </span>
    );
  }
  return (
    <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'Outfit, sans-serif' }}>
      ➡️ 0%
    </span>
  );
};

export interface ArbitrageDetailPaneProps {
  selectedOp: ArbitrageOpportunity | null;
  sourceItem: MarketItem | null;
  homeItem: MarketItem | null;
  alignedSourceTrend: { date: string; weighted_avg: number; volume: number }[];
  alignedHomeTrend: { date: string; weighted_avg: number; volume: number }[];
  sourceViewMode: ArbitrageViewMode;
  setSourceViewMode: (mode: ArbitrageViewMode) => void;
  homeViewMode: ArbitrageViewMode;
  setHomeViewMode: (mode: ArbitrageViewMode) => void;
  loadingSourceListings: boolean;
  loadingHomeListings: boolean;
  displayedSourceHistories: { price: number; qty: number; ts: number; buyer: string; hq: boolean }[];
  displayedSourceListings: ListingEntry[];
  displayedHomeHistories: { price: number; qty: number; ts: number; buyer: string; hq: boolean }[];
  displayedHomeListings: ListingEntry[];
}

export const ArbitrageDetailPane: React.FC<ArbitrageDetailPaneProps> = React.memo(({
  selectedOp,
  sourceItem,
  homeItem,
  alignedSourceTrend,
  alignedHomeTrend,
  sourceViewMode,
  setSourceViewMode,
  homeViewMode,
  setHomeViewMode,
  loadingSourceListings,
  loadingHomeListings,
  displayedSourceHistories,
  displayedSourceListings,
  displayedHomeHistories,
  displayedHomeListings,
}) => {
  if (!selectedOp) {
    return (
      <div style={{ textAlign: 'center', padding: '3.5rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: '84px', height: '84px', borderRadius: '50%', background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', boxShadow: '0 0 35px rgba(251, 191, 36, 0.15)' }}>
          <i className="fa-solid fa-scale-balanced" style={{ fontSize: '2.5rem', color: '#ffb703' }}></i>
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.5rem' }}>金策品目を選択してください</div>
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '380px', lineHeight: 1.6 }}>左側の金策カードをクリックすると仕入れ先と販売先の2窓比較が表示されます</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      
      {/* Header Card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(22, 30, 49, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', marginBottom: '0.75rem', flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src={selectedOp.itemIcon}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: '44px', height: '44px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: '#0b111e', objectFit: 'contain' }}
          />
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{selectedOp.itemName}</span>
              {selectedOp.isHq ? (
                <span style={{ fontSize: '0.72rem', fontWeight: 900, color: '#ffb703', background: 'rgba(255,183,3,0.18)', border: '1px solid rgba(255,183,3,0.5)', padding: '2px 6px', borderRadius: '6px' }}>HQ</span>
              ) : (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.3)', padding: '2px 6px', borderRadius: '6px' }}>NQ</span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '3px' }}>
              ID: {selectedOp.itemId} | カテゴリ: {selectedOp.categoryName}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>予想1個純利益 (手数料控除後):</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#4ade80', fontFamily: 'Outfit, sans-serif' }}>
              +{selectedOp.unitProfit.toLocaleString()}G <span style={{ fontSize: '0.75rem', color: '#ffb703' }}>(+{selectedOp.roiPercent}%)</span>
            </div>
          </div>
          <a
            href={`https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/?patch=&db_search_category=item&category2=&q=${encodeURIComponent(selectedOp.itemName)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.82rem', padding: '6px 12px', borderRadius: '8px', background: 'rgba(255, 183, 3, 0.12)', border: '1px solid rgba(255, 183, 3, 0.3)', color: '#ffb703', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            Lodestone <i className="fa-solid fa-arrow-up-right-from-square"></i>
          </a>
        </div>
      </div>

      {/* 2-Window Split Grid: Left (Source World) vs Right (Home World) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        
        {/* 👈 Left Window: Source World Area */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(74, 222, 128, 0.35)', borderRadius: '12px', padding: '0.75rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <span style={{ fontSize: '0.88rem', color: '#4ade80', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <i className="fa-solid fa-cart-shopping"></i> 仕入れ先: {selectedOp.sourceWorld} <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 'normal' }}>({selectedOp.sourceDc})</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              目標仕入値: <strong style={{ color: '#c084fc', fontSize: '0.85rem', fontFamily: 'Outfit, sans-serif' }}>{selectedOp.buyPrice.toLocaleString()}G</strong>
            </span>
          </div>

          {/* 4 Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '0.65rem', flexShrink: 0 }}>
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #4ade80', borderRadius: '8px', padding: '5px 7px' }}>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '2px' }}>最安価格</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#4ade80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif' }}>
                {sourceItem && sourceItem.min_price > 0 ? `${sourceItem.min_price.toLocaleString()}G` : '-'}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #c084fc', borderRadius: '8px', padding: '5px 7px' }}>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '2px' }}>目標仕入値 (中央値)</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#c084fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif' }}>
                {selectedOp.buyPrice.toLocaleString()}G
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #38bdf8', borderRadius: '8px', padding: '5px 7px' }}>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '2px' }}>販売速度</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif' }}>
                {sourceItem?.sale_velocity ? `${sourceItem.sale_velocity.toFixed(1)}個/日` : '-'}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #ffb703', borderRadius: '8px', padding: '5px 7px' }}>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '2px' }}>7日売買数</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffb703', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif' }}>
                {sourceItem?.sale_trades ? `${sourceItem.sale_trades.toLocaleString()}件` : '-'}
              </div>
            </div>
          </div>

          {/* 7-Day Trend Chart Container */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '0.5rem 0.7rem', marginBottom: '0.6rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="fa-solid fa-chart-line" style={{ color: '#4ade80' }}></i> 日別相場推移 (直近7日間)
              </div>
              {renderTrendBadge(sourceItem?.trend_pct || 0)}
            </div>
            <div style={{ width: '100%', position: 'relative' }}>
              <TrendChartCanvas
                trend={alignedSourceTrend}
                trendPct={sourceItem?.trend_pct || 0}
                lineColor="#4ade80"
                height={105}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2px', width: '100%', height: '36px', marginTop: '2px', paddingTop: '3px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {alignedSourceTrend.map((d, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: '38px' }}>
                    <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.62rem' }}>{d.date}</div>
                    <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.62rem', fontFamily: 'Outfit, sans-serif' }}>
                      {d.weighted_avg > 0 ? (d.weighted_avg >= 1000000 ? `${Math.round(d.weighted_avg / 1000)}kG` : `${d.weighted_avg.toLocaleString()}G`) : '-'}
                    </div>
                    <div style={{ color: '#38bdf8', fontSize: '0.58rem', fontFamily: 'Outfit, sans-serif' }}>
                      {d.volume > 0 ? `${d.volume}個` : '0個'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sub-tabs and Table Container */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.4)', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={() => setSourceViewMode('history')}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                    background: sourceViewMode === 'history' ? '#ffb703' : 'transparent',
                    color: sourceViewMode === 'history' ? '#000000' : '#94a3b8',
                  }}
                >
                  <i className="fa-solid fa-clock-rotate-left"></i> 取引履歴
                </button>
                <button
                  onClick={() => setSourceViewMode('listings')}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                    background: sourceViewMode === 'listings' ? '#ffb703' : 'transparent',
                    color: sourceViewMode === 'listings' ? '#000000' : '#94a3b8',
                  }}
                >
                  <i className="fa-solid fa-list-ul"></i> 出品一覧
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', padding: '4px' }}>
              {sourceViewMode === 'history' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '4px 6px' }}>日時 (JST)</th>
                      <th style={{ padding: '4px 6px' }}>購入者</th>
                      <th style={{ padding: '4px 6px', textAlign: 'center' }}>HQ</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>単価 (G)</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSourceHistories.length > 0 ? (
                      displayedSourceHistories.map((h, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '4px 6px', color: '#94a3b8', fontSize: '0.66rem' }}>{formatTimeJst(h.ts)}</td>
                          <td style={{ padding: '4px 6px', color: '#38bdf8', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.buyer}>
                            {h.buyer}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>{renderQualityBadge(h.hq)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#f1f5f9', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
                            {h.price.toLocaleString()}G
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>
                            {h.qty}個
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>履歴なし</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : loadingSourceListings && displayedSourceListings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                  <i className="fa-solid fa-spinner fa-spin"></i> 出品データを取得中...
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '4px 6px' }}>ワールド</th>
                      <th style={{ padding: '4px 6px' }}>リテイナー</th>
                      <th style={{ padding: '4px 6px', textAlign: 'center' }}>品質</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>単価 (G)</th>
                      <th style={{ padding: '4px 6px', textAlign: 'center' }}>仕入判定</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>数量</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>合計 (G)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSourceListings.length > 0 ? (
                      displayedSourceListings.map((l, i) => {
                        const diffPct = selectedOp.buyPrice > 0
                          ? Math.round(((l.pricePerUnit - selectedOp.buyPrice) / selectedOp.buyPrice) * 100)
                          : 0;
                        const isGoodBuy = l.pricePerUnit <= selectedOp.buyPrice;
                        const diffPctStr = diffPct > 0
                          ? `+${diffPct}%`
                          : (diffPct === 0 && !isGoodBuy ? '+0%' : `${diffPct}%`);
                        const priceColor = isGoodBuy ? '#4ade80' : '#f87171';
                        const rowBg = isGoodBuy ? 'rgba(74, 222, 128, 0.04)' : 'rgba(248, 113, 113, 0.03)';

                        return (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg }}>
                            <td style={{ padding: '4px 6px', color: '#ffb703', fontWeight: 700, whiteSpace: 'nowrap' }}>{l.worldName}</td>
                            <td style={{ padding: '4px 6px', color: '#38bdf8', fontWeight: 600, maxWidth: '85px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.retainerName}>
                              {l.retainerName}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>{l.hq ? (
                              <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.18)', border: '1px solid rgba(56, 189, 248, 0.45)', color: '#38bdf8', fontFamily: 'Outfit, sans-serif' }}>HQ</span>
                            ) : (
                              <span style={{ fontSize: '0.66rem', fontWeight: 600, color: '#94a3b8' }}>NQ</span>
                            )}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: priceColor, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
                              {l.pricePerUnit.toLocaleString()}G
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              {isGoodBuy ? (
                                <span style={{ background: 'rgba(74, 222, 128, 0.18)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.4)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <i className="fa-solid fa-circle" style={{ fontSize: '0.42rem' }}></i> 割安 ({diffPctStr})
                                </span>
                              ) : (
                                <span style={{ background: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.35)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <i className="fa-solid fa-circle-xmark" style={{ fontSize: '0.58rem' }}></i> 割高 ({diffPctStr})
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#f1f5f9', fontFamily: 'Outfit, sans-serif' }}>{l.quantity}個</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#ffb703', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{l.total.toLocaleString()}G</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>出品がありません</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

        {/* 👉 Right Window: Home World Area */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(0, 210, 255, 0.35)', borderRadius: '12px', padding: '0.75rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <span style={{ fontSize: '0.88rem', color: '#38bdf8', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <i className="fa-solid fa-house"></i> 販売先(ホーム): {selectedOp.homeWorld} <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 'normal' }}>({selectedOp.homeDc})</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              目標販売値: <strong style={{ color: '#ffb703', fontSize: '0.85rem', fontFamily: 'Outfit, sans-serif' }}>{selectedOp.sellPrice.toLocaleString()}G</strong>
            </span>
          </div>

          {/* 4 Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '0.65rem', flexShrink: 0 }}>
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #4ade80', borderRadius: '8px', padding: '5px 7px' }}>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '2px' }}>最安価格</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#4ade80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif' }}>
                {homeItem && homeItem.min_price > 0 ? `${homeItem.min_price.toLocaleString()}G` : '-'}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #c084fc', borderRadius: '8px', padding: '5px 7px' }}>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '2px' }}>目標販売値 (中央値)</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#c084fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif' }}>
                {selectedOp.sellPrice.toLocaleString()}G
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #38bdf8', borderRadius: '8px', padding: '5px 7px' }}>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '2px' }}>販売速度</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif' }}>
                {homeItem?.sale_velocity ? `${homeItem.sale_velocity.toFixed(1)}個/日` : '-'}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #ffb703', borderRadius: '8px', padding: '5px 7px' }}>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '2px' }}>7日売買数</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffb703', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif' }}>
                {homeItem?.sale_trades ? `${homeItem.sale_trades.toLocaleString()}件` : '-'}
              </div>
            </div>
          </div>

          {/* 7-Day Trend Chart Container */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '0.5rem 0.7rem', marginBottom: '0.6rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="fa-solid fa-chart-line" style={{ color: '#38bdf8' }}></i> 日別相場推移 (直近7日間)
              </div>
              {renderTrendBadge(homeItem?.trend_pct || 0)}
            </div>
            <div style={{ width: '100%', position: 'relative' }}>
              <TrendChartCanvas
                trend={alignedHomeTrend}
                trendPct={homeItem?.trend_pct || 0}
                lineColor="#38bdf8"
                height={105}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2px', width: '100%', height: '36px', marginTop: '2px', paddingTop: '3px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {alignedHomeTrend.map((d, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: '38px' }}>
                    <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.62rem' }}>{d.date}</div>
                    <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.62rem', fontFamily: 'Outfit, sans-serif' }}>
                      {d.weighted_avg > 0 ? (d.weighted_avg >= 1000000 ? `${Math.round(d.weighted_avg / 1000)}kG` : `${d.weighted_avg.toLocaleString()}G`) : '-'}
                    </div>
                    <div style={{ color: '#38bdf8', fontSize: '0.58rem', fontFamily: 'Outfit, sans-serif' }}>
                      {d.volume > 0 ? `${d.volume}個` : '0個'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sub-tabs and Table Container */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.4)', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={() => setHomeViewMode('history')}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                    background: homeViewMode === 'history' ? '#ffb703' : 'transparent',
                    color: homeViewMode === 'history' ? '#000000' : '#94a3b8',
                  }}
                >
                  <i className="fa-solid fa-clock-rotate-left"></i> 取引履歴
                </button>
                <button
                  onClick={() => setHomeViewMode('listings')}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                    background: homeViewMode === 'listings' ? '#ffb703' : 'transparent',
                    color: homeViewMode === 'listings' ? '#000000' : '#94a3b8',
                  }}
                >
                  <i className="fa-solid fa-list-ul"></i> 出品一覧
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', padding: '4px' }}>
              {homeViewMode === 'history' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '4px 6px' }}>日時 (JST)</th>
                      <th style={{ padding: '4px 6px' }}>購入者</th>
                      <th style={{ padding: '4px 6px', textAlign: 'center' }}>HQ</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>単価 (G)</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedHomeHistories.length > 0 ? (
                      displayedHomeHistories.map((h, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '4px 6px', color: '#94a3b8', fontSize: '0.66rem' }}>{formatTimeJst(h.ts)}</td>
                          <td style={{ padding: '4px 6px', color: '#38bdf8', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.buyer}>
                            {h.buyer}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>{renderQualityBadge(h.hq)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#f1f5f9', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
                            {h.price.toLocaleString()}G
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>
                            {h.qty}個
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>履歴なし</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : loadingHomeListings && displayedHomeListings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                  <i className="fa-solid fa-spinner fa-spin"></i> 出品データを取得中...
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '4px 6px' }}>ワールド</th>
                      <th style={{ padding: '4px 6px' }}>リテイナー</th>
                      <th style={{ padding: '4px 6px', textAlign: 'center' }}>品質</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>単価 (G)</th>
                      <th style={{ padding: '4px 6px', textAlign: 'center' }}>競合判定</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>数量</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>合計 (G)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedHomeListings.length > 0 ? (
                      displayedHomeListings.map((l, i) => {
                        const diffPct = selectedOp.sellPrice > 0
                          ? Math.round(((l.pricePerUnit - selectedOp.sellPrice) / selectedOp.sellPrice) * 100)
                          : 0;
                        const diffPctStr = diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`;
                        
                        let priceColor = '#38bdf8';
                        let badge = null;
                        let rowBg = undefined;

                        if (diffPct < -5) {
                          // 安値競合
                          priceColor = '#f472b6';
                          rowBg = 'rgba(244, 114, 182, 0.04)';
                          badge = (
                            <span style={{ background: 'rgba(244, 114, 182, 0.15)', color: '#f472b6', border: '1px solid rgba(244, 114, 182, 0.4)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <i className="fa-solid fa-arrow-trend-down"></i> 安値 ({diffPctStr})
                            </span>
                          );
                        } else if (diffPct > 5) {
                          // 高値
                          priceColor = '#ffb703';
                          badge = (
                            <span style={{ background: 'rgba(255, 183, 3, 0.18)', color: '#ffb703', border: '1px solid rgba(255, 183, 3, 0.4)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <i className="fa-solid fa-arrow-trend-up"></i> 高値 ({diffPctStr})
                            </span>
                          );
                        } else {
                          // 適正価格
                          priceColor = '#38bdf8';
                          badge = (
                            <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.35)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              適正 ({diffPctStr})
                            </span>
                          );
                        }

                        const dcName = WORLD_TO_DC[l.worldName] || '';
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg }}>
                            <td style={{ padding: '4px 6px', color: '#ffb703', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {l.worldName}
                              {dcName && (
                                <span style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 500, marginLeft: '3px' }}>
                                  ({dcName})
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '4px 6px', color: '#38bdf8', fontWeight: 600, maxWidth: '85px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.retainerName}>
                              {l.retainerName}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>{l.hq ? (
                              <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.18)', border: '1px solid rgba(56, 189, 248, 0.45)', color: '#38bdf8', fontFamily: 'Outfit, sans-serif' }}>HQ</span>
                            ) : (
                              <span style={{ fontSize: '0.66rem', fontWeight: 600, color: '#94a3b8' }}>NQ</span>
                            )}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: priceColor, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
                              {l.pricePerUnit.toLocaleString()}G
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              {badge}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#f1f5f9', fontFamily: 'Outfit, sans-serif' }}>{l.quantity}個</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#ffb703', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{l.total.toLocaleString()}G</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>出品がありません</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
});
