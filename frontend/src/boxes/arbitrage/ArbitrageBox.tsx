import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { JAPAN_DCS, getSavedSharedWorld, saveSharedWorld } from '../../shared/marketConstants';
import { fetchAndPrepareMarketData, type MarketItem } from '../../services/marketDataService';
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
  fetchListingsFromUniversalis,
} from './arbitrageUtils';
import { ArbitrageDetailPane } from './ArbitrageDetailPane';
import { ArbitrageCard } from './ArbitrageCard';



export const ArbitrageBox: React.FC = () => {
  const [homeWorld, setHomeWorld] = useState<string>(() => getSavedSharedWorld());
  const [sortMode, setSortMode] = useState<ArbitrageSortMode>('dailyProfit');
  const [minVelocity, setMinVelocity] = useState<number>(1);
  const [excludeCrystals, setExcludeCrystals] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [allData, setAllData] = useState<Record<string, MarketItem[]>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Selected Opportunity for Detail Monitor
  const [selectedOp, setSelectedOp] = useState<ArbitrageOpportunity | null>(null);

  // Listing fetch states for Source and Home
  const [sourceListings, setSourceListings] = useState<ListingEntry[]>([]);
  const [homeListings, setHomeListings] = useState<ListingEntry[]>([]);
  const [loadingSourceListings, setLoadingSourceListings] = useState<boolean>(false);
  const [loadingHomeListings, setLoadingHomeListings] = useState<boolean>(false);

  // View modes for both windows
  const [sourceViewMode, setSourceViewMode] = useState<ArbitrageViewMode>('history');
  const [homeViewMode, setHomeViewMode] = useState<ArbitrageViewMode>('history');

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
    setSourceViewMode('history');
    setHomeViewMode('history');
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

          // Collect all available categories from catalog & items
          const catSet = new Set<string>();
          if (dataset.items) {
            Object.values(dataset.items).forEach((item) => {
              if (item.category) catSet.add(item.category);
            });
          }
          if (catSet.size === 0) {
            Object.values(dataset.data).forEach((worldItems) => {
              worldItems.forEach((it) => {
                if (it.category_name) catSet.add(it.category_name);
              });
            });
          }
          const cats = Array.from(catSet).sort();
          setAvailableCategories(cats);
          setSelectedCategories(cats);

          setLoading(false);
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
    return computeArbitrageOpportunities(allData, {
      homeWorld,
      sortMode,
      minVelocity,
      excludeCrystals,
      searchQuery,
      availableCategories,
      selectedCategories,
    });
  }, [allData, homeWorld, minVelocity, excludeCrystals, searchQuery, sortMode, selectedCategories, availableCategories]);


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

  // Aligned 7-Day Trend Arrays for Source & Home (Strict Date Vertical Sync)
  const alignedSourceTrend = useMemo(() => {
    return alignDailyTrend(sourceItem?.daily_trend, getWeekRangeJst());
  }, [sourceItem]);

  const alignedHomeTrend = useMemo(() => {
    return alignDailyTrend(homeItem?.daily_trend, getWeekRangeJst());
  }, [homeItem]);

  // Listings in-memory cache to avoid redundant API calls
  const listingsCacheRef = useRef<Map<string, ListingEntry[]>>(new Map());

  // Reset subtabs to 'history' and clear current listings on item change
  useEffect(() => {
    setSourceViewMode('history');
    setHomeViewMode('history');
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
        const rawList = await fetchListingsFromUniversalis('Japan', op.itemId, op.isHq, controller.signal);
        if (isMounted) {
          listingsCacheRef.current.set(cacheKey, rawList);
          setSourceListings(rawList);
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
        const rawList = await fetchListingsFromUniversalis(op.homeWorld, op.itemId, op.isHq, controller.signal);
        if (isMounted) {
          listingsCacheRef.current.set(cacheKey, rawList);
          setHomeListings(rawList);
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
    <div className="container" style={{ maxWidth: '1850px', margin: '0 auto', height: '100%', padding: '0.25rem 0.6rem', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div className="pc-dashboard-container" style={{ display: 'flex', gap: '1.25rem', alignItems: 'stretch', width: '100%', flex: 1, minHeight: 0, height: '100%', marginTop: 0 }}>
        
        {/* ================= LEFT PANE (440px) ================= */}
        <div className="left-card-scroll-pane" style={{ width: '440px', flex: '0 0 440px', height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '0.85rem', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(12px)' }}>
          
          {/* Header Controls (Exact 1:1 Matching market.html) */}
          <div className="left-pane-header" style={{ flexShrink: 0, background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '8px 10px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            
            {/* Row 1: Sort Toggle (利益額/日商額) + Min Velocity Select + Crystal Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '2px' }}>
              <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={() => setSortMode('dailyProfit')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.74rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    ...(sortMode === 'dailyProfit'
                      ? { background: 'linear-gradient(135deg, #ffb703, #d97706)', color: '#ffffff', fontWeight: 700, boxShadow: '0 2px 8px rgba(255, 183, 3, 0.4)' }
                      : { background: 'transparent', color: '#94a3b8', fontWeight: 600 })
                  }}
                >
                  日商額
                </button>
                <button
                  onClick={() => setSortMode('unitProfit')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.74rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    ...(sortMode === 'unitProfit'
                      ? { background: 'linear-gradient(135deg, #ffb703, #d97706)', color: '#ffffff', fontWeight: 700, boxShadow: '0 2px 8px rgba(255, 183, 3, 0.4)' }
                      : { background: 'transparent', color: '#94a3b8', fontWeight: 600 })
                  }}
                >
                  利益額
                </button>
              </div>

              {/* Velocity Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.35)', padding: '2px 6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', flex: 1 }}>
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

        {/* ================= RIGHT PANE: 2-Window Monitor ================= */}
        <div className="pc-right-pane" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%', maxHeight: '100%', overflow: 'hidden', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1.1rem 1.25rem', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(12px)' }}>
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
