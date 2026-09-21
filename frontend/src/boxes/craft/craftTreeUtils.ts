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
  SelectedCraftTarget,
  ResolveTreeOptions,
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
 * カタログ未展開時のアイテムメタデータ救出用 O(1) キャッシュ
 */
const fallbackMetaCache = new WeakMap<MarketDataPayload, Map<number, { name: string; icon: string }>>();

function getFallbackItemMeta(
  marketData: MarketDataPayload,
  itemId: number
): { name: string; icon: string } {
  let cache = fallbackMetaCache.get(marketData);
  if (!cache) {
    cache = new Map();
    fallbackMetaCache.set(marketData, cache);
  }
  const cached = cache.get(itemId);
  if (cached) return cached;

  if (marketData.data) {
    for (const wList of Object.values(marketData.data)) {
      if (!wList) continue;
      const foundIt = wList.find((x) => x.item_id === itemId);
      if (foundIt) {
        const res = { name: foundIt.item_name, icon: foundIt.icon_url };
        cache.set(itemId, res);
        return res;
      }
    }
  }
  const empty = { name: '', icon: '' };
  cache.set(itemId, empty);
  return empty;
}

/**
 * レシピツリーノード生成用ファクトリヘルパー (DRY原則の徹底)
 */
interface CreateRecipeNodeParams {
  id: number;
  name: string;
  icon: string;
  cost: number;
  marketPrice: number;
  method: 'buy_npc' | 'craft' | 'buy_market' | 'self_sufficient';
  world: string;
  amount: number;
  isActive: boolean;
  parentYield: number;
  effectiveCost: number;
  quality: 'nq' | 'hq';
  hasHqOption: boolean;
  isSelfSufficient?: boolean;
  savings?: number;
  yieldAmt?: number;
  craftCost?: number;
  batchCost?: number;
  subs?: RecipeTreeItem[];
}

function createRecipeTreeNode(p: CreateRecipeNodeParams): RecipeTreeItem {
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    cost: p.cost,
    marketPrice: p.marketPrice,
    craftCost: p.craftCost,
    batchCost: p.batchCost,
    method: p.method,
    world: p.world,
    amount: p.amount,
    isActive: p.isActive,
    savings: p.savings,
    yieldAmt: p.yieldAmt,
    parentYield: p.parentYield,
    effectiveCost: p.effectiveCost,
    quality: p.quality,
    hasHqOption: p.hasHqOption,
    isSelfSufficient: p.isSelfSufficient,
    subs: p.subs,
  };
}

/**
 * レシピ再帰ツリー展開・自作 vs 購入の原価最適化判定
 * （クリーンなオプション引数オブジェクトおよびレガシー位置引数の両方に対応するオーバーロード）
 */
