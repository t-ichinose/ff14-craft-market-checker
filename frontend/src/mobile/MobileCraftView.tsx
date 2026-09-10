import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { JAPAN_DCS, WORLD_TO_DC } from '../constants/japanDcs';
import { fetchAndPrepareMarketData } from '../services/marketDataService';
import { fetchRecipes, getCachedRecipes, type RecipesMap } from '../services/recipeDataService';
import { CategoryFilterDropdown } from '../shared/CategoryFilterDropdown';
import { SwipeContainer } from './SwipeContainer';
import { MobileWorldVelocityBar } from './MobileWorldVelocityBar';
import {
  isCrystalItem,
  getJobBadgeStyle,
  resolveFullTreeForScope,
  aggregateProcurementItems,
} from '../boxes/craft/craftTreeUtils';
import type {
  MarketDataPayload,
  MarketItemPayload,
  CraftCardItem,
  ProcurementItem,
  RecipeTreeItem,
  SourcingScope,
} from '../boxes/craft/craftTypes';

const ITEMS_PER_PAGE = 35;

// メモリ保持キャッシュ（タブ再切替時のレイテンシを0msにする）
let cachedMarketPayload: MarketDataPayload | null = null;
let cachedCategories: string[] | null = null;

interface MobileCraftViewProps {
  salesWorld: string;
  onWorldChange?: (world: string) => void;
  isActive?: boolean;
  onNavigateToMarket?: (itemId: number, isHq?: boolean, context?: { neededCount?: number; targetPrice?: number; isMaterial?: boolean }) => void;
}

type SortOption = 'dailyProfit' | 'profit' | 'profitRate';

// 中間素材製作ステップ情報
interface IntermediateCraftStep {
  itemId: number;
  name: string;
  icon: string;
  job?: string;
  lvl?: number;
  is_company?: boolean;
  totalNeeded: number;
  yieldAmt: number;
  craftBatches: number;
  totalYield: number;
  unitCost: number;
  marketPrice: number;
  savingsTotal: number;
  materials: {
    itemId: number;
    name: string;
    icon: string;
    amount: number;
    unitPrice: number;
    method: 'buy_npc' | 'craft' | 'buy_market' | 'self_sufficient';
    world: string;
  }[];
}

interface AssemblyMaterial {
  itemId: number;
  name: string;
  icon: string;
  amount: number;
  unitPrice: number;
  method: 'buy_npc' | 'craft' | 'buy_market' | 'self_sufficient';
  world: string;
}

// レシピ評価ヘルパー（ループ外に抽出して毎回の関数アロケーションを排除）
function evaluateCardItem(
  iid: number,
  meta: { name: string; category: string; icon: string; ilvl?: number },
  rec: { job?: string; lvl?: number; is_company?: boolean },
  yieldAmt: number,
  batchCost: number,
  craftCost: number,
  rawSellPrice: number,
  velocity: number,
  isHq: boolean,
  it?: MarketItemPayload
): CraftCardItem | null {
  if (rawSellPrice <= 0 || craftCost <= 0) return null;

  const netSellPrice = Math.round(rawSellPrice * 0.95);
  const profit = netSellPrice - craftCost;
  const profitRate = Math.round(((profit / craftCost) * 100) * 10) / 10;

  const isHighVelocity = velocity >= 1.0;
  const isLowValueConsumable = rawSellPrice < 30000;

  if (!isHighVelocity && !isLowValueConsumable) {
    if (profitRate > 500) return null;
    if (rawSellPrice > craftCost * 8) return null;
  }

  if (craftCost <= 1000 && rawSellPrice > 50000 && !isHighVelocity) return null;

  if (rawSellPrice >= 1000000 && velocity < 0.3 && !rec.is_company) {
    const isCollectible = ['その他', 'ミニオン', 'マウント', '雑貨', '調度品(一般)'].includes(meta.category);
    if (!isCollectible) return null;
  }

  const dailyProfit = Math.round(profit * velocity);

  return {
    item_id: iid,
    name: meta.name || (it ? it.item_name : `Item #${iid}`),
    cat: meta.category || (it ? it.category_name : 'その他'),
    icon: meta.icon || (it ? it.icon_url : ''),
    ilvl: meta.ilvl || (it ? it.level_item : 1),
    job: rec.job || '裁縫',
    lvl: rec.lvl || 1,
    is_company: rec.is_company || false,
    is_hq: isHq,
    amt: yieldAmt,
    batch_cost: batchCost,
    sell_price: rawSellPrice,
    craft_cost: craftCost,
    profit,
    profit_rate: profitRate,
    daily_sales_qty: velocity,
    daily_profit: dailyProfit,
    daily_trend: it?.daily_trend,
    trend_pct: it?.trend_pct,
  };
}

