import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { JAPAN_DCS, getSavedSharedWorld, saveSharedWorld } from '../../shared/marketConstants';
import {
  fetchAndPrepareMarketData,
  fetchAndPrepareListingsData,
  getCachedListingsDataset,
  extractAvailableCategories,
  type MarketItem,
  type RawListingTuple,
} from '../../services/marketDataService';
import { fetchMarketListings } from '../../services/universalisClient';
import { CategoryFilterDropdown } from '../../shared/CategoryFilterDropdown';
import {
  type ArbitrageOpportunity,
  type ListingEntry,
  type ArbitrageSortMode,
  type ArbitrageViewMode,
} from './arbitrageTypes';
import {
  getWeekRangeJst,
  alignDailyTrend,
  computeArbitrageOpportunities,
} from './arbitrageUtils';
import { ArbitrageDetailPane } from './ArbitrageDetailPane';
import { ArbitrageCard } from './ArbitrageCard';
import { useResizablePane } from '../../shared/useResizablePane';
import { PaneSplitter } from '../../shared/PaneSplitter';

export const ArbitrageBox: React.FC = () => {
  const [homeWorld, setHomeWorld] = useState<string>(() => getSavedSharedWorld());

  // Left Pane Resizer Hook (drag resizer + localStorage memory)
  const { width: leftPaneWidth, isResizing, startResizing } = useResizablePane();
  const [sortMode, setSortMode] = useState<ArbitrageSortMode>('dailyProfit');
  const [sourcingScope, setSourcingScope] = useState<'all_dc' | 'dc'>('all_dc');
  const [isSourcingCollapsed, setIsSourcingCollapsed] = useState<boolean>(true);
  const [minVelocity, setMinVelocity] = useState<number>(0);
  const [excludeCrystals, setExcludeCrystals] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [allData, setAllData] = useState<Record<string, MarketItem[]>>({});
  const [itemsCatalog, setItemsCatalog] = useState<Record<string, any>>({});
  const [listingsMap, setListingsMap] = useState<Record<string, Record<string, RawListingTuple[]>> | undefined>(
    () => getCachedListingsDataset()?.listings
  );
  const [loading, setLoading] = useState<boolean>(true);

  // Selected Opportunity for Detail Monitor
  const [selectedOp, setSelectedOp] = useState<ArbitrageOpportunity | null>(null);

  // Listing fetch states for Source and Home
  const [sourceListings, setSourceListings] = useState<ListingEntry[]>([]);
  const [homeListings, setHomeListings] = useState<ListingEntry[]>([]);
  const [loadingSourceListings, setLoadingSourceListings] = useState<boolean>(false);
  const [loadingHomeListings, setLoadingHomeListings] = useState<boolean>(false);

  // View modes for both windows
  const [sourceViewMode, setSourceViewMode] = useState<ArbitrageViewMode>('listings');
  const [homeViewMode, setHomeViewMode] = useState<ArbitrageViewMode>('listings');

  // World change listener (Sync with Header & other tabs)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SET_SHARED_WORLD' && event.data.world) {
        setHomeWorld(event.data.world);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleWorldChange = (w: string) => {
    setHomeWorld(w);
    saveSharedWorld(w);
    window.postMessage({ type: 'SET_SHARED_WORLD', world: w }, '*');
  };

  const handleSelectOp = useCallback((op: ArbitrageOpportunity) => {
    setSelectedOp(op);
    setSourceViewMode('listings');
    setHomeViewMode('listings');
  }, []);

  // Load Data using shared marketDataService
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        const dataset = await fetchAndPrepareMarketData();
        if (isMounted) {
          setAllData(dataset.data);
          if (dataset.items) {
            setItemsCatalog(dataset.items);
          }

          // Collect all available categories from catalog & items
          const cats = extractAvailableCategories(dataset);
          setAvailableCategories(cats);
          setSelectedCategories(cats);

          setLoading(false);

          // バックグラウンドで事前出品データも取得・反映 (0msサヤ取り計算)
          fetchAndPrepareListingsData().then((lData) => {
            if (isMounted && lData?.listings) {
              setListingsMap(lData.listings);
            }
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to load market data in ArbitrageBox:', err);
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, []);

  // Compute Arbitrage Opportunities
  const opportunities = useMemo(() => {
    return computeArbitrageOpportunities(
      allData,
      {
        homeWorld,
        sortMode,
        minVelocity,
        excludeCrystals,
        searchQuery,
        availableCategories,
        selectedCategories,
        sourcingScope,
      },
      itemsCatalog,
      listingsMap
    );
  }, [allData, homeWorld, minVelocity, excludeCrystals, searchQuery, sortMode, selectedCategories, availableCategories, sourcingScope, itemsCatalog, listingsMap]);

  // Source and Home Item Lookups from in-memory allData
  const sourceItem = useMemo(() => {
    if (!selectedOp || !allData[selectedOp.sourceWorld]) return null;
    const items = allData[selectedOp.sourceWorld];
    return items.find((x) => x.item_id === selectedOp.itemId && Boolean(x.hq) === Boolean(selectedOp.isHq))
      || items.find((x) => x.item_id === selectedOp.itemId) || null;
  }, [selectedOp, allData]);

  const homeItem = useMemo(() => {
    if (!selectedOp || !allData[selectedOp.homeWorld]) return null;
    const items = allData[selectedOp.homeWorld];
    return items.find((x) => x.item_id === selectedOp.itemId && Boolean(x.hq) === Boolean(selectedOp.isHq))
      || items.find((x) => x.item_id === selectedOp.itemId) || null;
  }, [selectedOp, allData]);

  // 日付ラベル一覧 (JST基準 7日間を1回のみ生成して再利用)
  const weekDates = useMemo(() => getWeekRangeJst(), []);

  // Aligned 7-Day Trend Arrays for Source & Home (Strict Date Vertical Sync)
  const alignedSourceTrend = useMemo(() => {
    return alignDailyTrend(sourceItem?.daily_trend, weekDates);
  }, [sourceItem, weekDates]);

  const alignedHomeTrend = useMemo(() => {
    return alignDailyTrend(homeItem?.daily_trend, weekDates);
  }, [homeItem, weekDates]);

  // Listings in-memory cache to avoid redundant API calls
  const listingsCacheRef = useRef<Map<string, ListingEntry[]>>(new Map());

  // Reset subtabs to 'listings' and clear current listings on item change
  useEffect(() => {
    setSourceViewMode('listings');
    setHomeViewMode('listings');
    setSourceListings([]);
    setHomeListings([]);
    setLoadingSourceListings(false);
    setLoadingHomeListings(false);
  }, [selectedOp?.itemId, selectedOp?.isHq]);

  // Fetch Source Listings ONLY when user switches to 'listings' tab
  useEffect(() => {
    if (!selectedOp || sourceViewMode !== 'listings') return;

    const op = selectedOp;
    const cacheKey = `source_${op.itemId}_${op.isHq ? 'hq' : 'nq'}`;
    const cached = listingsCacheRef.current.get(cacheKey);

    if (cached && cached.length > 0) {
      setSourceListings(cached);
      setLoadingSourceListings(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setLoadingSourceListings(true);

    async function fetchSourceListings() {
      try {
        const res = await fetchMarketListings('Japan', op.itemId, { isHq: op.isHq, limit: 50, signal: controller.signal });
        if (isMounted) {
          listingsCacheRef.current.set(cacheKey, res.listings);
          setSourceListings(res.listings);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error('Failed source listings fetch:', e);
        }
      } finally {
        if (isMounted) setLoadingSourceListings(false);
      }
    }

    fetchSourceListings();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedOp?.itemId, selectedOp?.isHq, selectedOp?.sourceWorld, sourceViewMode]);

  // Fetch Home Listings ONLY when user switches to 'listings' tab
  useEffect(() => {
    if (!selectedOp || homeViewMode !== 'listings') return;

    const op = selectedOp;
    const cacheKey = `home_${op.itemId}_${op.isHq ? 'hq' : 'nq'}_${op.homeWorld}`;
    const cached = listingsCacheRef.current.get(cacheKey);

    if (cached && cached.length > 0) {
      setHomeListings(cached);
      setLoadingHomeListings(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setLoadingHomeListings(true);

    async function fetchHomeListings() {
      try {
        const res = await fetchMarketListings(op.homeWorld, op.itemId, { isHq: op.isHq, limit: 50, signal: controller.signal });
        if (isMounted) {
          listingsCacheRef.current.set(cacheKey, res.listings);
          setHomeListings(res.listings);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error('Failed home listings fetch:', e);
        }
      } finally {
        if (isMounted) setLoadingHomeListings(false);
      }
    }

    fetchHomeListings();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedOp?.itemId, selectedOp?.isHq, selectedOp?.homeWorld, homeViewMode]);



  // Formatted displayed lists strictly matching selectedOp quality (NQ vs HQ)
  const displayedSourceHistories = useMemo(() => {
    const list = (sourceItem?.history || []).map((h) => ({
      price: h.price,
      qty: h.qty,
      ts: h.ts,
      buyer: h.buyer || '-',
      hq: Boolean(h.hq),
    }));
    if (!selectedOp) return list;
    return list.filter((h) => Boolean(h.hq) === Boolean(selectedOp.isHq));
  }, [sourceItem, selectedOp]);

  const displayedSourceListings = useMemo(() => {
    if (!selectedOp) return sourceListings;
    return sourceListings.filter((l) => Boolean(l.hq) === Boolean(selectedOp.isHq));
  }, [sourceListings, selectedOp]);

  const displayedHomeHistories = useMemo(() => {
    const list = (homeItem?.history || []).map((h) => ({
      price: h.price,
      qty: h.qty,
      ts: h.ts,
      buyer: h.buyer || '-',
      hq: Boolean(h.hq),
    }));
    if (!selectedOp) return list;
    return list.filter((h) => Boolean(h.hq) === Boolean(selectedOp.isHq));
  }, [homeItem, selectedOp]);

  const displayedHomeListings = useMemo(() => {
    if (!selectedOp) return homeListings;
    return homeListings.filter((l) => Boolean(l.hq) === Boolean(selectedOp.isHq));
  }, [homeListings, selectedOp]);





  return (
    <div className="container" style={{ width: '100%', maxWidth: '100%', margin: '0 auto', height: '100%', padding: '0.25rem 0.6rem', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div
        className="pc-dashboard-container"
        style={{
          display: 'flex',
          gap: '0.65rem',
          alignItems: 'stretch',
          width: '100%',
          flex: 1,
          minHeight: 0,
          height: '100%',
          marginTop: 0,
          '--left-pane-width': `${leftPaneWidth}px`,
        } as React.CSSProperties}
      >
        
        {/* ================= LEFT PANE (Dynamic width with resizer) ================= */}
        <div className="left-card-scroll-pane" style={{ width: `${leftPaneWidth}px`, flex: `0 0 ${leftPaneWidth}px`, height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '0.85rem', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)' }}>
          
          {/* Header Controls (Exact 1:1 Matching market.html) */}
          <div className="left-pane-header" style={{ flexShrink: 0, background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '8px 10px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            
            {/* Row 1: Sort Buttons (日当利益 / 単価利益 / 利益率 / 日販数) + Sourcing Collapse Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', flex: 1 }}>
                {[
                  { key: 'dailyProfit', label: '日当利益' },
                  { key: 'unitProfit', label: '単価利益' },
                  { key: 'roiPercent', label: '利益率' },
                  { key: 'velocity', label: '日販数' },
                ].map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSortMode(s.key as any)}
                    style={{
                      flex: 1,
                      padding: '4px 6px',
                      fontSize: '0.74rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      border: 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                      ...(sortMode === s.key || (s.key === 'dailyProfit' && (sortMode as string) === 'totalProfit')
                        ? { background: 'linear-gradient(135deg, #ffb703, #d97706)', color: '#ffffff', fontWeight: 700, boxShadow: '0 2px 8px rgba(255, 183, 3, 0.4)' }
                        : { background: 'transparent', color: '#94a3b8', fontWeight: 600 })
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Sourcing Collapse Toggle Button */}
              <button
                type="button"
                onClick={() => setIsSourcingCollapsed(!isSourcingCollapsed)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.74rem',
                  borderRadius: '8px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isSourcingCollapsed ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 183, 3, 0.18)',
                  border: isSourcingCollapsed ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #ffb703',
                  color: isSourcingCollapsed ? '#94a3b8' : '#ffb703',
                  fontWeight: 600
                }}
                title={isSourcingCollapsed ? '仕入れ設定を展開' : '仕入れ設定を折りたたむ'}
              >
                <i className="fa-solid fa-boxes-packing" style={{ color: isSourcingCollapsed ? '#94a3b8' : '#ffb703' }}></i>
                <span>仕入れ設定</span>
                <i className={`fa-solid fa-chevron-${isSourcingCollapsed ? 'down' : 'up'}`} style={{ fontSize: '0.62rem' }}></i>
              </button>
            </div>

            {/* Row 2: Sourcing Scope (仕入れ) + Min Velocity Select (日販数) + Crystal Toggle [Collapsible] */}
            {!isSourcingCollapsed && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-boxes-packing" style={{ color: '#ffb703' }}></i> 仕入れ:
                  </span>
                  <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {[
                      { key: 'all_dc', label: '全DC' },
                      { key: 'dc', label: '同DC' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        onClick={() => setSourcingScope(item.key as any)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.74rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'all 0.2s ease',
                          whiteSpace: 'nowrap',
                          ...(sourcingScope === item.key
                            ? { background: 'linear-gradient(135deg, #ffb703, #d97706)', color: '#ffffff', fontWeight: 700, boxShadow: '0 2px 8px rgba(255, 183, 3, 0.4)' }
                            : { background: 'transparent', color: '#94a3b8', fontWeight: 600 })
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Velocity Select */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.35)', padding: '2px 6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', flex: 1, minWidth: 0 }}>
                  <i className="fa-solid fa-bolt" style={{ color: '#ffb703', fontSize: '0.72rem' }}></i>
                  <select
                    value={minVelocity}
                    onChange={(e) => setMinVelocity(Number(e.target.value))}
                    style={{ padding: '2px 4px', fontSize: '0.74rem', border: 'none', background: 'transparent', color: '#ffffff', width: '100%', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value={0} style={{ background: '#0f172a' }}>制限なし</option>
                    <option value={1} style={{ background: '#0f172a' }}>1個/日以上</option>
                    <option value={5} style={{ background: '#0f172a' }}>5個/日以上</option>
                    <option value={10} style={{ background: '#0f172a' }}>10個/日以上</option>
                    <option value={20} style={{ background: '#0f172a' }}>20個/日以上</option>
                    <option value={50} style={{ background: '#0f172a' }}>50個/日以上</option>
                  </select>
                </div>

                {/* Crystal ON/OFF Button */}
                <button
                  onClick={() => setExcludeCrystals(!excludeCrystals)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.74rem',
                    borderRadius: '8px',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    ...(excludeCrystals
                      ? { background: 'rgba(255, 183, 3, 0.18)', border: '1px solid #ffb703', color: '#ffb703', boxShadow: '0 0 10px rgba(255, 183, 3, 0.35)' }
                      : { background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8' })
                  }}
                  title="クリスタル類の表示/除外"
                >
                  <i className="fa-solid fa-gem"></i> {excludeCrystals ? 'ON' : 'OFF'}
                </button>
              </div>
            )}

            {/* Row 2: World Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <i className="fa-solid fa-house-user" style={{ color: '#ffb703' }}></i> ワールド選択:
              </span>
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <i
                  className="fa-solid fa-house-user"
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#ffb703',
                    fontSize: '0.82rem',
                    pointerEvents: 'none',
                    zIndex: 1
                  }}
                ></i>
                <select
                  value={homeWorld}
                  onChange={(e) => handleWorldChange(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid #ffb703',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    padding: '6px 8px 6px 28px',
                    outline: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(255, 183, 3, 0.2)'
                  }}
                >
                  {Object.entries(JAPAN_DCS).map(([dcName, worlds]) => (
                    <optgroup key={dcName} label={`${dcName} DC`} style={{ background: '#0f172a', color: '#ffb703', fontWeight: 700 }}>
                      {worlds.map((w) => (
                        <option key={w} value={w} style={{ background: '#0f172a', color: '#ffffff', fontWeight: 600 }}>
                          {w} ({dcName})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 3: Search Box + Category Filter Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.82rem', color: '#94a3b8' }}></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="アイテム検索..."
                  style={{
                    width: '100%',
                    padding: '6px 28px 6px 30px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <i
                    className="fa-solid fa-xmark"
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.88rem', color: '#94a3b8', cursor: 'pointer' }}
                    onClick={() => setSearchQuery('')}
                  ></i>
                )}
              </div>

              {/* Category Dropdown */}
              <CategoryFilterDropdown
                availableCategories={availableCategories}
                selectedCategories={selectedCategories}
                onSelectedCategoriesChange={setSelectedCategories}
                accentColor="#ffb703"
              />
            </div>

          </div>

          {/* Cards Scroll Container */}
          <div style={{ flex: 1, height: '100%', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '4px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', width: '100%', color: '#94a3b8' }}>
                <i className="fa-solid fa-spinner fa-spin fa-2x"></i><br /><br />金策データを分析中...
              </div>
            ) : opportunities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                金策機会が見つかりませんでした
              </div>
            ) : (
              opportunities.map((op, idx) => (
                <ArbitrageCard
                  key={`${op.itemId}_${op.isHq ? 'hq' : 'nq'}`}
                  op={op}
                  index={idx}
                  isSelected={Boolean(selectedOp && selectedOp.itemId === op.itemId && selectedOp.isHq === op.isHq)}
                  onSelect={handleSelectOp}
                />
              ))
            )}
          </div>
        </div>

        {/* Pane Splitter (Resize Handle) */}
        <PaneSplitter
          onMouseDown={startResizing}
          isResizing={isResizing}
          accentColor="#ffb703"
        />

        {/* ================= RIGHT PANE: 2-Window Monitor ================= */}
        <div className="pc-right-pane" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%', maxHeight: '100%', overflow: 'hidden', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1.1rem 1.25rem', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)' }}>
          <ArbitrageDetailPane
            selectedOp={selectedOp}
            sourceItem={sourceItem}
            homeItem={homeItem}
            alignedSourceTrend={alignedSourceTrend}
            alignedHomeTrend={alignedHomeTrend}
            sourceViewMode={sourceViewMode}
            setSourceViewMode={setSourceViewMode}
            homeViewMode={homeViewMode}
            setHomeViewMode={setHomeViewMode}
            loadingSourceListings={loadingSourceListings}
            loadingHomeListings={loadingHomeListings}
            displayedSourceHistories={displayedSourceHistories}
            displayedSourceListings={displayedSourceListings}
            displayedHomeHistories={displayedHomeHistories}
            displayedHomeListings={displayedHomeListings}
          />
        </div>

      </div>
    </div>
  );
};
