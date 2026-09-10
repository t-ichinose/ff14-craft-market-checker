import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { WORLD_TO_DC } from '../constants/japanDcs';
import { fetchAndPrepareMarketData, type MarketItem, type MarketDataset } from '../services/marketDataService';
import { fetchMarketListings, type UniversalisListingItem } from '../services/universalisClient';
import { CategoryFilterDropdown } from '../shared/CategoryFilterDropdown';
import { TrendChartCanvas } from '../shared/TrendChartCanvas';
import { SwipeContainer } from './SwipeContainer';
import { MobileWorldVelocityBar } from './MobileWorldVelocityBar';
import { formatJstDateTime } from '../shared/marketConstants';
import { ArbitrageCard } from '../boxes/arbitrage/ArbitrageCard';
import {
  type ArbitrageOpportunity,
  type ArbitrageSortMode,
} from '../boxes/arbitrage/arbitrageTypes';
import {
  getWeekRangeJst,
  alignDailyTrend,
  computeArbitrageOpportunities,
} from '../boxes/arbitrage/arbitrageUtils';

interface MobileArbitrageViewProps {
  homeWorld: string;
  onWorldChange?: (world: string) => void;
  isActive?: boolean;
}

export const MobileArbitrageView: React.FC<MobileArbitrageViewProps> = React.memo(({
  homeWorld,
  onWorldChange,
  isActive = true,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(0); // 0: 一覧, 1: 仕入, 2: 販売
  const [allData, setAllData] = useState<Record<string, MarketItem[]>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // フィルタ & ソート
  const [sortMode, setSortMode] = useState<ArbitrageSortMode>('dailyProfit');
  const [minVelocity, setMinVelocity] = useState<number>(0); // 日当たり販売数の足切り (0: 指定なし)
  const [excludeCrystals, setExcludeCrystals] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  // 選択サヤ取り機会
  const [selectedOp, setSelectedOp] = useState<ArbitrageOpportunity | null>(null);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);

  // 仕入・販売画面内の表示モード ('history' | 'listings') - デフォルトは取引履歴
  const [sourceViewMode, setSourceViewMode] = useState<'listings' | 'history'>('history');
  const [homeViewMode, setHomeViewMode] = useState<'listings' | 'history'>('history');

  // 出品リスト
  const [sourceListings, setSourceListings] = useState<UniversalisListingItem[]>([]);
  const [homeListings, setHomeListings] = useState<UniversalisListingItem[]>([]);
  const [loadingSource, setLoadingSource] = useState<boolean>(false);
  const [loadingHome, setLoadingHome] = useState<boolean>(false);

  // 日付ラベル一覧
  const weekDates = useMemo(() => getWeekRangeJst(), []);

  // データロード
  useEffect(() => {
    let isMounted = true;
    fetchAndPrepareMarketData()
      .then((dataset: MarketDataset) => {
        if (!isMounted) return;
        setAllData(dataset.data);
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
        // 【重要】selectedCategories を全選択で初期化することで、初回からサヤ取り機会が即座に計算・表示される
        setSelectedCategories(cats);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('Failed to load market data for arbitrage:', err);
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // サヤ取り計算
  const opportunities = useMemo(() => {
    if (!allData || Object.keys(allData).length === 0) return [];
    return computeArbitrageOpportunities(allData, {
      homeWorld,
      sortMode,
      minVelocity,
      excludeCrystals,
      searchQuery,
      availableCategories,
      selectedCategories,
    });
  }, [allData, homeWorld, sortMode, minVelocity, excludeCrystals, searchQuery, availableCategories, selectedCategories]);

  // アイテム選択時（自動で仕入画面へスワイプ）
  const handleSelectOp = useCallback((op: ArbitrageOpportunity) => {
    setSelectedOp(op);
    setCurrentPage(1); // 画面1 (仕入先分析) へスライド
  }, []);

  // ホームワールド切り替え時に選択中のサヤ取り機会も再計算・更新
  useEffect(() => {
    if (!selectedOp || !allData[homeWorld]) return;
    const matched = opportunities.find(
      (op) => op.itemId === selectedOp.itemId && op.isHq === selectedOp.isHq
    );
    if (matched) {
      setSelectedOp(matched);
    }
  }, [homeWorld, allData, opportunities]);

  // 出品情報の取得
  useEffect(() => {
    if (!isActive || !selectedOp) return;
    let isMounted = true;

    setLoadingSource(true);
    // 全ワールド（Japan DC）から出品データを取得（リアルタイム出品の最安推移に対応）
    fetchMarketListings('Japan', selectedOp.itemId, { isHq: selectedOp.isHq, limit: 50 })
      .then((res) => {
        if (isMounted) {
          setSourceListings(res.listings);
          setLoadingSource(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingSource(false);
      });

    setLoadingHome(true);
    fetchMarketListings(homeWorld, selectedOp.itemId, { isHq: selectedOp.isHq, limit: 30 })
      .then((res) => {
        if (isMounted) {
          setHomeListings(res.listings);
          setLoadingHome(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingHome(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedOp, homeWorld, isActive]);

  // トレンドデータの位置合わせ
  const sourceTrend = useMemo(() => {
    if (!selectedOp) return [];
    return alignDailyTrend(selectedOp.sourceTrend, weekDates);
  }, [selectedOp, weekDates]);

  const homeTrend = useMemo(() => {
    if (!selectedOp) return [];
    return alignDailyTrend(selectedOp.homeTrend, weekDates);
  }, [selectedOp, weekDates]);

  // 仕入先・自ワールドのMarketItem情報
  const sourceItem = useMemo(() => {
    if (!selectedOp) return null;
    const list = allData[selectedOp.sourceWorld] || [];
    return list.find((itm) => itm.item_id === selectedOp.itemId && itm.hq === selectedOp.isHq) || null;
  }, [selectedOp, allData]);

  const homeItem = useMemo(() => {
    if (!selectedOp) return null;
    const list = allData[homeWorld] || [];
    return list.find((itm) => itm.item_id === selectedOp.itemId && itm.hq === selectedOp.isHq) || null;
  }, [selectedOp, allData, homeWorld]);

  // 共通フィルターバー（左側: 画面切替タブセット / 右側: 現在の条件チップ ＆ フィルター開閉アイコン）
  const renderFilterBar = () => (
    <div className="shrink-0 flex flex-col gap-1.5">
      {/* バー本体（常時表示: タブセット + フィルターアイコン） */}
      <div
        className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-xl border text-xs text-slate-300 transition-all shadow-sm ${
          isMenuOpen
            ? 'bg-slate-900 border-[#ffb703]/40 shadow-[0_0_12px_rgba(255,183,3,0.15)]'
            : 'bg-slate-900/90 border-white/10'
        }`}
      >
        {/* 左側: 画面切り替えタブセット [一覧] [仕入] [販売] */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setCurrentPage(0)}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[0.68rem] flex items-center gap-1 whitespace-nowrap ${
              currentPage === 0
                ? 'bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5 border border-transparent'
            }`}
          >
            <i className="fa-solid fa-list text-[0.62rem]"></i>一覧
          </button>
          <button
            onClick={() => setCurrentPage(1)}
            disabled={!selectedOp}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[0.68rem] flex items-center gap-1 whitespace-nowrap ${
              currentPage === 1
                ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5 border border-transparent disabled:opacity-30 disabled:hover:text-slate-400'
            }`}
          >
            <i className="fa-solid fa-cart-shopping text-[0.62rem]"></i>仕入
          </button>
          <button
            onClick={() => setCurrentPage(2)}
            disabled={!selectedOp}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[0.68rem] flex items-center gap-1 whitespace-nowrap ${
              currentPage === 2
                ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5 border border-transparent disabled:opacity-30 disabled:hover:text-slate-400'
            }`}
          >
            <i className="fa-solid fa-store text-[0.62rem]"></i>販売
          </button>
        </div>

        {/* 右側: フィルター状態サマリー ＆ アイコン開閉ボタン */}
        <div
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex items-center gap-1.5 min-w-0 pl-1 cursor-pointer select-none"
          title={isMenuOpen ? 'フィルターを閉じる' : 'フィルターを展開'}
        >
          {/* 現在の条件サマリー（入る分だけtruncate表示） */}
          <div className="flex items-center gap-1 min-w-0 overflow-hidden text-[0.65rem]">
            <span className="text-slate-300 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/10 font-bold flex items-center gap-0.5 shrink-0">
              <i className="fa-solid fa-house text-[#ffb703] text-[0.58rem]"></i>
              <span className="truncate max-w-[55px]">{homeWorld}</span>
            </span>
            {minVelocity > 0 && (
              <span className="text-[#ffb703] font-mono bg-[#ffb703]/10 px-1 py-0.5 rounded border border-[#ffb703]/30 font-bold shrink-0">
                {minVelocity}+
              </span>
            )}
            {excludeCrystals && (
              <span className="text-[#ffb703] bg-[#ffb703]/10 px-1 py-0.5 rounded border border-[#ffb703]/30 font-semibold shrink-0" title="クリスタル除外中">
                <i className="fa-solid fa-gem text-[0.58rem]"></i>
              </span>
            )}
            {searchQuery && (
              <span className="text-white font-mono truncate max-w-[45px]">
                "{searchQuery}"
              </span>
            )}
          </div>

          {/* フィルターアイコン（テキスト「フィルター」をアイコンのみに変更） */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 shrink-0 transition-colors">
            <i className="fa-solid fa-filter text-[#ffb703] text-xs"></i>
            <i className={`fa-solid fa-chevron-${isMenuOpen ? 'up' : 'down'} text-[0.6rem] text-slate-400`}></i>
          </div>
        </div>
      </div>

      {/* バーの下に展開されるメニュー要素 */}
      {isMenuOpen && (
        <div className="flex flex-col gap-1.5 bg-slate-900/95 p-2 rounded-xl border border-white/10 shadow-xl transition-all">
          {/* Row 1: 検索フォーム + カテゴリーフィルター */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
              <input
                type="text"
                placeholder="アイテム名を検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ffb703]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
                >
                  <i className="fa-solid fa-circle-xmark"></i>
                </button>
              )}
            </div>

            <div className="shrink-0">
              <CategoryFilterDropdown
                availableCategories={availableCategories}
                selectedCategories={selectedCategories}
                onSelectedCategoriesChange={setSelectedCategories}
                accentColor="#ffb703"
              />
            </div>
          </div>

          {/* Row 2: ホームワールド選択 ＆ 日当たり販売数フィルター */}
          <MobileWorldVelocityBar
            world={homeWorld}
            onWorldChange={onWorldChange}
            worldLabel="販売先(ホーム):"
            worldIcon="fa-house"
            minVelocity={minVelocity}
            onMinVelocityChange={setMinVelocity}
            accentColor="#ffb703"
            accentTextClass="text-[#ffb703]"
          />

          {/* Row 3: ソートタブ（日商利益順 / 単体利益順） + 一番右手にクリスタル除外アイコン */}
          <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/10 text-xs gap-1 items-center">
            <button
              onClick={() => setSortMode('dailyProfit')}
              className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all text-[0.72rem] whitespace-nowrap ${
                sortMode === 'dailyProfit'
                  ? 'bg-gradient-to-r from-[#ffb703] to-[#f59e0b] text-black shadow-[0_2px_8px_rgba(255,183,3,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              日商利益順
            </button>
            <button
              onClick={() => setSortMode('unitProfit')}
              className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all text-[0.72rem] whitespace-nowrap ${
                sortMode === 'unitProfit'
                  ? 'bg-gradient-to-r from-[#ffb703] to-[#f59e0b] text-black shadow-[0_2px_8px_rgba(255,183,3,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              単体利益順
            </button>

            <button
              onClick={() => setExcludeCrystals(!excludeCrystals)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center shrink-0 ${
                excludeCrystals
                  ? 'bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/60 shadow-[0_0_8px_rgba(255,183,3,0.35)]'
                  : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'
              }`}
              title={excludeCrystals ? 'クリスタル除外中（タップで解除）' : 'クリスタル含む（タップで除外）'}
            >
              <i className="fa-solid fa-gem text-xs"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#070a12] text-slate-100 overflow-hidden">
      {/* 固定ヘッダーフィルターバー（画面切替タブ ＆ フィルター） */}
      <div className="px-2 pt-2 shrink-0">
        {renderFilterBar()}
      </div>

      {/* スワイプ可能な3画面カルーセル */}
      <SwipeContainer currentPage={currentPage} onPageChange={setCurrentPage} pageCount={3}>
        {/* ============================== */}
        {/* 🪙 PAGE 0: サヤ取り候補カード一覧 */}
        {/* ============================== */}
        <div className="flex flex-col h-full overflow-hidden px-2 pb-2 pt-1.5 gap-2">
          {/* サヤ取り候補リスト */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#ffb703]"></i>
                <span className="text-xs">全ワールドサヤ取りを解析中...</span>
              </div>
            ) : opportunities.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                該当するサヤ取り機会が見つかりませんでした
              </div>
            ) : (
              <div className="flex flex-col gap-2 pb-16">
                {opportunities.slice(0, 100).map((op: ArbitrageOpportunity, index: number) => {
                  const isSelected = selectedOp?.itemId === op.itemId && selectedOp?.isHq === op.isHq;
                  return (
                    <ArbitrageCard
                      key={`${op.itemId}_${op.isHq ? 'hq' : 'nq'}_${op.sourceWorld}`}
                      op={op}
                      index={index}
                      isSelected={isSelected}
                      onSelect={handleSelectOp}
                    />
                  );
                })}
                {opportunities.length > 100 && (
                  <div className="text-center text-xs text-slate-500 py-3">
                    上位 100 件を表示中
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================== */}
        {/* 🛒 PAGE 1: 仕入先ワールド分析 */}
        {/* ============================== */}
        <div className="flex flex-col h-full overflow-hidden px-2 pb-2 pt-1.5 gap-2">
          {!selectedOp ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center gap-3">
              <i className="fa-solid fa-arrow-left text-2xl text-[#4ade80] animate-bounce"></i>
              <p className="text-xs">一覧からサヤ取りアイテムを選択してください</p>
              <button
                onClick={() => setCurrentPage(0)}
                className="px-4 py-1.5 bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/40 rounded-lg text-xs font-bold"
              >
                一覧に戻る
              </button>
            </div>
          ) : (
            <>
              {/* 上部固定エリア（一覧のArbitrageCard ＆ 仕入先グラフ・指標の一括アコーディオン） */}
              <div className="bg-slate-900/90 rounded-xl border border-white/10 flex flex-col overflow-hidden transition-all shadow-sm shrink-0">
                <div
                  onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
                  className="flex items-center justify-between p-2 cursor-pointer bg-slate-900/60 hover:bg-white/5 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5 text-xs min-w-0">
                    {/* 畳まれている時は品目アイコン ＆ 品名をコンパクトに表示 */}
                    {isDetailCollapsed && selectedOp.itemIcon && (
                      <img
                        src={selectedOp.itemIcon}
                        alt={selectedOp.itemName}
                        className="w-5 h-5 rounded object-contain bg-black/50 border border-white/10 shrink-0"
                      />
                    )}
                    <span className="font-bold text-slate-300 flex items-center gap-1 text-[0.72rem] truncate">
                      {isDetailCollapsed ? (
                        <>
                          <span className="text-white font-bold truncate max-w-[130px]">{selectedOp.itemName}</span>
                          {selectedOp.isHq && (
                            <span className="bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 font-extrabold text-[0.55rem] px-1 py-0.2 rounded shrink-0">HQ</span>
                          )}
                          <span className="text-[#4ade80] font-mono text-[0.65rem] shrink-0">【仕入】{selectedOp.sourceWorld}</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-cart-shopping text-[#4ade80]"></i>
                          <span>【仕入先】{selectedOp.sourceWorld} ({selectedOp.sourceDc}) 7日間推移</span>
                        </>
                      )}
                    </span>
                    {selectedOp.sourceTrendPct !== undefined && (
                      <span
                        className={`text-[0.62rem] font-bold font-mono px-1.5 py-0.2 rounded shrink-0 ${
                          selectedOp.sourceTrendPct >= 0
                            ? 'bg-[#4ade80]/20 text-[#4ade80]'
                            : 'bg-[#f87171]/20 text-[#f87171]'
                        }`}
                      >
                        {selectedOp.sourceTrendPct >= 0 ? '+' : ''}{selectedOp.sourceTrendPct}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-[0.68rem] font-semibold shrink-0">
                    <span>{isDetailCollapsed ? '展開' : '閉じる'}</span>
                    <i className={`fa-solid fa-chevron-${isDetailCollapsed ? 'down' : 'up'} text-[0.6rem]`}></i>
                  </div>
                </div>

                {/* 展開時のみ: ArbitrageCard ＆ 仕入先メトリクス・グラフ */}
                {!isDetailCollapsed && (
                  <div className="p-2 pt-0 flex flex-col gap-2">
                    {/* 一覧カードをヘッダーとして配置 */}
                    <ArbitrageCard
                      op={selectedOp}
                      index={0}
                      isSelected={true}
                      onSelect={() => {}}
                    />
                      {/* 仕入先メトリクス */}
                      <div className="grid grid-cols-4 gap-1">
                        <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#4ade80] rounded p-1 text-center">
                          <div className="text-[0.55rem] text-slate-400">現在最安</div>
                          <div className="text-[0.72rem] font-bold font-mono text-[#4ade80] truncate">
                            {sourceItem && sourceItem.min_price > 0 ? `${sourceItem.min_price.toLocaleString()}G` : '-'}
                          </div>
                        </div>
                        <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#c084fc] rounded p-1 text-center">
                          <div className="text-[0.55rem] text-slate-400">目標仕入額</div>
                          <div className="text-[0.72rem] font-bold font-mono text-[#c084fc] truncate">
                            {selectedOp.buyPrice.toLocaleString()}G
                          </div>
                        </div>
                        <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#38bdf8] rounded p-1 text-center">
                          <div className="text-[0.55rem] text-slate-400">販売速度</div>
                          <div className="text-[0.72rem] font-bold font-mono text-[#38bdf8] truncate">
                            {sourceItem?.sale_velocity ? `${sourceItem.sale_velocity.toFixed(1)}/日` : '-'}
                          </div>
                        </div>
                        <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#ffb703] rounded p-1 text-center">
                          <div className="text-[0.55rem] text-slate-400">7日売買</div>
                          <div className="text-[0.72rem] font-bold font-mono text-[#ffb703] truncate">
                            {sourceItem?.sale_trades ? `${sourceItem.sale_trades}件` : '-'}
                          </div>
                        </div>
                      </div>

                      {/* グラフCanvas */}
                      <div className="bg-slate-950/60 rounded-lg p-1.5 flex flex-col gap-1">
                        <div className="w-full">
                          <TrendChartCanvas trend={sourceTrend} trendPct={selectedOp.sourceTrendPct} lineColor="#4ade80" height={105} />
                        </div>

                        {sourceTrend.length > 0 && (
                          <div className="flex justify-between gap-1 w-full pt-1 mt-0.5 border-t border-white/10">
                            {sourceTrend.map((d, i) => (
                              <div key={i} className="flex-1 text-center min-w-0">
                                <div className="font-bold text-slate-400 text-[0.6rem]">{d.date}</div>
                                <div className="text-[#4ade80] font-bold text-[0.62rem] font-mono whitespace-nowrap">
                                  {d.weighted_avg > 0
                                    ? (d.weighted_avg >= 10000
                                        ? `${Math.round(d.weighted_avg / 1000)}k`
                                        : d.weighted_avg.toLocaleString()) + 'G'
                                    : '-'}
                                </div>
                                <div className="text-[#38bdf8] text-[0.55rem] font-mono whitespace-nowrap">
                                  {d.volume > 0 ? `${d.volume}個` : '0個'}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              {/* 下部スクロールエリア（現在出品 or 直近履歴のカードリスト） */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 flex flex-col gap-2 pb-16">
                {/* 出品・履歴切り替えバー */}
                <div className="flex items-center justify-between bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-white/10 shrink-0">
                  <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <i className="fa-solid fa-cart-shopping text-[#4ade80]"></i>
                    <span>
                      {sourceViewMode === 'listings'
                        ? '全ワールド最安出品 (日本DC)'
                        : `${selectedOp.sourceWorld} (${selectedOp.sourceDc})`}
                    </span>
                    <span className="text-[0.65rem] text-slate-400 font-mono">
                      {sourceViewMode === 'listings'
                        ? `(出品 ${sourceListings.length}件)`
                        : `(履歴 ${sourceItem?.history?.length || 0}件)`}
                    </span>
                  </div>

                  <div className="flex bg-black/50 p-0.5 rounded-lg border border-white/10 text-xs">
                    <button
                      onClick={() => setSourceViewMode('history')}
                      className={`px-2.5 py-1 rounded font-bold transition-all text-[0.68rem] whitespace-nowrap ${
                        sourceViewMode === 'history'
                          ? 'bg-gradient-to-r from-[#4ade80] to-[#22c55e] text-black shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      取引履歴
                    </button>
                    <button
                      onClick={() => setSourceViewMode('listings')}
                      className={`px-2.5 py-1 rounded font-bold transition-all text-[0.68rem] whitespace-nowrap ${
                        sourceViewMode === 'listings'
                          ? 'bg-gradient-to-r from-[#4ade80] to-[#22c55e] text-black shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      現在出品
                    </button>
                  </div>
                </div>

                {/* リスト本体（カード形式） */}
                {sourceViewMode === 'listings' ? (
                  loadingSource ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <i className="fa-solid fa-circle-notch fa-spin text-xl text-[#4ade80]"></i>
                      <span className="text-xs">全ワールドのリアルタイム出品を取得中...</span>
                    </div>
                  ) : sourceListings.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 text-xs bg-slate-900/60 rounded-xl border border-white/5">
                      現在該当する出品がありません
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {sourceListings.slice(0, 50).map((l, idx) => {
                        const isHq = Boolean(l.hq);
                        const unitPrice = (l.pricePerUnit || 0).toLocaleString();
                        const qty = l.quantity || 1;
                        const totalPrice = (l.total || (l.pricePerUnit || 0) * qty).toLocaleString();
                        const retainer = l.retainerName || `リテーナー #${idx + 1}`;
                        const wName = l.worldName || selectedOp.sourceWorld;
                        const dcName = WORLD_TO_DC[wName] || '';
                        const fullWorldText = dcName ? `${wName} (${dcName})` : wName;

                        // 割安 / 割高ガイド判定 (仕入想定価格 buyPrice との比較)
                        const diffPct = selectedOp.buyPrice > 0
                          ? Math.round(((l.pricePerUnit - selectedOp.buyPrice) / selectedOp.buyPrice) * 100)
                          : 0;
                        const isGoodBuy = l.pricePerUnit <= selectedOp.buyPrice;
                        const diffPctStr = diffPct > 0
                          ? `+${diffPct}%`
                          : (diffPct === 0 && !isGoodBuy ? '+0%' : `${diffPct}%`);

                        return (
                          <div
                            key={idx}
                            className={`border rounded-xl p-2.5 flex flex-col gap-1.5 text-xs shadow-sm transition-all ${
                              isGoodBuy
                                ? 'bg-slate-950/70 border-white/10 hover:border-[#4ade80]/30'
                                : 'bg-slate-950/50 border-[#f87171]/20 hover:border-[#f87171]/40'
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-white/10 border-dashed pb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-[#ffb703] font-mono text-[0.8rem]">
                                  #{idx + 1}
                                </span>
                                {isHq ? (
                                  <span className="bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 font-extrabold text-[0.62rem] px-1.5 py-0.2 rounded">
                                    HQ
                                  </span>
                                ) : (
                                  <span className="bg-white/5 text-slate-400 border border-white/10 text-[0.62rem] px-1.5 py-0.2 rounded">
                                    NQ
                                  </span>
                                )}
                                <span className="text-slate-400 text-[0.68rem] flex items-center gap-1 font-mono">
                                  <i className="fa-solid fa-globe text-[#4ade80] text-[0.62rem]"></i>
                                  {fullWorldText}
                                </span>
                              </div>
                              <div className="text-[#60a5fa] font-bold text-[0.7rem] truncate max-w-[120px]" title={retainer}>
                                {retainer}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-0.5">
                              <div className="flex items-center gap-2 text-slate-400 text-[0.72rem] min-w-0">
                                {isGoodBuy ? (
                                  <span className="bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/40 px-1.5 py-0.2 rounded text-[0.6rem] font-bold font-mono flex items-center gap-1 shadow-sm shrink-0">
                                    <i className="fa-solid fa-circle text-[0.32rem]"></i> 割安 ({diffPctStr})
                                  </span>
                                ) : (
                                  <span className="bg-[#f87171]/15 text-[#f87171] border border-[#f87171]/40 px-1.5 py-0.2 rounded text-[0.6rem] font-bold font-mono flex items-center gap-1 shadow-sm shrink-0">
                                    <i className="fa-solid fa-circle-xmark text-[0.5rem]"></i> 割高 ({diffPctStr})
                                  </span>
                                )}
                                <span className="shrink-0">
                                  <i className="fa-solid fa-tag text-[#4ade80] text-[0.65rem] mr-0.5"></i>
                                  単価:{' '}
                                  <strong className={`font-mono ${isGoodBuy ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                                    {unitPrice}G
                                  </strong>
                                </span>
                                <span className="shrink-0">
                                  <i className="fa-solid fa-boxes-stacked text-slate-500 text-[0.65rem] mr-0.5"></i>
                                  出品数: <strong className="text-white font-mono">{qty}個</strong>
                                </span>
                              </div>
                              <div className="text-[#ffb703] font-bold font-mono text-[0.8rem] flex items-center gap-1 shrink-0">
                                <i className="fa-solid fa-coins text-[0.7rem]"></i>
                                <span>合計: {totalPrice}G</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  // 取引履歴カードリスト
                  (!sourceItem?.history || sourceItem.history.length === 0) ? (
                    <div className="text-center py-16 text-slate-400 text-xs bg-slate-900/60 rounded-xl border border-white/5">
                      取引履歴がありません
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {sourceItem.history.slice(0, 30).map((h, idx) => {
                        const exactTimeStr = formatJstDateTime(h.ts);
                        const isHq = Boolean(h.hq);
                        const buyerName = h.buyer || '購入者非公開';
                        const unitPrice = (h.price || 0).toLocaleString();
                        const qty = h.qty || 1;
                        const totalPrice = ((h.price || 0) * qty).toLocaleString();

                        return (
                          <div
                            key={idx}
                            className="bg-slate-950/70 border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5 text-xs shadow-sm hover:border-white/20 transition-all"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 border-dashed pb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 text-[0.72rem] flex items-center gap-1">
                                  <i className="fa-regular fa-clock text-[#38bdf8] text-[0.65rem]"></i>
                                  {exactTimeStr}
                                </span>
                                {isHq ? (
                                  <span className="bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 font-extrabold text-[0.62rem] px-1.5 py-0.2 rounded">
                                    HQ
                                  </span>
                                ) : (
                                  <span className="bg-white/5 text-slate-400 border border-white/10 text-[0.62rem] px-1.5 py-0.2 rounded">
                                    NQ
                                  </span>
                                )}
                              </div>
                              <div className="text-[#60a5fa] font-bold text-[0.72rem] flex items-center gap-1 truncate max-w-[130px]">
                                <i className="fa-solid fa-user text-[0.65rem] text-[#60a5fa]/70"></i>
                                <span className="truncate">{buyerName}</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-0.5">
                              <div className="flex items-center gap-2 text-slate-400 text-[0.72rem]">
                                <span>
                                  <i className="fa-solid fa-tag text-[#4ade80] text-[0.65rem] mr-0.5"></i>
                                  単価: <strong className="text-[#4ade80] font-mono">{unitPrice}G</strong>
                                </span>
                                <span>
                                  <i className="fa-solid fa-boxes-stacked text-slate-500 text-[0.65rem] mr-0.5"></i>
                                  数量: <strong className="text-white font-mono">{qty}個</strong>
                                </span>
                              </div>
                              <div className="text-[#ffb703] font-bold font-mono text-[0.8rem] flex items-center gap-1">
                                <i className="fa-solid fa-coins text-[0.7rem]"></i>
                                <span>合計: {totalPrice}G</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* 販売先分析（3画面目）へのナビゲーションボタン */}
                <button
                  onClick={() => setCurrentPage(2)}
                  className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-[#0f172a] to-[#1e293b] hover:from-[#1e293b] hover:to-[#334155] border border-white/10 rounded-xl text-xs font-bold text-slate-200 transition-all shadow-md active:scale-[0.99] mt-1"
                >
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-store text-[#38bdf8] text-sm"></i>
                    <span>自鯖 ({homeWorld}) での販売分析を見る</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <span>次へ</span>
                    <i className="fa-solid fa-chevron-right text-[0.65rem]"></i>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        {/* ============================== */}
        {/* 💰 PAGE 2: 自鯖販売分析＆取引履歴 */}
        {/* ============================== */}
        <div className="flex flex-col h-full overflow-hidden px-2 pb-2 pt-1.5 gap-2">
          {!selectedOp ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center gap-3">
              <i className="fa-solid fa-arrow-left text-2xl text-[#38bdf8] animate-bounce"></i>
              <p className="text-xs">一覧からサヤ取りアイテムを選択してください</p>
              <button
                onClick={() => setCurrentPage(0)}
                className="px-4 py-1.5 bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40 rounded-lg text-xs font-bold"
              >
                一覧に戻る
              </button>
            </div>
          ) : (
            <>
              {/* 上部固定エリア（一覧のArbitrageCard ＆ 自鯖グラフ・指標の一括アコーディオン） */}
              <div className="bg-slate-900/90 rounded-xl border border-white/10 flex flex-col overflow-hidden transition-all shadow-sm shrink-0">
                <div
                  onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
                  className="flex items-center justify-between p-2 cursor-pointer bg-slate-900/60 hover:bg-white/5 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5 text-xs min-w-0">
                    {/* 畳まれている時は品目アイコン ＆ 品名をコンパクトに表示 */}
                    {isDetailCollapsed && selectedOp.itemIcon && (
                      <img
                        src={selectedOp.itemIcon}
                        alt={selectedOp.itemName}
                        className="w-5 h-5 rounded object-contain bg-black/50 border border-white/10 shrink-0"
                      />
                    )}
                    <span className="font-bold text-slate-300 flex items-center gap-1 text-[0.72rem] truncate">
                      {isDetailCollapsed ? (
                        <>
                          <span className="text-white font-bold truncate max-w-[130px]">{selectedOp.itemName}</span>
                          {selectedOp.isHq && (
                            <span className="bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 font-extrabold text-[0.55rem] px-1 py-0.2 rounded shrink-0">HQ</span>
                          )}
                          <span className="text-[#38bdf8] font-mono text-[0.65rem] shrink-0">【販売】{selectedOp.homeWorld}</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-store text-[#38bdf8]"></i>
                          <span>【販売先】{selectedOp.homeWorld} ({selectedOp.homeDc}) 7日間推移</span>
                        </>
                      )}
                    </span>
                    {selectedOp.homeTrendPct !== undefined && (
                      <span
                        className={`text-[0.62rem] font-bold font-mono px-1.5 py-0.2 rounded shrink-0 ${
                          selectedOp.homeTrendPct >= 0
                            ? 'bg-[#4ade80]/20 text-[#4ade80]'
                            : 'bg-[#f87171]/20 text-[#f87171]'
                        }`}
                      >
                        {selectedOp.homeTrendPct >= 0 ? '+' : ''}{selectedOp.homeTrendPct}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-[0.68rem] font-semibold shrink-0">
                    <span>{isDetailCollapsed ? '展開' : '閉じる'}</span>
                    <i className={`fa-solid fa-chevron-${isDetailCollapsed ? 'down' : 'up'} text-[0.6rem]`}></i>
                  </div>
                </div>

                {/* 展開時のみ: ArbitrageCard ＆ 自鯖メトリクス・グラフ */}
                {!isDetailCollapsed && (
                  <div className="p-2 pt-0 flex flex-col gap-2">
                    {/* 一覧カードをヘッダーとして配置 */}
                    <ArbitrageCard
                      op={selectedOp}
                      index={0}
                      isSelected={true}
                      onSelect={() => {}}
                    />

                    {/* 自鯖メトリクス */}
                    <div className="grid grid-cols-4 gap-1">
                      <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#38bdf8] rounded p-1 text-center">
                        <div className="text-[0.55rem] text-slate-400">現在最安</div>
                        <div className="text-[0.72rem] font-bold font-mono text-[#38bdf8] truncate">
                          {homeItem && homeItem.min_price > 0 ? `${homeItem.min_price.toLocaleString()}G` : '-'}
                        </div>
                      </div>
                      <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#ffb703] rounded p-1 text-center">
                        <div className="text-[0.55rem] text-slate-400">目標販売額</div>
                        <div className="text-[0.72rem] font-bold font-mono text-[#ffb703] truncate">
                          {selectedOp.sellPrice.toLocaleString()}G
                        </div>
                      </div>
                      <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#4ade80] rounded p-1 text-center">
                        <div className="text-[0.55rem] text-slate-400">日販速度</div>
                        <div className="text-[0.72rem] font-bold font-mono text-[#4ade80] truncate">
                          {homeItem?.sale_velocity ? `${homeItem.sale_velocity.toFixed(1)}/日` : '-'}
                        </div>
                      </div>
                      <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#ffb703] rounded p-1 text-center">
                        <div className="text-[0.55rem] text-slate-400">7日売買</div>
                        <div className="text-[0.72rem] font-bold font-mono text-[#ffb703] truncate">
                          {homeItem?.sale_trades ? `${homeItem.sale_trades}件` : '-'}
                        </div>
                      </div>
                    </div>

                    {/* グラフCanvas */}
                    <div className="bg-slate-950/60 rounded-lg p-1.5 flex flex-col gap-1">
                      <div className="w-full">
                        <TrendChartCanvas trend={homeTrend} trendPct={selectedOp.homeTrendPct} lineColor="#38bdf8" height={105} />
                      </div>

                      {homeTrend.length > 0 && (
                        <div className="flex justify-between gap-1 w-full pt-1 mt-0.5 border-t border-white/10">
                          {homeTrend.map((d, i) => (
                            <div key={i} className="flex-1 text-center min-w-0">
                              <div className="font-bold text-slate-400 text-[0.6rem]">{d.date}</div>
                              <div className="text-[#38bdf8] font-bold text-[0.62rem] font-mono whitespace-nowrap">
                                {d.weighted_avg > 0
                                  ? (d.weighted_avg >= 10000
                                      ? `${Math.round(d.weighted_avg / 1000)}k`
                                      : d.weighted_avg.toLocaleString()) + 'G'
                                  : '-'}
                              </div>
                              <div className="text-[#4ade80] text-[0.55rem] font-mono whitespace-nowrap">
                                {d.volume > 0 ? `${d.volume}個` : '0個'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 下部スクロールエリア（現在出品 or 直近履歴のカードリスト） */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 flex flex-col gap-2 pb-16">
                {/* 出品・履歴切り替えバー */}
                <div className="flex items-center justify-between bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-white/10 shrink-0">
                  <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <i className="fa-solid fa-store text-[#38bdf8]"></i>
                    <span>{selectedOp.homeWorld} ({selectedOp.homeDc})</span>
                    <span className="text-[0.65rem] text-slate-400 font-mono">
                      {homeViewMode === 'listings'
                        ? `(出品 ${homeListings.length}件)`
                        : `(履歴 ${homeItem?.history?.length || 0}件)`}
                    </span>
                  </div>

                  <div className="flex bg-black/50 p-0.5 rounded-lg border border-white/10 text-xs">
                    <button
                      onClick={() => setHomeViewMode('history')}
                      className={`px-2.5 py-1 rounded font-bold transition-all text-[0.68rem] whitespace-nowrap ${
                        homeViewMode === 'history'
                          ? 'bg-gradient-to-r from-[#00d2ff] to-[#3b82f6] text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      取引履歴
                    </button>
                    <button
                      onClick={() => setHomeViewMode('listings')}
                      className={`px-2.5 py-1 rounded font-bold transition-all text-[0.68rem] whitespace-nowrap ${
                        homeViewMode === 'listings'
                          ? 'bg-gradient-to-r from-[#00d2ff] to-[#3b82f6] text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      現在出品
                    </button>
                  </div>
                </div>

                {/* リスト本体（カード形式） */}
                {homeViewMode === 'listings' ? (
                  loadingHome ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <i className="fa-solid fa-circle-notch fa-spin text-xl text-[#38bdf8]"></i>
                      <span className="text-xs">自鯖出品情報を取得中...</span>
                    </div>
                  ) : homeListings.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 text-xs bg-slate-900/60 rounded-xl border border-white/5">
                      現在自鯖に該当出品がありません
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {homeListings.slice(0, 30).map((l, idx) => {
                        const isHq = Boolean(l.hq);
                        const unitPrice = (l.pricePerUnit || 0).toLocaleString();
                        const qty = l.quantity || 1;
                        const totalPrice = (l.total || (l.pricePerUnit || 0) * qty).toLocaleString();
                        const retainer = l.retainerName || `リテーナー #${idx + 1}`;
                        const fullWorldText = `${selectedOp.homeWorld} (${selectedOp.homeDc})`;

                        // 競合価格ガイド判定 (自鯖販売想定価格との乖離)
                        const diffPct = selectedOp.sellPrice > 0
                          ? Math.round(((l.pricePerUnit - selectedOp.sellPrice) / selectedOp.sellPrice) * 100)
                          : 0;
                        const diffPctStr = diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`;

                        let priceColorClass = 'text-[#38bdf8]';
                        let badge = null;

                        if (diffPct < -5) {
                          // 安値競合
                          priceColorClass = 'text-[#f472b6]';
                          badge = (
                            <span className="bg-[#f472b6]/15 text-[#f472b6] border border-[#f472b6]/40 px-1.5 py-0.5 rounded text-[0.62rem] font-bold font-mono flex items-center gap-1 shadow-sm">
                              <i className="fa-solid fa-arrow-trend-down text-[0.55rem]"></i> 安値 ({diffPctStr})
                            </span>
                          );
                        } else if (diffPct > 5) {
                          // 高値
                          priceColorClass = 'text-[#ffb703]';
                          badge = (
                            <span className="bg-[#ffb703]/15 text-[#ffb703] border border-[#ffb703]/40 px-1.5 py-0.5 rounded text-[0.62rem] font-bold font-mono flex items-center gap-1 shadow-sm">
                              <i className="fa-solid fa-arrow-trend-up text-[0.55rem]"></i> 高値 ({diffPctStr})
                            </span>
                          );
                        } else {
                          // 適正価格
                          priceColorClass = 'text-[#38bdf8]';
                          badge = (
                            <span className="bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/40 px-1.5 py-0.5 rounded text-[0.62rem] font-bold font-mono shadow-sm">
                              適正 ({diffPctStr})
                            </span>
                          );
                        }

                        return (
                          <div
                            key={idx}
                            className={`border rounded-xl p-2.5 flex flex-col gap-1.5 text-xs shadow-sm transition-all ${
                              diffPct < -5
                                ? 'bg-slate-950/70 border-[#f472b6]/25 hover:border-[#f472b6]/40'
                                : 'bg-slate-950/70 border-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-white/10 border-dashed pb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-[#ffb703] font-mono text-[0.8rem]">
                                  #{idx + 1}
                                </span>
                                {isHq ? (
                                  <span className="bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 font-extrabold text-[0.62rem] px-1.5 py-0.2 rounded">
                                    HQ
                                  </span>
                                ) : (
                                  <span className="bg-white/5 text-slate-400 border border-white/10 text-[0.62rem] px-1.5 py-0.2 rounded">
                                    NQ
                                  </span>
                                )}
                                <span className="text-slate-400 text-[0.68rem] flex items-center gap-1 font-mono">
                                  <i className="fa-solid fa-globe text-[#38bdf8] text-[0.62rem]"></i>
                                  {fullWorldText}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {badge}
                                <span className="text-[#60a5fa] font-bold text-[0.7rem] truncate max-w-[80px]" title={retainer}>
                                  {retainer}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-0.5">
                              <div className="flex items-center gap-2 text-slate-400 text-[0.72rem]">
                                <span>
                                  <i className="fa-solid fa-tag text-[#38bdf8] text-[0.65rem] mr-0.5"></i>
                                  単価:{' '}
                                  <strong className={`font-mono ${priceColorClass}`}>
                                    {unitPrice}G
                                  </strong>
                                </span>
                                <span>
                                  <i className="fa-solid fa-boxes-stacked text-slate-500 text-[0.65rem] mr-0.5"></i>
                                  出品数: <strong className="text-white font-mono">{qty}個</strong>
                                </span>
                              </div>
                              <div className="text-[#ffb703] font-bold font-mono text-[0.8rem] flex items-center gap-1">
                                <i className="fa-solid fa-coins text-[0.7rem]"></i>
                                <span>合計: {totalPrice}G</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  // 取引履歴カードリスト
                  (!homeItem?.history || homeItem.history.length === 0) ? (
                    <div className="text-center py-16 text-slate-400 text-xs bg-slate-900/60 rounded-xl border border-white/5">
                      取引履歴がありません
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {homeItem.history.slice(0, 30).map((h, idx) => {
                        const exactTimeStr = formatJstDateTime(h.ts);
                        const isHq = Boolean(h.hq);
                        const buyerName = h.buyer || '購入者非公開';
                        const unitPrice = (h.price || 0).toLocaleString();
                        const qty = h.qty || 1;
                        const totalPrice = ((h.price || 0) * qty).toLocaleString();

                        return (
                          <div
                            key={idx}
                            className="bg-slate-950/70 border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5 text-xs shadow-sm hover:border-white/20 transition-all"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 border-dashed pb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 text-[0.72rem] flex items-center gap-1">
                                  <i className="fa-regular fa-clock text-[#38bdf8] text-[0.65rem]"></i>
                                  {exactTimeStr}
                                </span>
                                {isHq ? (
                                  <span className="bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 font-extrabold text-[0.62rem] px-1.5 py-0.2 rounded">
                                    HQ
                                  </span>
                                ) : (
                                  <span className="bg-white/5 text-slate-400 border border-white/10 text-[0.62rem] px-1.5 py-0.2 rounded">
                                    NQ
                                  </span>
                                )}
                              </div>
                              <div className="text-[#60a5fa] font-bold text-[0.72rem] flex items-center gap-1 truncate max-w-[130px]">
                                <i className="fa-solid fa-user text-[0.65rem] text-[#60a5fa]/70"></i>
                                <span className="truncate">{buyerName}</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-0.5">
                              <div className="flex items-center gap-2 text-slate-400 text-[0.72rem]">
                                <span>
                                  <i className="fa-solid fa-tag text-[#4ade80] text-[0.65rem] mr-0.5"></i>
                                  単価: <strong className="text-[#4ade80] font-mono">{unitPrice}G</strong>
                                </span>
                                <span>
                                  <i className="fa-solid fa-boxes-stacked text-slate-500 text-[0.65rem] mr-0.5"></i>
                                  数量: <strong className="text-white font-mono">{qty}個</strong>
                                </span>
                              </div>
                              <div className="text-[#ffb703] font-bold font-mono text-[0.8rem] flex items-center gap-1">
                                <i className="fa-solid fa-coins text-[0.7rem]"></i>
                                <span>合計: {totalPrice}G</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* 仕入先分析（2画面目）へ戻るナビゲーションボタン */}
                <button
                  onClick={() => setCurrentPage(1)}
                  className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-[#0f172a] to-[#1e293b] hover:from-[#1e293b] hover:to-[#334155] border border-white/10 rounded-xl text-xs font-bold text-slate-200 transition-all shadow-md active:scale-[0.99] mt-1"
                >
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-cart-shopping text-[#4ade80] text-sm"></i>
                    <span>仕入先 ({selectedOp.sourceWorld}) の分析に戻る</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <i className="fa-solid fa-chevron-left text-[0.65rem]"></i>
                    <span>前へ</span>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </SwipeContainer>
    </div>
  );
});
