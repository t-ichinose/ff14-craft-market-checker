import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendChartCanvas } from './TrendChartCanvas';
import { JAPAN_DCS, WORLD_TO_DC } from './marketConstants';
import {
  fetchMarketHistory,
  fetchMarketListings,
  fetchCheapestTriad,
  type ListingEntry as ListingItem,
} from '../services/universalisClient';

interface ItemMarketModalProps {
  itemId: number;
  worldName?: string;
  initialHq?: boolean;
  onClose: () => void;
}

interface HistoryItem {
  pricePerUnit: number;
  quantity: number;
  total: number;
  worldName?: string;
  buyerName?: string;
  timestamp: number;
  hq: boolean;
}

interface DailyTrendPoint {
  date: string;
  weighted_avg: number;
  volume: number;
}



// Direct memory sharing with Market Tab (100% exact match, zero redundant network fetch)
function getSharedMarketItem(worldName: string, itemId: number, isHq: boolean): any {
  // 1. Check parent window shared data
  const sharedData = (window as any).__FF14_MARKET_DATA__;
  if (sharedData && sharedData[worldName]) {
    const found = sharedData[worldName].find((it: any) => it.item_id === itemId && Boolean(it.hq) === isHq);
    if (found) return found;
  }

  // 2. Check iframe contentWindow allData directly
  try {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null;
    const iframeData = (iframe?.contentWindow as any)?.allData;
    if (iframeData && iframeData[worldName]) {
      const found = iframeData[worldName].find((it: any) => it.item_id === itemId && Boolean(it.hq) === isHq);
      if (found) return found;
    }
  } catch {
    // ignore
  }

  return null;
}

export const ItemMarketModal: React.FC<ItemMarketModalProps> = ({
  itemId,
  worldName = 'Carbuncle',
  initialHq = false,
  onClose
}) => {
  const homeWorld = worldName;
  const [activeWorld, setActiveWorld] = useState<string>(worldName);
  const [isHq, setIsHq] = useState<boolean>(initialHq);
  const [meta, setMeta] = useState<{ name: string; icon: string; category: string } | null>(null);

  // Right pane: Listings state
  const [listingsScope, setListingsScope] = useState<'world' | 'dc' | 'all'>('world');
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loadingListings, setLoadingListings] = useState<boolean>(false);
  const [listingsError, setListingsError] = useState<boolean>(false);

  // 3-Scope Cheapest Cards for Right Pane
  const [cheapestCards, setCheapestCards] = useState<{
    selWorld: [string, number];
    dc: [string, number];
    all: [string, number];
  }>({
    selWorld: [worldName, 0],
    dc: ['-', 0],
    all: ['-', 0]
  });

