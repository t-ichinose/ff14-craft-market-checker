import React, { useState, useEffect } from 'react';
import { JAPAN_SCOPE_OPTIONS } from './constants/japanDcs';

// 🏛️ 3つの独立した機能ボックス（1つの boxes/ ディレクトリ配下に対等に配置）
import { MarketBox } from './boxes/market/MarketBox';
import { ArbitrageBox } from './boxes/arbitrage/ArbitrageBox';
import { CraftBox } from './boxes/craft/CraftBox';

// 🛠️ 共通設備（モーダル等）
import { ItemMarketModal } from './shared/ItemMarketModal';
import { ApiHealthIndicator } from './shared/ApiHealthIndicator';
import { prefetchRecipes } from './services/recipeDataService';
import { fetchAndPrepareMarketData } from './services/marketDataService';

import { useIsMobile } from './hooks/useIsMobile';
import { MobileApp } from './mobile/MobileApp';

// 🚀 アプリ起動の瞬間から最速並行バックグラウンドプリフェッチを開始 (0ms即時表示の実現)
prefetchRecipes();
fetchAndPrepareMarketData().catch(() => {});

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

  // 🚀 バックグラウンドウォームアップ: 市場タブの描画直後の空き時間で、金策とクラフトも静かに初期化
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisitedTabs({
        analytics: true,
        arbitrage: true,
        craft: true,
      });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleTabSelect = (tab: 'analytics' | 'arbitrage' | 'craft') => {
    setActiveMainTab(tab);
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetchAndPrepareMarketData()
      .then((dataset) => {
        if (dataset.last_updated) {
          setLastUpdated(dataset.last_updated);
        }
      })
      .catch(() => {});
  }, []);

  const formattedLastUpdated = React.useMemo(() => {
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

  const periodStr = React.useMemo(() => {
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

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f19] text-[#f8fafc] font-['Inter',sans-serif] overflow-hidden">
      {/* Universal Fixed Header (Platform Land) */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#0f172a]/95 border-b border-white/10 shrink-0 z-50 backdrop-blur-md">
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
          <div className="flex items-center gap-1.5 bg-[#0f172a]/80 border border-white/10 px-2.5 py-1 rounded-[10px] text-[0.75rem] text-[#94a3b8] font-normal backdrop-blur shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_8px_#4ade80] animate-pulse" />
            <span className="text-[#00d2ff] font-semibold flex items-center gap-1">
              <i className="fa-regular fa-calendar-days"></i> 集計期間: {periodStr}
            </span>
            <span className="opacity-35 mx-1">|</span>
            <span className="flex items-center gap-1 text-slate-300">
              <i className="fa-regular fa-clock text-slate-400"></i>
              <span>最終更新: {formattedLastUpdated}</span>
            </span>
          </div>

          {/* API Health Monitor Badge */}
          <ApiHealthIndicator />

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
              onSelectItemForModal={(id, world, isHq) => setSelectedModalItemId({ id, world: world || 'Carbuncle', isHq })}
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
