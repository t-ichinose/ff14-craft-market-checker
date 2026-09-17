import type { RecipesMap } from '../../services/recipeDataService';
import type { RawListingTuple } from '../../services/marketDataService';
import { JAPAN_DCS } from '../../constants/japanDcs';
import { extractCleanMinListing } from '../arbitrage/arbitrageUtils';
import type {
  RecipeTreeItem,
  MarketDataPayload,
  MarketItemPayload,
  CraftCardItem,
  CanvasNode,
  CanvasEdge,
  ProcurementItem,
  SourcingScope,
} from './craftTypes';

/**
 * クリスタル・触媒判定
 */
export const isCrystalItem = (name: string): boolean =>
  name.includes('シャード') || name.includes('クリスタル') || name.includes('クラスター');

/**
 * クラフタージョブごとのバッジスタイル
 */
export const getJobBadgeStyle = (job: string, isCompany = false): string => {
  if (isCompany) {
    return 'bg-indigo-950/80 text-indigo-300 border-indigo-500/50 shadow-[0_0_8px_rgba(99,102,241,0.25)]';
  }
  if (job.includes('木工')) return 'bg-amber-900/60 text-amber-300 border-amber-500/40';
  if (job.includes('鍛冶')) return 'bg-slate-700/80 text-orange-300 border-orange-500/40';
  if (job.includes('甲冑')) return 'bg-zinc-800/80 text-slate-200 border-slate-400/40';
  if (job.includes('彫金')) return 'bg-yellow-950/70 text-yellow-300 border-yellow-500/40';
  if (job.includes('革細')) return 'bg-orange-950/70 text-amber-400 border-amber-600/40';
  if (job.includes('裁縫')) return 'bg-cyan-950/70 text-cyan-300 border-cyan-500/40';
  if (job.includes('錬金')) return 'bg-purple-950/70 text-purple-300 border-purple-500/40';
  if (job.includes('調理')) return 'bg-rose-950/70 text-rose-300 border-rose-500/40';
  if (job.includes('全職')) return 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40';
  return 'bg-slate-800 text-slate-300 border-slate-600/40';
};

/**
 * サブツリー全体の isActive 状態を再帰的に更新するヘルパー
 */
export function applyCraftActiveState(tree: RecipeTreeItem[], isActive: boolean): RecipeTreeItem[] {
  return tree.map((node) => ({
    ...node,
    isActive,
    subs: node.subs ? applyCraftActiveState(node.subs, isActive) : undefined,
  }));
}

/**
 * レシピ再帰ツリー展開・自作 vs 購入の原価最適化判定
 */