export const MobileCraftView: React.FC<MobileCraftViewProps> = React.memo(({
  salesWorld,
  onWorldChange,
  isActive = true,
  onNavigateToMarket,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(0); // 0: クラフト候補一覧, 1: 買い物リスト

  // データ（キャッシュがあれば即座に初期化）
  const [recipesMap, setRecipesMap] = useState<RecipesMap | null>(() => getCachedRecipes());
  const [marketData, setMarketData] = useState<MarketDataPayload | null>(() => cachedMarketPayload);
  const [availableCategories, setAvailableCategories] = useState<string[]>(() => cachedCategories || []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => cachedCategories || []);
  const [loading, setLoading] = useState<boolean>(() => !getCachedRecipes() || !cachedMarketPayload);

  // 表示件数制御（初期35件、スクロールで段階読み込み）
  const [displayCount, setDisplayCount] = useState<number>(ITEMS_PER_PAGE);

  // フィルター & 設定
  const [sourcingScope, setSourcingScope] = useState<SourcingScope>('world'); // デフォルト: 自ワールド
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minVelocity, setMinVelocity] = useState<number>(0); // 日当たり販売数の足切り (0: 指定なし)
  const [sortBy, setSortBy] = useState<SortOption>('dailyProfit');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  // 買い物リスト・選択品目
  const [selectedItem, setSelectedItem] = useState<CraftCardItem | null>(null);
  const [craftCount, setCraftCount] = useState<number>(1);
  const [purchasedMap, setPurchasedMap] = useState<Record<number, number>>({});
  const [detailTab, setDetailTab] = useState<'steps' | 'shopping'>('steps'); // 'steps': 製作工程・中間素材, 'shopping': 調達リスト
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(false);

  // DC 判定
  const targetDc = useMemo(() => WORLD_TO_DC[salesWorld] || 'Elemental', [salesWorld]);

  // データ初期ロード
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [dataset, recJson] = await Promise.all([
          fetchAndPrepareMarketData(),
          fetchRecipes(),
        ]);

        const mktJson: MarketDataPayload = {
          last_updated: dataset.last_updated || '',
          data: dataset.data as unknown as Record<string, MarketItemPayload[]>,
          items: dataset.items as unknown as MarketDataPayload['items'],
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
      } catch (err) {
        console.error('Failed to load mobile craft datasets:', err);
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // フィルター・ソート変更時に表示件数をリセット
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [salesWorld, sourcingScope, searchQuery, selectedCategories, sortBy, minVelocity]);

  // 堅牢な代表価格計算（PC版同一・アロケーション最適化）
  const getRobustItemPrice = useCallback((it?: {
    history?: { price?: number }[];
    region_median_price?: number;
    avg_price?: number;
    min_price?: number;
  }): number => {
    if (!it) return 0;
    const history = it.history;
    if (!history || history.length === 0) {
      return it.avg_price || it.min_price || 0;
    }

    const validPrices: number[] = [];
    for (let i = 0; i < history.length; i++) {
      const p = history[i].price;
      if (p && p > 0) validPrices.push(p);
    }
    if (validPrices.length === 0) {
      return it.avg_price || it.min_price || 0;
    }

    const benchmark = it.region_median_price || it.avg_price || validPrices[0];

    let filtered = validPrices;
    if (benchmark >= 20000) {
      const minCutoff = benchmark * 0.30;
      const sanePrices: number[] = [];
      for (let i = 0; i < validPrices.length; i++) {
        if (validPrices[i] >= minCutoff) sanePrices.push(validPrices[i]);
      }
      if (sanePrices.length > 0) {
        filtered = sanePrices;
      }
    }

    filtered.sort((a: number, b: number) => a - b);
    const mid = Math.floor(filtered.length / 2);
    return filtered.length % 2 === 0
      ? Math.round((filtered[mid - 1] + filtered[mid]) / 2)
      : filtered[mid];
  }, []);

  // 全DCフォールバック相場マップ (NQ)
  const allDcPriceMap = useMemo(() => {
    if (!marketData || !marketData.data) return new Map<number, { price: number; world: string }>();
    const map = new Map<number, { price: number; world: string }>();
    const worldNames = Object.keys(marketData.data);
    for (let w = 0; w < worldNames.length; w++) {
      const wname = worldNames[w];
      const items = marketData.data[wname] || [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.hq) {
          const p = getRobustItemPrice(it);
          if (p > 0) {
            const cur = map.get(it.item_id);
            if (!cur || p < cur.price) {
              map.set(it.item_id, { price: p, world: wname });
            }
          }
        }
      }
    }
    return map;
  }, [marketData, getRobustItemPrice]);

  // 素材最安相場マップ (NQ) - 全DCスコープ時はallDcPriceMapを直接再利用
  const materialPriceMap = useMemo(() => {
    if (!marketData || !marketData.data) return new Map<number, { price: number; world: string }>();

    if (sourcingScope === 'all_dc') {
      return allDcPriceMap;
    }

    const map = new Map<number, { price: number; world: string }>();
    const dcWorlds = JAPAN_DCS[targetDc] || [];
    const allowedWorlds = sourcingScope === 'dc' ? dcWorlds : [salesWorld];

    for (let w = 0; w < allowedWorlds.length; w++) {
      const wname = allowedWorlds[w];
      const items = marketData.data[wname] || [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.hq) {
          const p = getRobustItemPrice(it);
          if (p > 0) {
            const cur = map.get(it.item_id);
            if (!cur || p < cur.price) {
              map.set(it.item_id, { price: p, world: wname });
            }
          }
        }
      }
    }
    return map;
  }, [marketData, sourcingScope, targetDc, salesWorld, getRobustItemPrice, allDcPriceMap]);

  // 全クラフト品の評価計算
  const allEvaluatedCraftItems = useMemo(() => {
    if (!recipesMap || !marketData || !marketData.data) return [];

    const worldItems = marketData.data[salesWorld] || [];
    const worldItemMap = new Map<string, MarketItemPayload>();
    for (let i = 0; i < worldItems.length; i++) {
      const it = worldItems[i];
      worldItemMap.set(`${it.item_id}_${it.hq ? 'hq' : 'nq'}`, it);
    }

    const results: CraftCardItem[] = [];
    const recipeEntries = Object.entries(recipesMap);

    for (let r = 0; r < recipeEntries.length; r++) {
      const [idStr, rec] = recipeEntries[r];
      const iid = parseInt(idStr, 10);
      const meta = marketData.items[idStr] || { name: `Item #${iid}`, category: 'その他', icon: '', ilvl: 1 };

      let batchCost = 0;
      let hasMissingPrice = false;

      for (let j = 0; j < rec.ings.length; j++) {
        const [ingId, amt] = rec.ings[j];
        const ingMeta = marketData.items[ingId.toString()] || {};
        const shopPrice = ingMeta.price_mid || ingMeta.shop_price || 0;

        let pInfo = materialPriceMap.get(ingId);
        if (!pInfo && allDcPriceMap.has(ingId)) {
          pInfo = allDcPriceMap.get(ingId);
        }

        const mktPrice = pInfo ? pInfo.price : 0;
        const bestPrice = (shopPrice > 0 && (mktPrice === 0 || shopPrice <= mktPrice))
          ? shopPrice
          : (mktPrice || shopPrice || 0);

        if (bestPrice <= 0) {
          hasMissingPrice = true;
          break;
        }
        batchCost += bestPrice * amt;
      }

      if (hasMissingPrice || batchCost <= 0) continue;
      const yieldAmt = Math.max(1, rec.amt || 1);
      const craftCost = Math.round(batchCost / yieldAmt);

      const hqIt = worldItemMap.get(`${iid}_hq`);
      const nqIt = worldItemMap.get(`${iid}_nq`);

      let hqCandidate: CraftCardItem | null = null;
      if (hqIt) {
        const p = getRobustItemPrice(hqIt);
        if (p > 0) {
          hqCandidate = evaluateCardItem(iid, meta, rec, yieldAmt, batchCost, craftCost, p, hqIt.sale_velocity || 0, true, hqIt);
        }
      }

      let nqCandidate: CraftCardItem | null = null;
      if (nqIt) {
        const p = getRobustItemPrice(nqIt);
        if (p > 0) {
          nqCandidate = evaluateCardItem(iid, meta, rec, yieldAmt, batchCost, craftCost, p, nqIt.sale_velocity || 0, false, nqIt);
        }
      }

      if (hqCandidate && nqCandidate) {
        if (hqCandidate.daily_profit >= nqCandidate.daily_profit) {
          results.push(hqCandidate);
        } else {
          results.push(nqCandidate);
        }
      } else if (hqCandidate) {
        results.push(hqCandidate);
      } else if (nqCandidate) {
        results.push(nqCandidate);
      }
    }

    return results;
  }, [recipesMap, marketData, salesWorld, materialPriceMap, allDcPriceMap, getRobustItemPrice]);

  // フィルタ・ソート適用
  const filteredItems = useMemo(() => {
    let list = allEvaluatedCraftItems;

    if (selectedCategories.length > 0 && availableCategories.length > 0) {
      const catSet = new Set(selectedCategories);
      list = list.filter((it) => catSet.has(it.cat));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((it) => it.name.toLowerCase().includes(q));
    }

    // 日当たり販売数足切りフィルター
    if (minVelocity > 0) {
      list = list.filter((it) => (it.daily_sales_qty || 0) >= minVelocity);
    }

    // ソート（推定日当 / 純利益 / 利益率）
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'dailyProfit':
          return b.daily_profit - a.daily_profit;
        case 'profit':
          return b.profit - a.profit;
        case 'profitRate':
          return b.profit_rate - a.profit_rate;
        default:
          return b.daily_profit - a.daily_profit;
      }
    });

    return list;
  }, [allEvaluatedCraftItems, selectedCategories, availableCategories, searchQuery, minVelocity, sortBy]);

  // 表示アイテムのスライス（初期35件、スクロールで自動追加）
  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, displayCount);
  }, [filteredItems, displayCount]);

  // 無限スクロールハンドラ
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 300) {
      setDisplayCount((prev) => {
        if (prev >= filteredItems.length) return prev;
        return Math.min(prev + ITEMS_PER_PAGE, filteredItems.length);
      });
    }
  }, [filteredItems.length]);

  // 選択アイテム変更時に買い物リストへ切り替え
  const handleSelectItem = useCallback((item: CraftCardItem) => {
    setSelectedItem(item);
    setCraftCount(1);
    setPurchasedMap({});
    setDetailTab('steps');
    setCurrentPage(1); // 画面1: 買い物リストへ自動移動
  }, []);

  // ツリー展開 (再帰ツリーベース)
  const resolvedTree: RecipeTreeItem[] = useMemo(() => {
    if (!isActive || !selectedItem || !recipesMap || !marketData) return [];

    return resolveFullTreeForScope(
      selectedItem.item_id,
      recipesMap,
      marketData,
      materialPriceMap,
      sourcingScope,
      salesWorld,
      targetDc,
      true,
      0,
      selectedItem.amt
    );
  }, [isActive, selectedItem, recipesMap, marketData, materialPriceMap, sourcingScope, salesWorld, targetDc]);

  // 調達買い物リスト (末端素材)
  const procurementList: ProcurementItem[] = useMemo(() => {
    if (!resolvedTree || resolvedTree.length === 0) return [];
    return aggregateProcurementItems(resolvedTree, craftCount);
  }, [resolvedTree, craftCount]);

  // 中間素材製作ステップ & 最終組立材料の抽出
  const { intermediateCraftSteps, finalAssemblyMaterials } = useMemo(() => {
    if (!resolvedTree || resolvedTree.length === 0 || !selectedItem) {
      return { intermediateCraftSteps: [], finalAssemblyMaterials: [] };
    }

    const stepsMap = new Map<number, IntermediateCraftStep>();

    // 中間素材を再帰探索
    function traverse(nodes: RecipeTreeItem[], currentMult: number) {
      for (const node of nodes) {
        if (!node.isActive) continue;

        if (node.method === 'craft' && node.subs && node.subs.length > 0) {
          const needed = node.amount * currentMult;
          const yieldAmt = Math.max(1, node.yieldAmt || 1);
          const batches = Math.ceil(needed / yieldAmt);

          const rec = recipesMap?.[node.id.toString()];

          const existing = stepsMap.get(node.id);
          if (existing) {
            existing.totalNeeded += needed;
            existing.craftBatches = Math.ceil(existing.totalNeeded / existing.yieldAmt);
            existing.totalYield = existing.craftBatches * existing.yieldAmt;
            existing.materials = node.subs.map((s) => ({
              itemId: s.id,
              name: s.name,
              icon: s.icon,
              amount: s.amount * existing.craftBatches,
              unitPrice: s.cost,
              method: s.method,
              world: s.world,
            }));
            existing.savingsTotal = Math.max(0, existing.marketPrice - existing.unitCost) * existing.totalNeeded;
          } else {
            const mats = node.subs.map((s) => ({
              itemId: s.id,
              name: s.name,
              icon: s.icon,
              amount: s.amount * batches,
              unitPrice: s.cost,
              method: s.method,
              world: s.world,
            }));

            stepsMap.set(node.id, {
              itemId: node.id,
              name: node.name,
              icon: node.icon,
              job: rec?.job,
              lvl: rec?.lvl,
              is_company: rec?.is_company || false,
              totalNeeded: needed,
              yieldAmt,
              craftBatches: batches,
              totalYield: batches * yieldAmt,
              unitCost: node.cost,
              marketPrice: node.marketPrice,
              savingsTotal: Math.max(0, node.marketPrice - node.cost) * needed,
              materials: mats,
            });
          }

          traverse(node.subs, batches);
        }
      }
    }

    traverse(resolvedTree, craftCount);

    // 最終完成品に直接投入する材料
    const assembly: AssemblyMaterial[] = resolvedTree.map((node) => ({
      itemId: node.id,
      name: node.name,
      icon: node.icon,
      amount: node.amount * craftCount,
      unitPrice: node.cost,
      method: node.method,
      world: node.world,
    }));

    return {
      intermediateCraftSteps: Array.from(stepsMap.values()),
      finalAssemblyMaterials: assembly,
    };
  }, [resolvedTree, craftCount, selectedItem, recipesMap]);

  // チェック切り替え
  const togglePurchased = useCallback((id: number, neededAmt: number) => {
    setPurchasedMap((prev) => {
      const cur = prev[id] || 0;
      return {
        ...prev,
        [id]: cur >= neededAmt ? 0 : neededAmt,
      };
    });
  }, []);

  // チェック全解除
  const clearPurchased = useCallback(() => {
    setPurchasedMap({});
  }, []);

  // 調達コスト計算
  const { totalProcurementCost, remainingProcurementCost } = useMemo(() => {
    let total = 0;
    let remaining = 0;

    procurementList.forEach((item) => {
      const needed = item.amount;
      const itemCost = item.unitPrice * needed;
      total += itemCost;

      const purchased = purchasedMap[item.id] || 0;
      if (purchased < needed) {
        remaining += item.unitPrice * (needed - purchased);
      }
    });

    return { totalProcurementCost: total, remainingProcurementCost: remaining };
  }, [procurementList, purchasedMap]);

  // 選択アイテムの製作サマリー（合計仕入、合計売価、合計利益）
  const totalCraftCost = useMemo(() => {
    return selectedItem ? selectedItem.craft_cost * craftCount : 0;
  }, [selectedItem, craftCount]);

  const totalSellPrice = useMemo(() => {
    return selectedItem ? selectedItem.sell_price * craftCount : 0;
  }, [selectedItem, craftCount]);

  const totalCraftProfit = useMemo(() => {
    if (!selectedItem) return 0;
    const unitProfit = selectedItem.profit !== undefined
      ? selectedItem.profit
      : selectedItem.sell_price - selectedItem.craft_cost;
    return unitProfit * craftCount;
  }, [selectedItem, craftCount]);

  // クリップボードコピー
  const handleCopyList = useCallback(() => {
    if (!selectedItem) return;

    if (detailTab === 'steps') {
      // 製作工程順コピー
      const lines: string[] = [
        `【FF14 製作工程リスト】`,
        `製作品: ${selectedItem.name} ${selectedItem.is_hq ? '(HQ)' : ''} × ${craftCount * selectedItem.amt}個 (${craftCount}回製作)`,
        `想定総原価: ${totalProcurementCost.toLocaleString()} Gil`,
        `--------------------------`,
      ];

      if (intermediateCraftSteps.length > 0) {
        lines.push(`■ STEP 1: 中間素材の製作`);
        intermediateCraftSteps.forEach((step, idx) => {
          const jobText = step.is_company ? 'カンパニークラフト' : `${step.job || 'クラフター'} Lv${step.lvl || 1}`;
          lines.push(` [${idx + 1}] ${step.name} × ${step.totalNeeded}個 (${step.craftBatches}回製作 / ${jobText})`);
          step.materials.forEach((m) => {
            const loc = m.method === 'buy_npc' ? 'NPC店' : m.method === 'craft' ? '自作' : (m.world || 'マケボ');
            lines.push(`    ・${m.name} × ${m.amount} (${loc}: @${m.unitPrice.toLocaleString()}G)`);
          });
        });
        lines.push('');
      }

      lines.push(`■ STEP 2: 最終完成品の組み立て`);
      finalAssemblyMaterials.forEach((m) => {
        const typeLabel = m.method === 'craft' ? '[中間素材]' : m.method === 'buy_npc' ? '[店売り]' : '[マケボ]';
        lines.push(`  ・${typeLabel} ${m.name} × ${m.amount}`);
      });

      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        setCopiedNotification(true);
        setTimeout(() => setCopiedNotification(false), 2000);
      });
    } else {
      // 調達買い物リストコピー
      const lines: string[] = [
        `【FF14 クラフト調達リスト】`,
        `製作品: ${selectedItem.name} ${selectedItem.is_hq ? '(HQ)' : ''} × ${craftCount * selectedItem.amt}個 (${craftCount}回製作)`,
        `仕入れスコープ: ${sourcingScope === 'all_dc' ? '全DC' : sourcingScope === 'dc' ? '同DC' : '自ワールド'}`,
        `想定原価: ${totalProcurementCost.toLocaleString()} Gil`,
        `--------------------------`,
      ];

      procurementList.forEach((item) => {
        const needed = item.amount;
        const isBought = (purchasedMap[item.id] || 0) >= needed;
        const checkMark = isBought ? '■' : '□';
        const loc = item.method === 'buy_npc' ? 'NPC店' : (item.world || 'マケボ');
        lines.push(`${checkMark} ${item.name} × ${needed} (${loc}: @${item.unitPrice.toLocaleString()}G)`);
      });

      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        setCopiedNotification(true);
        setTimeout(() => setCopiedNotification(false), 2000);
      });
    }
  }, [selectedItem, detailTab, intermediateCraftSteps, finalAssemblyMaterials, procurementList, craftCount, sourcingScope, totalProcurementCost, purchasedMap]);

  // 共通フィルターバー（左側: 画面切替タブセット / 右側: 現在の条件チップ ＆ フィルター開閉アイコン）
  const renderFilterBar = () => (
    <div className="shrink-0 flex flex-col gap-1.5">
      {/* バー本体（常時表示: タブセット + フィルターアイコン） */}
      <div
        className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-xl border text-xs text-slate-300 transition-all shadow-sm ${
          isMenuOpen
            ? 'bg-slate-900 border-[#10b981]/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
            : 'bg-slate-900/90 border-white/10'
        }`}
      >
        {/* 左側: 画面切り替えタブセット [一覧] [製作] */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setCurrentPage(0)}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[0.68rem] flex items-center gap-1 whitespace-nowrap ${
              currentPage === 0
                ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5 border border-transparent'
            }`}
          >
            <i className="fa-solid fa-list text-[0.62rem]"></i>一覧
          </button>
          <button
            onClick={() => setCurrentPage(1)}
            disabled={!selectedItem}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[0.68rem] flex items-center gap-1 whitespace-nowrap ${
              currentPage === 1
                ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5 border border-transparent disabled:opacity-30 disabled:hover:text-slate-400'
            }`}
          >
            <i className="fa-solid fa-hammer text-[0.62rem]"></i>製作
            {selectedItem && (
              <span className="px-1 py-0.2 rounded bg-[#10b981]/30 text-emerald-200 text-[0.6rem] font-bold whitespace-nowrap max-w-[70px] truncate">
                {selectedItem.name}
              </span>
            )}
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
              <i className="fa-solid fa-store text-[#10b981] text-[0.58rem]"></i>
              <span className="truncate max-w-[55px]">{salesWorld}</span>
            </span>
            {minVelocity > 0 && (
              <span className="text-emerald-300 font-mono bg-emerald-950/50 px-1 py-0.5 rounded border border-emerald-500/40 font-bold shrink-0">
                {minVelocity}+
              </span>
            )}
            <span className="text-slate-300 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/10 font-bold flex items-center gap-0.5 shrink-0">
              <i className="fa-solid fa-cart-shopping text-[#10b981] text-[0.58rem]"></i>
              <span>{sourcingScope === 'all_dc' ? '全DC' : sourcingScope === 'dc' ? '同DC' : '自鯖'}</span>
            </span>
            {searchQuery && (
              <span className="text-white font-mono truncate max-w-[45px]">
                "{searchQuery}"
              </span>
            )}
          </div>

          {/* フィルターアイコン（テキスト「フィルター」をアイコンのみに変更） */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 shrink-0 transition-colors">
            <i className="fa-solid fa-filter text-[#10b981] text-xs"></i>
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
                placeholder="クラフト品目を検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#10b981]"
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
                accentColor="#10b981"
              />
            </div>
          </div>

          {/* Row 2: 販売ワールド ＆ 日当たり販売数フィルター */}
          <MobileWorldVelocityBar
            world={salesWorld}
            onWorldChange={onWorldChange}
            worldLabel="販売先:"
            worldIcon="fa-store"
            minVelocity={minVelocity}
            onMinVelocityChange={setMinVelocity}
            accentColor="#10b981"
            accentTextClass="text-emerald-400"
          />

          {/* Row 3: ソートタブ（推定日当 / 純利益 / 利益率） ＆ 仕入れスコープ */}
          <div className="flex items-center gap-1.5">
            {/* ソートタブ（3項目） */}
            <div className="flex flex-1 bg-black/40 p-0.5 rounded-lg border border-white/10 text-xs gap-1 items-center">
              <button
                onClick={() => setSortBy('dailyProfit')}
                className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all text-[0.72rem] whitespace-nowrap ${
                  sortBy === 'dailyProfit'
                    ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-slate-950 shadow-[0_2px_8px_rgba(16,185,129,0.3)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                推定日当
              </button>
              <button
                onClick={() => setSortBy('profit')}
                className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all text-[0.72rem] whitespace-nowrap ${
                  sortBy === 'profit'
                    ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-slate-950 shadow-[0_2px_8px_rgba(16,185,129,0.3)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                純利益
              </button>
              <button
                onClick={() => setSortBy('profitRate')}
                className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all text-[0.72rem] whitespace-nowrap ${
                  sortBy === 'profitRate'
                    ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-slate-950 shadow-[0_2px_8px_rgba(16,185,129,0.3)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                利益率
              </button>
            </div>

            {/* 仕入れワールド切り替えタブ */}
            <div className="flex items-center bg-black/40 px-2 py-1 rounded-lg border border-white/10 shrink-0 gap-1">
              <span className="text-[0.68rem] text-slate-400 font-bold flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                <i className="fa-solid fa-cart-shopping text-[#10b981] text-[0.65rem]"></i> 仕入:
              </span>
              <div className="flex bg-slate-900 rounded p-0.5 border border-white/10 shrink-0 text-[0.65rem] font-bold">
                <button
                  onClick={() => setSourcingScope('all_dc')}
                  className={`px-1.5 py-0.5 rounded transition-all whitespace-nowrap ${
                    sourcingScope === 'all_dc'
                      ? 'bg-[#10b981]/30 text-emerald-300 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  全DC
                </button>
                <button
                  onClick={() => setSourcingScope('dc')}
                  className={`px-1.5 py-0.5 rounded transition-all whitespace-nowrap ${
                    sourcingScope === 'dc'
                      ? 'bg-[#10b981]/30 text-emerald-300 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  同DC
                </button>
                <button
                  onClick={() => setSourcingScope('world')}
                  className={`px-1.5 py-0.5 rounded transition-all whitespace-nowrap ${
                    sourcingScope === 'world'
                      ? 'bg-[#10b981]/30 text-emerald-300 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  自鯖
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#070a12] text-slate-100 overflow-hidden select-none">
      {/* 固定ヘッダーフィルターバー（画面切替タブ ＆ フィルター） */}
      <div className="px-2 pt-2 shrink-0">
        {renderFilterBar()}
      </div>

      {/* スワイプ可能な2画面カルーセル */}
      <SwipeContainer currentPage={currentPage} onPageChange={setCurrentPage} pageCount={2}>
        {/* ============================== */}
        {/* 🔨 PAGE 0: クラフト品目一覧 */}
        {/* ============================== */}
        <div className="flex flex-col h-full overflow-hidden px-2 pb-2 pt-1.5 gap-2">
          {/* 品目カード一覧スクロールエリア */}
          <div
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5 pb-8"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <i className="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-400 mb-2"></i>
                <span className="text-xs">クラフト原価と相場を計算中...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-900/40 rounded-xl border border-white/5 p-4 text-center">
                <i className="fa-solid fa-hammer text-3xl text-slate-600 mb-2"></i>
                <div className="text-xs font-bold text-slate-300">該当するクラフト品がありません</div>
                <div className="text-[0.68rem] text-slate-500 mt-1">
                  検索ワードやカテゴリ条件を緩めてみてください
                </div>
              </div>
            ) : (
              visibleItems.map((item) => {
                const isSelected = selectedItem?.item_id === item.item_id && selectedItem?.is_hq === item.is_hq;
                const jobBadge = getJobBadgeStyle(item.job, item.is_company);

                return (
                  <div
                    key={`${item.item_id}_${item.is_hq ? 'hq' : 'nq'}`}
                    onClick={() => handleSelectItem(item)}
                    className={`relative flex flex-col p-2 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                        : 'bg-slate-900/85 hover:bg-slate-850 border-white/10 hover:border-emerald-500/30'
                    }`}
                  >
                    {/* Header: アイコン + 品名 + HQ/ジョブ/ILv */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="relative w-[38px] h-[38px] rounded-lg bg-black/50 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                        {item.icon ? (
                          <img
                            src={item.icon}
                            alt={item.name}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <i className="fa-solid fa-box text-slate-600"></i>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span
                            className={`px-1.5 py-0.2 rounded border text-[0.6rem] font-bold shrink-0 ${jobBadge}`}
                          >
                            {item.is_company ? '⚓ カンパニークラフト' : `${item.job} Lv${item.lvl || 1}`}
                          </span>
                          <span className="text-[0.62rem] text-slate-400 font-mono">
                            IL{item.ilvl}
                          </span>
                          {item.amt > 1 && (
                            <span className="px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 text-[0.58rem] font-bold">
                              ×{item.amt}個完成
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[0.82rem] font-bold text-white truncate hover:text-emerald-300 transition-colors">
                            {item.name}
                          </span>
                          {item.is_hq && (
                            <span className="px-1.5 py-0.2 rounded bg-gradient-to-r from-amber-500/25 to-amber-600/35 text-amber-300 border border-amber-500/60 text-[0.62rem] font-black font-['Outfit'] shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.2)]">
                              HQ
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 粗利率バッジ */}
                      <div className="shrink-0 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[0.62rem] font-black font-mono border ${
                            item.profit_rate >= 50
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : item.profit_rate > 0
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          ROI {item.profit_rate > 0 ? `+${item.profit_rate}%` : `${item.profit_rate}%`}
                        </span>
                      </div>
                    </div>

                    {/* 4分割数値グリッド */}
                    <div className="grid grid-cols-4 gap-1 bg-black/40 p-1.5 rounded-lg border border-white/5 text-center">
                      <div className="flex flex-col">
                        <span className="text-[0.58rem] text-slate-400">想定日当利益</span>
                        <span
                          className={`text-[0.72rem] font-black font-mono truncate ${
                            item.daily_profit > 0 ? 'text-emerald-300' : 'text-slate-400'
                          }`}
                        >
                          {item.daily_profit.toLocaleString()}G
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[0.58rem] text-slate-400">純利益 (1個)</span>
                        <span
                          className={`text-[0.72rem] font-black font-mono truncate ${
                            item.profit > 0 ? 'text-cyan-300' : 'text-rose-400'
                          }`}
                        >
                          {item.profit.toLocaleString()}G
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[0.58rem] text-slate-400">目標仕入額</span>
                        <span className="text-[0.72rem] font-bold font-mono text-amber-300 truncate">
                          {item.craft_cost.toLocaleString()}G
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[0.58rem] text-slate-400">想定売価 (手残)</span>
                        <span className="text-[0.72rem] font-bold font-mono text-slate-200 truncate">
                          {item.sell_price.toLocaleString()}G
                        </span>
                      </div>
                    </div>

                    {/* 下部タップガイド */}
                    <div className="flex items-center justify-between mt-1 px-0.5 text-[0.62rem] text-slate-400">
                      <span>
                        日販数: <strong className="text-white font-mono">{item.daily_sales_qty}</strong> 個/日
                      </span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        製作手順を見る <i className="fa-solid fa-arrow-right text-[0.6rem]"></i>
                      </span>
                    </div>
                  </div>
                );
              })
            )}

            {/* スクロール追加読み込みインジケーター */}
            {visibleItems.length < filteredItems.length && (
              <div className="text-center py-2.5 text-[0.68rem] text-slate-500 font-mono flex items-center justify-center gap-1.5">
                <i className="fa-solid fa-angles-down text-slate-600 text-[0.6rem]"></i>
                <span>
                  表示中: <strong className="text-slate-300">{visibleItems.length}</strong> / {filteredItems.length} 件 (スクロールで追加読み込み)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ============================== */}
        {/* 🛒 PAGE 1: 製作工程 / 調達リスト */}
        {/* ============================== */}
        <div className="flex flex-col h-full overflow-hidden px-2 pb-2 pt-1.5 gap-2">
          {!selectedItem ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center">
              <i className="fa-solid fa-hammer text-4xl text-slate-600 mb-3"></i>
              <div className="text-sm font-bold text-slate-300">品目が選択されていません</div>
              <div className="text-xs text-slate-500 mt-1 mb-4">
                「品目一覧」画面から製作したいアイテムを選択してください
              </div>
              <button
                onClick={() => setCurrentPage(0)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-colors flex items-center gap-2"
              >
                <i className="fa-solid fa-arrow-left"></i>
                品目一覧に戻る
              </button>
            </div>
          ) : (
            <>
              {/* 選択品目サマリーカード（カードタップで市場の履歴タブへ遷移） */}
              <div
                onClick={() => onNavigateToMarket?.(selectedItem.item_id, selectedItem.is_hq, {
                  neededCount: craftCount * selectedItem.amt,
                  targetPrice: selectedItem.craft_cost,
                  isMaterial: false,
                })}
                className="bg-slate-900/95 p-2.5 rounded-xl border border-emerald-500/30 hover:border-[#00d2ff]/50 shadow-lg shrink-0 transition-all cursor-pointer group select-none"
                title="タップして市場の相場・履歴を見る"
              >
                {isHeaderCollapsed ? (
                  /* 畳んだ状態（1行バー） */
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {selectedItem.icon ? (
                        <img
                          src={selectedItem.icon}
                          alt={selectedItem.name}
                          className="w-5 h-5 rounded object-contain bg-black/50 border border-white/10 shrink-0"
                        />
                      ) : (
                        <i className="fa-solid fa-hammer text-slate-500 text-xs shrink-0"></i>
                      )}
                      <span className="text-xs font-black text-white truncate group-hover:text-[#00d2ff] transition-colors">
                        {selectedItem.name}
                      </span>
                      {selectedItem.is_hq && (
                        <span className="px-1 py-0.2 rounded bg-gradient-to-r from-amber-500/25 to-amber-600/35 text-amber-300 border border-amber-500/60 text-[0.55rem] font-black font-['Outfit'] shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.2)]">
                          HQ
                        </span>
                      )}
                      <span className="text-[0.62rem] text-emerald-400 font-mono font-bold shrink-0">
                        完成数: {craftCount * selectedItem.amt}個
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsHeaderCollapsed(false);
                        }}
                        className="w-6 h-6 rounded-lg bg-black/40 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center shrink-0 transition-colors"
                        title="カードを展開する"
                      >
                        <i className="fa-solid fa-chevron-down text-xs"></i>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 展開状態 */
                  <div className="flex items-start gap-2.5">
                    <div className="relative w-11 h-11 rounded-lg bg-black/60 border border-white/10 group-hover:border-[#00d2ff]/50 shrink-0 overflow-hidden flex items-center justify-center transition-colors">
                      {selectedItem.icon ? (
                        <img
                          src={selectedItem.icon}
                          alt={selectedItem.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <i className="fa-solid fa-hammer text-slate-500 text-lg"></i>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`px-1.5 py-0.2 rounded border text-[0.6rem] font-bold shrink-0 ${getJobBadgeStyle(
                              selectedItem.job,
                              selectedItem.is_company
                            )}`}
                          >
                            {selectedItem.is_company ? '⚓ カンパニークラフト' : `${selectedItem.job} Lv${selectedItem.lvl || 1}`}
                          </span>
                          <span className="text-[0.62rem] text-slate-400 font-mono">
                            IL{selectedItem.ilvl}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsHeaderCollapsed(true);
                            }}
                            className="w-6 h-6 rounded-lg bg-black/40 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center shrink-0 transition-colors"
                            title="カードを畳む"
                          >
                            <i className="fa-solid fa-chevron-up text-xs"></i>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 min-w-0 mb-1">
                        <span className="text-sm font-black text-white truncate group-hover:text-[#00d2ff] transition-colors">
                          {selectedItem.name}
                        </span>
                        {selectedItem.is_hq && (
                          <span className="px-1.5 py-0.2 rounded bg-gradient-to-r from-amber-500/25 to-amber-600/35 text-amber-300 border border-amber-500/60 text-[0.62rem] font-black font-['Outfit'] shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.2)]">
                            HQ
                          </span>
                        )}
                      </div>

                      {/* 原価 / 売価 行 */}
                      <div className="flex items-center justify-between text-[0.68rem] text-slate-400 pt-1 border-t border-white/5">
                        <div className="min-w-0">
                          目標仕入額: <span className="text-amber-300 font-bold font-mono">{totalCraftCost.toLocaleString()}G</span>
                        </div>
                        <div className="min-w-0 text-right">
                          想定売価: <span className="text-slate-200 font-bold font-mono">{totalSellPrice.toLocaleString()}G</span>
                        </div>
                      </div>

                      {/* 製作回数ステッパー ＆ 想定利益 行 */}
                      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/5 text-[0.68rem]">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 shrink-0"
                        >
                          <span className="text-[0.65rem] text-slate-300 font-bold">製作回数:</span>
                          <div className="flex items-center bg-slate-950 border border-white/10 rounded-lg overflow-hidden h-6">
                            <button
                              onClick={() => setCraftCount((c) => Math.max(1, c - 1))}
                              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors font-bold text-xs"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max="999"
                              value={craftCount}
                              onChange={(e) => setCraftCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="w-8 text-center bg-transparent text-white font-mono font-black text-[0.72rem] focus:outline-none"
                            />
                            <button
                              onClick={() => setCraftCount((c) => c + 1)}
                              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors font-bold text-xs"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[0.62rem] text-cyan-400 font-bold font-mono">
                            ({craftCount * selectedItem.amt}個)
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-slate-400 text-[0.65rem]">想定利益: </span>
                          <span
                            className={`font-black font-mono text-[0.75rem] ${
                              totalCraftProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {totalCraftProfit >= 0 ? `+${totalCraftProfit.toLocaleString()}` : totalCraftProfit.toLocaleString()}G
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 画面内タブ切り替え: [中間素材・製作工程] vs [調達買い物リスト] */}
              <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shrink-0 gap-1 text-xs">
                <button
                  onClick={() => setDetailTab('steps')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    detailTab === 'steps'
                      ? 'bg-gradient-to-r from-[#10b981]/25 to-[#059669]/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <i className="fa-solid fa-sitemap text-[0.7rem]"></i>
                  <span>製作工程・中間素材</span>
                  {intermediateCraftSteps.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 text-[0.6rem] font-mono">
                      {intermediateCraftSteps.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setDetailTab('shopping')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    detailTab === 'shopping'
                      ? 'bg-gradient-to-r from-[#10b981]/25 to-[#059669]/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <i className="fa-solid fa-cart-flatbed text-[0.7rem]"></i>
                  <span>調達買い物リスト</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[0.6rem] font-mono">
                    {procurementList.length}
                  </span>
                </button>
              </div>

              {/* サブヘッダー: 操作ボタン */}
              <div className="flex items-center justify-between px-1 text-xs shrink-0">
                <div className="font-bold text-slate-300 flex items-center gap-1.5">
                  {detailTab === 'steps' ? (
                    <>
                      <i className="fa-solid fa-diagram-project text-emerald-400"></i>
                      <span>中間素材の自作と必要素材</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-list-check text-emerald-400"></i>
                      <span>末端素材の調達リスト</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {detailTab === 'shopping' && (
                    <button
                      onClick={clearPurchased}
                      className="text-[0.65rem] text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      チェック解除
                    </button>
                  )}
                  <button
                    onClick={handleCopyList}
                    className="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 rounded-md text-emerald-300 text-[0.68rem] font-bold flex items-center gap-1 transition-colors"
                  >
                    <i className="fa-solid fa-copy text-[0.65rem]"></i>
                    <span>{copiedNotification ? 'コピー完了!' : 'リストコピー'}</span>
                  </button>
                </div>
              </div>

              {/* ============================================================== */}
              {/* TAB 1: 製作工程・中間素材 (見出し: 完成物 / 小見出し: 必要素材) */}
              {/* ============================================================== */}
              {detailTab === 'steps' ? (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5 pb-20">
                  {/* 自作中間素材一覧 */}
                  {intermediateCraftSteps.length === 0 ? (
                    <div className="p-4 bg-slate-900/60 rounded-xl border border-white/10 text-center">
                      <div className="text-xs font-bold text-emerald-400 mb-1 flex items-center justify-center gap-1.5">
                        <i className="fa-solid fa-circle-check text-sm"></i>
                        <span>中間素材の自作工程はありません</span>
                      </div>
                      <div className="text-[0.68rem] text-slate-400 leading-relaxed">
                        すべての素材をマーケットまたは店売りから直接購入して完成品を製作するのが最も安価です。
                      </div>
                    </div>
                  ) : (
                    intermediateCraftSteps.map((step, idx) => (
                      <div
                        key={step.itemId}
                        className="bg-slate-900/90 rounded-xl border border-emerald-500/30 overflow-hidden shadow-lg"
                      >
                        {/* 見出し: 完成物 (自作中間素材) 情報 */}
                        <div className="p-2.5 bg-gradient-to-r from-emerald-950/70 to-slate-900/90 border-b border-emerald-500/20">
                          <div className="flex items-start justify-between gap-2">
                            <div
                              onClick={() => onNavigateToMarket?.(step.itemId, false, {
                                neededCount: step.totalNeeded,
                                targetPrice: step.unitCost > 0 ? step.unitCost : step.marketPrice,
                                isMaterial: true,
                              })}
                              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
                              title="市場で相場・履歴を見る"
                            >
                              <span className="w-5 h-5 rounded-full bg-emerald-500/25 text-emerald-300 font-black text-[0.65rem] flex items-center justify-center border border-emerald-500/40 shrink-0">
                                {idx + 1}
                              </span>
                              <div className="w-9 h-9 rounded-lg bg-black/60 border border-white/10 group-hover:border-[#00d2ff]/50 overflow-hidden shrink-0 flex items-center justify-center transition-colors">
                                {step.icon ? (
                                  <img src={step.icon} alt={step.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                                ) : (
                                  <i className="fa-solid fa-cubes text-slate-600 text-xs"></i>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-black text-white truncate group-hover:text-[#00d2ff] transition-colors">{step.name}</span>
                                  {step.is_company ? (
                                    <span className="px-1 py-0.2 rounded border text-[0.55rem] font-bold bg-indigo-950/80 text-indigo-300 border-indigo-500/50 shadow-[0_0_8px_rgba(99,102,241,0.25)]">
                                      ⚓ カンパニークラフト
                                    </span>
                                  ) : step.job ? (
                                    <span className={`px-1 py-0.2 rounded border text-[0.55rem] font-bold ${getJobBadgeStyle(step.job)}`}>
                                      {step.job} Lv{step.lvl || 1}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[0.65rem] text-slate-300 mt-0.5">
                                  必要数: <strong className="text-white font-mono text-[0.72rem]">{step.totalNeeded}個</strong>
                                  <span className="text-emerald-300 font-mono ml-1.5 font-bold">
                                    ({step.craftBatches}回製作 → {step.totalYield}個完成)
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 自作節約額バッジ ＆ 市場ボタン */}
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <button
                                onClick={() => onNavigateToMarket?.(step.itemId, false, {
                                  neededCount: step.totalNeeded,
                                  targetPrice: step.unitCost > 0 ? step.unitCost : step.marketPrice,
                                  isMaterial: true,
                                })}
                                className="px-1.5 py-0.5 rounded bg-[#00d2ff]/20 hover:bg-[#00d2ff]/30 text-[#00d2ff] border border-[#00d2ff]/40 text-[0.58rem] font-bold flex items-center gap-1 transition-colors"
                                title="市場で相場・履歴を見る"
                              >
                                <i className="fa-solid fa-chart-line text-[0.52rem]"></i>
                                <span>相場</span>
                              </button>
                              {step.savingsTotal > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[0.62rem] font-black font-mono shadow-sm">
                                  自作で +{step.savingsTotal.toLocaleString()}G 得
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[0.62rem] font-mono">
                                  自作原価: @{step.unitCost.toLocaleString()}G/個
                                </span>
                              )}
                              <div className="text-[0.58rem] text-slate-400 font-mono">
                                マケボ相場: @{step.marketPrice.toLocaleString()}G/個
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 小見出し: その中間素材の必要材料 */}
                        <div className="p-2 space-y-1 bg-black/25">
                          <div className="text-[0.62rem] text-emerald-400/90 font-bold px-1 mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <i className="fa-solid fa-angles-right text-[0.55rem]"></i>
                              <span>材料リスト ({step.materials.length}種) <span className="text-[0.55rem] text-slate-500 font-normal">※タップで市場確認</span></span>
                            </span>
                            <span className="text-slate-400 font-mono text-[0.58rem]">
                              1回分 × {step.craftBatches}回製作
                            </span>
                          </div>

                          {step.materials.map((mat) => {
                            const isShop = mat.method === 'buy_npc';
                            const isCraft = mat.method === 'craft';
                            return (
                              <div
                                key={mat.itemId}
                                onClick={() => onNavigateToMarket?.(mat.itemId, false, {
                                  neededCount: mat.amount,
                                  targetPrice: mat.unitPrice,
                                  isMaterial: true,
                                })}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950/70 hover:bg-slate-900 border border-white/5 hover:border-[#00d2ff]/40 text-xs cursor-pointer transition-all group"
                                title="タップして市場の相場・履歴を見る"
                              >
                                <div className="w-7 h-7 rounded-lg bg-black/50 border border-white/10 group-hover:border-[#00d2ff]/40 shrink-0 overflow-hidden flex items-center justify-center transition-colors">
                                  {mat.icon ? (
                                    <img src={mat.icon} alt={mat.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                                  ) : (
                                    <i className="fa-solid fa-cubes text-slate-600 text-xs"></i>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-white text-[0.72rem] truncate group-hover:text-[#00d2ff] transition-colors flex items-center gap-1">
                                    <span>{mat.name}</span>
                                    <i className="fa-solid fa-arrow-up-right-from-square text-[0.55rem] text-slate-500 group-hover:text-[#00d2ff] transition-colors"></i>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[0.58rem] mt-0.5">
                                    {isShop ? (
                                      <span className="px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/40 font-bold">
                                        店売り
                                      </span>
                                    ) : isCraft ? (
                                      <span className="px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold">
                                        中間素材自作
                                      </span>
                                    ) : (
                                      <span className="px-1 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-500/40 font-bold">
                                        {mat.world || 'マケボ最安'}
                                      </span>
                                    )}
                                    <span className="text-slate-400 font-mono">
                                      単価: @{mat.unitPrice.toLocaleString()}G
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0 flex items-center gap-1">
                                  <div>
                                    <span className="text-xs font-black font-mono text-emerald-400">
                                      ×{mat.amount}個
                                    </span>
                                    <div className="text-[0.62rem] font-mono text-slate-300">
                                      小計: {(mat.unitPrice * mat.amount).toLocaleString()}G
                                    </div>
                                  </div>
                                  <i className="fa-solid fa-chevron-right text-[0.55rem] text-slate-600 group-hover:text-[#00d2ff] ml-0.5 transition-colors"></i>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}

                  {/* 最終製作品の組み立て工程 */}
                  <div className="bg-slate-900/90 rounded-xl border border-sky-500/30 overflow-hidden shadow-lg">
                    <div className="p-2.5 bg-gradient-to-r from-sky-950/70 to-slate-900/90 border-b border-sky-500/20">
                      <div className="flex items-center justify-between gap-2">
                        <div
                          onClick={() => onNavigateToMarket?.(selectedItem.item_id, selectedItem.is_hq, {
                            neededCount: craftCount * selectedItem.amt,
                            targetPrice: selectedItem.craft_cost,
                            isMaterial: false,
                          })}
                          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
                          title="市場で相場・履歴を見る"
                        >
                          <span className="w-5 h-5 rounded-full bg-sky-500/25 text-sky-300 font-black text-[0.65rem] flex items-center justify-center border border-sky-500/40 shrink-0">
                            <i className="fa-solid fa-flag-checkered text-[0.55rem]"></i>
                          </span>
                          <div className="w-9 h-9 rounded-lg bg-black/60 border border-white/10 group-hover:border-[#00d2ff]/50 overflow-hidden shrink-0 flex items-center justify-center transition-colors">
                            <img src={selectedItem.icon} alt={selectedItem.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-white flex items-center gap-1.5">
                              <span className="truncate group-hover:text-[#00d2ff] transition-colors">最終工程: {selectedItem.name}</span>
                              {selectedItem.is_hq && (
                                <span className="px-1.5 py-0.2 rounded bg-gradient-to-r from-amber-500/25 to-amber-600/35 text-amber-300 border border-amber-500/60 text-[0.6rem] font-black font-['Outfit'] shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.2)]">
                                  HQ
                                </span>
                              )}
                              <i className="fa-solid fa-arrow-up-right-from-square text-[0.55rem] text-slate-500 group-hover:text-[#00d2ff] transition-colors"></i>
                            </div>
                            <div className="text-[0.65rem] text-slate-300 mt-0.5">
                              完成個数: <strong className="text-white font-mono text-[0.72rem]">{craftCount * selectedItem.amt}個</strong>
                              <span className="text-sky-300 font-mono ml-1.5 font-bold">({craftCount}回製作)</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => onNavigateToMarket?.(selectedItem.item_id, selectedItem.is_hq, {
                            neededCount: craftCount * selectedItem.amt,
                            targetPrice: selectedItem.craft_cost,
                            isMaterial: false,
                          })}
                          className="px-1.5 py-0.5 rounded bg-[#00d2ff]/20 hover:bg-[#00d2ff]/30 text-[#00d2ff] border border-[#00d2ff]/40 text-[0.58rem] font-bold flex items-center gap-1 shrink-0 transition-colors"
                          title="市場で相場・履歴を見る"
                        >
                          <i className="fa-solid fa-chart-line text-[0.52rem]"></i>
                          <span>相場</span>
                        </button>
                      </div>
                    </div>

                    {/* 投入材料 */}
                    <div className="p-2 space-y-1 bg-black/25">
                      <div className="text-[0.62rem] text-sky-400/90 font-bold px-1 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <i className="fa-solid fa-angles-right text-[0.55rem]"></i>
                          <span>直接投入する材料・中間素材 ({finalAssemblyMaterials.length}種)</span>
                        </span>
                        <span className="text-slate-500 text-[0.55rem]">※タップで市場確認</span>
                      </div>

                      {finalAssemblyMaterials.map((mat) => {
                        const isCraft = mat.method === 'craft';
                        const isShop = mat.method === 'buy_npc';
                        return (
                          <div
                            key={mat.itemId}
                            onClick={() => onNavigateToMarket?.(mat.itemId, false, {
                              neededCount: mat.amount,
                              targetPrice: mat.unitPrice,
                              isMaterial: true,
                            })}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950/70 hover:bg-slate-900 border border-white/5 hover:border-[#00d2ff]/40 text-xs cursor-pointer transition-all group"
                            title="タップして市場の相場・履歴を見る"
                          >
                            <div className="w-7 h-7 rounded-lg bg-black/50 border border-white/10 group-hover:border-[#00d2ff]/40 shrink-0 overflow-hidden flex items-center justify-center transition-colors">
                              {mat.icon ? (
                                <img src={mat.icon} alt={mat.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                              ) : (
                                <i className="fa-solid fa-cubes text-slate-600 text-xs"></i>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-white text-[0.72rem] truncate group-hover:text-[#00d2ff] transition-colors flex items-center gap-1">
                                <span>{mat.name}</span>
                                <i className="fa-solid fa-arrow-up-right-from-square text-[0.55rem] text-slate-500 group-hover:text-[#00d2ff] transition-colors"></i>
                              </div>
                              <div className="flex items-center gap-1.5 text-[0.58rem] mt-0.5">
                                {isCraft ? (
                                  <span className="px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold">
                                    自作した中間素材
                                  </span>
                                ) : isShop ? (
                                  <span className="px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/40 font-bold">
                                    店売り
                                  </span>
                                ) : (
                                  <span className="px-1 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-500/40 font-bold">
                                    {mat.world || 'マケボ'}
                                  </span>
                                )}
                                <span className="text-slate-400 font-mono">
                                  単価: @{mat.unitPrice.toLocaleString()}G
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0 flex items-center gap-1">
                              <div>
                                <span className="text-xs font-black font-mono text-emerald-400">
                                  ×{mat.amount}個
                                </span>
                                <div className="text-[0.62rem] font-mono text-slate-300">
                                  小計: {(mat.unitPrice * mat.amount).toLocaleString()}G
                                </div>
                              </div>
                              <i className="fa-solid fa-chevron-right text-[0.55rem] text-slate-600 group-hover:text-[#00d2ff] ml-0.5 transition-colors"></i>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* ============================================================== */
                /* TAB 2: 調達買い物リスト (末端素材の一括チェックリスト) */
                /* ============================================================== */
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5 pb-20">
                  {procurementList.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      調達素材の計算がありません
                    </div>
                  ) : (
                    procurementList.map((ing) => {
                      const needed = ing.amount;
                      const purchased = purchasedMap[ing.id] || 0;
                      const isCompleted = purchased >= needed;
                      const itemTotal = ing.unitPrice * needed;
                      const isShop = ing.method === 'buy_npc';
                      const isCrystal = ing.category === 'crystal' || isCrystalItem(ing.name);

                      return (
                        <div
                          key={ing.id}
                          onClick={() => {
                            const remaining = Math.max(0, ing.amount - (purchasedMap[ing.id] || 0));
                            onNavigateToMarket?.(ing.id, false, {
                              neededCount: remaining > 0 ? remaining : ing.amount,
                              targetPrice: ing.unitPrice,
                              isMaterial: true,
                            });
                          }}
                          className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer group ${
                            isCompleted
                              ? 'bg-slate-950/40 border-white/5 opacity-50'
                              : 'bg-slate-900/80 hover:bg-slate-850 border-white/10 hover:border-[#00d2ff]/40'
                          }`}
                          title="タップして市場の相場・履歴を見る"
                        >
                          {/* チェックボックス */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePurchased(ing.id, needed);
                            }}
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                              isCompleted
                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                : 'bg-black/40 border-white/20 text-transparent hover:border-emerald-400'
                            }`}
                          >
                            <i className="fa-solid fa-check text-xs"></i>
                          </button>

                          {/* 素材アイコン */}
                          <div className="w-8 h-8 rounded-lg bg-black/50 border border-white/10 group-hover:border-[#00d2ff]/40 shrink-0 overflow-hidden flex items-center justify-center transition-colors">
                            {ing.icon ? (
                              <img src={ing.icon} alt={ing.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                            ) : (
                              <i className="fa-solid fa-cubes text-slate-500 text-xs"></i>
                            )}
                          </div>

                          {/* 素材名 ＆ 調達元バッジ */}
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-xs font-bold truncate group-hover:text-[#00d2ff] transition-colors flex items-center gap-1 ${
                                isCompleted ? 'line-through text-slate-500' : 'text-white'
                              }`}
                            >
                              <span>{ing.name}</span>
                              <i className="fa-solid fa-arrow-up-right-from-square text-[0.55rem] text-slate-500 group-hover:text-[#00d2ff] transition-colors"></i>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {isShop ? (
                                <span className="px-1 py-0.2 rounded bg-amber-950/70 text-amber-300 border border-amber-500/40 text-[0.55rem] font-bold">
                                  店売り
                                </span>
                              ) : (
                                <span className="px-1 py-0.2 rounded bg-sky-950/70 text-sky-300 border border-sky-500/40 text-[0.55rem] font-bold">
                                  {ing.world || '最安相場'}
                                </span>
                              )}
                              {isCrystal && (
                                <span className="px-1 py-0.2 rounded bg-purple-950/70 text-purple-300 border border-purple-500/40 text-[0.55rem] font-bold">
                                  触媒
                                </span>
                              )}
                              <span className="text-[0.62rem] text-slate-400 font-mono">
                                目標単価: @{ing.unitPrice.toLocaleString()}G
                              </span>
                            </div>
                          </div>

                          {/* 必要数 ＆ 小計 */}
                          <div className="text-right shrink-0 flex items-center gap-1">
                            <div>
                              <div className="text-xs font-black font-mono text-emerald-400">
                                ×{needed}個
                              </div>
                              <div className="text-[0.65rem] font-bold font-mono text-slate-300">
                                目標仕入額: {itemTotal.toLocaleString()}G
                              </div>
                            </div>
                            <i className="fa-solid fa-chevron-right text-[0.55rem] text-slate-600 group-hover:text-[#00d2ff] ml-0.5 transition-colors"></i>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* 下部固定サマリーバー (Page 1 のみ表示) */}
              {currentPage === 1 && (
                <div className="fixed bottom-0 left-0 right-0 p-2.5 bg-[#0b1120]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-between z-30 shadow-2xl">
                  <div className="flex flex-col">
                    <div className="text-[0.62rem] text-slate-400">
                      目標仕入総額: <span className="font-bold font-mono text-slate-200">{totalProcurementCost.toLocaleString()}G</span>
                    </div>
                    <div className="text-xs font-black">
                      残り仕入額: <span className="text-emerald-400 font-mono">{remainingProcurementCost.toLocaleString()}G</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyList}
                      className="px-3 py-1.5 bg-[#10b981] hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-colors"
                    >
                      <i className="fa-solid fa-copy"></i>
                      <span>{copiedNotification ? 'コピー済' : detailTab === 'steps' ? '工程コピー' : '調達コピー'}</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SwipeContainer>
    </div>
  );
});
