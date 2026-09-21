import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { JAPAN_SCOPE_OPTIONS } from './constants/japanDcs';

// 🏛️ 3つの独立した機能ボックス（1つの boxes/ ディレクトリ配下に対等に配置）
import { MarketBox } from './boxes/market/MarketBox';
import { ArbitrageBox } from './boxes/arbitrage/ArbitrageBox';
import { CraftBox } from './boxes/craft/CraftBox';

// 🛠️ 共通設備（モーダル等）
import { ItemMarketModal } from './shared/ItemMarketModal';
import { ALL_JAPAN_WORLDS, getSavedSharedWorld } from './shared/marketConstants';
import { prefetchRecipes } from './services/recipeDataService';
import {
  fetchAndPrepareMarketData,
  fetchAndPrepareListingsData,
  invalidateMarketDataCache,
  getLatestTimestamp,
} from './services/marketDataService';

import { useIsMobile } from './hooks/useIsMobile';
import { MobileApp } from './mobile/MobileApp';

export const App: React.FC = () => {
  const { isMobile, toggleOverride } = useIsMobile();

  // Main View Switcher: 'analytics' (市場分析) vs 'arbitrage' (金策ナビ) vs 'craft' (クラフト分析)
  const [activeMainTab, setActiveMainTab] = useState<'analytics' | 'arbitrage' | 'craft'>('analytics');

  // Craft Tab sub-states
  const [selectedModalItemId, setSelectedModalItemId] = useState<{ id: number; world: string; isHq?: boolean } | null>(null);

  // Track visited tabs so they mount and stay in DOM (0ms switching)
  const [visitedTabs, setVisitedTabs] = useState<Record<string, boolean>>({
    analytics: true,
    arbitrage: false,
    craft: false,
  });

  // 初期ロード・エラー状態管理
  const [initLoading, setInitLoading] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // 🚀 アプリ初期化: 並行バックグラウンドプリフェッチ (0ms即時表示の実現)
  useEffect(() => {
    let isMounted = true;
    setInitLoading(true);
    setInitError(null);

    Promise.allSettled([
      prefetchRecipes(),
      fetchAndPrepareMarketData({ forceRefresh: retryCount > 0 }),
      fetchAndPrepareListingsData({ forceRefresh: retryCount > 0 }),
    ]).then(([_, marketRes, listingsRes]) => {
      if (!isMounted) return;

      const marketUpdated =
        marketRes.status === 'fulfilled' && marketRes.value?.last_updated
          ? marketRes.value.last_updated
          : null;
      const listingsUpdated =
        listingsRes.status === 'fulfilled' && listingsRes.value?.last_updated
          ? listingsRes.value.last_updated
          : null;

      const latest = getLatestTimestamp(marketUpdated, listingsUpdated);
      if (latest) {
        setLastUpdated(latest);
      }

      if (marketRes.status === 'fulfilled' && marketRes.value) {
        setInitLoading(false);
      } else {
        const errorReason =
          marketRes.status === 'rejected'
            ? marketRes.reason?.message || 'データの取得に失敗しました'
            : 'データセットが見つかりません';
        setInitError(errorReason);
        setInitLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [retryCount]);

  const handleRetryInit = useCallback(() => {
    invalidateMarketDataCache();
    setRetryCount((c) => c + 1);
  }, []);

  // 🚀 バックグラウンドウォームアップ: 市場タブの描画直後の空き時間で、金策とクラフトも静かに初期化
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisitedTabs({
        analytics: true,
        arbitrage: true,
        craft: true,
      });
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const handleTabSelect = (tab: 'analytics' | 'arbitrage' | 'craft') => {
    setActiveMainTab(tab);
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  const formattedLastUpdated = useMemo(() => {
    if (!lastUpdated) return '読込中...';
    try {
      const d = new Date(lastUpdated);
      if (isNaN(d.getTime())) return lastUpdated;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch {
      return lastUpdated;
    }
  }, [lastUpdated]);

  const periodStr = useMemo(() => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
    const startJst = new Date(jstNow);
    startJst.setDate(jstNow.getDate() - 6);
    const sMonth = startJst.getMonth() + 1;
    const sDay = startJst.getDate();
    const eMonth = jstNow.getMonth() + 1;
    const eDay = jstNow.getDate();
    return `${sMonth}/${sDay}〜${eMonth}/${eDay}`;
  }, []);

  if (isMobile) {
    return <MobileApp onSwitchToPc={() => toggleOverride('pc')} />;
  }

  // 初期化致命的エラー時のフォールバック画面
  if (initError && !lastUpdated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#0b0f19] text-[#f8fafc] font-['Inter',sans-serif] p-6">
        <div className="max-w-md w-full bg-[#0f172a] border border-red-500/30 rounded-2xl p-6 text-center shadow-[0_0_30px_rgba(239,68,68,0.15)]">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 text-2xl">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h2 className="text-lg font-bold text-white mb-2 font-['Outfit']">初期データの読み込みに失敗しました</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            {initError}
            <br />
            ネットワーク接続を確認の上、再度お試しください。
          </p>
          <button
            onClick={handleRetryInit}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00d2ff] to-[#7928ca] text-white text-xs font-bold hover:opacity-90 transition-all shadow-[0_0_15px_rgba(0,210,255,0.3)] cursor-pointer flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-rotate-right"></i>
            <span>再試行する</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f19] text-[#f8fafc] font-['Inter',sans-serif] overflow-hidden">
      {/* Universal Fixed Header (Platform Land) */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#0f172a] border-b border-white/10 shrink-0 z-50">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-[#00d2ff] to-[#7928ca] shadow-[0_0_15px_rgba(0,210,255,0.4)]">
            <i className="fa-solid fa-chart-line text-white text-base"></i>
          </div>
          <div>
            <h1 className="text-[1.05rem] font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent leading-tight font-['Outfit']">
              FF14 Market Tracker
            </h1>
            <div className="text-[0.62rem] text-[#94a3b8] font-bold tracking-wider uppercase">
              Japan Datacenters · All 32 Worlds
            </div>
          </div>
        </div>

        {/* Center: 3 Primary Tabs Navigation (3 Independent House Boxes) */}
        <div className="flex items-center gap-2">
          <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
            {/* Box 1: 市場分析 (Market Analytics) */}
            <button
              onClick={() => handleTabSelect('analytics')}
              className={`flex items-center gap-[0.35rem] px-3.5 py-[0.35rem] rounded-[8px] text-[0.82rem] font-[700] transition-all cursor-pointer whitespace-nowrap ${
                activeMainTab === 'analytics'
                  ? 'bg-gradient-to-br from-[rgba(0,210,255,0.3)] to-[rgba(15,23,42,0.9)] border border-[rgba(0,210,255,0.5)] text-white shadow-[0_0_12px_rgba(0,210,255,0.3)]'
                  : 'bg-transparent border border-transparent text-[#94a3b8] hover:text-white hover:bg-white/10'
              }`}
            >
              <i className="fa-solid fa-chart-simple text-[#00d2ff]"></i>
              <span>市場分析</span>
            </button>

            {/* Box 2: 金策ナビ (Arbitrage Finder) */}
            <button
              onClick={() => handleTabSelect('arbitrage')}
              className={`flex items-center gap-[0.35rem] px-3.5 py-[0.35rem] rounded-[8px] text-[0.82rem] font-[700] transition-all cursor-pointer whitespace-nowrap ${
                activeMainTab === 'arbitrage'
                  ? 'bg-gradient-to-br from-[rgba(255,183,3,0.3)] to-[rgba(15,23,42,0.9)] border border-[rgba(255,183,3,0.5)] text-white shadow-[0_0_12px_rgba(255,183,3,0.3)]'
                  : 'bg-transparent border border-transparent text-[#94a3b8] hover:text-white hover:bg-white/10'
              }`}
            >
              <i className="fa-solid fa-coins text-[#ffb703]"></i>
              <span>金策ナビ</span>
            </button>

            {/* Box 3: クラフト分析 (Craft Profit Optimizer) */}
            <button
              onClick={() => handleTabSelect('craft')}
              className={`flex items-center gap-[0.35rem] px-3.5 py-[0.35rem] rounded-[8px] text-[0.82rem] font-[700] transition-all cursor-pointer whitespace-nowrap ${
                activeMainTab === 'craft'
                  ? 'bg-gradient-to-br from-[rgba(16,185,129,0.3)] to-[rgba(15,23,42,0.9)] border border-[rgba(16,185,129,0.5)] text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-transparent border border-transparent text-[#94a3b8] hover:text-white hover:bg-white/10'
              }`}
            >
              <i className="fa-solid fa-hammer text-[#10b981]"></i>
              <span>クラフト分析</span>
            </button>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-1.5 bg-[#0f172a] border border-white/10 px-2.5 py-1 rounded-[10px] text-[0.75rem] text-[#94a3b8] font-normal shadow-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                initLoading
                  ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'
                  : 'bg-[#4ade80] shadow-[0_0_8px_#4ade80]'
              } animate-pulse`}
            />
            <span className="text-[#00d2ff] font-semibold flex items-center gap-1">
              <i className="fa-regular fa-calendar-days"></i> 集計期間: {periodStr}
            </span>
            <span className="opacity-35 mx-1">|</span>
            <span className="flex items-center gap-1 text-slate-300">
              <i className="fa-regular fa-clock text-slate-400"></i>
              <span>最終更新: {formattedLastUpdated}</span>
            </span>
          </div>

          {/* Mobile Preview Toggle */}
          <button
            onClick={() => toggleOverride('mobile')}
            title="スマホ版表示に切り替え"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#00d2ff]/40 rounded-[10px] text-[0.72rem] text-slate-400 hover:text-white font-medium transition-all shadow-sm cursor-pointer"
          >
            <i className="fa-solid fa-mobile-screen text-[#00d2ff]"></i>
            <span>スマホ版</span>
          </button>
        </div>
      </header>

      {/* Main View Area: Lazy Keep-Alive Mounted Boxes (0ms instant tab switching) */}
      <main className="flex-1 w-full h-[calc(100vh-53px)] min-h-[calc(100vh-53px)] max-h-[calc(100vh-53px)] overflow-hidden flex flex-col bg-[#0b0f19]">
        {/* 🏠 Box 1: 市場分析ボックス */}
        {visitedTabs.analytics && (
          <div className="w-full h-full flex flex-col" style={{ display: activeMainTab === 'analytics' ? 'flex' : 'none' }}>
            <MarketBox />
          </div>
        )}

        {/* 🏠 Box 2: 金策ナビボックス */}
        {visitedTabs.arbitrage && (
          <div className="w-full h-full flex flex-col" style={{ display: activeMainTab === 'arbitrage' ? 'flex' : 'none' }}>
            <ArbitrageBox />
          </div>
        )}

        {/* 🏠 Box 3: クラフト分析ボックス */}
        {visitedTabs.craft && (
          <div className="w-full h-full flex flex-col" style={{ display: activeMainTab === 'craft' ? 'flex' : 'none' }}>
            <CraftBox
              scopes={JAPAN_SCOPE_OPTIONS}
              initialSalesWorld="Carbuncle"
              initialSourcingScope="world"
              onSelectItemForModal={(id, world, isHq) => {
                const safeWorld = (world && ALL_JAPAN_WORLDS.includes(world))
                  ? world
                  : (getSavedSharedWorld() || 'Carbuncle');
                setSelectedModalItemId({ id, world: safeWorld, isHq });
              }}
            />
          </div>
        )}
      </main>

      {/* 🛠️ Item Market Detail Modal */}
      {selectedModalItemId !== null && (
        <ItemMarketModal
          itemId={selectedModalItemId.id}
          worldName={selectedModalItemId.world || 'Carbuncle'}
          initialHq={selectedModalItemId.isHq}
          onClose={() => setSelectedModalItemId(null)}
        />
      )}
    </div>
  );
};

export default App;
