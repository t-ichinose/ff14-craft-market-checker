import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchAndPrepareMarketData, fetchAndPrepareListingsData, getCachedListingsDataset, type RawListingTuple } from '../../services/marketDataService';
import { getSavedSharedWorld, saveSharedWorld } from '../../shared/marketConstants';
import { fetchRecipes, getCachedRecipes, type RecipesMap } from '../../services/recipeDataService';
import { CategoryFilterDropdown } from '../../shared/CategoryFilterDropdown';

import type {
  MarketDataPayload,
  CraftCardItem,
  CraftPlannerViewProps,
  RecipeTreeItem,
} from './craftTypes';

export type * from './craftTypes';

import {
  getJobBadgeStyle,
  resolveFullTreeForScope,
  isCrystalItem,
  buildMaterialPriceMaps,
  evaluateAllCraftCards,
  searchCraftPlaceholders,
} from './craftTreeUtils';
import { ShoppingListPanel } from './ShoppingListPanel';
import { InteractiveNodeCanvas } from './InteractiveNodeCanvas';

const ITEMS_PER_PAGE = 40;


// In-memory module cache to eliminate reload latency
let cachedMarketPayload: MarketDataPayload | null = null;
let cachedCategories: string[] | null = null;

export const CraftBox: React.FC<CraftPlannerViewProps> = ({

  scopes,
  initialSalesWorld = 'Carbuncle',
  initialSourcingScope = 'world',
  onSelectItemForModal,
}) => {
  const [salesScopeName, setSalesScopeName] = useState<string>(() => getSavedSharedWorld() || initialSalesWorld);
  const [sourcingScope, setSourcingScope] = useState<'all_dc' | 'dc' | 'world'>(initialSourcingScope);
  const [isSourcingCollapsed, setIsSourcingCollapsed] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minVelocity, setMinVelocity] = useState<number>(0);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);


  const [sortBy, setSortBy] = useState<string>('daily_profit');

  const [recipesMap, setRecipesMap] = useState<RecipesMap | null>(() => getCachedRecipes());
  const [marketData, setMarketData] = useState<MarketDataPayload | null>(() => cachedMarketPayload);
  const [listingsMap, setListingsMap] = useState<Record<string, Record<string, RawListingTuple[]>> | undefined>(
    () => getCachedListingsDataset()?.listings
  );
  const [availableCategories, setAvailableCategories] = useState<string[]>(() => cachedCategories || []);
  const [loading, setLoading] = useState<boolean>(() => !getCachedRecipes() || !cachedMarketPayload);

  const [selectedCardKey, setSelectedCardKey] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState<number>(ITEMS_PER_PAGE);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Shopping List Panel State
  const [isShoppingListOpen, setIsShoppingListOpen] = useState<boolean>(true);
  const [craftCount, setCraftCount] = useState<number>(1);
  const [purchasedMap, setPurchasedMap] = useState<Record<number, number>>({});

  // Material Quality Customization (NQ / HQ)
  const [qualityMap, setQualityMap] = useState<Record<number, 'nq' | 'hq'>>({});
  // Material Self-Sufficient (自給自足: 0G)
  const [selfSufficientMap, setSelfSufficientMap] = useState<Record<number, boolean>>({});

  // Fullscreen Pan Canvas Mode
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setCraftCount(1);
    setPurchasedMap({});
    setQualityMap({});
    setSelfSufficientMap({});
  }, [selectedCardKey]);

  const handleSetPurchased = useCallback((id: number, amount: number) => {
    setPurchasedMap((prev) => ({
      ...prev,
      [id]: Math.max(0, amount),
    }));
  }, []);

  const handleToggleFullPurchased = useCallback((id: number, neededAmount: number) => {
    setPurchasedMap((prev) => {
      const current = prev[id] || 0;
      return {
        ...prev,
        [id]: current >= neededAmount ? 0 : neededAmount,
      };
    });
  }, []);

  const handleClearPurchased = useCallback(() => {
    setPurchasedMap({});
  }, []);

  const worldToDc = useMemo(() => {
    const map: Record<string, string> = {};
    if (scopes && scopes.dc_worlds) {
      Object.entries(scopes.dc_worlds).forEach(([dc, worlds]) => {
        worlds.forEach((w) => { map[w] = dc; });
      });
    }
    return map;
  }, [scopes]);

  const targetDc = useMemo(() => {
    return worldToDc[salesScopeName] || 'Elemental';
  }, [worldToDc, salesScopeName]);

  const handleSalesWorldChange = (newWorld: string) => {
    if (!newWorld) return;
    setSalesScopeName(newWorld);
    saveSharedWorld(newWorld);
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      iframe.contentWindow?.postMessage({ type: 'SET_SHARED_WORLD', world: newWorld }, '*');
    });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SET_SHARED_WORLD' && event.data.world) {
        setSalesScopeName(event.data.world);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        // 1. 市場データ & レシピデータを並行して超高速ロード (すでにメモリにある場合は 0ms)
        const [dataset, recJson] = await Promise.all([
          fetchAndPrepareMarketData(),
          fetchRecipes(),
        ]);

        const mktJson: MarketDataPayload = {
          last_updated: dataset.last_updated || '',
          items: dataset.items as any,
          data: dataset.data as any,
        };
        cachedMarketPayload = mktJson;

        let catsList = cachedCategories;
        if (!catsList) {
          const catsSet = new Set<string>();
          Object.keys(recJson).forEach((idStr) => {
            const cat = mktJson?.items?.[idStr]?.category;
            if (cat) catsSet.add(cat);
          });
          catsList = Array.from(catsSet).sort();
          cachedCategories = catsList;
        }

        if (isMounted) {
          setRecipesMap(recJson);
          setMarketData(mktJson);
          setAvailableCategories(catsList);
          setSelectedCategories((prev) => (prev.length === 0 ? catsList! : prev));
          setLoading(false);
        }

        // バックグラウンドで出品データも取得・反映 (0msクラフト計算)
        fetchAndPrepareListingsData().then((lData) => {
          if (isMounted && lData?.listings) {
            setListingsMap(lData.listings);
          }
        }).catch(() => {});
      } catch (err) {
        console.error('Failed to load unified craft datasets:', err);
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, []);



  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [salesScopeName, sourcingScope, selectedCategories, searchQuery, sortBy, minVelocity]);

  // 選択された仕入れスコープに応じた素材価格マップ (NQ / HQ / 全DC) を1パスで生成
  const priceMaps = useMemo(() => {
    return buildMaterialPriceMaps(
      marketData,
      sourcingScope,
      salesScopeName,
      targetDc,
      listingsMap
    );
  }, [marketData, sourcingScope, salesScopeName, targetDc, listingsMap]);

  const { materialPriceMap, materialHqPriceMap, allDcPriceMap } = priceMaps;

  // 全クラフト品の原価・利益評価キャッシュ (検索文字入力では再計算せず、仕入れ/販売ワールド変更時のみ計算)
  const allEvaluatedCraftItems = useMemo(() => {
    return evaluateAllCraftCards(
      recipesMap,
      marketData,
      salesScopeName,
      materialPriceMap,
      allDcPriceMap,
      listingsMap,
      { bestOnly: false }
    );
  }, [recipesMap, marketData, salesScopeName, materialPriceMap, allDcPriceMap, listingsMap]);

  // 3. ユーザー操作 (検索文字列入力・カテゴリ選択・ソート) ➔ わずか0.1msで瞬時に完了！
  const processedItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const isFilterCategory = selectedCategories.length < availableCategories.length;
    const catSet = new Set(selectedCategories);

    if (selectedCategories.length === 0) {
      return [];
    }

    // 検索クエリがある場合: 評価済みクラフト品に加え、取引データのないレシピ品目も全件ヒット・表示
    if (query) {
      // 1. まず評価済みクラフト品の中からマッチするものを抽出
      const matchedActive: CraftCardItem[] = [];
      const existingKeySet = new Set<string>();

      for (let i = 0; i < allEvaluatedCraftItems.length; i++) {
        const item = allEvaluatedCraftItems[i];
        if (isFilterCategory && !catSet.has(item.cat)) continue;
        const name = (item.name || '').toLowerCase();
        const idStr = String(item.item_id);
        if (name.includes(query) || idStr.includes(query)) {
          matchedActive.push(item);
          existingKeySet.add(`${item.item_id}_${item.is_hq ? 'hq' : 'nq'}`);
        }
      }

      // 2. 次に、レシピマスター (recipesMap) の全品目からマッチするものを検索
      const matchedCatalog = searchCraftPlaceholders(
        query,
        recipesMap,
        marketData,
        materialPriceMap,
        allDcPriceMap,
        existingKeySet,
        selectedCategories,
        availableCategories
      );

      // ソート: 有効アイテムは選択ソート順、カタログアイテムは名前順
      matchedActive.sort((a, b) => {
        if (sortBy === 'daily_profit') return b.daily_profit - a.daily_profit;
        if (sortBy === 'profit') return b.profit - a.profit;
        if (sortBy === 'profit_rate') return b.profit_rate - a.profit_rate;
        if (sortBy === 'velocity') return b.daily_sales_qty - a.daily_sales_qty;
        return 0;
      });
      matchedCatalog.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      return [...matchedActive, ...matchedCatalog];
    }

    if (allEvaluatedCraftItems.length === 0) return [];

    let filtered = allEvaluatedCraftItems;

    if (minVelocity > 0) {
      filtered = filtered.filter(item => item.daily_sales_qty >= minVelocity);
    }
    if (isFilterCategory) {
      filtered = filtered.filter(item => selectedCategories.includes(item.cat));
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'daily_profit') return b.daily_profit - a.daily_profit;
      if (sortBy === 'profit') return b.profit - a.profit;
      if (sortBy === 'profit_rate') return b.profit_rate - a.profit_rate;
      if (sortBy === 'velocity') return b.daily_sales_qty - a.daily_sales_qty;
      return 0;
    });

    return sorted;
  }, [allEvaluatedCraftItems, searchQuery, selectedCategories, availableCategories, sortBy, minVelocity, recipesMap, marketData, materialPriceMap, allDcPriceMap]);

  // Selected item object (null if unselected or filtered out)
  const selectedItem = useMemo(() => {
    if (!selectedCardKey) return null;
    return processedItems.find((it) => `${it.item_id}_${it.is_hq ? 'hq' : 'nq'}` === selectedCardKey) || null;
  }, [processedItems, selectedCardKey]);

  const liveTree = useMemo(() => {
    if (!recipesMap || !marketData || !selectedItem) return [];
    return resolveFullTreeForScope(
      selectedItem.item_id,
      recipesMap,
      marketData,
      materialPriceMap,
      sourcingScope,
      salesScopeName,
      targetDc,
      true,
      0,
      1,
      materialHqPriceMap,
      qualityMap,
      selfSufficientMap
    );
  }, [recipesMap, marketData, selectedItem, materialPriceMap, sourcingScope, salesScopeName, targetDc, materialHqPriceMap, qualityMap, selfSufficientMap]);

  // HQ/NQ切替後の実効製作原価
  const activeCraftCost = useMemo(() => {
    if (!liveTree || liveTree.length === 0 || !selectedItem) return selectedItem?.craft_cost || 0;
    const totalBatchCost = liveTree
      .filter((t) => t.isActive)
      .reduce((sum, item) => sum + item.cost * item.amount, 0);
    const yieldAmt = Math.max(1, selectedItem.amt || 1);
    return yieldAmt > 1 ? Math.round(totalBatchCost / yieldAmt) : totalBatchCost;
  }, [liveTree, selectedItem]);

  // HQ/NQ切替後の動的選択中アイテム (原価・利益・利益率・日商をリアルタイム再計算)
  const activeSelectedItem = useMemo(() => {
    if (!selectedItem) return null;
    const netSellPrice = Math.round(selectedItem.sell_price * 0.95);
    const profit = netSellPrice - activeCraftCost;
    const profitRate = activeCraftCost > 0 ? Math.round(((profit / activeCraftCost) * 100) * 10) / 10 : 0;
    const batchCost = activeCraftCost * Math.max(1, selectedItem.amt || 1);
    const dailyProfit = Math.round(profit * selectedItem.daily_sales_qty);
    return {
      ...selectedItem,
      craft_cost: activeCraftCost,
      batch_cost: batchCost,
      profit,
      profit_rate: profitRate,
      daily_profit: dailyProfit,
    };
  }, [selectedItem, activeCraftCost]);

  // 素材のNQ/HQトグル
  const handleToggleQuality = useCallback((itemId: number) => {
    setQualityMap((prev) => ({
      ...prev,
      [itemId]: prev[itemId] === 'hq' ? 'nq' : 'hq',
    }));
  }, []);

  // すべてHQに設定
  const handleSetAllHq = useCallback(() => {
    if (!liveTree || liveTree.length === 0) return;
    const newMap: Record<number, 'nq' | 'hq'> = {};
    function collect(nodes: RecipeTreeItem[]) {
      for (const n of nodes) {
        if (n.hasHqOption) {
          newMap[n.id] = 'hq';
        }
        if (n.subs && n.subs.length > 0) {
          collect(n.subs);
        }
      }
    }
    collect(liveTree);
    setQualityMap(newMap);
  }, [liveTree]);

  // すべてNQに戻す
  const handleSetAllNq = useCallback(() => {
    setQualityMap({});
  }, []);

  // 自給自足 (0G) トグル
  const handleToggleSelfSufficient = useCallback((itemId: number) => {
    setSelfSufficientMap((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  }, []);

  // すべて自給 (0G) に設定（クリスタル以外）
  const handleSetAllSelfSufficient = useCallback(() => {
    if (!liveTree || liveTree.length === 0) return;
    const newMap: Record<number, boolean> = {};
    function collect(nodes: RecipeTreeItem[]) {
      for (const n of nodes) {
        if (!isCrystalItem(n.name)) {
          newMap[n.id] = true;
        }
        if (n.subs && n.subs.length > 0) {
          collect(n.subs);
        }
      }
    }
    collect(liveTree);
    setSelfSufficientMap(newMap);
  }, [liveTree]);

  // すべて調達（自給解除）に戻す
  const handleClearSelfSufficient = useCallback(() => {
    setSelfSufficientMap({});
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      setDisplayCount((prev) => Math.min(prev + ITEMS_PER_PAGE, processedItems.length));
    }
  };

  const visibleItems = useMemo(() => {
    return processedItems.slice(0, displayCount);
  }, [processedItems, displayCount]);



  // Sparkline SVG + % Badge generator for craft cards
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

  return (
    <div className="container" style={{ maxWidth: '1850px', margin: '0 auto', height: '100%', padding: '0.25rem 0.6rem', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div className="pc-dashboard-container" style={{ display: 'flex', gap: '1.25rem', alignItems: 'stretch', width: '100%', flex: 1, minHeight: 0, height: '100%', marginTop: 0 }}>
        {/* LEFT PANE (Exact 1:1 Matching market.html: w: 440px, p: 0.85rem) */}
        <div className="left-card-scroll-pane" style={{ width: '440px', flex: '0 0 440px', height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '0.85rem', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(12px)' }}>
        
          {/* Header Controls (Exact 1:1 Matching Market & Arbitrage tabs) */}
          <div className="left-pane-header" style={{ flexShrink: 0, background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '8px 10px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            
            {/* Row 1: Sort Toggle (推定日当 / 純利益 / 利益率 / 日販数) + Category Filter Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', flex: 1 }}>
                {[
                  { key: 'daily_profit', label: '日当利益' },
                  { key: 'profit', label: '単価利益' },
                  { key: 'profit_rate', label: '利益率' },
                  { key: 'velocity', label: '日販数' },
                ].map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSortBy(s.key)}
                    style={{
                      flex: 1,
                      padding: '4px 6px',
                      fontSize: '0.74rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      border: 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                      ...(sortBy === s.key
                        ? { background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff', fontWeight: 700, boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)' }
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
                  background: isSourcingCollapsed ? 'rgba(0, 0, 0, 0.4)' : 'rgba(16, 185, 129, 0.18)',
                  border: isSourcingCollapsed ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #10b981',
                  color: isSourcingCollapsed ? '#94a3b8' : '#10b981',
                  fontWeight: 600
                }}
                title={isSourcingCollapsed ? '仕入れ設定を展開' : '仕入れ設定を折りたたむ'}
              >
                <i className="fa-solid fa-boxes-packing" style={{ color: isSourcingCollapsed ? '#94a3b8' : '#10b981' }}></i>
                <span>仕入れ設定</span>
                <i className={`fa-solid fa-chevron-${isSourcingCollapsed ? 'down' : 'up'}`} style={{ fontSize: '0.62rem' }}></i>
              </button>
            </div>

            {/* Row 2: Sourcing Scope (仕入れ) + Min Velocity Select (日販数) [Collapsible] */}
            {!isSourcingCollapsed && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-boxes-packing" style={{ color: '#10b981' }}></i> 仕入れ:
                  </span>
                  <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {[
                      { key: 'all_dc', label: '全DC' },
                      { key: 'dc', label: '同DC' },
                      { key: 'world', label: '単ワールド' },
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
                            ? { background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff', fontWeight: 700, boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)' }
                            : { background: 'transparent', color: '#94a3b8', fontWeight: 600 })
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Velocity Select (日販数) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.35)', padding: '2px 6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', flex: 1, minWidth: 0 }}>
                  <i className="fa-solid fa-bolt" style={{ color: '#10b981', fontSize: '0.72rem' }}></i>
                  <select
                    value={minVelocity}
                    onChange={(e) => setMinVelocity(Number(e.target.value))}
                    style={{ padding: '2px 4px', fontSize: '0.74rem', border: 'none', background: 'transparent', color: '#ffffff', width: '100%', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value={0} style={{ background: '#0f172a' }}>日販制限なし</option>
                    <option value={1} style={{ background: '#0f172a' }}>1個/日以上</option>
                    <option value={5} style={{ background: '#0f172a' }}>5個/日以上</option>
                    <option value={10} style={{ background: '#0f172a' }}>10個/日以上</option>
                    <option value={50} style={{ background: '#0f172a' }}>50個/日以上</option>
                  </select>
                </div>
              </div>
            )}

            {/* Row 3: World Select (Exact 1:1 Match with Market & Arbitrage tabs) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <i className="fa-solid fa-globe" style={{ color: '#10b981' }}></i> ワールド選択:
              </span>
              <select
                value={salesScopeName}
                onChange={(e) => handleSalesWorldChange(e.target.value)}
                style={{
                  flex: 1,
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid #10b981',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  padding: '6px 8px',
                  outline: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.2)'
                }}
              >
                {scopes && scopes.dc_worlds ? (
                  Object.entries(scopes.dc_worlds).map(([dcName, worlds]) => (
                    <optgroup key={dcName} label={`${dcName} DC`} style={{ background: '#0f172a', color: '#ffb703', fontWeight: 700 }}>
                      {worlds.map((w) => (
                        <option key={w} value={w} style={{ background: '#0f172a', color: '#ffffff', fontWeight: 600 }}>
                          🌐 {w} ({dcName})
                        </option>
                      ))}
                    </optgroup>
                  ))
                ) : (
                  <option value="Carbuncle" style={{ background: '#0f172a', color: '#ffffff', fontWeight: 600 }}>
                    🌐 Carbuncle (Elemental)
                  </option>
                )}
              </select>
            </div>

            {/* Row 4: Search Box + Category Filter Dropdown */}
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
                accentColor="#10b981"
              />
            </div>

          </div>

          {/* Cards Scroll Container (Exact 1:1 Match with Market & Arbitrage tabs) */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{ flex: 1, height: '100%', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '4px' }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', width: '100%', color: '#94a3b8' }}>
                <i className="fa-solid fa-spinner fa-spin fa-2x"></i><br /><br />クラフトデータを分析中...
              </div>
            ) : processedItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                条件に一致するクラフト品目がありません
              </div>
            ) : (
              visibleItems.map((item, idx) => {
                const cardKey = `${item.item_id}_${item.is_hq ? 'hq' : 'nq'}`;
                const isSelected = selectedCardKey === cardKey;
                // 選択中のカードなら、HQ調整後の activeSelectedItem を使用
                const displayItem = (isSelected && activeSelectedItem) ? activeSelectedItem : item;
                const cleanTitle = displayItem.name || `Item #${displayItem.item_id}`;
                const jobStyle = getJobBadgeStyle(displayItem.job || '', displayItem.is_company);
                const lodestoneUrl = `https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/?patch=&db_search_category=item&category2=&q=${encodeURIComponent(cleanTitle)}`;
                const isLoss = displayItem.profit <= 0;
                const hasCustomHq = isSelected && Object.values(qualityMap).some((q) => q === 'hq');

                return (
                  <div
                    key={cardKey}
                    onClick={() => {
                      if (isSelected && onSelectItemForModal) {
                        onSelectItemForModal(displayItem.item_id, salesScopeName, displayItem.is_hq);
                      } else {
                        setSelectedCardKey(cardKey);
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
                              : 'linear-gradient(135deg, rgba(0, 210, 255, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
                            border: isLoss ? '1px solid #f87171' : '1px solid #00d2ff',
                            boxShadow: isLoss ? '0 0 16px rgba(248, 113, 113, 0.45)' : '0 0 16px rgba(0, 210, 255, 0.45)'
                          }
                        : {
                            background: 'rgba(22, 30, 49, 0.85)',
                            border: isLoss ? '1px solid rgba(248, 113, 113, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
                          })
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <img
                        src={item.icon || 'https://xivapi.com/i/000000/000000.png'}
                        alt={cleanTitle}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#0b111e', objectFit: 'contain', flexShrink: 0 }}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', lineHeight: 1.2 }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>#{idx + 1}</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cleanTitle}>
                            {cleanTitle}
                          </span>
                          {displayItem.is_hq ? (
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
                                flexShrink: 0
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
                                flexShrink: 0
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
                                flexShrink: 0
                              }}
                              title="素材の一部または全てをHQに指定して原価計算中"
                            >
                              ★HQ素材
                            </span>
                          )}

                          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectItemForModal) onSelectItemForModal(displayItem.item_id, salesScopeName, displayItem.is_hq);
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
                            {displayItem.is_company ? '⚓ カンパニークラフト' : `${displayItem.job} Lv${displayItem.lvl || 1}`}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                            IL{displayItem.ilvl || 1} · {displayItem.cat}
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
                          <span style={{ fontSize: '0.58rem', color: displayItem.amt > 1 ? '#34d399' : '#64748b', fontFamily: 'Outfit, sans-serif' }}>
                            {displayItem.amt > 1 ? `${displayItem.amt}個完成` : '1個'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ fontSize: '0.63rem', color: '#94a3b8' }}>目標仕入:</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <strong style={{ color: '#c084fc', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>{displayItem.craft_cost.toLocaleString()}</strong>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#ffb703' }}>G/以下</span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.60rem', color: '#64748b' }}>総素材費:</span>
                          <span style={{ color: '#94a3b8', fontSize: '0.64rem', fontFamily: 'Outfit, sans-serif' }}>{displayItem.batch_cost.toLocaleString()}G</span>
                        </div>
                      </div>

                      {/* Right: 販売先 */}
                      <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderLeft: '3px solid #38bdf8', borderRadius: '7px', padding: '5px 7px' }}>
                        <div style={{ fontSize: '0.66rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                            <i className="fa-solid fa-store" style={{ color: '#38bdf8', fontSize: '0.65rem' }}></i> 販売: <strong style={{ color: '#38bdf8' }}>{salesScopeName}</strong>
                          </span>
                          <span style={{ fontSize: '0.58rem', color: '#64748b', fontFamily: 'Outfit, sans-serif' }}>{(displayItem.daily_sales_qty || 0).toFixed(1)}個/日</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ fontSize: '0.63rem', color: '#94a3b8' }}>目標販売:</span>
                          <strong style={{ color: '#38bdf8', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>{displayItem.sell_price.toLocaleString()}G</strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.60rem', color: '#64748b' }}>推移:</span>
                          {renderMiniTrend(displayItem.daily_trend, displayItem.trend_pct)}
                        </div>
                      </div>
                    </div>

                    {/* Bottom: Common Profit Summary (単価利益 + 日当利益) */}
                    <div style={{ background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '7px', padding: '5px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa-solid fa-coins" style={{ color: isLoss ? '#f87171' : '#10b981', fontSize: '0.72rem' }}></i>
                        <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>単価利益:</span>
                        <strong style={{ color: isLoss ? '#f87171' : '#10b981', fontSize: '0.78rem', fontFamily: 'Outfit, sans-serif' }}>
                          {displayItem.profit > 0 ? '+' : ''}{displayItem.profit.toLocaleString()}G
                        </strong>
                        <span style={{ color: isLoss ? '#f87171' : '#34d399', fontSize: '0.64rem', fontFamily: 'Outfit, sans-serif' }}>
                          ({displayItem.profit > 0 ? '+' : ''}{displayItem.profit_rate.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa-solid fa-sack-dollar" style={{ color: isLoss ? '#f87171' : '#ffb703', fontSize: '0.72rem' }}></i>
                        <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>日当利益:</span>
                        <strong style={{ color: isLoss ? '#f87171' : '#ffb703', fontSize: '0.80rem', fontFamily: 'Outfit, sans-serif' }}>
                          {displayItem.daily_profit > 0 ? '+' : ''}{displayItem.daily_profit.toLocaleString()}G/日
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
      </div>

      {/* RIGHT PANE: Interactive Infinite Node Canvas or Empty Placeholder (Supports Fullscreen) */}
      <div
        className={`pc-right-pane ${
          isFullscreen
            ? 'fixed inset-0 z-[9999] bg-slate-950/95 flex flex-col w-screen h-screen p-3.5 backdrop-blur-xl shadow-2xl animate-fadeIn'
            : ''
        }`}
        style={
          isFullscreen
            ? { display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }
            : {
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
              }
        }
      >
        {selectedItem ? (() => {
          const effectiveItem = activeSelectedItem || selectedItem;
          const hasCustomHq = Object.values(qualityMap).some((q) => q === 'hq');
          const hasCustomSelfSufficient = Object.values(selfSufficientMap).some(Boolean);

          return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {/* Top Bar Banner (Exact 1:1 Matching Market & Arbitrage tabs) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(22, 30, 49, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', marginBottom: '0.75rem', flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              {/* Left: Icon + Title + Meta */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img
                  src={effectiveItem.icon || 'https://xivapi.com/i/000000/000000.png'}
                  alt={effectiveItem.name}
                  loading="lazy"
                  decoding="async"
                  onClick={() => onSelectItemForModal && onSelectItemForModal(effectiveItem.item_id, salesScopeName, effectiveItem.is_hq)}
                  title="クリックして全32ワールド相場詳細を表示"
                  style={{ width: '44px', height: '44px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: '#0b111e', objectFit: 'contain', cursor: 'pointer', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      onClick={() => onSelectItemForModal && onSelectItemForModal(effectiveItem.item_id, salesScopeName, effectiveItem.is_hq)}
                      style={{ cursor: 'pointer' }}
                      title="クリックして全32ワールド相場詳細を表示"
                    >
                      {effectiveItem.name}
                    </span>
                    {effectiveItem.is_hq ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 900, color: '#ffb703', background: 'rgba(255,183,3,0.18)', border: '1px solid rgba(255,183,3,0.5)', padding: '2px 6px', borderRadius: '6px' }}>
                        HQ
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.3)', padding: '2px 6px', borderRadius: '6px' }}>
                        NQ
                      </span>
                    )}
                    {hasCustomHq && (
                      <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.5)', padding: '2px 6px', borderRadius: '6px' }}>
                        ★一部/全HQ素材
                      </span>
                    )}
                    {hasCustomSelfSufficient && (
                      <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', padding: '2px 6px', borderRadius: '6px' }}>
                        🌱自給素材あり(0G)
                      </span>
                    )}
                    <span
                      onClick={() => onSelectItemForModal && onSelectItemForModal(effectiveItem.item_id, salesScopeName, effectiveItem.is_hq)}
                      style={{ color: '#10b981', fontSize: '0.85rem', cursor: 'pointer', opacity: 0.8 }}
                      title="全32ワールド相場モニターを開く"
                    >
                      <i className="fa-solid fa-chart-line"></i>
                    </span>
                    <span className={`px-2 py-0.5 rounded border ${getJobBadgeStyle(effectiveItem.job || '', effectiveItem.is_company)}`} style={{ fontSize: '0.65rem', fontWeight: 700 }}>
                      {effectiveItem.is_company ? '⚓ カンパニークラフト' : `${effectiveItem.job} Lv${effectiveItem.lvl}`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '3px' }}>
                    <span>IL{effectiveItem.ilvl} · {effectiveItem.cat}</span>
                    <span style={{ opacity: 0.3 }}>|</span>
                    <span>出品先: <strong style={{ color: '#10b981' }}>{salesScopeName}</strong></span>
                    <span style={{ opacity: 0.3 }}>|</span>
                    <span>仕入れ基準: <strong style={{ color: '#10b981' }}>{sourcingScope === 'all_dc' ? '全DC最安' : sourcingScope === 'dc' ? '自DC最安' : '自ワールド'}</strong></span>
                  </div>
                </div>
              </div>

              {/* Right: Metrics + Lodestone Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>日当利益:</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffb703', fontFamily: 'Outfit, sans-serif' }}>
                      {(effectiveItem.daily_profit || 0).toLocaleString()} <span style={{ fontSize: '0.72rem', color: '#ffb703' }}>G/日</span>
                    </div>
                  </div>
                  <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }}></div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>単価利益:</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: effectiveItem.profit > 0 ? '#4ade80' : '#f87171', fontFamily: 'Outfit, sans-serif' }}>
                      {effectiveItem.profit > 0 ? '+' : ''}{(effectiveItem.profit || 0).toLocaleString()}G <span style={{ fontSize: '0.75rem', color: effectiveItem.profit > 0 ? '#34d399' : '#f87171' }}>({effectiveItem.profit_rate.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>

                <a
                  href={`https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/?patch=&db_search_category=item&category2=&q=${encodeURIComponent(effectiveItem.name || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.82rem', padding: '6px 12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                >
                  Lodestone <i className="fa-solid fa-arrow-up-right-from-square"></i>
                </a>

                {/* Fullscreen Toggle in Top Bar */}
                <button
                  type="button"
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    isFullscreen
                      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/40 hover:border-cyan-400'
                  }`}
                  title={isFullscreen ? '全画面表示を解除 (Esc)' : 'ツリーを画面いっぱいに全画面表示'}
                >
                  <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
                  <span>{isFullscreen ? '通常表示 (Esc)' : '全画面'}</span>
                </button>
              </div>
            </div>

            {/* Tree Section Header */}
            <div className="flex items-center justify-between px-1 shrink-0" style={{ marginBottom: '0.4rem' }}>
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-diagram-project text-emerald-400"></i>
                <h3 className="text-xs font-bold text-slate-200">
                  クラフト製作マップ（素材カードをクリックで全32ワールド相場・履歴を表示）
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsShoppingListOpen(prev => !prev)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isShoppingListOpen
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                  title="調達・買い物リストの表示切替"
                >
                  <i className="fa-solid fa-cart-shopping"></i>
                  <span>買い物リスト</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${isShoppingListOpen ? 'bg-emerald-500/30 text-emerald-200' : 'bg-slate-700 text-slate-300'}`}>
                    {craftCount > 1 ? `×${craftCount}` : 'ON'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isFullscreen
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-cyan-300 hover:border-cyan-500/50'
                  }`}
                  title={isFullscreen ? '通常表示に戻す (Esc)' : '画面いっぱいに全画面表示'}
                >
                  <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
                  <span>{isFullscreen ? '全画面解除' : '全画面'}</span>
                </button>

                <div className="text-[0.7rem] text-slate-400">
                  完成原価: <strong className="text-purple-300 font-bold">{effectiveItem.craft_cost.toLocaleString()} G/以下</strong> / 個
                  {effectiveItem.amt > 1 && (
                    <span className="text-slate-400 ml-1.5 font-mono">
                      (1回分総素材費: {effectiveItem.batch_cost.toLocaleString()}G ÷ {effectiveItem.amt}個完成)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 w-full min-h-0 flex gap-3 overflow-hidden">
              <div className="flex-1 h-full min-w-0 min-h-0 overflow-hidden relative">
                <InteractiveNodeCanvas
                  selectedItem={effectiveItem}
                  tree={liveTree}
                  currentWorld={salesScopeName}
                  onOpenMarketModal={onSelectItemForModal}
                  onToggleQuality={handleToggleQuality}
                  onSetAllHq={handleSetAllHq}
                  onSetAllNq={handleSetAllNq}
                  onToggleSelfSufficient={handleToggleSelfSufficient}
                  onSetAllSelfSufficient={handleSetAllSelfSufficient}
                  onClearSelfSufficient={handleClearSelfSufficient}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
                />
              </div>
              {isShoppingListOpen && (
                <div className="w-[380px] shrink-0 h-full min-h-0">
                  <ShoppingListPanel
                    selectedItem={effectiveItem}
                    tree={liveTree}
                    salesWorld={salesScopeName}
                    craftCount={craftCount}
                    onChangeCraftCount={setCraftCount}
                    purchasedMap={purchasedMap}
                    onSetPurchased={handleSetPurchased}
                    onToggleFullPurchased={handleToggleFullPurchased}
                    onClearPurchased={handleClearPurchased}
                    onOpenMarketModal={onSelectItemForModal}
                    onToggleQuality={handleToggleQuality}
                    onToggleSelfSufficient={handleToggleSelfSufficient}
                    onClose={() => setIsShoppingListOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>
          );
        })() : (
          /* Standard Clean Empty Placeholder (Exact 1:1 Size Matching Other Tabs) */
          <div className="flex flex-col items-center justify-center h-full text-slate-400 select-none">
            <div className="w-[84px] h-[84px] rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-500/25 flex items-center justify-center mb-5 shadow-[0_0_35px_rgba(16,185,129,0.15)] animate-pulse">
              <i className="fa-solid fa-hammer text-[2.5rem] text-emerald-400"></i>
            </div>
            <div className="text-[1.25rem] font-extrabold text-white mb-2 font-['Outfit']">
              クラフト品目を選択してください
            </div>
            <div className="text-[0.85rem] text-[#94a3b8] max-w-[380px] leading-relaxed text-center">
              左側のカード一覧からアイテムを選択するとリアルタイム製作ツリーと原価分析が表示されます
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export const CraftPlannerTable = CraftBox;
export default CraftBox;
