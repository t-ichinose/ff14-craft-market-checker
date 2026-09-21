import type { RecipeTreeItem, SelectedCraftTarget } from './craftTypes';
import type { PipelineItem } from './craftTreeUtils';

export interface TargetMetric {
  procureCost: number;
  remainingCost: number;
  totalItems: number;
  completedItems: number;
}

export interface DemandAndSatisfactionResult {
  activeDemandMap: Map<number, number>;
  parentSatisfactionMap: Map<number, boolean>;
}

interface TreeNode {
  id: number;
  tier: number;
  amount: number;
  yieldAmt: number;
  isActive: boolean;
  children: TreeNode[];
  nodeDemand: number;
}

/**
 * ツリーノード内に指定IDが含まれているかを再帰判定する共有ヘルパー
 */
export function hasDescendantInTree(tree: RecipeTreeItem[] | undefined, targetId: number): boolean {
  if (!tree) return false;
  for (const n of tree) {
    if (n.id === targetId) return true;
    if (n.subs && n.subs.length > 0 && hasDescendantInTree(n.subs, targetId)) return true;
  }
  return false;
}

/**
 * 各アイテムの有効必要数量（未完了の親工程から要求されている数量）と親工程充足判定を算出
 */
export function calculatePipelineDemandAndSatisfaction(
  targets: SelectedCraftTarget[],
  allItemMap: Map<number, PipelineItem>,
  purchasedMap: Record<number, number>,
  focusItemId: number | null,
  targetRootIds: Set<number>
): DemandAndSatisfactionResult {
  const demandMap = new Map<number, number>();
  const satMap = new Map<number, boolean>();

  function buildTreeNode(item: RecipeTreeItem): TreeNode {
    const isCraft = item.method === 'craft';
    const children = (isCraft && item.subs) ? item.subs.map(buildTreeNode) : [];
    const tier = children.length === 0
      ? 0
      : children.reduce((max, c) => Math.max(max, c.tier), 0) + 1;
    return {
      id: item.id,
      tier,
      amount: item.amount,
      yieldAmt: Math.max(1, item.yieldAmt || 1),
      isActive: item.isActive !== false,
      children,
      nodeDemand: 0,
    };
  }

  const targetTrees = targets.map((t) => ({
    target: t,
    rootNodes: (t.tree || []).map(buildTreeNode),
  }));

  let maxTreeTier = 0;
  for (const tt of targetTrees) {
    for (const rn of tt.rootNodes) {
      if (rn.tier > maxTreeTier) maxTreeTier = rn.tier;
    }
  }

  // 1. 中間素材などの絞り込み表示中 (focusItemId !== null && !targetRootIds.has(focusItemId)) の場合
  if (focusItemId !== null && !targetRootIds.has(focusItemId)) {
    const focusNodes: TreeNode[] = [];
    function findFocusNodes(node: TreeNode) {
      if (node.id === focusItemId) {
        focusNodes.push(node);
      } else {
        node.children.forEach(findFocusNodes);
      }
    }
    for (const tt of targetTrees) {
      tt.rootNodes.forEach(findFocusNodes);
    }

    const focusIt = allItemMap.get(focusItemId);
    const focusOwned = purchasedMap[focusItemId] || 0;
    const focusNeeded = focusIt?.isActive
      ? (focusIt.activeAmount > 0 ? focusIt.activeAmount : focusIt.totalAmount)
      : (focusIt?.totalAmount || 1);
    const isSelf = !!focusIt?.isSelfSufficient;
    const focusRemaining = isSelf ? 0 : Math.max(0, focusNeeded - focusOwned);

    demandMap.set(focusItemId, focusNeeded);
    satMap.set(focusItemId, false);

    if (focusRemaining === 0) {
      function markDescendantsSatisfied(node: TreeNode) {
        for (const child of node.children) {
          satMap.set(child.id, true);
          demandMap.set(child.id, 0);
          markDescendantsSatisfied(child);
        }
      }
      focusNodes.forEach(markDescendantsSatisfied);
    } else {
      const focusYield = Math.max(1, focusIt?.yieldAmt || 1);
      const focusBatches = Math.ceil(focusRemaining / focusYield);
      if (focusNodes.length > 0) {
        const primaryFocusNode = focusNodes[0];
        for (const child of primaryFocusNode.children) {
          child.nodeDemand += child.isActive ? child.amount * focusBatches : 0;
        }
      }

      for (let t = maxTreeTier; t >= 0; t--) {
        const tierNodes: TreeNode[] = [];
        function collectTierNodes(n: TreeNode) {
          if (n.tier === t) {
            tierNodes.push(n);
          }
          n.children.forEach(collectTierNodes);
        }
        focusNodes.forEach((fn) => fn.children.forEach(collectTierNodes));

        const tierDemandById = new Map<number, number>();
        for (const node of tierNodes) {
          if (node.nodeDemand > 0) {
            tierDemandById.set(node.id, (tierDemandById.get(node.id) || 0) + node.nodeDemand);
          }
        }

        for (const [id, demand] of tierDemandById.entries()) {
          demandMap.set(id, (demandMap.get(id) || 0) + demand);
        }

        const availableOwnedMap = new Map<number, number>();
        for (const id of tierDemandById.keys()) {
          const it = allItemMap.get(id);
          if (it?.isSelfSufficient) {
            availableOwnedMap.set(id, Infinity);
          } else {
            availableOwnedMap.set(id, purchasedMap[id] || 0);
          }
        }

        for (const node of tierNodes) {
          if (node.children.length === 0 || node.nodeDemand <= 0) continue;

          const available = availableOwnedMap.get(node.id) || 0;
          const coveredByOwned = Math.min(node.nodeDemand, available);
          if (available !== Infinity) {
            availableOwnedMap.set(node.id, available - coveredByOwned);
          }

          const remainingDemand = node.nodeDemand - coveredByOwned;
          if (remainingDemand > 0) {
            const batches = Math.ceil(remainingDemand / node.yieldAmt);
            for (const child of node.children) {
              child.nodeDemand += child.isActive ? child.amount * batches : 0;
            }
          }
        }
      }

      function checkDescendantSat(node: TreeNode) {
        for (const child of node.children) {
          const d = demandMap.get(child.id) || 0;
          satMap.set(child.id, d === 0);
          checkDescendantSat(child);
        }
      }
      focusNodes.forEach(checkDescendantSat);
    }

    for (const id of allItemMap.keys()) {
      if (!satMap.has(id)) {
        satMap.set(id, false);
      }
    }

    return { activeDemandMap: demandMap, parentSatisfactionMap: satMap };
  }

  // 2. 通常（または特定完成品フォーカス時）の計算
  let hasAnyUnfinished = false;
  for (const tt of targetTrees) {
    if (focusItemId !== null && targetRootIds.has(focusItemId) && tt.target.item.item_id !== focusItemId) {
      continue;
    }
    const targetCraftCount = Math.max(1, tt.target.craftCount || 1);
    const targetOwned = purchasedMap[tt.target.item.item_id] || 0;
    const targetRemaining = Math.max(0, targetCraftCount - targetOwned);

    if (targetRemaining > 0) {
      hasAnyUnfinished = true;
      for (const rootNode of tt.rootNodes) {
        rootNode.nodeDemand = rootNode.isActive ? rootNode.amount * targetRemaining : 0;
      }
    } else {
      for (const rootNode of tt.rootNodes) {
        rootNode.nodeDemand = 0;
      }
    }
  }

  if (!hasAnyUnfinished) {
    for (const id of allItemMap.keys()) {
      demandMap.set(id, 0);
      satMap.set(id, true);
    }
    return { activeDemandMap: demandMap, parentSatisfactionMap: satMap };
  }

  const nodesByTier = new Map<number, TreeNode[]>();
  for (let t = 0; t <= maxTreeTier; t++) {
    nodesByTier.set(t, []);
  }

  function collectAllNodes(node: TreeNode) {
    nodesByTier.get(node.tier)?.push(node);
    node.children.forEach(collectAllNodes);
  }
  for (const tt of targetTrees) {
    if (focusItemId !== null && targetRootIds.has(focusItemId) && tt.target.item.item_id !== focusItemId) {
      continue;
    }
    tt.rootNodes.forEach(collectAllNodes);
  }

  for (let t = maxTreeTier; t >= 0; t--) {
    const tierNodes = nodesByTier.get(t) || [];

    const tierDemandById = new Map<number, number>();
    for (const node of tierNodes) {
      if (node.nodeDemand > 0) {
        tierDemandById.set(node.id, (tierDemandById.get(node.id) || 0) + node.nodeDemand);
      }
    }

    for (const [id, demand] of tierDemandById.entries()) {
      demandMap.set(id, (demandMap.get(id) || 0) + demand);
    }

    // このtierに存在する各アイテムの所持数を分配するための管理マップ
    const availableOwnedMap = new Map<number, number>();
    for (const id of tierDemandById.keys()) {
      const it = allItemMap.get(id);
      if (it?.isSelfSufficient) {
        availableOwnedMap.set(id, Infinity);
      } else {
        availableOwnedMap.set(id, purchasedMap[id] || 0);
      }
    }

    for (const node of tierNodes) {
      if (node.children.length === 0 || node.nodeDemand <= 0) continue;

      const available = availableOwnedMap.get(node.id) || 0;
      const coveredByOwned = Math.min(node.nodeDemand, available);
      if (available !== Infinity) {
        availableOwnedMap.set(node.id, available - coveredByOwned);
      }

      const remainingDemand = node.nodeDemand - coveredByOwned;
      if (remainingDemand > 0) {
        const batches = Math.ceil(remainingDemand / node.yieldAmt);
        for (const child of node.children) {
          child.nodeDemand += child.isActive ? child.amount * batches : 0;
        }
      }
    }
  }

  for (const id of allItemMap.keys()) {
    const it = allItemMap.get(id);
    if (!it) continue;
    const demand = demandMap.get(id) || 0;
    if (it.usedInIds && it.usedInIds.length > 0) {
      satMap.set(id, it.isActive && demand === 0);
    } else {
      satMap.set(id, false);
    }
  }

  return { activeDemandMap: demandMap, parentSatisfactionMap: satMap };
}