export function resolveFullTreeForScope(
  itemId: number,
  recipesMap: RecipesMap,
  marketData: MarketDataPayload,
  materialPriceMap: Map<number, { price: number; world: string }>,
  sourcingScope: SourcingScope,
  salesScopeName: string,
  targetDc: string,
  isParentActive = true,
  depth = 0,
  parentYield = 1,
  materialHqPriceMap?: Map<number, { price: number; world: string }>,
  qualityMap?: Record<number, 'nq' | 'hq'>,
  selfSufficientMap?: Record<number, boolean>
): RecipeTreeItem[] {
  const rec = recipesMap[itemId.toString()];
  if (!rec || !rec.ings || rec.ings.length === 0) return [];

  const safeParentYield = Math.max(1, parentYield || 1);

  return rec.ings.map(([ingId, rawAmt]) => {
    const amt = Math.max(1, rawAmt || 1);
    const idStr = ingId.toString();
    const meta = marketData.items[idStr] || { name: '', icon: '', shop_price: 0, category: '' };

    // 多重フォールバック (カタログ未展開時でもmarketData.dataから名前とアイコンを救出)
    let fallbackName = '';
    let fallbackIcon = '';
    if (!meta.name || !meta.icon) {
      for (const wList of Object.values(marketData.data || {})) {
        const foundIt = wList.find((x) => x.item_id === ingId);
        if (foundIt) {
          fallbackName = foundIt.item_name;
          fallbackIcon = foundIt.icon_url;
          break;
        }
      }
    }

    const name = meta.name || fallbackName || `Item #${ingId}`;
    const icon = meta.icon || fallbackIcon || 'https://xivapi.com/i/000000/000000.png';
    const shopPrice = meta.price_mid || meta.shop_price || 0;

    // NQ相場
    const pInfo = materialPriceMap.get(ingId);
    const nqMarketPrice = pInfo ? pInfo.price : 0;
    const nqCheapWorld = pInfo ? pInfo.world : '不明';

    // HQ相場
    const hqInfo = materialHqPriceMap ? materialHqPriceMap.get(ingId) : undefined;
    const hqMarketPrice = hqInfo ? hqInfo.price : 0;
    const hqCheapWorld = hqInfo ? hqInfo.world : '不明';

    // HQが存在するか (クリスタル除外、かつHQ相場データがあるか、またはサブレシピで作れる中間素材)
    const isCrystal = isCrystalItem(name);
    const hasSubRecipe = !!recipesMap[idStr] && depth < 3;
    const hasHqOption = !isCrystal && (hqMarketPrice > 0 || hasSubRecipe);

    // 指定された品質 (デフォルト: 'nq')
    const currentQuality: 'nq' | 'hq' = (hasHqOption && qualityMap?.[ingId] === 'hq') ? 'hq' : 'nq';

    // 品質に応じた実効相場と仕入れワールド
    const effectiveMarketPrice = currentQuality === 'hq'
      ? (hqMarketPrice > 0 ? hqMarketPrice : nqMarketPrice)
      : nqMarketPrice;
    const effectiveWorld = currentQuality === 'hq'
      ? (hqMarketPrice > 0 ? hqCheapWorld : nqCheapWorld)
      : nqCheapWorld;

    // 自給自足 (0G) 判定
    const isSelfSufficient = !!selfSufficientMap?.[ingId];

    if (isSelfSufficient) {
      return {
        id: ingId,
        name,
        icon,
        cost: 0,
        marketPrice: effectiveMarketPrice,
        method: 'self_sufficient',
        world: '自給 (0G)',
        amount: amt,
        isActive: isParentActive,
        savings: effectiveMarketPrice * amt,
        parentYield: safeParentYield,
        effectiveCost: 0,
        quality: currentQuality,
        hasHqOption,
        isSelfSufficient: true,
      };
    }

    const effectiveCost =
      safeParentYield > 1 ? Math.round((shopPrice * amt) / safeParentYield) : shopPrice * amt;

    // NPC店売りが最安の場合 (※NPCはNQのみ販売のため、HQ指定時はNPC店売り不可)
    if (currentQuality === 'nq' && shopPrice > 0 && (effectiveMarketPrice === 0 || shopPrice <= effectiveMarketPrice)) {
      return {
        id: ingId,
        name,
        icon,
        cost: shopPrice,
        marketPrice: shopPrice,
        method: 'buy_npc',
        world: 'NPC店売り',
        amount: amt,
        isActive: isParentActive,
        parentYield: safeParentYield,
        effectiveCost,
        quality: 'nq',
        hasHqOption,
        isSelfSufficient: false,
      };
    }

    if (hasSubRecipe) {
      const subRec = recipesMap[idStr];
      const subYield = Math.max(1, subRec?.amt || 1);
      const tempSubTree = resolveFullTreeForScope(
        ingId,
        recipesMap,
        marketData,
        materialPriceMap,
        sourcingScope,
        salesScopeName,
        targetDc,
        true,
        depth + 1,
        subYield,
        materialHqPriceMap,
        qualityMap,
        selfSufficientMap
      );
      const subCraftCostTotal = tempSubTree
        .filter((t) => t.isActive)
        .reduce((sum, sub) => sum + sub.cost * sub.amount, 0);
      const unitCraftCost = Math.round(subCraftCostTotal / subYield);

      const shouldCraft = isParentActive && (effectiveMarketPrice === 0 || unitCraftCost < effectiveMarketPrice);

      // 2回目の重い再帰呼び出しを撤廃！shouldCraftがfalseの場合はisActiveをfalseに更新
      const finalSubTree = shouldCraft
        ? tempSubTree
        : applyCraftActiveState(tempSubTree, false);

      if (shouldCraft) {
        return {
          id: ingId,
          name,
          icon,
          cost: unitCraftCost,
          marketPrice: effectiveMarketPrice,
          method: 'craft',
          world: '自作',
          amount: amt,
          isActive: isParentActive,
          savings: effectiveMarketPrice > 0 ? effectiveMarketPrice - unitCraftCost : 0,
          yieldAmt: subYield,
          batchCost: subCraftCostTotal,
          parentYield: safeParentYield,
          effectiveCost:
            safeParentYield > 1 ? Math.round((unitCraftCost * amt) / safeParentYield) : unitCraftCost * amt,
          quality: currentQuality,
          hasHqOption,
          subs: finalSubTree,
        };
      } else {
        return {
          id: ingId,
          name,
          icon,
          cost: effectiveMarketPrice,
          marketPrice: effectiveMarketPrice,
          method: 'buy_market',
          world: effectiveWorld,
          amount: amt,
          isActive: isParentActive,
          savings: unitCraftCost > 0 ? unitCraftCost - effectiveMarketPrice : 0,
          parentYield: safeParentYield,
          effectiveCost:
            safeParentYield > 1 ? Math.round((effectiveMarketPrice * amt) / safeParentYield) : effectiveMarketPrice * amt,
          quality: currentQuality,
          hasHqOption,
          subs: finalSubTree,
        };
      }
    }

    return {
      id: ingId,
      name,
      icon,
      cost: effectiveMarketPrice,
      marketPrice: effectiveMarketPrice,
      method: 'buy_market',
      world: effectiveWorld,
      amount: amt,
      isActive: isParentActive,
      parentYield: safeParentYield,
      effectiveCost:
        safeParentYield > 1 ? Math.round((effectiveMarketPrice * amt) / safeParentYield) : effectiveMarketPrice * amt,
      quality: currentQuality,
      hasHqOption,
    };
  });
}

