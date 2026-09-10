import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { WORLD_TO_DC } from '../constants/japanDcs';
import { fetchAndPrepareMarketData, type MarketItem, type MarketDataset, type MasterCatalogItem } from '../services/marketDataService';
import { fetchCheapestTriad, type UniversalisListingItem, type TriadSummary } from '../services/universalisClient';
import { CategoryFilterDropdown } from '../shared/CategoryFilterDropdown';
import { TrendChartCanvas } from '../shared/TrendChartCanvas';
import { SwipeContainer } from './SwipeContainer';
import { MobileWorldVelocityBar } from './MobileWorldVelocityBar';
import { formatJstDateTime } from '../shared/marketConstants';
import { MarketCard } from '../boxes/market/MarketCard';
import { getOrComputeDailyTrend } from '../boxes/market/marketUtils';

interface MobileMarketViewProps {
  selectedWorld: string;
  onWorldChange?: (world: string) => void;
  isActive?: boolean;
  targetItem?: { itemId: number; isHq?: boolean } | null;
  onTargetItemHandled?: () => void;
  returnSource?: {
    label: string;
    tab: string;
    neededCount?: number;
    targetPrice?: number;
    isMaterial?: boolean;
  } | null;
  onReturnBack?: () => void;
  onClearReturnSource?: () => void;
}