/**
 * 各完成品ターゲットごとの個別調達進捗・調達原価・残額のリアルタイム計算
 */
export function calculateTargetMetrics(
  targets: SelectedCraftTarget[],
  purchasedMap: Record<number, number>
): Map<string, TargetMetric> {
  const metrics = new Map<string, TargetMetric>();

  for (const target of targets) {
    const safeMult = Math.max(1, target.craftCount || 1);
    const procMap = new Map<number, { unitPrice: number; amount: number; remainingAmount: number }>();

    function traverse(
      nodes: RecipeTreeItem[],
      totalMult: number,
      remainingMult: number,
      ancestorCompleted: boolean
    ) {
      for (const node of nodes) {
        if (!node.isActive) continue;

        const totalNeeded = node.amount * totalMult;
        const remainingNeededRaw = node.amount * remainingMult;
        const owned = purchasedMap[node.id] || 0;
        const isThisCompleted = ancestorCompleted || !!node.isSelfSufficient || (owned > 0 && owned >= remainingNeededRaw);

        if (node.method === 'craft' && node.subs && node.subs.length > 0) {
          const yieldAmt = Math.max(1, node.yieldAmt || 1);
          const totalBatches = Math.ceil(totalNeeded / yieldAmt);
          const remainingToCraft = isThisCompleted ? 0 : Math.max(0, remainingNeededRaw - owned);
          const remainingBatches = Math.ceil(remainingToCraft / yieldAmt);
          traverse(node.subs, totalBatches, remainingBatches, isThisCompleted);
        } else {
          const isSelf = !!node.isSelfSufficient;
          const unitPrice = isSelf ? 0 : (node.cost || node.marketPrice || 0);
          const remainingAmt = isThisCompleted ? 0 : Math.max(0, remainingNeededRaw - owned);

          const existing = procMap.get(node.id);
          if (existing) {
            existing.amount += totalNeeded;
            existing.remainingAmount += remainingAmt;
          } else {
            procMap.set(node.id, {
              unitPrice,
              amount: totalNeeded,
              remainingAmount: remainingAmt,
            });
          }
        }
      }
    }

    traverse(target.tree || [], safeMult, safeMult, false);

    let cost = 0;
    let rem = 0;
    let comp = 0;
    for (const it of procMap.values()) {
      cost += it.unitPrice * it.amount;
      rem += it.unitPrice * it.remainingAmount;
      if (it.remainingAmount === 0) {
        comp++;
      }
    }

    metrics.set(target.cardKey, {
      procureCost: cost,
      remainingCost: rem,
      totalItems: procMap.size,
      completedItems: comp,
    });
  }

  return metrics;
}