/**
 * 樹形図キャンバス用のノード・エッジ座標レイアウト計算 (決定論的IDでReact reconciliationを正常化)
 */
export function calculateTreeLayout(
  selectedItem: CraftCardItem,
  tree: RecipeTreeItem[]
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const CARD_WIDTH = 350;
  const CARD_HEIGHT = 96;
  const GAP_X = 60;
  const GAP_Y = 16;

  const rootHeight = selectedItem.amt > 1 ? 116 : 96;

  const rootNode: CanvasNode = {
    id: `root-${selectedItem.item_id}`,
    type: 'root',
    x: 40,
    y: 0,
    width: CARD_WIDTH,
    height: rootHeight,
    data: selectedItem,
    isActive: true,
  };

  function computeSubtreeHeight(item: RecipeTreeItem): number {
    if (item.subs && item.subs.length > 0) {
      const childrenHeight = item.subs.reduce(
        (sum, sub) => sum + computeSubtreeHeight(sub) + GAP_Y,
        -GAP_Y
      );
      return Math.max(CARD_HEIGHT, childrenHeight);
    }
    return CARD_HEIGHT;
  }

  function layoutItem(
    item: RecipeTreeItem,
    parentId: string,
    parentRightX: number,
    parentCenterY: number,
    depth: number,
    multiplier: number,
    startY: number,
    childIndex: number
  ): number {
    // 決定論的ID: parentId, item.id, depth, childIndex から一意に生成
    const nodeId = `node-${parentId}-${item.id}-${depth}-${childIndex}`;
    const x = 40 + depth * (CARD_WIDTH + GAP_X);
    const subHeight = computeSubtreeHeight(item);
    const y = startY + (subHeight - CARD_HEIGHT) / 2;

    const node: CanvasNode = {
      id: nodeId,
      type: 'material',
      x,
      y,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      data: item,
      multiplier,
      isActive: item.isActive,
    };
    nodes.push(node);

    const isCrafted = item.method === 'craft';
    edges.push({
      id: `edge-${parentId}-${nodeId}`,
      fromId: parentId,
      toId: nodeId,
      startX: parentRightX,
      startY: parentCenterY,
      endX: x,
      endY: y + CARD_HEIGHT / 2,
      isCrafted,
      isActive: item.isActive,
    });

    if (item.subs && item.subs.length > 0) {
      const childMultiplier = item.amount * multiplier;
      let childY = startY;
      item.subs.forEach((subItem, idx) => {
        const h = computeSubtreeHeight(subItem);
        layoutItem(
          subItem,
          nodeId,
          x + CARD_WIDTH,
          y + CARD_HEIGHT / 2,
          depth + 1,
          childMultiplier,
          childY,
          idx
        );
        childY += h + GAP_Y;
      });
    }

    return subHeight;
  }

  let totalL1Height = 0;
  if (tree && tree.length > 0) {
    tree.forEach((l1Item) => {
      const h = computeSubtreeHeight(l1Item);
      totalL1Height += h + GAP_Y;
    });
    totalL1Height -= GAP_Y;
  }

  rootNode.y = Math.max(40, 40 + (totalL1Height - rootNode.height) / 2);
  nodes.push(rootNode);

  let currentLevel1Y = 40;
  if (tree && tree.length > 0) {
    tree.forEach((l1Item, idx) => {
      const h = computeSubtreeHeight(l1Item);
      layoutItem(
        l1Item,
        rootNode.id,
        rootNode.x + rootNode.width,
        rootNode.y + rootNode.height / 2,
        1,
        1,
        currentLevel1Y,
        idx
      );
      currentLevel1Y += h + GAP_Y;
    });
  }

  return { nodes, edges };
}