export function resolveFullTreeForScope(
  itemId: number,
  recipesMap: RecipesMap,
  marketData: MarketDataPayload,
  materialPriceMap: Map<number, { price: number; world: string }>,
  options?: ResolveTreeOptions
): RecipeTreeItem[];
export function resolveFullTreeForScope(
  itemId: number,
  recipesMap: RecipesMap,
  marketData: MarketDataPayload,
  materialPriceMap: Map<number, { price: number; world: string }>,
  sourcingScopeOrOptions?: SourcingScope | ResolveTreeOptions,
  salesScopeName?: string,
  targetDc?: string,
  isParentActive?: boolean,
  depth?: number,
  parentYield?: number,
  materialHqPriceMap?: Map<number, { price: number; world: string }>,
  qualityMap?: Record<number, 'nq' | 'hq'>,
  selfSufficientMap?: Record<number, boolean>
): RecipeTreeItem[];
export function resolveFullTreeForScope(
  itemId: number,
  recipesMap: RecipesMap,
  marketData: MarketDataPayload,
  materialPriceMap: Map<number, { price: number; world: string }>,
  sourcingScopeOrOptions?: SourcingScope | ResolveTreeOptions,
  _salesScopeName?: string,
  _targetDc?: string,
  argIsParentActive = true,
  argDepth = 0,
  argParentYield = 1,
  argMaterialHqPriceMap?: Map<number, { price: number; world: string }>,
  argQualityMap?: Record<number, 'nq' | 'hq'>,
  argSelfSufficientMap?: Record<number, boolean>
): RecipeTreeItem[] {
  // 引数正規化: オプションオブジェクト渡しか位置引数渡しかを自動判定
  const isOptionsObject = typeof sourcingScopeOrOptions === 'object' && sourcingScopeOrOptions !== null;
  const options: ResolveTreeOptions = isOptionsObject ? sourcingScopeOrOptions : {};

  const isParentActive = isOptionsObject ? (options.isParentActive ?? true) : argIsParentActive;
  const depth = isOptionsObject ? (options.depth ?? 0) : argDepth;
  const parentYield = isOptionsObject ? (options.parentYield ?? 1) : argParentYield;
  const materialHqPriceMap = isOptionsObject ? options.materialHqPriceMap : argMaterialHqPriceMap;
  const qualityMap = isOptionsObject ? options.qualityMap : argQualityMap;
  const selfSufficientMap = isOptionsObject ? options.selfSufficientMap : argSelfSufficientMap;

  const rec = recipesMap[itemId.toString()];
  if (!rec || !rec.ings || rec.ings.length === 0) return [];

  const safeParentYield = Math.max(1, parentYield || 1);

  return rec.ings.map(([ingId, rawAmt]) => {
    const amt = rawAmt;
    const idStr = ingId.toString();
    const meta = marketData.items[idStr] || {};

    // 多重フォールバック (O(1) キャッシュ引きで最悪O(W*N)の線形探索を完全排除)
    let fallbackName = '';
    let fallbackIcon = '';
    if (!meta.name || !meta.icon) {
      const fb = getFallbackItemMeta(marketData, ingId);
      fallbackName = fb.name;
      fallbackIcon = fb.icon;
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

    // 自給自足 (0G) 判定: 自給ボタンが押された場合のみ適用
    const isSelfSufficient = !!selfSufficientMap?.[ingId];

    // 共通ファクトリ関数用ベースオプション
    const baseNodeParams = {
      id: ingId,
      name,
      icon,
      amount: amt,
      isActive: isParentActive,
      parentYield: safeParentYield,
      quality: currentQuality,
      hasHqOption,
      isSelfSufficient,
    };

    // 末端素材 (サブレシピなし) の自給自足 (0G) 判定
    if (isSelfSufficient && !hasSubRecipe) {
      return createRecipeTreeNode({
        ...baseNodeParams,
        cost: 0,
        marketPrice: effectiveMarketPrice,
        method: 'self_sufficient',
        world: '自給 (0G)',
        savings: effectiveMarketPrice * amt,
        effectiveCost: 0,
      });
    }

    const effectiveCost =
      safeParentYield > 1 ? Math.round((shopPrice * amt) / safeParentYield) : shopPrice * amt;

    // NPC店売りが最安の場合 (※NPCはNQのみ販売のため、HQ指定時はNPC店売り不可)
    if (!isSelfSufficient && currentQuality === 'nq' && shopPrice > 0 && (effectiveMarketPrice === 0 || shopPrice <= effectiveMarketPrice)) {
      return createRecipeTreeNode({
        ...baseNodeParams,
        cost: shopPrice,
        marketPrice: shopPrice,
        method: 'buy_npc',
        world: 'NPC店売り',
        effectiveCost,
        quality: 'nq',
      });
    }

    if (hasSubRecipe) {
      const subRec = recipesMap[idStr];
      const subYield = Math.max(1, subRec?.amt || 1);
      const tempSubTree = resolveFullTreeForScope(
        ingId,
        recipesMap,
        marketData,
        materialPriceMap,
        {
          isParentActive: true,
          depth: depth + 1,
          parentYield: subYield,
          materialHqPriceMap,
          qualityMap,
          selfSufficientMap,
        }
      );

      const subCraftCostTotal = tempSubTree
        .filter((t) => t.isActive)
        .reduce((sum, sub) => sum + sub.cost * sub.amount, 0);
      const unitCraftCost = Math.round(subCraftCostTotal / subYield);

      // 中間素材自給自足 (0G) の場合: 自身の手持ち・自給なので下位素材はスキップ(購入不要)扱い
      if (isSelfSufficient) {
        return createRecipeTreeNode({
          ...baseNodeParams,
          cost: 0,
          marketPrice: effectiveMarketPrice,
          craftCost: unitCraftCost,
          batchCost: subCraftCostTotal,
          method: 'self_sufficient',
          world: '自給 (0G)',
          savings: effectiveMarketPrice * amt,
          yieldAmt: subYield,
          effectiveCost: 0,
          subs: applyCraftActiveState(tempSubTree, false),
        });
      }

      // 製作/購入の自動判定（原価最適化）
      const shouldCraft =
        isParentActive &&
        (effectiveMarketPrice === 0 || unitCraftCost < effectiveMarketPrice);

      const finalSubTree = shouldCraft
        ? tempSubTree
        : applyCraftActiveState(tempSubTree, false);

      if (shouldCraft) {
        return createRecipeTreeNode({
          ...baseNodeParams,
          cost: unitCraftCost,
          marketPrice: effectiveMarketPrice,
          craftCost: unitCraftCost,
          batchCost: subCraftCostTotal,
          method: 'craft',
          world: '自作',
          savings: effectiveMarketPrice > 0 ? effectiveMarketPrice - unitCraftCost : 0,
          yieldAmt: subYield,
          effectiveCost:
            safeParentYield > 1 ? Math.round((unitCraftCost * amt) / safeParentYield) : unitCraftCost * amt,
          subs: finalSubTree,
        });
      } else {
        return createRecipeTreeNode({
          ...baseNodeParams,
          cost: effectiveMarketPrice,
          marketPrice: effectiveMarketPrice,
          craftCost: unitCraftCost,
          batchCost: subCraftCostTotal,
          method: 'buy_market',
          world: effectiveWorld,
          savings: unitCraftCost > 0 ? unitCraftCost - effectiveMarketPrice : 0,
          yieldAmt: subYield,
          effectiveCost:
            safeParentYield > 1 ? Math.round((effectiveMarketPrice * amt) / safeParentYield) : effectiveMarketPrice * amt,
          subs: finalSubTree,
        });
      }
    }

    return createRecipeTreeNode({
      ...baseNodeParams,
      cost: effectiveMarketPrice,
      marketPrice: effectiveMarketPrice,
      method: 'buy_market',
      world: effectiveWorld,
      effectiveCost:
        safeParentYield > 1 ? Math.round((effectiveMarketPrice * amt) / safeParentYield) : effectiveMarketPrice * amt,
    });
  });
}

/**
 * 樹形図キャンバス用のノード・エッジ座標レイアウト計算 (決定論的IDでReact reconciliationを正常化)
 */
export function calculateTreeLayout(
  selectedItem: CraftCardItem,
  tree: RecipeTreeItem[],
  multiplier: number = 1
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
      const needed = item.amount * multiplier;
      const yieldAmt = Math.max(1, item.yieldAmt || 1);
      const childMultiplier = Math.ceil(needed / yieldAmt);
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

  const safeMult = Math.max(1, multiplier || 1);
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
        safeMult,
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
 * 出品データ（最大20件）から中央値を特定し、中央値の2倍（+100%）を超える高額出品や
 * 極端な捨て値を除外した適正出品の加重平均単価（まとめ買い基準価格）を算出
 */
export function extractCleanProcurementPrice(
  rawTuples: RawListingTuple[] | undefined,
  isHq: boolean,
  _benchmarkPrice?: number
): number | null {
  if (!rawTuples || rawTuples.length === 0) return null;

  // 1. 指定品質（HQ/NQ）の有効な出品を抽出
  const filtered: { price: number; quantity: number }[] = [];
  for (let i = 0; i < rawTuples.length; i++) {
    const [price, qty, hqFlag] = rawTuples[i];
    if (Boolean(hqFlag) === isHq && price > 0 && qty > 0) {
      filtered.push({ price, quantity: qty });
    }
  }
  if (filtered.length === 0) return null;

  // 2. 価格昇順ソート
  filtered.sort((a, b) => a.price - b.price);

  // 3. なんのフィルターもかけていない状態の全件データから「中央値（Median）」を特定
  const midIdx = Math.floor(filtered.length / 2);
  const medianPrice = filtered.length % 2 === 0
    ? Math.round((filtered[midIdx - 1].price + filtered[midIdx].price) / 2)
    : filtered[midIdx].price;

  if (medianPrice <= 0) return null;

  // 4. 中央値を基準にした許容フィルター
  // - 上限: 最大100%（2倍）まで許容。2倍を超えるボッタクリ・倉庫代わりの出品を除外
  // - 下限: 10G未満の捨て値、および中央値の30%未満（桁ミス・極端安値）を除外
  const maxAllowedPrice = medianPrice * 2.0;
  const minAllowedPrice = Math.max(10, Math.round(medianPrice * 0.30));

  const valid = filtered.filter((f) => f.price >= minAllowedPrice && f.price <= maxAllowedPrice);
  if (valid.length === 0) return null;

  // 5. 残った適正出品全件の加重平均（総額 ÷ 総数量）
  let totalCost = 0;
  let totalQty = 0;
  for (let i = 0; i < valid.length; i++) {
    totalCost += valid[i].price * valid[i].quantity;
    totalQty += valid[i].quantity;
  }

  if (totalQty <= 0) return null;
  return Math.round(totalCost / totalQty);
}

/**
 * 出品データが存在する場合は出品全件の加重平均調達価格を優先、なければ履歴相場にフォールバック
 */
export function getMaterialPrice(
  it: MarketItemPayload | (Partial<MarketItemPayload> & { item_id: number; hq?: boolean }),
  wname: string,
  isHq: boolean,
  listingsMap?: Record<string, Record<string, RawListingTuple[]>>
): number {
  if (listingsMap) {
    const rawListings = listingsMap[String(it.item_id)]?.[wname];
    const benchmark = it.region_median_price || it.avg_price || 0;
    const avgProcurementPrice = extractCleanProcurementPrice(rawListings, isHq, benchmark);
    if (avgProcurementPrice && avgProcurementPrice > 0) {
      return avgProcurementPrice;
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
    sellPrice = historyPrice || it.avg_price || it.min_price || benchmark || 0;
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

  // 1. 金策タブと完全一致: 目標販売額から逆算した「目標仕入上限額 (maxBuyPrice)」
  // 手数料 (他鯖購入税5% + 自鯖販売税5% = 計10%) を考慮し、最低利回り15%を確保できる仕入上限
  // netReturn = sellPrice * 0.95, netCost = buyPrice * 1.05
  // netReturn - netCost >= netCost * 0.15  =>  buyPrice <= (sellPrice * 0.95) / (1.05 * 1.15)
  const maxBuyPrice = Math.floor((rawSellPrice * 0.95) / (1.05 * 1.15));

  // 2. 販売手数料 (5%控除後の手残り純売価)
  const netSellPrice = Math.round(rawSellPrice * 0.95);
  const profit = netSellPrice - craftCost;
  // 原価利益率 (ROI %)
  const profitRate = Math.round(((profit / craftCost) * 100) * 10) / 10;

  // === 3. 堅牢なノイズフィルター (ギル移動・偽の異常利益を完全排除) ===
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
    max_buy_price: maxBuyPrice,
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
 * 候補リストからポツン半値（異常な単発安値外れ値）を除外し、真の最安値を決定するヘルパー
 */
function resolveRobustBestCandidate(
  candidates: { price: number; world: string }[]
): { price: number; world: string } | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  candidates.sort((a, b) => a.price - b.price);

  // ★ 金策タブと完全同一: 1位が2位の55%未満（ほぼ半値以下）なら1位をスキップ
  let validCandidates = candidates;
  while (
    validCandidates.length >= 2 &&
    validCandidates[1].price >= 1000 &&
    validCandidates[0].price < validCandidates[1].price * 0.55
  ) {
    validCandidates = validCandidates.slice(1);
  }

  return validCandidates[0];
}

/**
 * 全ワールドから素材最安価格マップ（NQ/HQ/全DC）を1パスで構築する共通関数
 * 金策タブと同じポツン半値外れ値除外フィルターを適用
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

  const isAllDc = sourcingScope === 'all_dc';
  let allowedWorldsSet: Set<string> | null = null;
  if (!isAllDc) {
    if (sourcingScope === 'dc') {
      allowedWorldsSet = new Set(dcWorldsMap[targetDc] || []);
    } else {
      allowedWorldsSet = new Set([salesWorld]);
    }
  }

  // アイテムごとの候補収集マップ: itemId -> Candidate[]
  const allDcNqCandidates = new Map<number, { price: number; world: string }[]>();
  const allDcHqCandidates = new Map<number, { price: number; world: string }[]>();
  const scopedNqCandidates = new Map<number, { price: number; world: string }[]>();
  const scopedHqCandidates = new Map<number, { price: number; world: string }[]>();

  const worldNames = Object.keys(marketData.data);
  for (let w = 0; w < worldNames.length; w++) {
    const wname = worldNames[w];
    const items = marketData.data[wname] || [];
    const isAllowed = isAllDc || (allowedWorldsSet ? allowedWorldsSet.has(wname) : false);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const p = getMaterialPrice(it, wname, it.hq, listingsMap);
      if (p <= 0) continue;

      const cand = { price: p, world: wname };

      // 1. 全DC候補
      const targetAllMap = it.hq ? allDcHqCandidates : allDcNqCandidates;
      let allList = targetAllMap.get(it.item_id);
      if (!allList) {
        allList = [];
        targetAllMap.set(it.item_id, allList);
      }
      allList.push(cand);

      // 2. スコープ内候補
      if (!isAllDc && isAllowed) {
        const targetScopedMap = it.hq ? scopedHqCandidates : scopedNqCandidates;
        let scopedList = targetScopedMap.get(it.item_id);
        if (!scopedList) {
          scopedList = [];
          targetScopedMap.set(it.item_id, scopedList);
        }
        scopedList.push(cand);
      }
    }
  }

  // 候補からポツン半値を除外して最安マップを確定
  const allDcNqMap = new Map<number, { price: number; world: string }>();
  const allDcHqMap = new Map<number, { price: number; world: string }>();
  const scopedNqMap = new Map<number, { price: number; world: string }>();
  const scopedHqMap = new Map<number, { price: number; world: string }>();

  for (const [id, list] of allDcNqCandidates.entries()) {
    const best = resolveRobustBestCandidate(list);
    if (best) allDcNqMap.set(id, best);
  }
  for (const [id, list] of allDcHqCandidates.entries()) {
    const best = resolveRobustBestCandidate(list);
    if (best) allDcHqMap.set(id, best);
  }

  if (isAllDc) {
    return {
      materialPriceMap: allDcNqMap,
      materialHqPriceMap: allDcHqMap,
      allDcPriceMap: allDcNqMap,
      allDcHqPriceMap: allDcHqMap,
    };
  }

  for (const [id, list] of scopedNqCandidates.entries()) {
    const best = resolveRobustBestCandidate(list);
    if (best) scopedNqMap.set(id, best);
  }
  for (const [id, list] of scopedHqCandidates.entries()) {
    const best = resolveRobustBestCandidate(list);
    if (best) scopedHqMap.set(id, best);
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
 * レシピの素材費（batchCost）を算出する純粋ヘルパー関数 (DRY原則・Null安全)
 */
export function calculateRecipeBatchCost(
  ings: [number, number][] | undefined,
  materialPriceMap: Map<number, { price: number; world: string }>,
  allDcPriceMap: Map<number, { price: number; world: string }>,
  itemsMeta?: Record<string, { price_mid?: number; shop_price?: number }>
): { batchCost: number; hasMissingPrice: boolean } {
  if (!ings || ings.length === 0) {
    return { batchCost: 0, hasMissingPrice: true };
  }

  let batchCost = 0;
  let hasMissingPrice = false;

  for (let j = 0; j < ings.length; j++) {
    const [ingId, amt] = ings[j];
    const ingMeta = itemsMeta?.[ingId.toString()];
    const shopPrice = ingMeta?.price_mid || ingMeta?.shop_price || 0;

    let pInfo = materialPriceMap.get(ingId);
    if (!pInfo && allDcPriceMap.has(ingId)) {
      pInfo = allDcPriceMap.get(ingId);
    }

    const mktPrice = pInfo ? pInfo.price : 0;
    const bestPrice =
      shopPrice > 0 && (mktPrice === 0 || shopPrice <= mktPrice)
        ? shopPrice
        : mktPrice || shopPrice || 0;

    if (bestPrice <= 0) {
      hasMissingPrice = true;
      break;
    }
    batchCost += bestPrice * amt;
  }

  return { batchCost, hasMissingPrice };
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

    const { batchCost, hasMissingPrice } = calculateRecipeBatchCost(
      rec.ings,
      materialPriceMap,
      allDcPriceMap,
      marketData.items
    );

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
        const { batchCost } = calculateRecipeBatchCost(
          rec.ings,
          materialPriceMap,
          allDcPriceMap,
          marketData.items
        );
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

/**
 * 製造ライン（パイプライン）用の素材ノード
 */
export interface PipelineItem {
  id: number;
  name: string;
  icon: string;
  cost: number;
  marketPrice: number;
  craftCost?: number; // 中間素材の1個あたり製作原価
  batchCost?: number; // 中間素材の1回クラフトあたりの素材原価
  method: 'buy_npc' | 'craft' | 'buy_market' | 'self_sufficient';
  world: string;
  totalAmount: number;
  activeAmount: number; // 採用ルートでの実調達数量
  tier: number;
  isActive: boolean; // 採用ルートかスキップ対象か
  isSelfSufficient?: boolean;
  quality?: 'nq' | 'hq';
  hasHqOption?: boolean;
  parentYield?: number;
  effectiveCost?: number;
  yieldAmt?: number; // 1回クラフトあたりの完成個数
  job?: string;
  ingredientIds: number[];
  usedInIds: number[];
  occurrences: number;
}

export interface PipelineStep {
  tier: number;
  title: string;
  badge: string;
  subtitle: string;
  items: PipelineItem[];
  totalCost: number;
}

/**
 * 複数選択された完成品ターゲットから、共通素材を合算した製造ライン（パイプライン）を構築する
 * （次工程直前配置 / ALAP ルール: 各素材をその消費工程の直前列に配置）
 */
export function buildMultiCraftPipeline(
  targets: SelectedCraftTarget[]
): { steps: PipelineStep[]; targets: SelectedCraftTarget[] } {
  if (!targets || targets.length === 0) {
    return { steps: [], targets: [] };
  }

  // 1. 各ノードのボトムアップ深さ（最長原料パス長）を再帰計算
  function getBottomHeight(item: RecipeTreeItem): number {
    if (!item.subs || item.subs.length === 0) {
      return 0; // 原料・調達品 (高さ 0)
    }
    let maxSub = 0;
    for (const sub of item.subs) {
      maxSub = Math.max(maxSub, getBottomHeight(sub));
    }
    return maxSub + 1;
  }

  // 2. アイテムごとに数量と親子関係を集約（全ターゲットのツリーから共通素材を合算）
  interface PipelineCollectorItem extends Omit<PipelineItem, 'ingredientIds' | 'usedInIds'> {
    bottomHeight: number;
    activeParentIds: Set<number>;
    allParentIds: Set<number>;
    ingredientIdsSet: Set<number>;
  }

  const itemMap = new Map<number, PipelineCollectorItem>();

  function traverse(item: RecipeTreeItem, parentId: number, currentMult: number) {
    const bHeight = getBottomHeight(item);
    const existing = itemMap.get(item.id);
    const nodeQty = item.amount * currentMult;
    const activeQty = item.isActive ? nodeQty : 0;

    if (!existing) {
      const activeParents = new Set<number>();
      const allParents = new Set<number>();
      if (parentId > 0) {
        allParents.add(parentId);
        if (item.isActive) {
          activeParents.add(parentId);
        }
      }
      const ingSet = new Set<number>();
      if (item.subs && item.subs.length > 0) {
        for (let sIdx = 0; sIdx < item.subs.length; sIdx++) {
          ingSet.add(item.subs[sIdx].id);
        }
      }

      itemMap.set(item.id, {
        id: item.id,
        name: item.name,
        icon: item.icon,
        cost: item.cost,
        marketPrice: item.marketPrice,
        craftCost: item.craftCost,
        batchCost: item.batchCost,
        method: item.method,
        world: item.world,
        totalAmount: nodeQty,
        activeAmount: activeQty,
        tier: 0,
        isActive: !!item.isActive,
        isSelfSufficient: item.isSelfSufficient,
        quality: item.quality,
        hasHqOption: item.hasHqOption,
        parentYield: item.parentYield,
        effectiveCost: item.effectiveCost,
        yieldAmt: item.yieldAmt || 1,
        occurrences: item.isActive ? 1 : 0,
        bottomHeight: bHeight,
        activeParentIds: activeParents,
        allParentIds: allParents,
        ingredientIdsSet: ingSet,
      });
    } else {
      existing.totalAmount += nodeQty;
      existing.activeAmount += activeQty;
      if (item.isActive) {
        existing.occurrences += 1;
        existing.isActive = true; // 1箇所でも採用されていればアクティブ
      }
      if (item.yieldAmt && item.yieldAmt > 1) {
        existing.yieldAmt = item.yieldAmt;
      }
      if (item.craftCost !== undefined) {
        existing.craftCost = item.craftCost;
      }
      if (item.batchCost !== undefined) {
        existing.batchCost = item.batchCost;
      }
      if (parentId > 0) {
        existing.allParentIds.add(parentId);
        if (item.isActive) {
          existing.activeParentIds.add(parentId);
        }
      }
      if (bHeight > existing.bottomHeight) {
        existing.bottomHeight = bHeight;
      }
      if (item.subs && item.subs.length > 0) {
        for (let sIdx = 0; sIdx < item.subs.length; sIdx++) {
          existing.ingredientIdsSet.add(item.subs[sIdx].id);
        }
      }
    }

    if (item.subs && item.subs.length > 0) {
      const itemYield = Math.max(1, item.yieldAmt || 1);
      const batches = Math.ceil(nodeQty / itemYield);
      item.subs.forEach((sub) => {
        traverse(sub, item.id, batches);
      });
    }
  }

  const targetRootIds = new Set(targets.map((t) => t.item.item_id));

  for (const target of targets) {
    const safeMult = Math.max(1, target.craftCount || 1);
    if (target.tree && target.tree.length > 0) {
      target.tree.forEach((rootMat) => {
        traverse(rootMat, target.item.item_id, safeMult);
      });
    }
  }

  // 3. パイプライン総段数 (stepCount) の算出
  // 完成品直下の最大高さ + 1 が中間パイプラインの列数 (FINAL列は含まない)
  let maxTreeDepth = 1;
  for (const target of targets) {
    if (target.tree && target.tree.length > 0) {
      for (const rootMat of target.tree) {
        maxTreeDepth = Math.max(maxTreeDepth, getBottomHeight(rootMat) + 1);
      }
    }
  }
  const stepCount = Math.max(1, maxTreeDepth);
  const finalCol = stepCount; // 最終完成品列のインデックス

  // 4. ALAP (As-Late-As-Possible / 次工程直前配置) による列(Tier)の確定
  // 各アイテムは「自分を消費する最も若い工程の一列前 (minParentCol - 1)」に配置される。
  // ただし、自身の下位素材を配置するスペースを確保するため bottomHeight 以上とする。
  const colMap = new Map<number, number>();
  for (const item of itemMap.values()) {
    // 初期値: ひとまず最大中間列
    colMap.set(item.id, stepCount - 1);
  }

  // DAG上の緩和反復 (深さ分繰り返すことで確実にトップダウン伝播)
  for (let iter = 0; iter < stepCount + 2; iter++) {
    for (const item of itemMap.values()) {
      // 親の決定: アクティブな親があればそれらを使用、なければ全親を使用
      const parentsToUse = item.activeParentIds.size > 0 ? item.activeParentIds : item.allParentIds;

      let minParentCol = finalCol;
      if (parentsToUse.size > 0) {
        for (const pId of parentsToUse) {
          if (targetRootIds.has(pId)) {
            minParentCol = Math.min(minParentCol, finalCol);
          } else if (colMap.has(pId)) {
            minParentCol = Math.min(minParentCol, colMap.get(pId)!);
          }
        }
      }

      // 直前列: minParentCol - 1
      let desired = minParentCol - 1;

      // 自身の下位素材に必要な段数 (bottomHeight) を下回らないよう下限保証
      if (desired < item.bottomHeight) {
        desired = item.bottomHeight;
      }

      // [0, stepCount - 1] の範囲に収める
      desired = Math.max(0, Math.min(stepCount - 1, desired));

      colMap.set(item.id, desired);
    }
  }

  // 各アイテムに確定した Tier (列インデックス) を反映
  for (const item of itemMap.values()) {
    item.tier = colMap.get(item.id) ?? 0;
  }

  // 5. ステップ列の生成
  const steps: PipelineStep[] = [];

  for (let t = 0; t < stepCount; t++) {
    let title = '';
    let badge = `Step ${t + 1}`;
    let subtitle = '';

    if (t === 0) {
      title = '初期原料・一次加工';
      subtitle = '初期投入素材・基本加工';
    } else if (t === 1) {
      title = '中間加工・部材調達';
      subtitle = '中間加工・次工程投入素材';
    } else if (t === 2) {
      title = '直前加工・組立部材';
      subtitle = '上位部材・最終組立直前素材';
    } else if (t === 3) {
      title = '上位組立・直前部材';
      subtitle = '大型パーツ・最終投入素材';
    } else {
      title = `工程 ${t + 1}（中間部材）`;
      subtitle = '次工程・直前投入部材';
    }

    steps.push({
      tier: t,
      title,
      badge,
      subtitle,
      items: [],
      totalCost: 0,
    });
  }

  for (const item of itemMap.values()) {
    const step = steps[item.tier];
    if (step) {
      step.items.push({
        ...item,
        ingredientIds: Array.from(item.ingredientIdsSet),
        usedInIds: Array.from(item.activeParentIds),
      });
      if (item.isActive) {
        const activeQty = item.activeAmount > 0 ? item.activeAmount : item.totalAmount;
        const itemCost = item.isSelfSufficient ? 0 : (item.cost || item.marketPrice || 0) * activeQty;
        step.totalCost += itemCost;
      }
    }
  }

  steps.forEach((step) => {
    step.items.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      const costA = (a.cost || a.marketPrice || 0) * (a.isActive ? a.activeAmount : a.totalAmount);
      const costB = (b.cost || b.marketPrice || 0) * (b.isActive ? b.activeAmount : b.totalAmount);
      return costB - costA;
    });
  });

  return { steps, targets };
}