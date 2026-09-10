import type { RecipesMap } from '../../services/recipeDataService';
import type {
  RecipeTreeItem,
  MarketDataPayload,
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

      const finalSubTree = resolveFullTreeForScope(
        ingId,
        recipesMap,
        marketData,
        materialPriceMap,
        sourcingScope,
        salesScopeName,
        targetDc,
        shouldCraft,
        depth + 1,
        subYield,
        materialHqPriceMap,
        qualityMap,
        selfSufficientMap
      );

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
 * 樹形図キャンバス用のノード・エッジ座標レイアウト計算
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
    startY: number
  ): number {
    const nodeId = `node-${item.id}-${Math.random().toString(36).substr(2, 6)}`;
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
      item.subs.forEach((subItem) => {
        const h = computeSubtreeHeight(subItem);
        layoutItem(
          subItem,
          nodeId,
          x + CARD_WIDTH,
          y + CARD_HEIGHT / 2,
          depth + 1,
          childMultiplier,
          childY
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
    tree.forEach((l1Item) => {
      const h = computeSubtreeHeight(l1Item);
      layoutItem(
        l1Item,
        rootNode.id,
        rootNode.x + rootNode.width,
        rootNode.y + rootNode.height / 2,
        1,
        1,
        currentLevel1Y
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