/**
 * 調達リスト（末端のマーケット・NPC・クリスタル素材）の一括集計
 */
export function aggregateProcurementItems(
  items: RecipeTreeItem[],
  multiplier: number
): ProcurementItem[] {
  const safeMult = Math.max(1, multiplier || 1);
  const map = new Map<number, ProcurementItem>();

  function traverse(nodes: RecipeTreeItem[], currentMult: number) {
    for (const node of nodes) {
      if (!node.isActive) continue;

      if (node.method === 'craft' && node.subs && node.subs.length > 0) {
        const needed = node.amount * currentMult;
        const yieldAmt = Math.max(1, node.yieldAmt || 1);
        const batches = Math.ceil(needed / yieldAmt);
        traverse(node.subs, batches);
      } else {
        const needed = node.amount * currentMult;
        const qKey = node.quality || 'nq';
        const existing = map.get(node.id);
        if (existing) {
          existing.amount += needed;
        } else {
          const cat: 'market' | 'npc' | 'crystal' = isCrystalItem(node.name || '')
            ? 'crystal'
            : node.method === 'buy_npc'
            ? 'npc'
            : 'market';
          const isSelf = !!node.isSelfSufficient;
          map.set(node.id, {
            id: node.id,
            name: node.name,
            icon: node.icon,
            unitPrice: isSelf ? 0 : node.cost,
            method: isSelf ? 'self_sufficient' : (node.method === 'buy_npc' ? 'buy_npc' : 'buy_market'),
            world: isSelf ? '自給 (0G)' : node.world,
            amount: needed,
            category: cat,
            quality: qKey,
            hasHqOption: node.hasHqOption,
            isSelfSufficient: isSelf,
          });
        }
      }
    }
  }

  traverse(items, safeMult);
  return Array.from(map.values());
}

