import React, { useMemo } from 'react';
import type { MarketItem } from '../../services/marketDataService';
import type { ListingEntry } from '../../services/universalisClient';
import { TrendChartCanvas } from '../../shared/TrendChartCanvas';
import { getOrComputeDailyTrend, renderQualityBadge } from './marketUtils';
import { WORLD_TO_DC } from '../../shared/marketConstants';

interface MarketDetailPaneProps {
  selectedItem: MarketItem | null;
  selectedWorld: string;
  activeDc: string;
  scopeMinSummary: {
    selWorldMin: number;
    dcMin: { price: number; world: string };
    allMin: { price: number; world: string };
  };
  cachedScopes: {
    world: ListingEntry[];
    dc: ListingEntry[];
    all: ListingEntry[];
    worldUnits: number;
    dcUnits: number;
    allUnits: number;
    worldError?: boolean;
    dcError?: boolean;
    allError?: boolean;
  };
  listingsScope: 'world' | 'dc' | 'all';
  setListingsScope: (scope: 'world' | 'dc' | 'all') => void;
  loadingListings: boolean;
  onRetry?: () => void;
}

export const MarketDetailPane: React.FC<MarketDetailPaneProps> = React.memo(({
  selectedItem,
  selectedWorld,
  activeDc,
  scopeMinSummary,
  cachedScopes,
  listingsScope,
  setListingsScope,
  loadingListings,
  onRetry,
}) => {
  // 表示中スコープのAPIエラー判定
  const currentError = useMemo(() => {
    if (listingsScope === 'dc') return Boolean(cachedScopes.dcError);
    if (listingsScope === 'all') return Boolean(cachedScopes.allError);
    return Boolean(cachedScopes.worldError);
  }, [listingsScope, cachedScopes]);

  // 表示中スコープの出品一覧
  const currentDisplayedListings = useMemo(() => {
    if (listingsScope === 'dc') return cachedScopes.dc;
    if (listingsScope === 'all') return cachedScopes.all;
    return cachedScopes.world;
  }, [listingsScope, cachedScopes]);

  // 出品数・ユニット数バッジ
  const currentCountBadge = useMemo(() => {
    if (currentError) return 'APIエラー';
    const list = currentDisplayedListings;
    const units = listingsScope === 'dc'
      ? cachedScopes.dcUnits
      : listingsScope === 'all'
      ? cachedScopes.allUnits
      : cachedScopes.worldUnits;
    return `${list.length}件 (${units.toLocaleString()}個)`;
  }, [currentDisplayedListings, listingsScope, cachedScopes, currentError]);

  // クリーンデータ (バックエンド集計済み)
  const cleanItemData = useMemo(() => {
    if (!selectedItem) return null;
    return {
      cleanHistory: selectedItem.history || [],
      metrics: {
        min_price: selectedItem.min_price || 0,
        avg_price: selectedItem.avg_price || 0,
        max_price: selectedItem.max_price || 0,
        sale_velocity: selectedItem.sale_velocity || 0,
        sale_trades: selectedItem.sale_trades || 0,
        daily_revenue: selectedItem.daily_revenue || 0,
      },
    };
  }, [selectedItem]);

  const hasHistory = useMemo(() => {
    if (!selectedItem) return false;
    return (cleanItemData?.metrics.sale_trades || selectedItem.sale_trades || 0) > 0 ||
      (cleanItemData?.metrics.min_price || selectedItem.min_price || 0) > 0;
  }, [cleanItemData, selectedItem]);

  return (
    <div
      className="pc-right-pane"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        height: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.1rem 1.25rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {selectedItem ? (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {/* Header Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              background: 'rgba(22, 30, 49, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              marginBottom: '0.75rem',
              flexShrink: 0,
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <img
                src={selectedItem.icon_url || 'https://v2.xivapi.com/api/asset?path=ui/icon/020000/021001_hr1.tex&format=png'}
                alt=""
                loading="lazy"
                decoding="async"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#0b111e',
                  objectFit: 'contain',
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: '#ffffff',
                    lineHeight: 1.2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span>{selectedItem.item_name}</span>
                  {selectedItem.hq ? (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 900,
                        color: '#ffb703',
                        background: 'rgba(255,183,3,0.18)',
                        border: '1px solid rgba(255,183,3,0.5)',
                        padding: '2px 6px',
                        borderRadius: '6px',
                      }}
                    >
                      HQ
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#94a3b8',
                        background: 'rgba(148,163,184,0.12)',
                        border: '1px solid rgba(148,163,184,0.3)',
                        padding: '2px 6px',
                        borderRadius: '6px',
                      }}
                    >
                      NQ
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.7rem',
                    marginTop: '3px',
                  }}
                >
                  ID: {selectedItem.item_id} | 選択中ワールド: <strong style={{ color: '#00d2ff' }}>{selectedWorld}</strong> | 売買速度:{' '}
                  <strong style={{ color: '#00d2ff', fontFamily: 'Outfit, sans-serif' }}>
                    {hasHistory ? `${(selectedItem.sale_velocity || 0).toFixed(1)} 個/日` : '履歴なし'}
                  </strong>
                </div>
              </div>
            </div>

            <a
              href={`https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/?patch=&db_search_category=item&category2=&q=${encodeURIComponent(
                selectedItem.item_name || ''
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.82rem',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(0, 210, 255, 0.12)',
                border: '1px solid rgba(0, 210, 255, 0.3)',
                color: '#00d2ff',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Lodestone <i className="fa-solid fa-arrow-up-right-from-square"></i>
            </a>
          </div>

          {/* 2-Split Grid: Left (History & Trends) vs Right (Live Listings) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* 👈 Left Pane: History & Trend */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
                gap: '0.75rem',
                background: 'rgba(22, 30, 49, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '0.85rem',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}
            >
              {/* 3 Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', flexShrink: 0 }}>
                {/* 最安値 Card */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(74, 222, 128, 0.35)',
                    borderLeft: '4px solid #4ade80',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-tag" style={{ color: '#4ade80' }}></i> 最安値 ({selectedWorld})
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>{selectedWorld}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80', fontFamily: 'Outfit, sans-serif' }}>
                    {hasHistory && (cleanItemData?.metrics.min_price || selectedItem.min_price || 0) > 0
                      ? `${(cleanItemData?.metrics.min_price || selectedItem.min_price || 0).toLocaleString()}G`
                      : '-'}
                  </div>
                </div>

                {/* 平均値 Card */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(192, 132, 252, 0.35)',
                    borderLeft: '4px solid #c084fc',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-scale-balanced" style={{ color: '#c084fc' }}></i> 平均値 ({selectedWorld})
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>{selectedWorld}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c084fc', fontFamily: 'Outfit, sans-serif' }}>
                    {hasHistory && (cleanItemData?.metrics.avg_price || selectedItem.avg_price || 0) > 0
                      ? `${Math.round(cleanItemData?.metrics.avg_price || selectedItem.avg_price || 0).toLocaleString()}G`
                      : '-'}
                  </div>
                </div>

                {/* 最高値 Card */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(248, 113, 113, 0.35)',
                    borderLeft: '4px solid #f87171',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-arrow-trend-up" style={{ color: '#f87171' }}></i> 最高値 ({selectedWorld})
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>{selectedWorld}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f87171', fontFamily: 'Outfit, sans-serif' }}>
                    {hasHistory && (cleanItemData?.metrics.max_price || selectedItem.max_price || 0) > 0
                      ? `${(cleanItemData?.metrics.max_price || selectedItem.max_price || 0).toLocaleString()}G`
                      : '-'}
                  </div>
                </div>
              </div>

              {/* 7-Day Trend Chart Container */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '0.65rem 0.85rem',
                  flexShrink: 0,
                }}
              >
                {/* Header: Title + Trend Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <i className="fa-solid fa-chart-line" style={{ color: '#4ade80' }}></i> 販売量・金額推移 ({selectedWorld})
                  </div>
                  {(() => {
                    if (!hasHistory) {
                      return (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: '#94a3b8',
                            fontWeight: 700,
                            background: 'rgba(148, 163, 184, 0.12)',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          取引データなし
                        </span>
                      );
                    }
                    const { trendPct } = getOrComputeDailyTrend(selectedItem);
                    if (trendPct > 0) {
                      return (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: '#4ade80',
                            fontWeight: 700,
                            background: 'rgba(74, 222, 128, 0.12)',
                            border: '1px solid rgba(74, 222, 128, 0.3)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          <i className="fa-solid fa-arrow-trend-up"></i> +{trendPct}% (値上がり)
                        </span>
                      );
                    } else if (trendPct < 0) {
                      return (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: '#f87171',
                            fontWeight: 700,
                            background: 'rgba(248, 113, 113, 0.12)',
                            border: '1px solid rgba(248, 113, 113, 0.3)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          <i className="fa-solid fa-arrow-trend-down"></i> {trendPct}% (値下がり)
                        </span>
                      );
                    }
                    return (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: '#38bdf8',
                          fontWeight: 700,
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        ➡️ 0% (安定相場)
                      </span>
                    );
                  })()}
                </div>

                {/* Canvas for Dual Curve/Bar Chart */}
                {!hasHistory ? (
                  <div
                    style={{
                      height: '105px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      color: '#94a3b8',
                      fontSize: '0.75rem',
                      background: 'rgba(0, 0, 0, 0.15)',
                      borderRadius: '8px',
                    }}
                  >
                    <i className="fa-regular fa-clock" style={{ fontSize: '1.2rem', color: '#64748b' }}></i>
                    <span>直近7日間の取引履歴はありません</span>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>（出品状況は右側の出品一覧で確認できます）</span>
                  </div>
                ) : (
                  <div style={{ width: '100%', position: 'relative' }}>
                    {(() => {
                      const { trend, trendPct } = getOrComputeDailyTrend(selectedItem);
                      return (
                        <TrendChartCanvas
                          key={`${selectedItem.item_id}_${selectedItem.hq ? 'hq' : 'nq'}_${selectedWorld}`}
                          trend={trend}
                          trendPct={trendPct}
                          height={105}
                          showDateLabels={true}
                        />
                      );
                    })()}

                    {/* Data Labels Summary Footer */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '2px',
                        width: '100%',
                        marginTop: '4px',
                        paddingTop: '4px',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      {(() => {
                        const { trend } = getOrComputeDailyTrend(selectedItem);
                        if (!trend || trend.length === 0) return null;
                        return trend.map((d, i) => (
                          <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: '42px' }}>
                            <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.65rem' }}>{d.date}</div>
                            <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.65rem', fontFamily: 'Outfit, sans-serif' }}>
                              {d.weighted_avg > 0 ? `${d.weighted_avg.toLocaleString()}G` : '-'}
                            </div>
                            <div style={{ color: '#38bdf8', fontSize: '0.6rem', fontFamily: 'Outfit, sans-serif' }}>
                              {d.volume > 0 ? `${d.volume}個` : '0個'}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Recent History Table */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: '#ffffff',
                    marginBottom: '0.4rem',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <i className="fa-solid fa-receipt" style={{ color: '#00d2ff' }}></i> 直近の売買取引履歴一覧 ({selectedWorld})
                </div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.2)',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                          color: '#94a3b8',
                          background: 'rgba(0,0,0,0.3)',
                          textAlign: 'left',
                        }}
                      >
                        <th style={{ padding: '4px 6px' }}>取引日時 (JST)</th>
                        <th style={{ padding: '4px 6px' }}>購入者</th>
                        <th style={{ padding: '4px 6px', textAlign: 'center' }}>品質</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right' }}>単価</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right' }}>数量</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right' }}>合計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cleanItemData?.cleanHistory || selectedItem.history || []).length > 0 ? (
                        (cleanItemData?.cleanHistory || selectedItem.history || []).slice(0, 30).map((h, i) => {
                          const dateStr = h.ts
                            ? new Date(h.ts * 1000).toLocaleString('ja-JP', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '4px 6px', color: '#94a3b8', fontFamily: 'monospace' }}>{dateStr}</td>
                              <td style={{ padding: '4px 6px', color: '#f1f5f9' }}>{h.buyer || '-'}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'center' }}>{renderQualityBadge(Boolean(h.hq))}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', color: '#00d2ff', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
                                {h.price.toLocaleString()}G
                              </td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', color: '#f1f5f9', fontFamily: 'Outfit, sans-serif' }}>
                                {h.qty}
                              </td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', color: '#f1f5f9', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
                                {(h.price * h.qty).toLocaleString()}G
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                            取引履歴がありません
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 👉 Right Pane: Live Listings */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
                gap: '0.75rem',
                background: 'rgba(22, 30, 49, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '0.85rem',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}
            >
              {/* 3 Scope Min Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', flexShrink: 0 }}>
                {/* 選択サーバー最安 */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(74, 222, 128, 0.35)',
                    borderLeft: '4px solid #4ade80',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-tag" style={{ color: '#4ade80' }}></i> 選択サーバー最安
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>{selectedWorld}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80', fontFamily: 'Outfit, sans-serif' }}>
                    {scopeMinSummary.selWorldMin > 0 ? `${scopeMinSummary.selWorldMin.toLocaleString()}G` : '-'}
                  </div>
                </div>

                {/* 同DC最安 */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderLeft: '4px solid #38bdf8',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-layer-group" style={{ color: '#38bdf8' }}></i> 同DC最安 ({activeDc})
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8' }}>{scopeMinSummary.dcMin.world}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'Outfit, sans-serif' }}>
                    {scopeMinSummary.dcMin.price > 0 ? `${scopeMinSummary.dcMin.price.toLocaleString()}G` : '-'}
                  </div>
                </div>

                {/* 全DC最安 */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 183, 3, 0.35)',
                    borderLeft: '4px solid #ffb703',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-trophy" style={{ color: '#ffb703' }}></i> 全DC最安 (日本)
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffb703', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{scopeMinSummary.allMin.world}</span>
                    {WORLD_TO_DC[scopeMinSummary.allMin.world] && (
                      <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600 }}>
                        ({WORLD_TO_DC[scopeMinSummary.allMin.world]})
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffb703', fontFamily: 'Outfit, sans-serif' }}>
                    {scopeMinSummary.allMin.price > 0 ? `${scopeMinSummary.allMin.price.toLocaleString()}G` : '-'}
                  </div>
                </div>
              </div>

              {/* Listings Controls & Table */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  overflow: 'hidden',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.5rem',
                    paddingBottom: '0.4rem',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffb703', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <i className="fa-solid fa-store"></i> リアルタイム出品状況
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: currentError ? '#f87171' : '#94a3b8',
                        fontWeight: currentError ? 700 : 400,
                        marginLeft: '6px',
                      }}
                    >
                      {currentCountBadge}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div
                      style={{
                        display: 'flex',
                        background: 'rgba(0,0,0,0.4)',
                        padding: '2px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <button
                        onClick={() => setListingsScope('world')}
                        style={{
                          padding: '3px 8px',
                          fontSize: '0.7rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'all 0.2s ease',
                          ...(listingsScope === 'world'
                            ? {
                                background: '#00d2ff',
                                color: '#0a0e1a',
                                fontWeight: 800,
                              }
                            : {
                                background: 'transparent',
                                color: '#94a3b8',
                              }),
                        }}
                      >
                        自鯖
                      </button>
                      <button
                        onClick={() => setListingsScope('dc')}
                        style={{
                          padding: '3px 8px',
                          fontSize: '0.7rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'all 0.2s ease',
                          ...(listingsScope === 'dc'
                            ? {
                                background: '#38bdf8',
                                color: '#0a0e1a',
                                fontWeight: 800,
                              }
                            : {
                                background: 'transparent',
                                color: '#94a3b8',
                              }),
                        }}
                      >
                        同DC
                      </button>
                      <button
                        onClick={() => setListingsScope('all')}
                        style={{
                          padding: '3px 8px',
                          fontSize: '0.7rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'all 0.2s ease',
                          ...(listingsScope === 'all'
                            ? {
                                background: '#ffb703',
                                color: '#0a0e1a',
                                fontWeight: 800,
                              }
                            : {
                                background: 'transparent',
                                color: '#94a3b8',
                              }),
                        }}
                      >
                        全DC
                      </button>
                    </div>
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        disabled={loadingListings}
                        title="出品情報を再取得 (リフレッシュ)"
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.72rem',
                          borderRadius: '6px',
                          cursor: loadingListings ? 'not-allowed' : 'pointer',
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: loadingListings ? '#00d2ff' : '#94a3b8',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '27px',
                        }}
                        onMouseEnter={(e) => {
                          if (!loadingListings) {
                            e.currentTarget.style.color = '#00d2ff';
                            e.currentTarget.style.borderColor = 'rgba(0, 210, 255, 0.4)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!loadingListings) {
                            e.currentTarget.style.color = '#94a3b8';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                          }
                        }}
                      >
                        <i className={`fa-solid fa-arrows-rotate ${loadingListings ? 'fa-spin' : ''}`}></i>
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {loadingListings ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                      <i className="fa-solid fa-spinner fa-spin"></i> 出品データを取得中...
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                      <thead>
                        <tr
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            color: '#94a3b8',
                            textAlign: 'left',
                            background: 'rgba(0,0,0,0.3)',
                          }}
                        >
                          <th style={{ padding: '4px 6px' }}>ワールド</th>
                          <th style={{ padding: '4px 6px' }}>リテイナー</th>
                          <th style={{ padding: '4px 6px', textAlign: 'center' }}>品質</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>単価 (G)</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>数量</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>合計金額 (G)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentDisplayedListings.length > 0 ? (
                          currentDisplayedListings.slice(0, 100).map((l, i) => {
                            const isHome = l.worldName === selectedWorld;
                            const dcName = WORLD_TO_DC[l.worldName] || '';
                            const rowBg = isHome ? 'rgba(0, 210, 255, 0.08)' : 'transparent';
                            const rowBorder = isHome ? '3px solid #00d2ff' : '3px solid transparent';

                            return (
                              <tr
                                key={i}
                                style={{
                                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                                  background: rowBg,
                                  borderLeft: rowBorder,
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <td style={{ padding: '4px 6px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  {isHome ? (
                                    <span style={{ color: '#00d2ff', fontWeight: 800 }}>
                                      {l.worldName}
                                      {dcName && (
                                        <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 500, marginLeft: '3px' }}>
                                          ({dcName})
                                        </span>
                                      )}{' '}
                                      <span
                                        style={{
                                          fontSize: '0.6rem',
                                          padding: '1px 4px',
                                          borderRadius: '3px',
                                          background: 'rgba(0,210,255,0.2)',
                                          border: '1px solid rgba(0,210,255,0.5)',
                                          marginLeft: '2px',
                                        }}
                                      >
                                        自鯖
                                      </span>
                                    </span>
                                  ) : (
                                    <span style={{ color: '#ffb703' }}>
                                      {l.worldName}
                                      {dcName && (
                                        <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 500, marginLeft: '3px' }}>
                                          ({dcName})
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </td>
                                <td
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    color: '#38bdf8',
                                    maxWidth: '100px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={l.retainerName}
                                >
                                  {l.retainerName}
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                  {renderQualityBadge(l.hq)}
                                </td>
                                <td
                                  style={{
                                    padding: '4px 6px',
                                    textAlign: 'right',
                                    color: '#4ade80',
                                    fontWeight: 800,
                                    fontFamily: 'Outfit, sans-serif',
                                  }}
                                >
                                  {l.pricePerUnit.toLocaleString()}G
                                </td>
                                <td
                                  style={{
                                    padding: '4px 6px',
                                    textAlign: 'right',
                                    color: '#f1f5f9',
                                    fontWeight: 600,
                                    fontFamily: 'Outfit, sans-serif',
                                  }}
                                >
                                  {l.quantity}個
                                </td>
                                <td
                                  style={{
                                    padding: '4px 6px',
                                    textAlign: 'right',
                                    color: '#ffb703',
                                    fontWeight: 800,
                                    fontFamily: 'Outfit, sans-serif',
                                  }}
                                >
                                  {l.total.toLocaleString()}G
                                </td>
                              </tr>
                            );
                          })
                        ) : currentError ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                              <div style={{ color: '#f87171', fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                API通信エラーにより出品情報を取得できませんでした
                              </div>
                              <div style={{ color: '#94a3b8', fontSize: '0.72rem', lineHeight: 1.5, marginBottom: '12px' }}>
                                Universalis APIが高負荷または応答タイムアウトの可能性があります。
                              </div>
                              {onRetry && (
                                <button
                                  onClick={onRetry}
                                  disabled={loadingListings}
                                  style={{
                                    padding: '5px 16px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: '#0a0e1a',
                                    background: '#00d2ff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: loadingListings ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 10px rgba(0, 210, 255, 0.3)',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                                >
                                  <i className={`fa-solid fa-arrows-rotate ${loadingListings ? 'fa-spin' : ''}`}></i>
                                  再試行する
                                </button>
                              )}
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                              現在出品中の商品はありません
                            </td>
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
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: '3.5rem',
            color: '#94a3b8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <div
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              background: 'rgba(0, 210, 255, 0.08)',
              border: '1px solid rgba(0, 210, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
              boxShadow: '0 0 35px rgba(0, 210, 255, 0.15)',
            }}
          >
            <i className="fa-solid fa-chart-line" style={{ fontSize: '2.5rem', color: '#00d2ff' }}></i>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.5rem' }}>
            品目を選択してください
          </div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '380px', lineHeight: 1.6 }}>
            左側のカード一覧からアイテムを選択すると全32ワールドの価格比較と推移が表示されます
          </div>
        </div>
      )}
    </div>
  );
});

MarketDetailPane.displayName = 'MarketDetailPane';
