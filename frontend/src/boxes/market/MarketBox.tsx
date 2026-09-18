import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { JAPAN_DCS, WORLD_TO_DC, getSavedSharedWorld, saveSharedWorld } from '../../shared/marketConstants';
import { fetchAndPrepareMarketData, extractAvailableCategories, type MarketItem } from '../../services/marketDataService';
import { CategoryFilterDropdown } from '../../shared/CategoryFilterDropdown';
import { fetchCheapestTriad, type ListingEntry } from '../../services/universalisClient';
import { MarketCard } from './MarketCard';
import { MarketDetailPane } from './MarketDetailPane';
import { filterAndSortMarketItems } from './marketUtils';
import { useResizablePane } from '../../shared/useResizablePane';
import { PaneSplitter } from '../../shared/PaneSplitter';

export const MarketBox: React.FC = () => {
  const [selectedWorld, setSelectedWorld] = useState<string>(() => getSavedSharedWorld());
  const [activeDc, setActiveDc] = useState<string>(() => WORLD_TO_DC[getSavedSharedWorld()] || 'Elemental');
  const [sortMode, setSortMode] = useState<'velocity' | 'revenue' | 'max_price'>('velocity');
  const [excludeCrystals, setExcludeCrystals] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [allData, setAllData] = useState<Record<string, MarketItem[]>>({});
  const [itemsCatalog, setItemsCatalog] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Selected Item for Detail Monitor
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);

  // Left Pane Resizer Hook (drag resizer + localStorage memory)
  const { width: leftPaneWidth, isResizing, startResizing } = useResizablePane();

  // Detail Monitor state
  const [listingsScope, setListingsScope] = useState<'world' | 'dc' | 'all'>('world');
  const [loadingListings, setLoadingListings] = useState<boolean>(false);

  // Scope min summaries
  const [scopeMinSummary, setScopeMinSummary] = useState<{
    selWorldMin: number;
    dcMin: { price: number; world: string };
    allMin: { price: number; world: string };
  }>({
    selWorldMin: 0,
    dcMin: { price: 0, world: '-' },
    allMin: { price: 0, world: '-' },
  });

  // Universalis Multi-Scope Cache Map
  const [cachedScopes, setCachedScopes] = useState<{
    world: ListingEntry[];
    dc: ListingEntry[];
    all: ListingEntry[];
    worldUnits: number;
    dcUnits: number;
    allUnits: number;
    worldError: boolean;
    dcError: boolean;
    allError: boolean;
  }>({
    world: [],
    dc: [],
    all: [],
    worldUnits: 0,
    dcUnits: 0,
    allUnits: 0,
    worldError: false,
    dcError: false,
    allError: false,
  });

  // World change listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SET_SHARED_WORLD' && event.data.world) {
        const w = event.data.world;
        setSelectedWorld(w);
        if (WORLD_TO_DC[w]) setActiveDc(WORLD_TO_DC[w]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleWorldChange = useCallback((w: string) => {
    setSelectedWorld(w);
    if (WORLD_TO_DC[w]) setActiveDc(WORLD_TO_DC[w]);
    saveSharedWorld(w);
    window.postMessage({ type: 'SET_SHARED_WORLD', world: w }, '*');
  }, []);

  // Synchronize selectedItem with new world dataset when selectedWorld changes
  useEffect(() => {
    if (!selectedItem) return;
    const worldItems = allData[selectedWorld] || [];
    const matched = worldItems.find(
      (it) => it.item_id === selectedItem.item_id && Boolean(it.hq) === Boolean(selectedItem.hq)
    );
    if (matched) {
      setSelectedItem(matched);
    } else {
      const meta = itemsCatalog[selectedItem.item_id];
      setSelectedItem({
        item_id: selectedItem.item_id,
        item_name: selectedItem.item_name || meta?.name || `Item #${selectedItem.item_id}`,
        category_name: selectedItem.category_name || meta?.category,
        icon_url: selectedItem.icon_url || meta?.icon,
        hq: selectedItem.hq,
        min_price: 0,
        avg_price: 0,
        max_price: 0,
        sale_velocity: 0,
        sale_trades: 0,
        daily_revenue: 0,
        daily_trend: [],
        trend_pct: 0,
        history: [],
        shop_price: selectedItem.shop_price ?? meta?.shop_price,
      });
    }
  }, [selectedWorld, allData, itemsCatalog]);

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
        }
      } catch (err) {
        console.error('Failed to load market data in MarketBox:', err);
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, []);

  // Filter and Sort Items for Left Column
  const displayItems = useMemo(() => {
    return filterAndSortMarketItems(allData, itemsCatalog, {
      selectedWorld,
      searchQuery,
      selectedCategories,
      availableCategories,
      excludeCrystals,
      sortMode,
      limit: searchQuery.trim() ? 100 : 30,
    });
  }, [allData, itemsCatalog, selectedWorld, excludeCrystals, searchQuery, sortMode, selectedCategories, availableCategories]);

  // Compute DC Min & All Min summaries from local dataset when selectedItem changes
  useEffect(() => {
    if (!selectedItem) return;
    const iid = selectedItem.item_id;
    const isHq = selectedItem.hq;

    const selMin = selectedItem.min_price || 0;
    let dcMinPrice = Infinity;
    let dcMinWorld = '-';
    let allMinPrice = Infinity;
    let allMinWorld = '-';

    const dcWorldList = JAPAN_DCS[activeDc] || [];

    for (const [wName, wItems] of Object.entries(allData)) {
      const match = wItems.find((it) => it.item_id === iid && Boolean(it.hq) === isHq);
      if (match && match.min_price > 0) {
        if (dcWorldList.includes(wName)) {
          if (match.min_price < dcMinPrice) {
            dcMinPrice = match.min_price;
            dcMinWorld = wName;
          }
        }
        if (match.min_price < allMinPrice) {
          allMinPrice = match.min_price;
          allMinWorld = wName;
        }
      }
    }

    setScopeMinSummary({
      selWorldMin: selMin,
      dcMin: { price: dcMinPrice === Infinity ? 0 : dcMinPrice, world: dcMinWorld },
      allMin: { price: allMinPrice === Infinity ? 0 : allMinPrice, world: allMinWorld },
    });
  }, [selectedItem, allData, activeDc]);

  // Global In-Memory Cache (itemId_hq_world -> Listing Data + 5-min TTL)
  const listingsCacheRef = useRef<Map<string, {
    world: ListingEntry[];
    dc: ListingEntry[];
    all: ListingEntry[];
    worldUnits: number;
    dcUnits: number;
    allUnits: number;
    worldError: boolean;
    dcError: boolean;
    allError: boolean;
    summary: { selWorldMin: number; dcMin: { price: number; world: string }; allMin: { price: number; world: string } };
    ts: number;
  }>>(new Map());

  // Retry / Refresh trigger state
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [isJustRefreshed, setIsJustRefreshed] = useState(false);
  const forceLiveRef = useRef(false);

  const handleRetryListings = useCallback(() => {
    if (!selectedItem) return;
    const cacheKey = `${selectedItem.item_id}_${selectedItem.hq ? 'hq' : 'nq'}_${selectedWorld}`;
    listingsCacheRef.current.delete(cacheKey);
    forceLiveRef.current = true;
    setRetryTrigger((prev) => prev + 1);
  }, [selectedItem, selectedWorld]);

  // 3-Way Parallel Prefetch (World + DC + Japan) with AbortController
  useEffect(() => {
    if (!selectedItem) return;
    const targetItem = selectedItem;
    const targetWorld = selectedWorld;
    const targetDc = activeDc;
    const cacheKey = `${targetItem.item_id}_${targetItem.hq ? 'hq' : 'nq'}_${targetWorld}`;

    const isForceLive = forceLiveRef.current;
    forceLiveRef.current = false;

    // 1. Check in-memory cache (5-min freshness) - skip if forceLive
    if (!isForceLive) {
      const cached = listingsCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        setScopeMinSummary(cached.summary);
        setCachedScopes({
          world: cached.world,
          dc: cached.dc,
          all: cached.all,
          worldUnits: cached.worldUnits,
          dcUnits: cached.dcUnits,
          allUnits: cached.allUnits,
          worldError: cached.worldError,
          dcError: cached.dcError,
          allError: cached.allError,
        });
        setLoadingListings(false);
        return;
      }
    }

    // 2. Setup AbortController to cancel inflight requests on fast clicking
    const controller = new AbortController();
    const signal = controller.signal;
    let isMounted = true;

    async function prefetchTriad() {
      setLoadingListings(true);

      try {
        const result = await fetchCheapestTriad({
          world: targetWorld,
          dc: targetDc,
          itemId: targetItem.item_id,
          isHq: Boolean(targetItem.hq),
          signal,
          limitWorld: 30,
          limitDc: 50,
          limitAll: 100,
          forceLive: isForceLive,
        });

        if (signal.aborted) return;

        const resultCache = {
          world: result.world,
          dc: result.dc,
          all: result.all,
          worldUnits: result.worldUnits,
          dcUnits: result.dcUnits,
          allUnits: result.allUnits,
          worldError: result.worldError,
          dcError: result.dcError,
          allError: result.allError,
          summary: result.summary,
          ts: Date.now(),
        };

        listingsCacheRef.current.set(cacheKey, resultCache);

        if (isMounted) {
          setScopeMinSummary(result.summary);
          setCachedScopes({
            world: result.world,
            dc: result.dc,
            all: result.all,
            worldUnits: result.worldUnits,
            dcUnits: result.dcUnits,
            allUnits: result.allUnits,
            worldError: result.worldError,
            dcError: result.dcError,
            allError: result.allError,
          });
          setLoadingListings(false);
          if (isForceLive) {
            setIsJustRefreshed(true);
            setTimeout(() => {
              if (isMounted) setIsJustRefreshed(false);
            }, 1800);
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to prefetch triad listings:', err);
        if (isMounted) {
          setCachedScopes((prev) => ({
            ...prev,
            worldError: true,
            dcError: true,
            allError: true,
          }));
          setLoadingListings(false);
        }
      }
    }

    prefetchTriad();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedItem, selectedWorld, activeDc, retryTrigger]);

  const handleSelectItem = useCallback((item: MarketItem) => {
    setSelectedItem(item);
  }, []);

  return (
    <div
      className="container"
      style={{
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
        height: '100%',
        padding: '0.25rem 0.6rem',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
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
        <div
          className="left-card-scroll-pane"
          style={{
            width: `${leftPaneWidth}px`,
            flex: `0 0 ${leftPaneWidth}px`,
            height: '100%',
            maxHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '0.85rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Header Controls */}
          <div
            className="left-pane-header"
            style={{
              flexShrink: 0,
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '8px 10px',
              marginBottom: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {/* Row 1: Sort Toggle Group + Crystal Toggle Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '2px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '3px',
                  background: 'rgba(0,0,0,0.4)',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  flex: 1,
                }}
              >
                <button
                  onClick={() => setSortMode('velocity')}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '0.74rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    ...(sortMode === 'velocity'
                      ? {
                          background: 'linear-gradient(135deg, #00d2ff, #7928ca)',
                          color: '#ffffff',
                          fontWeight: 700,
                          boxShadow: '0 2px 8px rgba(0, 210, 255, 0.4)',
                        }
                      : { background: 'transparent', color: '#94a3b8', fontWeight: 600 }),
                  }}
                >
                  売買数
                </button>
                <button
                  onClick={() => setSortMode('revenue')}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '0.74rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    ...(sortMode === 'revenue'
                      ? {
                          background: 'linear-gradient(135deg, #00d2ff, #7928ca)',
                          color: '#ffffff',
                          fontWeight: 700,
                          boxShadow: '0 2px 8px rgba(0, 210, 255, 0.4)',
                        }
                      : { background: 'transparent', color: '#94a3b8', fontWeight: 600 }),
                  }}
                >
                  流通ギル
                </button>
                <button
                  onClick={() => setSortMode('max_price')}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '0.74rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    ...(sortMode === 'max_price'
                      ? {
                          background: 'linear-gradient(135deg, #00d2ff, #7928ca)',
                          color: '#ffffff',
                          fontWeight: 700,
                          boxShadow: '0 2px 8px rgba(0, 210, 255, 0.4)',
                        }
                      : { background: 'transparent', color: '#94a3b8', fontWeight: 600 }),
                  }}
                >
                  高額取引
                </button>
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
                    ? {
                        background: 'rgba(0, 210, 255, 0.18)',
                        border: '1px solid #00d2ff',
                        color: '#00d2ff',
                        boxShadow: '0 0 10px rgba(0, 210, 255, 0.35)',
                      }
                    : { background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8' }),
                }}
                title="クリスタル類の表示/除外"
              >
                <i className="fa-solid fa-gem"></i> {excludeCrystals ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Row 2: World Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <span
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#94a3b8',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="fa-solid fa-globe" style={{ color: '#00d2ff' }}></i> ワールド選択:
              </span>
              <select
                value={selectedWorld}
                onChange={(e) => handleWorldChange(e.target.value)}
                style={{
                  flex: 1,
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid #00d2ff',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  padding: '6px 8px',
                  outline: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(0, 210, 255, 0.2)',
                }}
              >
                {Object.entries(JAPAN_DCS).map(([dcName, worlds]) => (
                  <optgroup key={dcName} label={`${dcName} DC`} style={{ background: '#0f172a', color: '#ffb703', fontWeight: 700 }}>
                    {worlds.map((w) => (
                      <option key={w} value={w} style={{ background: '#0f172a', color: '#ffffff', fontWeight: 600 }}>
                        🌐 {w} ({dcName})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Row 3: Search Box + Category Filter Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <i
                  className="fa-solid fa-magnifying-glass"
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.82rem', color: '#94a3b8' }}
                ></i>
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
                    boxSizing: 'border-box',
                  }}
                />
                {searchQuery && (
                  <i
                    className="fa-solid fa-xmark"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '0.88rem',
                      color: '#94a3b8',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSearchQuery('')}
                  ></i>
                )}
              </div>

              {/* Category Dropdown */}
              <CategoryFilterDropdown
                availableCategories={availableCategories}
                selectedCategories={selectedCategories}
                onSelectedCategoriesChange={setSelectedCategories}
                accentColor="#00d2ff"
              />
            </div>
          </div>

          {/* Cards Scroll Container */}
          <div
            style={{
              flex: 1,
              height: '100%',
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.8rem',
              paddingRight: '4px',
            }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', width: '100%', color: '#94a3b8' }}>
                <i className="fa-solid fa-spinner fa-spin fa-2x"></i>
                <br />
                <br />
                マーケットデータを読み込み中...
              </div>
            ) : displayItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                プールデータ未登録（データ収集待ち）
              </div>
            ) : (
              displayItems.map((item, idx) => {
                const isSelected = Boolean(
                  selectedItem && selectedItem.item_id === item.item_id && Boolean(selectedItem.hq) === Boolean(item.hq)
                );
                return (
                  <MarketCard
                    key={`${item.item_id}_${item.hq ? 'hq' : 'nq'}`}
                    item={item}
                    idx={idx}
                    isSelected={isSelected}
                    onSelect={handleSelectItem}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Pane Splitter (Resize Handle) */}
        <PaneSplitter
          onMouseDown={startResizing}
          isResizing={isResizing}
          accentColor="#00d2ff"
        />

        {/* ================= RIGHT PANE: Detail Monitor ================= */}
        <MarketDetailPane
          selectedItem={selectedItem}
          selectedWorld={selectedWorld}
          activeDc={activeDc}
          scopeMinSummary={scopeMinSummary}
          cachedScopes={cachedScopes}
          listingsScope={listingsScope}
          setListingsScope={setListingsScope}
          loadingListings={loadingListings}
          onRetry={handleRetryListings}
          isJustRefreshed={isJustRefreshed}
        />
      </div>
    </div>
  );
};