/**
 * アイテムの販売履歴から中央値（または平均値）を算出（捨て値・桁ミスを排除）
 */
export function getRobustItemPrice(it?: {
  history?: { price?: number }[];
  region_median_price?: number;
  avg_price?: number;
  min_price?: number;
}): number {
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
}

/**
 * 出品データが存在する場合はクリーンな出品最安値を優先、なければ履歴相場にフォールバック
 */
export function getMaterialPrice(
  it: any,
  wname: string,
  isHq: boolean,
  listingsMap?: Record<string, Record<string, RawListingTuple[]>>
): number {
  if (listingsMap) {
    const rawListings = listingsMap[String(it.item_id)]?.[wname];
    const benchmark = it.region_median_price || it.avg_price || 0;
    const cleanMin = extractCleanMinListing(rawListings, isHq, benchmark);
    if (cleanMin && cleanMin.price > 0) {
      return cleanMin.price;
    }
  }
  return getRobustItemPrice(it);
}

/**
 * 自鯖出品最安値と販売履歴基準相場を比較し、安い方を基準にした目標売価 (sellPrice) の算出
 */
export function evaluateProductSellPrice(
  it: MarketItemPayload,
  salesWorld: string,
  isHq: boolean,
  listingsMap?: Record<string, Record<string, RawListingTuple[]>>
): number {
  const historyPrice = getRobustItemPrice(it);
  const benchmark = it.region_median_price || historyPrice || it.avg_price || 0;
  let sellPrice = 0;

  const trendPct = it.trend_pct || 0;
  // 下落トレンドなら -8%、上昇トレンドなら -2%、横ばいなら -5%
  const discountRate = trendPct <= -5 ? 0.92 : (trendPct >= 5 ? 0.98 : 0.95);

  if (listingsMap) {
    const homeRawListings = listingsMap[String(it.item_id)]?.[salesWorld];
    const cleanHomeMin = extractCleanMinListing(homeRawListings, isHq, benchmark);
    if (cleanHomeMin && cleanHomeMin.price > 0 && historyPrice > 0) {
      // 最安値と履歴相場を比較して、より安い方を基準に算出
      const basePrice = Math.min(cleanHomeMin.price, historyPrice);
      sellPrice = Math.max(1, Math.round(basePrice * discountRate));
    } else if (cleanHomeMin && cleanHomeMin.price > 0) {
      sellPrice = Math.max(1, Math.round(cleanHomeMin.price * discountRate));
    }
  }
  if (sellPrice <= 0) {
    sellPrice = historyPrice || getRobustItemPrice(it);
  }
  return sellPrice;
}

/**
 * クラフト完成品の粗利・ROI・日当利益計算および堅牢なノイズフィルター判定
 */
