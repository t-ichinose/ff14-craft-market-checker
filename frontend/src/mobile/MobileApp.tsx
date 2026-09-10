import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { JAPAN_DCS } from '../constants/japanDcs';
import { getSavedSharedWorld, saveSharedWorld } from '../shared/marketConstants';
import { fetchAndPrepareMarketData, type MarketDataset } from '../services/marketDataService';
import { ApiHealthIndicator } from '../shared/ApiHealthIndicator';
import { MobileMarketView } from './MobileMarketView';
import { MobileArbitrageView } from './MobileArbitrageView';
import { MobileCraftView } from './MobileCraftView';

type MobileTab = 'market' | 'arbitrage' | 'craft';

interface MobileAppProps {
  onSwitchToPc: () => void;
}

export const MobileApp: React.FC<MobileAppProps> = ({ onSwitchToPc }) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('market');
  const [selectedWorld, setSelectedWorld] = useState<string>(() => getSavedSharedWorld());
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [marketTargetItem, setMarketTargetItem] = useState<{ itemId: number; isHq?: boolean } | null>(null);
  const [returnSource, setReturnSource] = useState<{
    label: string;
    tab: MobileTab;
    neededCount?: number;
    targetPrice?: number;
    isMaterial?: boolean;
  } | null>(null);

  // ユーザーが自発的にメインタブを切り替えたとき（リセット条件②: 戻りナビを消去）
  const handleTabChange = useCallback((tab: MobileTab) => {
    setActiveTab(tab);
    setReturnSource(null);
  }, []);

  // クラフト等から市場タブへの遷移ハンドラー
  const handleNavigateToMarket = useCallback((
    itemId: number,
    isHq?: boolean,
    context?: { neededCount?: number; targetPrice?: number; isMaterial?: boolean }
  ) => {
    setMarketTargetItem({ itemId, isHq });
    setReturnSource({
      label: 'クラフト',
      tab: 'craft',
      neededCount: context?.neededCount,
      targetPrice: context?.targetPrice,
      isMaterial: context?.isMaterial,
    });
    setActiveTab('market');
  }, []);

  // 「戻る」を実行（リセット条件①）
  const handleReturnBack = useCallback(() => {
    if (returnSource) {
      setActiveTab(returnSource.tab);
      setReturnSource(null);
    }
  }, [returnSource]);

  // 戻りナビの消去（リセット条件③ & ④）
  const handleClearReturnSource = useCallback(() => {
    setReturnSource(null);
  }, []);

  // 最終更新の取得
  useEffect(() => {
    fetchAndPrepareMarketData()
      .then((ds: MarketDataset) => {
        if (ds.last_updated) setLastUpdated(ds.last_updated);
      })
      .catch(() => {});
  }, []);

  // 外部/タブ間メッセージでのワールド同期リスナー
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === 'SET_SHARED_WORLD' && typeof e.data?.world === 'string' && e.data.world !== selectedWorld) {
        setSelectedWorld(e.data.world);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [selectedWorld]);

  const handleWorldChange = useCallback((w: string) => {
    if (!w) return;
    setSelectedWorld((prev) => {
      if (prev === w) return prev;
      saveSharedWorld(w);
      window.postMessage({ type: 'SET_SHARED_WORLD', world: w }, '*');
      return w;
    });
  }, []);

  const formattedLastUpdated = useMemo(() => {
    if (!lastUpdated) return '同期中...';
    try {
      const d = new Date(lastUpdated);
      if (isNaN(d.getTime())) return lastUpdated;
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${m}/${day} ${h}:${min}`;
    } catch {
      return lastUpdated;
    }
  }, [lastUpdated]);

  return (
    <div className="fixed inset-0 flex flex-col h-[100dvh] w-screen bg-[#070a12] text-slate-100 font-['Inter',sans-serif] overflow-hidden select-none overscroll-none">
      {/* モバイル専用スリムヘッダー */}
      <header className="flex items-center justify-between px-3 py-2 bg-[#0b1120] border-b border-white/10 shrink-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00d2ff] to-[#7928ca] flex items-center justify-center text-white text-xs shadow-md">
            <i className="fa-solid fa-chart-line"></i>
          </div>
          <div>
            <div className="text-xs font-black tracking-tight text-white font-['Outfit'] leading-tight">
              FF14 Tracker
            </div>
            <div className="text-[0.6rem] text-slate-400 font-mono">
              最終更新: {formattedLastUpdated}
            </div>
          </div>
        </div>

        {/* ワールド選択 ＆ PC切替 */}
        <div className="flex items-center gap-1.5">
          <ApiHealthIndicator compact />
          <select
            value={selectedWorld}
            onChange={(e) => handleWorldChange(e.target.value)}
            className={`bg-slate-900 border border-white/20 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none transition-colors ${
              activeTab === 'market'
                ? 'text-[#00d2ff] focus:border-[#00d2ff]'
                : activeTab === 'arbitrage'
                ? 'text-[#ffb703] focus:border-[#ffb703]'
                : 'text-emerald-400 focus:border-emerald-500'
            }`}
          >
            {(Object.entries(JAPAN_DCS) as [string, string[]][]).map(([dc, worlds]) => (
              <optgroup key={dc} label={`DC: ${dc}`}>
                {worlds.map((w: string) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <button
            onClick={onSwitchToPc}
            title="PC版表示に切り替え"
            className="px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-[0.68rem] text-slate-300 font-bold flex items-center gap-1 shrink-0"
          >
            <i className="fa-solid fa-desktop"></i>
            <span>PC版</span>
          </button>
        </div>
      </header>

      {/* 3大機能切り替えタブバー */}
      <div className="flex bg-[#0b1120] px-3 py-1.5 border-b border-white/10 gap-2 shrink-0">
        <button
          onClick={() => handleTabChange('market')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'market'
              ? 'bg-gradient-to-r from-[#00d2ff]/20 to-[#3b82f6]/20 text-[#00d2ff] border border-[#00d2ff]/40 shadow-sm'
              : 'text-slate-400 hover:text-white bg-slate-900/40 border border-transparent'
          }`}
        >
          <i className="fa-solid fa-chart-line text-[0.75rem]"></i>
          <span>市場分析</span>
        </button>

        <button
          onClick={() => handleTabChange('arbitrage')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'arbitrage'
              ? 'bg-gradient-to-r from-[#ffb703]/20 to-[#f59e0b]/20 text-[#ffb703] border border-[#ffb703]/40 shadow-sm'
              : 'text-slate-400 hover:text-white bg-slate-900/40 border border-transparent'
          }`}
        >
          <i className="fa-solid fa-coins text-[0.75rem]"></i>
          <span>金策ナビ</span>
        </button>

        <button
          onClick={() => handleTabChange('craft')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'craft'
              ? 'bg-gradient-to-r from-[#10b981]/20 to-[#059669]/20 text-[#34d399] border border-[#10b981]/40 shadow-sm'
              : 'text-slate-400 hover:text-white bg-slate-900/40 border border-transparent'
          }`}
        >
          <i className="fa-solid fa-hammer text-[0.75rem]"></i>
          <span>クラフト原価</span>
        </button>
      </div>

      {/* メインビュー */}
      <div className="flex-1 w-full min-h-0 overflow-hidden relative">
        <div className={`w-full h-full ${activeTab === 'market' ? 'block' : 'hidden'}`}>
          <MobileMarketView
            selectedWorld={selectedWorld}
            onWorldChange={handleWorldChange}
            isActive={activeTab === 'market'}
            targetItem={marketTargetItem}
            onTargetItemHandled={() => setMarketTargetItem(null)}
            returnSource={returnSource}
            onReturnBack={handleReturnBack}
            onClearReturnSource={handleClearReturnSource}
          />
        </div>
        <div className={`w-full h-full ${activeTab === 'arbitrage' ? 'block' : 'hidden'}`}>
          <MobileArbitrageView homeWorld={selectedWorld} onWorldChange={handleWorldChange} isActive={activeTab === 'arbitrage'} />
        </div>
        <div className={`w-full h-full ${activeTab === 'craft' ? 'block' : 'hidden'}`}>
          <MobileCraftView
            salesWorld={selectedWorld}
            onWorldChange={handleWorldChange}
            isActive={activeTab === 'craft'}
            onNavigateToMarket={handleNavigateToMarket}
          />
        </div>
      </div>
    </div>
  );
};