export const MobileMarketView: React.FC<MobileMarketViewProps> = React.memo(({
  selectedWorld,
  onWorldChange,
  isActive = true,
  targetItem,
  onTargetItemHandled,
  returnSource,
  onReturnBack,
  onClearReturnSource,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(0); // 0: 一覧, 1: 履歴 (分析), 2: 出品
  const [allData, setAllData] = useState<Record<string, MarketItem[]>>({});
  const [itemsCatalog, setItemsCatalog] = useState<Record<string, MasterCatalogItem>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'velocity' | 'revenue' | 'max_price'>('velocity');
  const [minVelocity, setMinVelocity] = useState<number>(0); // 日当たり販売数の足切り (0: 指定なし)
  const [excludeCrystals, setExcludeCrystals] = useState<boolean>(true);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  // 選択アイテム
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);

  // ワールド切り替え時に同一アイテムを新ワールドのデータに同期
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

  // クラフトタブ等からの外部遷移リクエスト処理 (targetItem)
  useEffect(() => {
    if (!targetItem) return;
    const { itemId, isHq } = targetItem;
    const worldItems = allData[selectedWorld] || [];

    // 1. まず該当ワールドのマーケットデータから探す（HQ指定があれば一致優先）
    let matched = worldItems.find(
      (it) => it.item_id === itemId && (isHq !== undefined ? Boolean(it.hq) === Boolean(isHq) : true)
    );
    if (!matched && isHq !== undefined) {
      matched = worldItems.find((it) => it.item_id === itemId);
    }

    if (matched) {
      setSelectedItem(matched);
      setIsDetailCollapsed(false); // カードを展開して見やすくする
      setCurrentPage(2); // 出品 (PAGE 2) へジャンプ
      onTargetItemHandled?.();
    } else if (itemsCatalog && itemsCatalog[String(itemId)]) {
      // 2. マーケットデータに直近取引がなくてもマスターカタログにあればプレースホルダーを生成
      const meta = itemsCatalog[String(itemId)];
      setSelectedItem({
        item_id: itemId,
        item_name: meta.name,
        category_name: meta.category,
        icon_url: meta.icon,
        hq: Boolean(isHq),
        min_price: 0,
        avg_price: 0,
        max_price: 0,
        sale_velocity: 0,
        sale_trades: 0,
        daily_revenue: 0,
        daily_trend: [],
        trend_pct: 0,
        history: [],
        shop_price: meta.shop_price,
      });
      setIsDetailCollapsed(false);
      setCurrentPage(2); // 出品 (PAGE 2) へジャンプ
      onTargetItemHandled?.();
    } else if (!loading) {
      // 3. データロード後もカタログに見つからない場合
      setSelectedItem({
        item_id: itemId,
        item_name: `Item #${itemId}`,
        category_name: 'その他',
        icon_url: '',
        hq: Boolean(isHq),
        min_price: 0,
        avg_price: 0,
        max_price: 0,
        sale_velocity: 0,
        sale_trades: 0,
        daily_revenue: 0,
        daily_trend: [],
        trend_pct: 0,
        history: [],
      });
      setIsDetailCollapsed(false);
      setCurrentPage(2); // 出品 (PAGE 2) へジャンプ
      onTargetItemHandled?.();
    }
  }, [targetItem, allData, itemsCatalog, selectedWorld, loading, onTargetItemHandled]);

  // 出品スコープ
  const [listingsScope, setListingsScope] = useState<'world' | 'dc' | 'all'>('world');
  const [cachedScopes, setCachedScopes] = useState<{
    world: UniversalisListingItem[];
    dc: UniversalisListingItem[];
    all: UniversalisListingItem[];
    summary: TriadSummary;
  }>({
    world: [],
    dc: [],
    all: [],
    summary: { selWorldMin: 0, dcMin: { price: 0, world: '-' }, allMin: { price: 0, world: '-' } },
  });
  const [loadingListings, setLoadingListings] = useState<boolean>(false);

  const activeDc = useMemo(() => WORLD_TO_DC[selectedWorld] || 'Mana', [selectedWorld]);

  // データ初期ロード
  useEffect(() => {
    let isMounted = true;
    fetchAndPrepareMarketData()
      .then((dataset: MarketDataset) => {
        if (!isMounted) return;
        setAllData(dataset.data);
        if (dataset.items) {
          setItemsCatalog(dataset.items);
        }
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
      })
      .catch((err: unknown) => {
        console.error('Failed to load market data:', err);
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // フィルタ・ソート済みアイテム
  const filteredItems = useMemo(() => {
    const rawList = allData[selectedWorld] || [];

    // 検索クエリ処理: 検索時は全品目（35,000+マスター）を対象にし、履歴なし品目もプレースホルダーとして表示
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const isFilterCat = selectedCategories.length > 0 && selectedCategories.length < availableCategories.length;
      const catSet = new Set(selectedCategories);

      // 1. 直近7日間に取引履歴のある品目を収集
      const existingKeySet = new Set<string>();
      let matchedActive: MarketItem[] = [];

      for (let i = 0; i < rawList.length; i++) {
        const item = rawList[i];
        if (excludeCrystals && item.item_id >= 2 && item.item_id <= 19) continue;
        if (isFilterCat && !catSet.has(item.category_name || '')) continue;

        const name = (item.item_name || '').toLowerCase();
        const idStr = String(item.item_id);
        if (name.includes(q) || idStr.includes(q)) {
          matchedActive.push(item);
          existingKeySet.add(`${item.item_id}_${item.hq ? 'hq' : 'nq'}`);
        }
      }

      // 2. 直近7日間に取引履歴のないマスターカタログ品目も検索
      const matchedCatalog: MarketItem[] = [];
      if (itemsCatalog && Object.keys(itemsCatalog).length > 0) {
        for (const [idStr, meta] of Object.entries(itemsCatalog)) {
          const iid = Number(idStr);
          if (excludeCrystals && iid >= 2 && iid <= 19) continue;
          if (isFilterCat && !catSet.has(meta.category || '')) continue;

          const name = (meta.name || '').toLowerCase();
          if (name.includes(q) || idStr.includes(q)) {
            // NQプレースホルダーを追加
            if (!existingKeySet.has(`${iid}_nq`)) {
              matchedCatalog.push({
                item_id: iid,
                item_name: meta.name,
                category_name: meta.category,
                icon_url: meta.icon,
                hq: false,
                min_price: 0,
                avg_price: 0,
                max_price: 0,
                sale_velocity: 0,
                sale_trades: 0,
                daily_revenue: 0,
                daily_trend: [],
                trend_pct: 0,
                history: [],
                shop_price: meta.shop_price,
              });
            }
          }
        }
      }

      // ソート: 取引実績のあるアイテムを sortMode に従って並び替え、次にカタログ品目を五十音順
      if (minVelocity > 0) {
        matchedActive = matchedActive.filter((it) => (it.sale_velocity || 0) >= minVelocity);
      }
      if (sortMode === 'revenue') {
        matchedActive.sort(
          (a, b) =>
            (b.daily_revenue || (b.avg_price || 0) * (b.sale_velocity || 0)) -
            (a.daily_revenue || (a.avg_price || 0) * (a.sale_velocity || 0))
        );
      } else if (sortMode === 'max_price') {
        matchedActive.sort((a, b) => (b.max_price || 0) - (a.max_price || 0));
      } else {
        // デフォルト: 売買速度 (velocity)
        matchedActive.sort((a, b) => (b.sale_velocity || 0) - (a.sale_velocity || 0));
      }
      matchedCatalog.sort((a, b) => (a.item_name || '').localeCompare(b.item_name || ''));

      return [...matchedActive, ...(minVelocity > 0 ? [] : matchedCatalog)];
    }

    if (rawList.length === 0) return [];
    let filtered = rawList;

    // カテゴリ絞り込み
    if (selectedCategories.length === 0) {
      return [];
    }
    if (selectedCategories.length < availableCategories.length) {
      const catSet = new Set(selectedCategories);
      filtered = filtered.filter((itm) => catSet.has(itm.category_name || ''));
    }

    // クリスタル除外 (IDs 2〜19)
    if (excludeCrystals) {
      filtered = filtered.filter((item) => !(item.item_id >= 2 && item.item_id <= 19));
    }

    // 取引実績あり（> 0）
    filtered = filtered.filter((item) => (item.sale_trades || 0) > 0);

    // 日当たり販売数足切りフィルター
    if (minVelocity > 0) {
      filtered = filtered.filter((item) => (item.sale_velocity || 0) >= minVelocity);
    }

    // ソート
    const sorted = [...filtered];
    if (sortMode === 'revenue') {
      sorted.sort(
        (a, b) =>
          (b.daily_revenue || (b.avg_price || 0) * (b.sale_velocity || 0)) -
          (a.daily_revenue || (a.avg_price || 0) * (a.sale_velocity || 0))
      );
    } else if (sortMode === 'max_price') {
      sorted.sort((a, b) => (b.max_price || 0) - (a.max_price || 0));
    } else {
      // デフォルト: 販売数 (velocity)
      sorted.sort((a, b) => (b.sale_velocity || 0) - (a.sale_velocity || 0));
    }

    return sorted;
  }, [allData, itemsCatalog, selectedWorld, excludeCrystals, searchQuery, sortMode, minVelocity, selectedCategories, availableCategories]);

  // アイテム選択時（自動で分析ページにスライド ＆ 復帰ナビをリセット）
  const handleSelectItem = useCallback((item: MarketItem) => {
    setSelectedItem(item);
    setCurrentPage(1); // 画面2 (分析) へ自動遷移
    onClearReturnSource?.();
  }, [onClearReturnSource]);

  // ページ変更時（一覧に戻ったら復帰ナビをリセット）
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    if (page === 0) {
      onClearReturnSource?.();
    }
  }, [onClearReturnSource]);

  // 出品データの取得（fetchCheapestTriad を利用）
  useEffect(() => {
    if (!isActive || !selectedItem) return;
    let isMounted = true;
    setLoadingListings(true);

    fetchCheapestTriad({
      world: selectedWorld,
      dc: activeDc,
      itemId: selectedItem.item_id,
      isHq: selectedItem.hq ? true : undefined,
    })
      .then((res) => {
        if (!isMounted) return;
        setCachedScopes({
          world: res.world,
          dc: res.dc,
          all: res.all,
          summary: res.summary,
        });
        setLoadingListings(false);
      })
      .catch((err: unknown) => {
        console.error('Failed to fetch listings:', err);
        if (isMounted) setLoadingListings(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedItem, selectedWorld, activeDc, isActive]);

  // 表示中スコープの出品一覧
  const currentListings = useMemo(() => {
    if (listingsScope === 'dc') return cachedScopes.dc;
    if (listingsScope === 'all') return cachedScopes.all;
    return cachedScopes.world;
  }, [listingsScope, cachedScopes]);

  // 7日間のトレンドデータ
  const dailyTrendData = useMemo(() => {
    if (!selectedItem) return { trend: [], trendPct: 0 };
    return getOrComputeDailyTrend(selectedItem);
  }, [selectedItem]);

  // 共通フィルターバー（左側: 画面切替タブセット / 右側: 現在の条件チップ ＆ フィルター開閉アイコン）
  const renderFilterBar = () => (
    <div className="shrink-0 flex flex-col gap-1.5">
      {/* バー本体（常時表示: タブセット + フィルターアイコン） */}
      <div
        className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-xl border text-xs text-slate-300 transition-all shadow-sm ${
          isMenuOpen
            ? 'bg-slate-900 border-[#00d2ff]/40 shadow-[0_0_12px_rgba(0,210,255,0.15)]'
            : 'bg-slate-900/90 border-white/10'
        }`}
      >
        {/* 左側: 画面切り替えタブセット [一覧] [履歴] [出品] */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handlePageChange(0)}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[0.68rem] flex items-center gap-1 whitespace-nowrap ${
              currentPage === 0
                ? 'bg-[#00d2ff]/20 text-[#00d2ff] border border-[#00d2ff]/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5 border border-transparent'
            }`}
          >
            <i className="fa-solid fa-list text-[0.62rem]"></i>一覧
          </button>
          <button
            onClick={() => handlePageChange(1)}
            disabled={!selectedItem}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[0.68rem] flex items-center gap-1 whitespace-nowrap ${
              currentPage === 1
                ? 'bg-[#c084fc]/20 text-[#c084fc] border border-[#c084fc]/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5 border border-transparent disabled:opacity-30 disabled:hover:text-slate-400'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left text-[0.62rem]"></i>履歴
          </button>
          <button
            onClick={() => handlePageChange(2)}
            disabled={!selectedItem}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[0.68rem] flex items-center gap-1 whitespace-nowrap ${
              currentPage === 2
                ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5 border border-transparent disabled:opacity-30 disabled:hover:text-slate-400'
            }`}
          >
            <i className="fa-solid fa-store text-[0.62rem]"></i>出品
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
              <i className="fa-solid fa-globe text-[#00d2ff] text-[0.58rem]"></i>
              <span className="truncate max-w-[55px]">{selectedWorld}</span>
            </span>
            {minVelocity > 0 && (
              <span className="text-[#00d2ff] font-mono bg-[#00d2ff]/10 px-1 py-0.5 rounded border border-[#00d2ff]/30 font-bold shrink-0">
                {minVelocity}+
              </span>
            )}
            {excludeCrystals && (
              <span className="text-[#00d2ff] bg-[#00d2ff]/10 px-1 py-0.5 rounded border border-[#00d2ff]/30 font-semibold shrink-0" title="クリスタル除外中">
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
            <i className="fa-solid fa-filter text-[#00d2ff] text-xs"></i>
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
                className="w-full bg-slate-950 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00d2ff]"
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
                accentColor="#00d2ff"
              />
            </div>
          </div>

          {/* Row 2: ワールド選択 ＆ 日当たり販売数フィルター */}
          <MobileWorldVelocityBar
            world={selectedWorld}
            onWorldChange={onWorldChange}
            worldLabel="ワールド:"
            worldIcon="fa-globe"
            minVelocity={minVelocity}
            onMinVelocityChange={setMinVelocity}
            accentColor="#00d2ff"
            accentTextClass="text-[#00d2ff]"
          />

          {/* Row 3: ソートタブ（販売数 / 流通ギル / 高額取引） + 一番右手にクリスタル除外アイコン */}
          <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/10 text-xs gap-1 items-center">
            <button
              onClick={() => setSortMode('velocity')}
              className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all text-[0.72rem] whitespace-nowrap ${
                sortMode === 'velocity'
                  ? 'bg-gradient-to-r from-[#00d2ff] to-[#0284c7] text-slate-950 shadow-[0_2px_8px_rgba(0,210,255,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              販売数
            </button>
            <button
              onClick={() => setSortMode('revenue')}
              className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all text-[0.72rem] whitespace-nowrap ${
                sortMode === 'revenue'
                  ? 'bg-gradient-to-r from-[#00d2ff] to-[#0284c7] text-slate-950 shadow-[0_2px_8px_rgba(0,210,255,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              流通ギル
            </button>
            <button
              onClick={() => setSortMode('max_price')}
              className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all text-[0.72rem] whitespace-nowrap ${
                sortMode === 'max_price'
                  ? 'bg-gradient-to-r from-[#00d2ff] to-[#0284c7] text-slate-950 shadow-[0_2px_8px_rgba(0,210,255,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              高額取引
            </button>

            {/* クリスタル除外ボタン（ラベルなし、アイコンのみ） */}
            <button
              onClick={() => setExcludeCrystals(!excludeCrystals)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center shrink-0 ${
                excludeCrystals
                  ? 'bg-[#00d2ff]/20 text-[#00d2ff] border border-[#00d2ff]/60 shadow-[0_0_8px_rgba(0,210,255,0.35)]'
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
      {/* 外部（クラフト等）から遷移してきた時の一時的スマート復帰バー */}
      {returnSource && (
        <div className="mx-2 mt-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-950/90 to-slate-900/90 border border-emerald-500/40 flex items-center justify-between shadow-lg shrink-0 transition-all gap-1.5">
          <button
            onClick={onReturnBack}
            className="flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 font-bold text-xs shrink-0"
          >
            <i className="fa-solid fa-arrow-left text-[0.7rem] animate-pulse"></i>
            <span className="font-black whitespace-nowrap">【{returnSource.label}に戻る】</span>
          </button>

          {/* 中央〜右側: 目標仕入額 ＆ 必要数の表示（余白の有効活用） */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
            {returnSource.neededCount !== undefined && returnSource.neededCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[0.68rem] font-bold font-mono whitespace-nowrap flex items-center gap-1 shadow-sm">
                <span className="text-slate-400 font-normal text-[0.6rem]">必要:</span>
                <span className="text-emerald-300 font-black">{returnSource.neededCount.toLocaleString()}個</span>
              </span>
            )}
            {returnSource.targetPrice !== undefined && returnSource.targetPrice > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-200 text-[0.68rem] font-bold font-mono whitespace-nowrap flex items-center gap-1 shadow-sm">
                <span className="text-slate-400 font-normal text-[0.6rem]">目標仕入:</span>
                <span className="text-amber-300 font-black">@{Math.round(returnSource.targetPrice).toLocaleString()}G</span>
              </span>
            )}
            {/* 必要数も目標仕入額もない場合のアイテム名フォールバック */}
            {!returnSource.neededCount && !returnSource.targetPrice && selectedItem && (
              <span className="text-slate-300 font-normal truncate max-w-[130px] text-[0.68rem]">
                {selectedItem.item_name}
              </span>
            )}
          </div>

          <button
            onClick={onClearReturnSource}
            className="w-5 h-5 rounded-full hover:bg-white/10 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs shrink-0 transition-colors ml-0.5"
            title="復帰バーを閉じる"
          >
            <i className="fa-solid fa-xmark text-[0.68rem]"></i>
          </button>
        </div>
      )}

      {/* 固定ヘッダーフィルターバー（画面切替タブ ＆ フィルター） */}
      <div className="px-2 pt-1.5 shrink-0">
        {renderFilterBar()}
      </div>

      {/* スワイプ可能な3画面カルーセル */}
      <SwipeContainer currentPage={currentPage} onPageChange={handlePageChange} pageCount={3}>
        {/* ============================== */}
        {/* 📄 PAGE 0: アイテムカード一覧 */}
        {/* ============================== */}
        <div className="flex flex-col h-full overflow-hidden px-2 pb-2 pt-1.5 gap-2">
          {/* アイテムカードリスト（ここ以下がスクロール） */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#00d2ff]"></i>
                <span className="text-xs">市場データを展開中...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                該当するアイテムが見つかりませんでした
              </div>
            ) : (
              <div className="flex flex-col gap-2 pb-16">
                {filteredItems.slice(0, 100).map((item, index) => {
                  const isSelected = selectedItem?.item_id === item.item_id && selectedItem?.hq === item.hq;
                  return (
                    <MarketCard
                      key={`${item.item_id}_${item.hq ? 'hq' : 'nq'}`}
                      item={item}
                      idx={index}
                      isSelected={isSelected}
                      onSelect={handleSelectItem}
                    />
                  );
                })}
                {filteredItems.length > 100 && (
                  <div className="text-center text-xs text-slate-500 py-3">
                    上位 100 件を表示中（全 {filteredItems.length.toLocaleString()} 件）
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================== */}
        {/* ============================== */}
        {/* 📈 PAGE 1: 分析サマリー＆グラフ */}
        {/* ============================== */}
        <div className="flex flex-col h-full overflow-hidden px-2 pb-2 pt-1.5 gap-2">
          {!selectedItem ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center gap-3">
              <i className="fa-solid fa-arrow-left text-2xl text-[#00d2ff] animate-bounce"></i>
              <p className="text-xs">一覧からアイテムを選択してください</p>
              <button
                onClick={() => setCurrentPage(0)}
                className="px-4 py-1.5 bg-[#00d2ff]/20 text-[#00d2ff] border border-[#00d2ff]/40 rounded-lg text-xs font-bold"
              >
                一覧に戻る
              </button>
            </div>
          ) : (() => {
            const hasItemHistory = (selectedItem.sale_trades || 0) > 0 || (selectedItem.min_price || 0) > 0;
            return (
            <>
              {/* 上部固定エリア（一覧のMarketCard ＆ 7日間グラフの一括アコーディオン） */}
              <div className="bg-slate-900/90 rounded-xl border border-white/10 flex flex-col overflow-hidden transition-all shadow-sm shrink-0">
                <div
                  onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
                  className="flex items-center justify-between p-2 cursor-pointer bg-slate-900/60 hover:bg-white/5 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5 text-xs min-w-0">
                    {/* 畳まれている時は品目アイコン ＆ 品名をコンパクトに表示 */}
                    {isDetailCollapsed && selectedItem.icon_url && (
                      <img
                        src={selectedItem.icon_url}
                        alt={selectedItem.item_name}
                        className="w-5 h-5 rounded object-contain bg-black/50 border border-white/10 shrink-0"
                      />
                    )}
                    <span className="font-bold text-slate-300 flex items-center gap-1 text-[0.72rem] truncate">
                      {isDetailCollapsed ? (
                        <>
                          <span className="text-white font-bold truncate max-w-[130px]">{selectedItem.item_name}</span>
                          {selectedItem.hq && (
                            <span className="bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 font-extrabold text-[0.55rem] px-1 py-0.2 rounded shrink-0">HQ</span>
                          )}
                          <span className="text-slate-400 font-mono text-[0.65rem] shrink-0">({selectedWorld})</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-chart-area text-[#00d2ff]"></i>
                          <span>7日間価格推移・取引量 ({selectedWorld})</span>
                        </>
                      )}
                    </span>
                    {!hasItemHistory ? (
                      <span className="text-[0.62rem] font-bold font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
                        履歴なし
                      </span>
                    ) : dailyTrendData.trendPct !== undefined ? (
                      <span
                        className={`text-[0.62rem] font-bold font-mono px-1.5 py-0.2 rounded shrink-0 ${
                          dailyTrendData.trendPct >= 0
                            ? 'bg-[#4ade80]/20 text-[#4ade80]'
                            : 'bg-[#f87171]/20 text-[#f87171]'
                        }`}
                      >
                        {dailyTrendData.trendPct >= 0 ? '+' : ''}{dailyTrendData.trendPct}%
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-[0.68rem] font-semibold shrink-0">
                    <span>{isDetailCollapsed ? '展開' : '閉じる'}</span>
                    <i className={`fa-solid fa-chevron-${isDetailCollapsed ? 'down' : 'up'} text-[0.6rem]`}></i>
                  </div>
                </div>

                {/* 展開時のみ: MarketCard ＆ 7日間メトリクス・グラフ */}
                {!isDetailCollapsed && (
                  <div className="p-2 pt-0 flex flex-col gap-2">
                    {/* 一覧カードをヘッダーとして配置 */}
                    <MarketCard
                      item={selectedItem}
                      idx={0}
                      isSelected={true}
                      onSelect={() => {}}
                    />

                    {/* 市場メトリクス */}
                    <div className="grid grid-cols-4 gap-1">
                      <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#00d2ff] rounded p-1 text-center">
                        <div className="text-[0.55rem] text-slate-400">現在最安</div>
                        <div className="text-[0.72rem] font-bold font-mono text-[#00d2ff] truncate">
                          {selectedItem.min_price > 0 ? `${selectedItem.min_price.toLocaleString()}G` : '-'}
                        </div>
                      </div>
                      <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#c084fc] rounded p-1 text-center">
                        <div className="text-[0.55rem] text-slate-400">平均価格</div>
                        <div className="text-[0.72rem] font-bold font-mono text-[#c084fc] truncate">
                          {selectedItem.avg_price > 0 ? `${selectedItem.avg_price.toLocaleString()}G` : '-'}
                        </div>
                      </div>
                      <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#4ade80] rounded p-1 text-center">
                        <div className="text-[0.55rem] text-slate-400">販売速度</div>
                        <div className="text-[0.72rem] font-bold font-mono text-[#4ade80] truncate">
                          {selectedItem.sale_velocity ? `${selectedItem.sale_velocity.toFixed(1)}/日` : '-'}
                        </div>
                      </div>
                      <div className="bg-slate-950/70 border border-white/10 border-l-2 border-l-[#ffb703] rounded p-1 text-center">
                        <div className="text-[0.55rem] text-slate-400">7日売買</div>
                        <div className="text-[0.72rem] font-bold font-mono text-[#ffb703] truncate">
                          {selectedItem.sale_trades ? `${selectedItem.sale_trades}件` : '-'}
                        </div>
                      </div>
                    </div>

                    {/* グラフCanvas */}
                    {hasItemHistory && (
                      <div className="bg-slate-950/60 rounded-lg p-1.5 flex flex-col gap-1">
                          <TrendChartCanvas
                            key={`${selectedItem?.item_id}_${selectedItem?.hq ? 'hq' : 'nq'}_${selectedWorld}`}
                            trend={dailyTrendData.trend}
                            trendPct={dailyTrendData.trendPct}
                            lineColor="#00d2ff"
                            height={105}
                          />

                        {dailyTrendData.trend.length > 0 && (
                          <div className="flex justify-between gap-1 w-full pt-1 mt-0.5 border-t border-white/10">
                            {dailyTrendData.trend.map((d, i) => (
                              <div key={i} className="flex-1 text-center min-w-0">
                                <div className="font-bold text-slate-400 text-[0.6rem]">{d.date}</div>
                                <div className="text-[#00d2ff] font-bold text-[0.62rem] font-mono whitespace-nowrap">
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
                    )}
                  </div>
                )}
              </div>

              {/* 下部スクロールエリア（売買履歴カードリスト ＆ 出品リスト遷移ボタン） */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 flex flex-col gap-2 pb-16">

              {/* 直近の売買履歴（モバイル専用カードリスト） */}
              <div className="flex flex-col gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <i className="fa-solid fa-clock-rotate-left text-[#c084fc]"></i> 直近の売買履歴 ({selectedWorld})
                  </span>
                  {selectedItem.history && selectedItem.history.length > 0 && (
                    <span className="text-[0.65rem] text-slate-400 font-mono">
                      直近 {Math.min(20, selectedItem.history.length)} 件
                    </span>
                  )}
                </div>

                {(!selectedItem.history || selectedItem.history.length === 0) ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    取引履歴がありません
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedItem.history.slice(0, 20).map((h, idx: number) => {
                      const exactTimeStr = formatJstDateTime(h.ts);
                      const isHq = Boolean(h.hq ?? selectedItem.hq);
                      const buyerName = h.buyer || '購入者非公開';
                      const unitPrice = (h.price || 0).toLocaleString();
                      const qty = h.qty || 1;
                      const totalPrice = ((h.price || 0) * qty).toLocaleString();

                      return (
                        <div
                          key={idx}
                          className="bg-slate-950/70 border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5 text-xs shadow-sm hover:border-white/20 transition-all"
                        >
                          {/* 上段: 取引日時 + HQ/NQバッジ (左) / 購入者名 (右) */}
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

                          {/* 下段: 単価 + 数量 (左) / 合計金額 (右) */}
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
                )}
              </div>

              {/* 出品リスト（3画面目）へのナビゲーションカード */}
              <button
                onClick={() => setCurrentPage(2)}
                className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-[#0f172a] to-[#1e293b] hover:from-[#1e293b] hover:to-[#334155] border border-white/10 rounded-xl text-xs font-bold text-slate-200 transition-all shadow-md active:scale-[0.99]"
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-store text-[#38bdf8] text-sm"></i>
                  <span>出品リストを見る（DC別最安値比較）</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <span>次へ</span>
                  <i className="fa-solid fa-chevron-right text-[0.65rem]"></i>
                </div>
              </button>
              </div>
            </>
            );
          })()}
        </div>

        {/* ============================== */}
        {/* 📋 PAGE 2: 出品リスト */}
        {/* ============================== */}
        <div className="flex flex-col h-full overflow-hidden px-2 pb-2 pt-1.5 gap-2">
          {!selectedItem ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center gap-3">
              <i className="fa-solid fa-arrow-left text-2xl text-[#00d2ff] animate-bounce"></i>
              <p className="text-xs">一覧からアイテムを選択してください</p>
              <button
                onClick={() => setCurrentPage(0)}
                className="px-4 py-1.5 bg-[#00d2ff]/20 text-[#00d2ff] border border-[#00d2ff]/40 rounded-lg text-xs font-bold"
              >
                一覧に戻る
              </button>
            </div>
          ) : (
            <>
              {/* 上部固定エリア（アイテムヘッダー、3エリア最安値比較カード、出品スコープ切替バーの一括アコーディオン） */}
              <div className="flex flex-col bg-slate-900/90 rounded-xl border border-white/10 overflow-hidden transition-all shadow-sm shrink-0">
                <div
                  onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
                  className="flex items-center justify-between p-2 cursor-pointer bg-slate-900/60 hover:bg-white/5 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5 text-xs min-w-0">
                    {/* 畳まれている時は品目アイコン ＆ 品名をコンパクトに表示 */}
                    {isDetailCollapsed && selectedItem.icon_url && (
                      <img
                        src={selectedItem.icon_url}
                        alt={selectedItem.item_name}
                        className="w-5 h-5 rounded object-contain bg-black/50 border border-white/10 shrink-0"
                      />
                    )}
                    <span className="font-bold text-slate-300 flex items-center gap-1 text-[0.72rem] truncate">
                      {isDetailCollapsed ? (
                        <>
                          <span className="text-white font-bold truncate max-w-[130px]">{selectedItem.item_name}</span>
                          {selectedItem.hq && (
                            <span className="bg-[#ffb703]/20 text-[#ffb703] border border-[#ffb703]/40 font-extrabold text-[0.55rem] px-1 py-0.2 rounded shrink-0">HQ</span>
                          )}
                          <span className="text-[#38bdf8] font-mono text-[0.65rem] shrink-0">
                            ({listingsScope === 'world' ? selectedWorld : listingsScope === 'dc' ? activeDc : '全DC'}: {currentListings.length}件)
                          </span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-layer-group text-[#00d2ff]"></i>
                          <span>DC別最安値比較 ({activeDc})</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-[0.68rem] font-semibold shrink-0">
                    <span>{isDetailCollapsed ? '展開' : '閉じる'}</span>
                    <i className={`fa-solid fa-chevron-${isDetailCollapsed ? 'down' : 'up'} text-[0.6rem]`}></i>
                  </div>
                </div>

                {!isDetailCollapsed && (
                  <div className="p-2 pt-0 flex flex-col gap-2">
                    {/* 一覧カードをヘッダーとして配置 */}
                    <MarketCard
                      item={selectedItem}
                      idx={0}
                      isSelected={true}
                      onSelect={() => {}}
                    />

                    {/* 3エリア最安値比較カード */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="bg-slate-950/80 p-1.5 rounded-lg border border-[#4ade80]/30 text-center flex flex-col">
                        <span className="text-[0.6rem] text-slate-400 truncate">{selectedWorld} 最安</span>
                        <span className="text-xs font-extrabold text-[#4ade80] font-mono mt-0.5">
                          {cachedScopes.summary.selWorldMin > 0 ? `${cachedScopes.summary.selWorldMin.toLocaleString()}G` : '-'}
                        </span>
                        <span className="text-[0.55rem] text-slate-400 truncate font-mono">({activeDc})</span>
                      </div>
                      <div className="bg-slate-950/80 p-1.5 rounded-lg border border-[#38bdf8]/30 text-center flex flex-col">
                        <span className="text-[0.6rem] text-slate-400 truncate">{activeDc} 最安</span>
                        <span className="text-xs font-extrabold text-[#38bdf8] font-mono mt-0.5">
                          {cachedScopes.summary.dcMin.price > 0 ? `${cachedScopes.summary.dcMin.price.toLocaleString()}G` : '-'}
                        </span>
                        <span className="text-[0.55rem] text-slate-400 truncate font-mono">
                          {cachedScopes.summary.dcMin.world && cachedScopes.summary.dcMin.world !== '-'
                            ? `${cachedScopes.summary.dcMin.world} (${activeDc})`
                            : '-'}
                        </span>
                      </div>
                      <div className="bg-slate-950/80 p-1.5 rounded-lg border border-[#c084fc]/30 text-center flex flex-col">
                        <span className="text-[0.6rem] text-slate-400 truncate">全DC 最安</span>
                        <span className="text-xs font-extrabold text-[#c084fc] font-mono mt-0.5">
                          {cachedScopes.summary.allMin.price > 0 ? `${cachedScopes.summary.allMin.price.toLocaleString()}G` : '-'}
                        </span>
                        <span className="text-[0.55rem] text-slate-400 truncate font-mono">
                          {cachedScopes.summary.allMin.world && cachedScopes.summary.allMin.world !== '-'
                            ? `${cachedScopes.summary.allMin.world} (${WORLD_TO_DC[cachedScopes.summary.allMin.world] || ''})`
                            : '-'}
                        </span>
                      </div>
                    </div>

                    {/* 対象ワールド範囲（スコープ切替バー） */}
                    <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1.5 rounded-lg border border-white/10">
                      <div className="flex items-center gap-1">
                        <i className="fa-solid fa-earth-asia text-[#38bdf8] text-xs"></i>
                        <span className="text-xs font-bold text-slate-200">対象ワールド範囲</span>
                        <span className="text-[0.65rem] text-slate-400 font-mono ml-1">
                          {loadingListings ? '取得中...' : `(${currentListings.length}件)`}
                        </span>
                      </div>

                      <div className="flex bg-black/50 p-0.5 rounded-lg border border-white/10 text-xs">
                        <button
                          onClick={() => setListingsScope('world')}
                          className={`px-2.5 py-1 rounded font-bold transition-all text-[0.68rem] ${
                            listingsScope === 'world'
                              ? 'bg-[#00d2ff]/20 text-[#00d2ff] border border-[#00d2ff]/40 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {selectedWorld}
                        </button>
                        <button
                          onClick={() => setListingsScope('dc')}
                          className={`px-2.5 py-1 rounded font-bold transition-all text-[0.68rem] ${
                            listingsScope === 'dc'
                              ? 'bg-[#00d2ff]/20 text-[#00d2ff] border border-[#00d2ff]/40 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {activeDc}
                        </button>
                        <button
                          onClick={() => setListingsScope('all')}
                          className={`px-2.5 py-1 rounded font-bold transition-all text-[0.68rem] ${
                            listingsScope === 'all'
                              ? 'bg-[#00d2ff]/20 text-[#00d2ff] border border-[#00d2ff]/40 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          全DC
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 下部スクロールエリア（出品カードリスト） */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 flex flex-col gap-2 pb-16">
                {loadingListings ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                    <i className="fa-solid fa-circle-notch fa-spin text-xl text-[#38bdf8]"></i>
                    <span className="text-xs">リアルタイム出品情報を取得中...</span>
                  </div>
                ) : currentListings.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs bg-slate-900/60 rounded-xl border border-white/5">
                    現在このスコープでの出品はありません
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {currentListings.slice(0, 40).map((l, idx) => {
                      const isHq = Boolean(l.hq);
                      const unitPrice = (l.pricePerUnit || 0).toLocaleString();
                      const qty = l.quantity || 1;
                      const totalPrice = (l.total || (l.pricePerUnit || 0) * qty).toLocaleString();
                      const retainer = l.retainerName || `リテーナー #${idx + 1}`;
                      const worldDisplay = l.worldName || selectedWorld;
                      const dcDisplay = WORLD_TO_DC[worldDisplay] || activeDc;
                      const fullWorldText = `${worldDisplay} (${dcDisplay})`;

                      // クラフトからの素材遷移時の割安/割高ガイド判定 (目標仕入額 targetPrice との比較)
                      const targetPrice = returnSource?.isMaterial && returnSource?.targetPrice ? returnSource.targetPrice : null;
                      const priceNum = l.pricePerUnit || 0;
                      const diffPct = targetPrice && targetPrice > 0
                        ? Math.round(((priceNum - targetPrice) / targetPrice) * 100)
                        : 0;
                      const isGoodBuy = targetPrice !== null ? priceNum <= targetPrice : null;
                      const diffPctStr = diffPct > 0
                        ? `+${diffPct}%`
                        : (diffPct === 0 && !isGoodBuy ? '+0%' : `${diffPct}%`);

                      return (
                        <div
                          key={idx}
                          className={`border rounded-xl p-2.5 flex flex-col gap-1.5 text-xs shadow-sm transition-all ${
                            targetPrice !== null
                              ? isGoodBuy
                                ? 'bg-slate-950/70 border-white/10 hover:border-[#4ade80]/30'
                                : 'bg-slate-950/50 border-[#f87171]/20 hover:border-[#f87171]/40'
                              : 'bg-slate-950/70 border-white/10 hover:border-white/20'
                          }`}
                        >
                          {/* 上段: #順位 + HQ/NQバッジ + ワールド (DC) (左) / ガイドバッジ ＆ リテーナー名 (右) */}
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
                            <div className="text-[#60a5fa] font-bold text-[0.72rem] flex items-center gap-1 truncate max-w-[120px]">
                              <i className="fa-solid fa-store text-[0.65rem] text-[#60a5fa]/70"></i>
                              <span className="truncate">{retainer}</span>
                            </div>
                          </div>

                          {/* 下段: ガイドチップ + 単価 + 出品数 (左) / 合計金額 (右) */}
                          <div className="flex items-center justify-between pt-0.5">
                            <div className="flex items-center gap-2 text-slate-400 text-[0.72rem] min-w-0">
                              {targetPrice !== null && (
                                isGoodBuy ? (
                                  <span className="bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/40 px-1.5 py-0.2 rounded text-[0.6rem] font-bold font-mono flex items-center gap-1 shadow-sm shrink-0">
                                    <i className="fa-solid fa-circle text-[0.32rem]"></i> 割安 ({diffPctStr})
                                  </span>
                                ) : (
                                  <span className="bg-[#f87171]/15 text-[#f87171] border border-[#f87171]/40 px-1.5 py-0.2 rounded text-[0.6rem] font-bold font-mono flex items-center gap-1 shadow-sm shrink-0">
                                    <i className="fa-solid fa-circle-xmark text-[0.5rem]"></i> 割高 ({diffPctStr})
                                  </span>
                                )
                              )}
                              <span className="shrink-0">
                                <i className={`fa-solid fa-tag text-[0.65rem] mr-0.5 ${targetPrice !== null && !isGoodBuy ? 'text-[#f87171]' : 'text-[#4ade80]'}`}></i>
                                単価: <strong className={`font-mono ${targetPrice !== null && !isGoodBuy ? 'text-[#f87171]' : 'text-[#4ade80]'}`}>{unitPrice}G</strong>
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
                )}
              </div>
            </>
          )}
        </div>
      </SwipeContainer>
    </div>
  );
});