export function evaluateCardItem(
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

  // 1. 販売手数料 (5%控除後の手残り純売価)
  const netSellPrice = Math.round(rawSellPrice * 0.95);
  const profit = netSellPrice - craftCost;
  // 原価利益率 (ROI %)
  const profitRate = Math.round(((profit / craftCost) * 100) * 10) / 10;

  // === 2. 堅牢なノイズフィルター (ギル移動・偽の異常利益を完全排除) ===
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

  // 日販数 (velocity) を掛けた実日当利益
  const dailyProfit = Math.round(profit * velocity);

  return {
    item_id: iid,
    name: meta.name || (it ? it.item_name : `Item #${iid}`),
    cat: meta.category || (it ? it.category_name : 'その他'),
    icon: meta.icon || (it ? it.icon_url : 'https://xivapi.com/i/000000/000000.png'),
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

export interface MaterialPriceMaps {
  materialPriceMap: Map<number, { price: number; world: string }>;
  materialHqPriceMap: Map<number, { price: number; world: string }>;
  allDcPriceMap: Map<number, { price: number; world: string }>;
  allDcHqPriceMap: Map<number, { price: number; world: string }>;
}

/**
 * 全ワールドから素材最安価格マップ（NQ/HQ/全DC）を1パスで構築する共通関数
 */
export function buildMaterialPriceMaps(
  marketData: MarketDataPayload | null | undefined,
  sourcingScope: SourcingScope,
  salesWorld: string,
  targetDc: string,
  listingsMap?: Record<string, Record<string, RawListingTuple[]>>,
  dcWorldsMap: Record<string, string[]> = JAPAN_DCS
): MaterialPriceMaps {
  const emptyRes: MaterialPriceMaps = {
    materialPriceMap: new Map(),
    materialHqPriceMap: new Map(),
    allDcPriceMap: new Map(),
    allDcHqPriceMap: new Map(),
  };
  if (!marketData || !marketData.data) return emptyRes;

  const allDcNqMap = new Map<number, { price: number; world: string }>();
  const allDcHqMap = new Map<number, { price: number; world: string }>();

  const isAllDc = sourcingScope === 'all_dc';
  let allowedWorldsSet: Set<string> | null = null;
  if (!isAllDc) {
    if (sourcingScope === 'dc') {
      allowedWorldsSet = new Set(dcWorldsMap[targetDc] || []);
    } else {
      allowedWorldsSet = new Set([salesWorld]);
    }
  }

  const scopedNqMap = isAllDc ? allDcNqMap : new Map<number, { price: number; world: string }>();
  const scopedHqMap = isAllDc ? allDcHqMap : new Map<number, { price: number; world: string }>();

  const worldNames = Object.keys(marketData.data);
  for (let w = 0; w < worldNames.length; w++) {
    const wname = worldNames[w];
    const items = marketData.data[wname] || [];
    const isAllowed = isAllDc || (allowedWorldsSet ? allowedWorldsSet.has(wname) : false);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const p = getMaterialPrice(it, wname, it.hq, listingsMap);
      if (p <= 0) continue;

      // 1. 全DCマップの更新
      const targetAllMap = it.hq ? allDcHqMap : allDcNqMap;
      const curAll = targetAllMap.get(it.item_id);
      if (!curAll || p < curAll.price) {
        targetAllMap.set(it.item_id, { price: p, world: wname });
      }

      // 2. スコープマップの更新 (all_dc の場合は同一インスタンスなので不要)
      if (!isAllDc && isAllowed) {
        const targetScopedMap = it.hq ? scopedHqMap : scopedNqMap;
        const curScoped = targetScopedMap.get(it.item_id);
        if (!curScoped || p < curScoped.price) {
          targetScopedMap.set(it.item_id, { price: p, world: wname });
        }
      }
    }
  }

  return {
    materialPriceMap: scopedNqMap,
    materialHqPriceMap: scopedHqMap,
    allDcPriceMap: allDcNqMap,
    allDcHqPriceMap: allDcHqMap,
  };
}

export interface EvaluateCraftCardsOptions {
  bestOnly?: boolean; // true: NQ/HQのうち日当利益が高い方を1枚採用 (モバイル版など)
}

/**
 * 全レシピ評価ループの共通化関数
 */
export function evaluateAllCraftCards(
  recipesMap: RecipesMap | null | undefined,
  marketData: MarketDataPayload | null | undefined,
  salesWorld: string,
  materialPriceMap: Map<number, { price: number; world: string }>,
  allDcPriceMap: Map<number, { price: number; world: string }>,
  listingsMap?: Record<string, Record<string, RawListingTuple[]>>,
  options?: EvaluateCraftCardsOptions
): CraftCardItem[] {
  if (!recipesMap || !marketData || !marketData.data) return [];

  const worldItems = marketData.data[salesWorld] || [];
  const worldItemMap = new Map<string, MarketItemPayload>();
  for (let i = 0; i < worldItems.length; i++) {
    const it = worldItems[i];
    worldItemMap.set(`${it.item_id}_${it.hq ? 'hq' : 'nq'}`, it);
  }

  const results: CraftCardItem[] = [];
  const recipeEntries = Object.entries(recipesMap);
  const bestOnly = options?.bestOnly ?? false;

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

    const nqIt = worldItemMap.get(`${iid}_nq`);
    const hqIt = worldItemMap.get(`${iid}_hq`);

    let nqCard: CraftCardItem | null = null;
    if (nqIt) {
      const sellP = evaluateProductSellPrice(nqIt, salesWorld, false, listingsMap);
      if (sellP > 0) {
        nqCard = evaluateCardItem(iid, meta, rec, yieldAmt, batchCost, craftCost, sellP, nqIt.sale_velocity || 0, false, nqIt);
      }
    }

    let hqCard: CraftCardItem | null = null;
    if (hqIt) {
      const sellP = evaluateProductSellPrice(hqIt, salesWorld, true, listingsMap);
      if (sellP > 0) {
        hqCard = evaluateCardItem(iid, meta, rec, yieldAmt, batchCost, craftCost, sellP, hqIt.sale_velocity || 0, true, hqIt);
      }
    }

    if (bestOnly) {
      if (hqCard && nqCard) {
        if (hqCard.daily_profit >= nqCard.daily_profit) {
          results.push(hqCard);
        } else {
          results.push(nqCard);
        }
      } else if (hqCard) {
        results.push(hqCard);
      } else if (nqCard) {
        results.push(nqCard);
      }
    } else {
      if (nqCard) results.push(nqCard);
      if (hqCard) results.push(hqCard);
    }
  }

  return results;
}