function computeRobustPrice(it: any): number {
  if (!it) return 0;
  const history = it.history || [];
  const validPrices = history.map((h: any) => h.price || 0).filter((p: number) => p > 0);
  const benchmark = it.region_median_price || it.avg_price || (validPrices.length > 0 ? validPrices[0] : 0);

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
  return it.avg_price || it.min_price || 0;
}

  // Left pane: Instant initial state from shared memory (0ms first frame render)
  const [homeStats, setHomeStats] = useState<{ min: number; avg: number; max: number; velocity: number }>(() => {
    const it = getSharedMarketItem(worldName, itemId, initialHq);
    if (it) {
      return {
        min: it.min_price || 0,
        avg: computeRobustPrice(it),
        max: it.max_price || 0,
        velocity: it.sale_velocity || 0
      };
    }
    return { min: 0, avg: 0, max: 0, velocity: 0 };
  });

  const [homeDailyTrends, setHomeDailyTrends] = useState<DailyTrendPoint[]>(() => {
    const it = getSharedMarketItem(worldName, itemId, initialHq);
    if (it?.daily_trend && it.daily_trend.length > 0) {
      return it.daily_trend.map((t: any) => ({
        date: t.date,
        weighted_avg: t.weighted_avg,
        volume: t.volume
      }));
    }
    return [];
  });

  const [homeHistory, setHomeHistory] = useState<HistoryItem[]>(() => {
    const it = getSharedMarketItem(worldName, itemId, initialHq);
    if (it?.history && it.history.length > 0) {
      return it.history.map((h: any) => ({
        pricePerUnit: h.price,
        quantity: h.qty,
        total: (h.price || 0) * (h.qty || 0),
        worldName: worldName,
        buyerName: h.buyer || '-',
        timestamp: h.ts,
        hq: Boolean(h.hq)
      }));
    }
    return [];
  });

  const [homeTrendPct, setHomeTrendPct] = useState<number>(() => {
    const it = getSharedMarketItem(worldName, itemId, initialHq);
    return it?.trend_pct || 0;
  });

  const [loadingHomeData, setLoadingHomeData] = useState<boolean>(false);
  const activeDc = useMemo(() => WORLD_TO_DC[activeWorld] || 'Elemental', [activeWorld]);

  // Load item meta from shared memory catalog
  useEffect(() => {
    let isMounted = true;
    function loadItemMeta() {
      const idStr = itemId.toString();
      // 1. Check parent window shared catalog
      const itemsCatalog = (window as any).__FF14_ITEMS_CATALOG__ || (window.parent as any)?.__FF14_ITEMS_CATALOG__;
      if (itemsCatalog && itemsCatalog[idStr] && isMounted) {
        const m = itemsCatalog[idStr];
        setMeta({
          name: m.name,
          icon: m.icon,
          category: m.category || ''
        });
        return;
      }

      // 2. Check iframe contentWindow globalItemsCatalog
      const iframe = document.querySelector('iframe') as HTMLIFrameElement | null;
      const iframeCatalog = (iframe?.contentWindow as any)?.globalItemsCatalog;
      if (iframeCatalog && iframeCatalog[idStr] && isMounted) {
        const m = iframeCatalog[idStr];
        setMeta({
          name: m.name,
          icon: m.icon,
          category: m.category || ''
        });
        return;
      }

      // 3. Fallback: search in shared allData
      const sharedData = (window as any).__FF14_MARKET_DATA__ || (window.parent as any)?.__FF14_MARKET_DATA__;
      if (sharedData) {
        for (const wList of Object.values(sharedData)) {
          const found = (wList as any[]).find((x: any) => x.item_id === itemId);
          if (found && isMounted) {
            setMeta({
              name: found.item_name,
              icon: found.icon_url,
              category: found.category_name || ''
            });
            return;
          }
        }
      }
    }
    loadItemMeta();
    return () => { isMounted = false; };
  }, [itemId]);

  // 1. Instant adoption of Market dataset via ultra-fast endpoint (/api/item-market-summary)
  useEffect(() => {
    let isMounted = true;

    function applySummaryData(summary: any) {
      setHomeStats({
        min: summary.min_price || 0,
        avg: computeRobustPrice(summary),
        max: summary.max_price || 0,
        velocity: summary.sale_velocity || 0
      });

      if (summary.daily_trend && summary.daily_trend.length > 0) {
        setHomeDailyTrends(summary.daily_trend.map((t: any) => ({
          date: t.date,
          weighted_avg: t.weighted_avg,
          volume: t.volume
        })));
        setHomeTrendPct(summary.trend_pct || 0);
      } else {
        setHomeDailyTrends([]);
        setHomeTrendPct(0);
      }

      if (summary.history && summary.history.length > 0) {
        const hist: HistoryItem[] = summary.history.map((h: any) => ({
          pricePerUnit: h.price,
          quantity: h.qty,
          total: (h.price || 0) * (h.qty || 0),
          worldName: homeWorld,
          buyerName: h.buyer || '-',
          timestamp: h.ts,
          hq: Boolean(h.hq)
        }));
        setHomeHistory(hist);
      } else {
        setHomeHistory([]);
      }
    }

    async function loadMarketDataForModal() {
      // 1. Direct memory sharing with Market Tab (0ms instant display, 0 network request)
      const localItem = getSharedMarketItem(homeWorld, itemId, isHq);
      if (localItem) {
        applySummaryData(localItem);
        setLoadingHomeData(false);
        return;
      }

      // 2. Fallback in shared memory
      const sharedData = (window as any).__FF14_MARKET_DATA__ || (window.parent as any)?.__FF14_MARKET_DATA__;
      if (sharedData && sharedData[homeWorld]) {
        const found = sharedData[homeWorld].find((x: any) => x.item_id === itemId && Boolean(x.hq) === isHq);
        if (found && isMounted) {
          applySummaryData(found);
          setLoadingHomeData(false);
          return;
        }
      }

      // 3. Fallback directly to Universalis public API (100% standalone, no local backend required)
      try {
        setLoadingHomeData(true);
        const historyData = await fetchMarketHistory(homeWorld, itemId, {
          isHq,
          limit: 50,
        });
        if (isMounted) {
          applySummaryData({
            min_price: historyData.minPrice,
            avg_price: historyData.avgPrice,
            max_price: historyData.maxPrice,
            sale_velocity: historyData.regularSaleVelocity,
            history: historyData.entries,
          });
        }
      } catch (err) {
        console.error('Failed to load market data for modal:', err);
      } finally {
        if (isMounted) setLoadingHomeData(false);
      }
    }

    loadMarketDataForModal();
    return () => { isMounted = false; };
  }, [itemId, homeWorld, isHq]);

  // 2. Fetch Right Pane Listings & 3-Scope Cheapest Cards
  const fetchRightPaneListings = useCallback(async () => {
    try {
      setLoadingListings(true);
      setListingsError(false);

      let targetScopeName = activeWorld;
      if (listingsScope === 'dc') targetScopeName = activeDc;
      else if (listingsScope === 'all') targetScopeName = 'Japan';

      // 1. Fetch Listings & 2. 3-Scope Cheapest Cards in parallel
      const [listingsResult, triadResult] = await Promise.all([
        fetchMarketListings(targetScopeName, itemId, { isHq, limit: 100 }),
        fetchCheapestTriad({
          world: activeWorld,
          dc: activeDc,
          itemId,
          isHq,
          limitWorld: 10,
          limitDc: 20,
          limitAll: 40,
        }),
      ]);

      setListings(listingsResult.listings);

      setCheapestCards({
        selWorld: [activeWorld, triadResult.summary.selWorldMin],
        dc: [triadResult.summary.dcMin.world, triadResult.summary.dcMin.price],
        all: [triadResult.summary.allMin.world, triadResult.summary.allMin.price],
      });

      setLoadingListings(false);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to fetch right pane listings:', err);
        setListingsError(true);
      }
      setLoadingListings(false);
    }
  }, [itemId, activeWorld, activeDc, listingsScope, isHq]);

  useEffect(() => {
    fetchRightPaneListings();
  }, [fetchRightPaneListings]);



  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const lodestoneUrl = `https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/?patch=&db_search_category=item&category2=&q=${encodeURIComponent(meta?.name || '')}`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f172a] border border-[#334155] rounded-2xl w-full max-w-[1280px] h-[92vh] max-h-[880px] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.85)] overflow-hidden font-['Inter',sans-serif]"
      >
        {/* 1. Header Bar with Dynamic NQ/HQ Switcher and Info */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#161e31] border-b border-[#334155] shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={meta?.icon || 'https://xivapi.com/i/000000/000000.png'}
              alt={meta?.name}
              className="w-10 h-10 rounded-xl bg-[#0b0f19] border border-white/20 object-contain shadow-md"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white leading-tight font-['Outfit']">
                  {meta?.name || `Item #${itemId}`}
                </h2>
                {isHq && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-300 border border-amber-500/60 text-[0.68rem] font-black">
                    HQ
                  </span>
                )}
              </div>
              <div className="text-[0.72rem] text-[#94a3b8] mt-0.5 flex items-center gap-2">
                <span>ID: {itemId}</span>
                <span>|</span>
                <span>出品先（ホーム）: <strong className="text-cyan-300">{homeWorld}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* NQ / HQ Quality Selector Tabs */}
            <div className="flex bg-black/50 p-1 rounded-xl border border-white/10 shadow-inner">
              <button
                onClick={() => setIsHq(false)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !isHq
                    ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white border border-white/20 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                NQ
              </button>
              <button
                onClick={() => setIsHq(true)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isHq
                    ? 'bg-gradient-to-r from-amber-600/50 to-amber-700/50 text-amber-200 border border-amber-500/50 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                HQ
              </button>
            </div>

            <a
              href={lodestoneUrl}
              target="_blank"
              rel="noopener"
              className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <span>Lodestone</span>
              <i className="fa-solid fa-arrow-up-right-from-square text-[0.65rem]"></i>
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-black/40 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 hover:border-rose-400/50 flex items-center justify-center text-sm transition-all cursor-pointer"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* 2. Main 2-Column Dashboard Body */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 bg-[#0b0f19] overflow-hidden">
          
          {/* LEFT COLUMN: Fixed Home World Stats + Trend Canvas Chart + Sales History */}
          <div className="flex flex-col gap-2.5 h-full min-h-0 overflow-hidden bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
            
            {/* Top 3 Stat Cards (Home World Fixed) */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <div className="bg-[#161e31] border border-emerald-500/40 rounded-xl p-2 flex flex-col justify-between shadow-sm">
                <div className="text-[0.65rem] text-[#94a3b8] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> 最安値 ({homeWorld})
                </div>
                <div className="text-[0.72rem] text-slate-300 font-semibold truncate">{homeWorld}</div>
                <div className="text-sm font-extrabold text-emerald-400 font-['Outfit']">
                  {homeStats.min > 0 ? `${homeStats.min.toLocaleString()}G` : '-'}
                </div>
              </div>

              <div className="bg-[#161e31] border border-purple-500/40 rounded-xl p-2 flex flex-col justify-between shadow-sm">
                <div className="text-[0.65rem] text-[#94a3b8] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span> 中央値 ({homeWorld})
                </div>
                <div className="text-[0.72rem] text-slate-300 font-semibold truncate">{homeWorld}</div>
                <div className="text-sm font-extrabold text-purple-300 font-['Outfit']">
                  {homeStats.avg > 0 ? `${homeStats.avg.toLocaleString()}G` : '-'}
                </div>
              </div>

              <div className="bg-[#161e31] border border-rose-500/40 rounded-xl p-2 flex flex-col justify-between shadow-sm">
                <div className="text-[0.65rem] text-[#94a3b8] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> 最高値 ({homeWorld})
                </div>
                <div className="text-[0.72rem] text-slate-300 font-semibold truncate">{homeWorld}</div>
                <div className="text-sm font-extrabold text-rose-400 font-['Outfit']">
                  {homeStats.max > 0 ? `${homeStats.max.toLocaleString()}G` : '-'}
                </div>
              </div>
            </div>

            {/* Sales Volume & Trend Canvas Chart Section */}
            <div className="bg-[#161e31] border border-[#334155] rounded-xl p-2.5 shrink-0 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.72rem] font-bold text-slate-200 flex items-center gap-1.5">
                  <i className="fa-solid fa-chart-line text-emerald-400"></i> 販売量・金額推移 ({homeWorld})
                </span>
                <span className={`text-[0.65rem] font-bold px-1.5 py-0.2 rounded border ${
                  homeTrendPct > 0 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  homeTrendPct < 0 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                }`}>
                  {homeTrendPct > 0 ? `↗ +${homeTrendPct}% (値上がり)` : homeTrendPct < 0 ? `↘ ${homeTrendPct}% (値下がり)` : '➡️ 0% (安定相場)'}
                </span>
              </div>

              {/* Real HTML5 Canvas Chart */}
              <div className="w-full relative">
                <TrendChartCanvas
                  trend={homeDailyTrends}
                  trendPct={homeTrendPct}
                  height={105}
                />
                
                {/* 7-Day Trend Numerical Summary Labels */}
                <div className="flex justify-between gap-1 mt-1 pt-1 border-t border-white/5">
                  {homeDailyTrends.map((t, idx) => (
                    <div key={idx} className="flex-1 text-center min-w-[40px]">
                      <div className="text-[0.62rem] font-bold text-[#94a3b8] font-mono">{t.date}</div>
                      <div className="text-[0.65rem] font-bold text-emerald-400 font-['Outfit']">
                        {t.weighted_avg > 0 ? `${t.weighted_avg.toLocaleString()}G` : '-'}
                      </div>
                      <div className="text-[0.58rem] text-sky-400 font-mono">
                        {t.volume > 0 ? `${t.volume}個` : '0個'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Sales History Table */}
            <div className="flex-1 min-h-0 bg-[#161e31] border border-[#334155] rounded-xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#334155] shrink-0 bg-[#0b0f19]/60">
                <span className="text-[0.72rem] font-bold text-slate-200 flex items-center gap-1.5">
                  <i className="fa-solid fa-clock-rotate-left text-cyan-400"></i> 直近の売買取引履歴一覧 ({homeWorld})
                </span>
                <span className="text-[0.68rem] text-slate-400 font-mono">
                  {homeHistory.length}件
                </span>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="sticky top-0 bg-[#0f172a] text-[#94a3b8] text-[0.68rem] border-b border-[#334155]">
                    <tr>
                      <th className="py-1.5 px-2.5">取引日時 (JST)</th>
                      <th className="py-1.5 px-2.5">購入者</th>
                      <th className="py-1.5 px-1.5 text-center">品質</th>
                      <th className="py-1.5 px-2 text-right">単価 (G)</th>
                      <th className="py-1.5 px-2 text-right">数量</th>
                      <th className="py-1.5 px-2.5 text-right">合計金額 (G)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[0.72rem]">
                    {loadingHomeData ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-cyan-400 font-sans text-xs">
                          <i className="fa-solid fa-spinner fa-spin mr-1.5"></i> 読込中...
                        </td>
                      </tr>
                    ) : homeHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-sans text-xs">
                          取引履歴がありません
                        </td>
                      </tr>
                    ) : (
                      homeHistory.map((h, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition">
                          <td className="py-1.5 px-2.5 text-slate-400 text-[0.68rem]">
                            <i className="fa-regular fa-clock text-[0.6rem] mr-1 opacity-70"></i>
                            {new Date(h.timestamp * 1000).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-1.5 px-2.5 text-cyan-300 font-sans truncate max-w-[90px]" title={h.buyerName}>
                            {h.buyerName || '-'}
                          </td>
                          <td className="py-1.5 px-1.5 text-center font-sans">
                            {h.hq ? (
                              <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[0.6rem] font-bold border border-amber-500/40">
                                HQ
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[0.65rem]">NQ</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right text-emerald-400 font-bold font-['Outfit']">
                            {h.pricePerUnit.toLocaleString()}G
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-200">
                            {h.quantity}個
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-amber-300 font-bold font-['Outfit']">
                            {h.total.toLocaleString()}G
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Dynamic 3-Scope Cheapest Cards + World Switcher + Live Listings Table */}
          <div className="flex flex-col gap-2.5 h-full min-h-0 overflow-hidden bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
            
            {/* Top 3 Scope Cheapest Cards (Exact Match with Live Listings) */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <div className="bg-[#161e31] border border-emerald-500/40 rounded-xl p-2 flex flex-col justify-between shadow-sm">
                <div className="text-[0.65rem] text-[#94a3b8] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> 選択サーバー最安
                </div>
                <div className="text-[0.72rem] text-slate-300 font-semibold truncate">{cheapestCards.selWorld[0]}</div>
                <div className="text-sm font-extrabold text-emerald-400 font-['Outfit']">
                  {cheapestCards.selWorld[1] > 0 ? `${cheapestCards.selWorld[1].toLocaleString()}G` : '-'}
                </div>
              </div>

              <div className="bg-[#161e31] border border-purple-500/40 rounded-xl p-2 flex flex-col justify-between shadow-sm">
                <div className="text-[0.65rem] text-[#94a3b8] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span> 同DC最安 ({activeDc})
                </div>
                <div className="text-[0.72rem] text-purple-300 font-semibold truncate">{cheapestCards.dc[0]}</div>
                <div className="text-sm font-extrabold text-purple-300 font-['Outfit']">
                  {cheapestCards.dc[1] > 0 ? `${cheapestCards.dc[1].toLocaleString()}G` : '-'}
                </div>
              </div>

              <div className="bg-[#161e31] border border-pink-500/40 rounded-xl p-2 flex flex-col justify-between shadow-sm">
                <div className="text-[0.65rem] text-[#94a3b8] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400"></span> 全DC最安 (日本)
                </div>
                <div className="text-[0.72rem] text-pink-300 font-semibold truncate">
                  {cheapestCards.all[0]}
                  {WORLD_TO_DC[cheapestCards.all[0]] && (
                    <span className="text-slate-400 font-normal ml-1 text-[0.65rem]">
                      ({WORLD_TO_DC[cheapestCards.all[0]]})
                    </span>
                  )}
                </div>
                <div className="text-sm font-extrabold text-pink-400 font-['Outfit']">
                  {cheapestCards.all[1] > 0 ? `${cheapestCards.all[1].toLocaleString()}G` : '-'}
                </div>
              </div>
            </div>

            {/* Live Listings Table with Scope & World Controls */}
            <div className="flex-1 min-h-0 bg-[#161e31] border border-[#334155] rounded-xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#334155] shrink-0 bg-[#0b0f19]/60">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-[0.72rem] font-bold text-amber-300">
                    <i className="fa-solid fa-store"></i>
                    <span>出品一覧</span>
                  </div>

                  {/* World Selector Dropdown */}
                  <select
                    value={activeWorld}
                    onChange={(e) => setActiveWorld(e.target.value)}
                    className="bg-[#0b0f19] border border-white/20 rounded text-slate-200 text-[0.68rem] font-semibold px-2 py-0.5 outline-none cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    {Object.entries(JAPAN_DCS).map(([dcName, worlds]) => (
                      <optgroup key={dcName} label={`${dcName} DC`}>
                        {worlds.map((w) => (
                          <option key={w} value={w}>🌐 {w}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  {/* 3 Scope Switcher */}
                  <div className="flex bg-black/50 p-0.5 rounded-lg border border-white/10 text-[0.68rem]">
                    <button
                      onClick={() => setListingsScope('world')}
                      className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        listingsScope === 'world' ? 'bg-cyan-500 text-black shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      単一
                    </button>
                    <button
                      onClick={() => setListingsScope('dc')}
                      className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        listingsScope === 'dc' ? 'bg-cyan-500 text-black shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      同DC
                    </button>
                    <button
                      onClick={() => setListingsScope('all')}
                      className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        listingsScope === 'all' ? 'bg-cyan-500 text-black shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      全DC
                    </button>
                  </div>

                  <span className="text-[0.68rem] text-slate-400 font-mono">
                    {listings.length}件
                  </span>

                  <button
                    onClick={fetchRightPaneListings}
                    className="text-slate-400 hover:text-cyan-300 text-xs p-1 transition-colors cursor-pointer"
                    title="再取得"
                  >
                    <i className={`fa-solid fa-arrows-rotate ${loadingListings ? 'fa-spin text-cyan-400' : ''}`}></i>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="sticky top-0 bg-[#0f172a] text-[#94a3b8] text-[0.68rem] border-b border-[#334155]">
                    <tr>
                      <th className="py-1.5 px-2.5">ワールド</th>
                      <th className="py-1.5 px-2.5">リテイナー</th>
                      <th className="py-1.5 px-1.5 text-center">品質</th>
                      <th className="py-1.5 px-2 text-right">単価 (G)</th>
                      <th className="py-1.5 px-2 text-right">数量</th>
                      <th className="py-1.5 px-2.5 text-right">合計金額 (G)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[0.72rem]">
                    {loadingListings ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-cyan-400 font-sans text-xs">
                          <i className="fa-solid fa-spinner fa-spin mr-1.5"></i> 出品情報を取得中...
                        </td>
                      </tr>
                    ) : listingsError ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center font-sans">
                          <div className="text-red-400 font-semibold text-xs mb-1 flex items-center justify-center gap-1.5">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            API通信エラーにより出品情報を取得できませんでした
                          </div>
                          <div className="text-slate-400 text-[0.7rem] leading-relaxed mb-3">
                            Universalis APIが高負荷または応答タイムアウトの可能性があります。
                          </div>
                          <button
                            onClick={fetchRightPaneListings}
                            disabled={loadingListings}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-bold text-xs rounded shadow transition cursor-pointer"
                          >
                            <i className={`fa-solid fa-arrows-rotate ${loadingListings ? 'fa-spin' : ''}`}></i>
                            再試行する
                          </button>
                        </td>
                      </tr>
                    ) : listings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-sans text-xs">
                          現在出品中の商品はありません
                        </td>
                      </tr>
                    ) : (
                      listings.map((l, idx) => {
                        const wName = l.worldName || activeWorld;
                        const dcName = WORLD_TO_DC[wName] || '';
                        return (
                          <tr key={idx} className="hover:bg-white/5 transition">
                            <td className="py-1.5 px-2.5 text-amber-300 font-semibold truncate max-w-[120px]">
                              {wName}
                              {dcName && (
                                <span className="text-[0.62rem] text-slate-400 font-normal ml-1">
                                  ({dcName})
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-cyan-300 font-sans truncate max-w-[95px]" title={l.retainerName}>
                              {l.retainerName || '-'}
                            </td>
                          <td className="py-1.5 px-1.5 text-center font-sans">
                            {l.hq ? (
                              <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[0.6rem] font-bold border border-amber-500/40">
                                HQ
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[0.65rem]">NQ</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right text-emerald-400 font-bold font-['Outfit']">
                            {l.pricePerUnit.toLocaleString()}G
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-200">
                            {l.quantity}個
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-amber-300 font-bold font-['Outfit']">
                            {l.total.toLocaleString()}G
                          </td>
                        </tr>
                      );
                    })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