/**
 * 検索時のレシピプレースホルダー補完共通関数
 */
export function searchCraftPlaceholders(
  query: string,
  recipesMap: RecipesMap | null | undefined,
  marketData: MarketDataPayload | null | undefined,
  materialPriceMap: Map<number, { price: number; world: string }>,
  allDcPriceMap: Map<number, { price: number; world: string }>,
  existingKeySet: Set<string>,
  selectedCategories?: string[],
  availableCategories?: string[]
): CraftCardItem[] {
  if (!query || !recipesMap || !marketData?.items) return [];

  const isFilterCategory = !!selectedCategories && !!availableCategories &&
    selectedCategories.length > 0 && selectedCategories.length < availableCategories.length;
  const catSet = selectedCategories ? new Set(selectedCategories) : null;
  const lowerQuery = query.toLowerCase().trim();

  const placeholders: CraftCardItem[] = [];

  for (const [idStr, rec] of Object.entries(recipesMap)) {
    const iid = parseInt(idStr, 10);
    const meta = marketData.items[idStr] || { name: `Item #${iid}`, category: 'その他', icon: '', ilvl: 1 };
    const cat = meta.category || 'その他';
    if (isFilterCategory && catSet && !catSet.has(cat)) continue;

    const name = (meta.name || '').toLowerCase();
    if (name.includes(lowerQuery) || idStr.includes(lowerQuery)) {
      if (!existingKeySet.has(`${iid}_nq`)) {
        const yieldAmt = Math.max(1, rec.amt || 1);

        let batchCost = 0;
        for (const [ingId, amt] of rec.ings) {
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
          if (bestPrice > 0) {
            batchCost += bestPrice * amt;
          }
        }
        const craftCost = batchCost > 0 ? Math.round(batchCost / yieldAmt) : 0;

        placeholders.push({
          item_id: iid,
          name: meta.name || `Item #${iid}`,
          cat,
          icon: meta.icon || 'https://xivapi.com/i/000000/000000.png',
          ilvl: meta.ilvl || 1,
          job: rec.job,
          lvl: rec.lvl,
          is_company: rec.is_company,
          is_hq: false,
          amt: yieldAmt,
          batch_cost: batchCost,
          sell_price: 0,
          craft_cost: craftCost,
          profit: 0,
          profit_rate: 0,
          daily_sales_qty: 0,
          daily_profit: 0,
        });
      }
    }
  }

  return placeholders;
}