import React, { useState, useMemo } from 'react';
import type { CraftCardItem, RecipeTreeItem, SelectedCraftTarget } from './craftTypes';
import { buildMultiCraftPipeline, getJobBadgeStyle, type PipelineItem } from './craftTreeUtils';
import { WheelNumberInput } from './WheelNumberInput';
import { ALL_JAPAN_WORLDS } from '../../shared/marketConstants';

export interface PipelineLineCanvasProps {
  selectedItem: CraftCardItem;
  tree: RecipeTreeItem[];
  currentWorld: string;
  craftCount?: number;
  purchasedMap?: Record<number, number>;
  onSetPurchased?: (id: number, amount: number) => void;
  onToggleFullPurchased?: (id: number, neededAmount: number) => void;
  onOpenMarketModal?: (itemId: number, worldName?: string, isHq?: boolean) => void;
  onToggleQuality?: (itemId: number) => void;
  onToggleSelfSufficient?: (itemId: number) => void;
  focusItemId?: number | null;
  onSetFocusItemId?: (id: number | null) => void;
  selectedTargets?: SelectedCraftTarget[];
  onUpdateTargetCraftCount?: (cardKey: string, count: number) => void;
  onRemoveTarget?: (cardKey: string) => void;
  steps?: import('./craftTreeUtils').PipelineStep[];
  allItemMap?: Map<number, PipelineItem>;
}

// ツリーノード内に指定IDが含まれているかを再帰判定する共有ヘルパー
function hasDescendantInTree(tree: RecipeTreeItem[] | undefined, targetId: number): boolean {
  if (!tree) return false;
  for (const n of tree) {
    if (n.id === targetId) return true;
    if (n.subs && n.subs.length > 0 && hasDescendantInTree(n.subs, targetId)) return true;
  }
  return false;
}

export const PipelineLineCanvas: React.FC<PipelineLineCanvasProps> = React.memo(({
  selectedItem,
  tree,
  currentWorld,
  craftCount = 1,
  purchasedMap = {},
  onSetPurchased,
  onToggleFullPurchased,
  onOpenMarketModal,
  onToggleQuality,
  onToggleSelfSufficient,
  focusItemId: propFocusItemId,
  onSetFocusItemId,
  selectedTargets,
  onUpdateTargetCraftCount,
  onRemoveTarget,
  steps: propSteps,
  allItemMap: propAllItemMap,
}) => {
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null);
  const [localFocusItemId, setLocalFocusItemId] = useState<number | null>(null);
  const focusItemId = propFocusItemId !== undefined ? propFocusItemId : localFocusItemId;
  const setFocusItemId = onSetFocusItemId || setLocalFocusItemId;

  const targets: SelectedCraftTarget[] = useMemo(() => {
    if (selectedTargets && selectedTargets.length > 0) {
      return selectedTargets;
    }
    return [
      {
        cardKey: `${selectedItem.item_id}_${selectedItem.is_hq ? 'hq' : 'nq'}`,
        item: selectedItem,
        craftCount,
        tree,
      },
    ];
  }, [selectedTargets, selectedItem, craftCount, tree]);

  const targetRootIds = useMemo(() => new Set(targets.map((t) => t.item.item_id)), [targets]);

  // 親から渡されたパイプライン計算結果を優先利用（二重計算を完全防止）
  const computedPipeline = useMemo(() => {
    if (propSteps && propAllItemMap) {
      return { steps: propSteps, allItemMap: propAllItemMap };
    }
    const { steps } = buildMultiCraftPipeline(targets);
    const map = new Map<number, PipelineItem>();
    for (const s of steps) {
      for (const item of s.items) {
        map.set(item.id, item);
      }
    }
    return { steps, allItemMap: map };
  }, [targets, propSteps, propAllItemMap]);

  const { steps, allItemMap } = computedPipeline;

  // フォーカス（絞り込み）時に表示すべき全関連ID（下流の全材料＋上流の全親）
  const focusedVisibleIds = useMemo(() => {
    if (focusItemId === null) return null;

    const visibleSet = new Set<number>();
    visibleSet.add(focusItemId);

    // 下流（材料すべて）を再帰的に収集（※自身以外で購入・自給の中間素材の下位材料は不要なため除外）
    function collectIngredients(id: number) {
      const item = allItemMap.get(id);
      if (!item || !item.ingredientIds) return;
      if (id !== focusItemId && item.method !== 'craft') return;
      for (const ingId of item.ingredientIds) {
        if (!visibleSet.has(ingId)) {
          visibleSet.add(ingId);
          collectIngredients(ingId);
        }
      }
    }

    // 上流（親すべて）を再帰的に収集
    function collectAncestors(id: number) {
      const item = allItemMap.get(id);
      if (!item || !item.usedInIds) return;
      for (const parentId of item.usedInIds) {
        if (!visibleSet.has(parentId)) {
          visibleSet.add(parentId);
          collectAncestors(parentId);
        }
      }
    }

    if (targetRootIds.has(focusItemId)) {
      // 特定の完成品フォーカス時はその完成品のツリー配下のみを表示
      const matchedTarget = targets.find((t) => t.item.item_id === focusItemId);
      if (matchedTarget && matchedTarget.tree) {
        function collectSubTree(subs: RecipeTreeItem[]) {
          for (const s of subs) {
            if (s.isActive) {
              visibleSet.add(s.id);
            }
            if (s.method === 'craft' && s.subs && s.subs.length > 0) {
              collectSubTree(s.subs);
            }
          }
        }
        collectSubTree(matchedTarget.tree);
      }
    } else {
      collectIngredients(focusItemId);
      collectAncestors(focusItemId);
      // 親の完成品IDもセットに追加
      for (const rootId of targetRootIds) {
        const rootTarget = targets.find((t) => t.item.item_id === rootId);
        if (rootTarget && rootTarget.tree && hasDescendantInTree(rootTarget.tree, focusItemId)) {
          visibleSet.add(rootId);
        }
      }
    }

    return visibleSet;
  }, [focusItemId, allItemMap, targets, targetRootIds]);

  // ホバー中の素材の依存関係（直近の材料IDと親ID）
  // ハイライト機能は絞り込み検索時 (focusItemId !== null) のみ適用
  const activeRelations = useMemo(() => {
    if (focusItemId === null) return null;

    const targetId = hoveredItemId;
    if (targetId === null) return null;

    const hovered = allItemMap.get(targetId);
    if (!hovered) {
      if (targetRootIds.has(targetId)) {
        const matchedTarget = targets.find((t) => t.item.item_id === targetId);
        const ingIds = new Set<number>();
        function collectAllIngs(nodes: RecipeTreeItem[]) {
          for (const n of nodes) {
            ingIds.add(n.id);
            if (n.subs && n.subs.length > 0) {
              collectAllIngs(n.subs);
            }
          }
        }
        if (matchedTarget && matchedTarget.tree) {
          collectAllIngs(matchedTarget.tree);
        }
        return {
          isHoveredRoot: true,
          ingredientIds: ingIds,
          usedInIds: new Set<number>(),
        };
      }
      return null;
    }

    return {
      isHoveredRoot: false,
      ingredientIds: new Set(hovered.ingredientIds),
      usedInIds: new Set(hovered.usedInIds),
    };
  }, [hoveredItemId, allItemMap, targets, targetRootIds]);

  // カードクリック時の動作（相場モーダル表示）
  const handleCardClick = (itemId: number, worldName: string, isHq: boolean) => {
    const validWorld = (worldName && ALL_JAPAN_WORLDS.includes(worldName)) ? worldName : currentWorld;
    if (onOpenMarketModal) {
      onOpenMarketModal(itemId, validWorld, isHq);
    }
  };

  // 各アイテムの親工程充足判定（連動する後半素材が揃った場合に前工程をグレーアウト）
  // 各アイテムの有効必要数量（未完了の親工程から要求されている数量）と親工程充足判定
  const { activeDemandMap, parentSatisfactionMap } = useMemo(() => {
    const demandMap = new Map<number, number>();
    const satMap = new Map<number, boolean>();

    interface TreeNode {
      id: number;
      tier: number;
      amount: number;
      yieldAmt: number;
      isActive: boolean;
      children: TreeNode[];
      nodeDemand: number;
    }

    function buildTreeNode(item: RecipeTreeItem): TreeNode {
      // 製作(craft)でない中間素材（購入・店売り・自給）は下位ツリーを製作しないため子ノードを展開しない
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
  }, [targets, targetRootIds, focusItemId, allItemMap, purchasedMap]);

  // 絞り込み後のステップ一覧
  const displaySteps = useMemo(() => {
    if (!focusedVisibleIds) return steps;
    return steps.map((step) => ({
      ...step,
      items: step.items.filter((it) => focusedVisibleIds.has(it.id)),
    }));
  }, [steps, focusedVisibleIds]);

  // 各完成品ターゲットごとの個別調達進捗・調達原価・残額のリアルタイム計算
  const targetMetricsMap = useMemo(() => {
    const metrics = new Map<string, {
      procureCost: number;
      remainingCost: number;
      totalItems: number;
      completedItems: number;
    }>();

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
  }, [targets, purchasedMap]);

  return (
    <div
      onClick={() => {
        // 背景クリックでフォーカス解除
        if (focusItemId !== null) setFocusItemId(null);
      }}
      className="w-full h-full overflow-x-auto overflow-y-hidden bg-slate-950/40 px-3 py-2 flex flex-col select-none"
    >
      {/* ステップ列（カンバン方式パイプライン） */}
      <div className="min-w-full w-fit flex-1 flex justify-center gap-2 pb-2 overflow-y-auto">
        {displaySteps.map((step) => {
          if (step.items.length === 0) return null;

          return (
            <React.Fragment key={step.tier}>
              {/* ステップ列 (伸縮型レスポンシブ幅: 340px〜540px) */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-[340px] max-w-[540px] flex-shrink-0 flex flex-col bg-slate-900/95 border border-white/10 rounded-2xl p-3 shadow-xl transition-all"
              >
                {/* 列ヘッダー */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[0.68rem] font-black font-mono">
                      {step.badge}
                    </span>
                    <h4 className="text-xs font-extrabold text-white tracking-wide">{step.title}</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-[0.68rem] font-bold text-slate-300 block">{step.items.length}品目</span>
                  </div>
                </div>

                {/* カード一覧 */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {step.items.map((item) => {
                    const isSelf = item.isSelfSufficient;
                    const isParentSatisfied = parentSatisfactionMap.get(item.id) || false;
                    const isFocused = focusItemId === item.id;
                    const isHovered = hoveredItemId === item.id;
                    const isIngredient = activeRelations?.ingredientIds.has(item.id);
                    const isUsedIn = activeRelations?.usedInIds.has(item.id);
                    const isActive = item.isActive;

                    // 所持数と不足数の計算
                    const initialNeeded = isActive
                      ? (item.activeAmount > 0 ? item.activeAmount : item.totalAmount)
                      : item.totalAmount;
                    const effectiveNeeded = isParentSatisfied
                      ? 0
                      : (activeDemandMap.has(item.id) ? activeDemandMap.get(item.id)! : initialNeeded);
                    const owned = purchasedMap[item.id] || 0;
                    // 直接調達完了 または 親充足
                    const isDirectlyCompleted = isActive && (isSelf || (owned > 0 && owned >= effectiveNeeded));
                    const isSatisfied = isDirectlyCompleted || isParentSatisfied;
                    const shortage = isSatisfied ? 0 : Math.max(0, effectiveNeeded - owned);

                    // 関連付けハイライト: クリック集約表示中 (focusItemId !== null) のみ発動
                    let cardOpacity = isParentSatisfied
                      ? 'opacity-45 hover:opacity-80'
                      : !isActive
                      ? 'opacity-40 hover:opacity-75'
                      : 'opacity-100';

                    let borderHighlight = isParentSatisfied
                      ? 'border-dashed border-slate-700/60 bg-slate-900/40'
                      : isDirectlyCompleted
                      ? 'border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                      : isActive
                      ? 'border-white/10'
                      : 'border-dashed border-slate-600/70';
                    let glowClass = '';

                    if (isFocused) {
                      borderHighlight = 'border-cyan-400 shadow-[0_0_18px_rgba(0,210,255,0.6)]';
                      glowClass = 'ring-2 ring-cyan-400';
                      cardOpacity = 'opacity-100';
                    } else if (focusItemId !== null && activeRelations) {
                      // 集約表示中のみホバーハイライトを適用
                      if (isHovered) {
                        borderHighlight = 'border-cyan-400 shadow-[0_0_15px_rgba(0,210,255,0.4)]';
                        glowClass = 'ring-2 ring-cyan-400/50';
                        cardOpacity = 'opacity-100';
                      } else if (isIngredient) {
                        borderHighlight = 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]';
                        glowClass = 'ring-2 ring-emerald-400/50';
                        cardOpacity = isParentSatisfied ? 'opacity-70' : 'opacity-100';
                      } else if (isUsedIn) {
                        borderHighlight = 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]';
                        glowClass = 'ring-2 ring-amber-400/50';
                        cardOpacity = 'opacity-100';
                      } else {
                        cardOpacity = 'opacity-30';
                      }
                    } else if (isHovered) {
                      borderHighlight = isParentSatisfied
                        ? 'border-slate-500'
                        : isActive
                        ? 'border-white/30'
                        : 'border-slate-500';
                    }

                    const targetBuyPrice = (isSelf || isParentSatisfied)
                      ? 0
                      : item.method === 'buy_npc'
                      ? item.cost
                      : (item.marketPrice > 0 ? item.marketPrice : item.cost);
                    const unitCraftCost = (isSelf || isParentSatisfied) ? 0 : (item.craftCost || 0);
                    const hasCraftOption = !isSelf && !isParentSatisfied && unitCraftCost > 0;

                    // 計算用数量: 自給や親充足の場合は0、所持数がある場合は残数、未所持の場合は全数
                    const calcQty = isSatisfied ? 0 : (owned > 0 ? shortage : effectiveNeeded);
                    const craftSubtotal = isSatisfied ? 0 : unitCraftCost * calcQty;
                    const buySubtotal = isSatisfied ? 0 : targetBuyPrice * calcQty;
                    const unitDiff = hasCraftOption ? Math.abs(targetBuyPrice - unitCraftCost) : 0;
                    const isCraftAdopted = !isSelf && !isParentSatisfied && item.method === 'craft';
                    const isBuyAdopted = !isSelf && !isParentSatisfied && (item.method === 'buy_market' || item.method === 'buy_npc');

                    return (
                      <div
                        key={item.id}
                        onMouseEnter={() => {
                          if (focusItemId !== null) setHoveredItemId(item.id);
                        }}
                        onMouseLeave={() => {
                          if (focusItemId !== null) setHoveredItemId(null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCardClick(item.id, item.world, item.quality === 'hq');
                        }}
                        className={`relative h-[188px] p-3.5 rounded-2xl flex flex-col justify-between ${
                          isFocused
                            ? 'bg-cyan-950/40 border-cyan-400'
                            : isParentSatisfied
                            ? 'bg-slate-900/40 border-slate-700/60'
                            : isDirectlyCompleted
                            ? 'bg-emerald-950/30 border-emerald-500/40 hover:bg-emerald-950/40'
                            : isActive
                            ? 'bg-slate-800/80 hover:bg-slate-800'
                            : 'bg-slate-900/50 hover:bg-slate-800/60'
                        } transition-all cursor-pointer border ${borderHighlight} ${cardOpacity} ${glowClass} shadow-md group`}
                      >
                        {/* 上部: アイコン + 名前 + 数量 */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <img
                            src={item.icon}
                            alt={item.name}
                            className={`w-9 h-9 rounded-xl border bg-black/40 flex-shrink-0 object-contain shadow-inner ${
                              isDirectlyCompleted
                                ? 'border-emerald-500/50'
                                : isParentSatisfied
                                ? 'border-slate-700 opacity-60'
                                : isActive
                                ? 'border-white/15'
                                : 'border-slate-700 opacity-80'
                            }`}
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5 mb-0.5">
                              <span
                                className={`text-[0.82rem] font-bold truncate ${
                                  isDirectlyCompleted
                                    ? 'text-emerald-300 font-extrabold'
                                    : isParentSatisfied
                                    ? 'text-slate-400'
                                    : isSelf
                                    ? 'text-emerald-300'
                                    : isFocused
                                    ? 'text-cyan-200 font-black'
                                    : isActive
                                    ? 'text-slate-100 group-hover:text-cyan-300'
                                    : 'text-slate-300 group-hover:text-white'
                                }`}
                                title={item.name}
                              >
                                {item.name}
                              </span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {isDirectlyCompleted && (
                                  <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold">
                                    ✔ 調達済
                                  </span>
                                )}
                                {isParentSatisfied && isActive && (
                                  <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300 border border-slate-600 font-extrabold" title="親工程が完了しているため調達不要">
                                    ✔ 連動済
                                  </span>
                                )}
                                {isFocused && (
                                  <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 font-bold">
                                    絞込中
                                  </span>
                                )}

                                {/* 右上固定バッジ: スキップ時は「スキップ」のみ表示、通常時は「製作 / 購入 / 店売 / 自給」 ＋ 「〇安」 */}
                                {!isActive ? (
                                  <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-0.5">
                                    <i className="fa-solid fa-ban text-rose-400 text-[0.55rem]"></i> スキップ
                                  </span>
                                ) : isSelf ? (
                                  <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                                    <i className="fa-solid fa-leaf text-[0.55rem]"></i> 自給
                                  </span>
                                ) : item.method === 'craft' ? (
                                  <>
                                    <span className="text-[0.65rem] font-extrabold px-2 py-0.5 rounded-md bg-sky-500/25 text-sky-300 border border-sky-500/50 flex items-center gap-1 shadow-[0_0_8px_rgba(56,189,248,0.25)]">
                                      <i className="fa-solid fa-hammer text-[0.55rem]"></i> 製作
                                    </span>
                                    {hasCraftOption && isActive && unitDiff > 0 && (
                                      <span className="text-sky-300 bg-sky-950/90 px-1.5 py-0.5 rounded-md border border-sky-500/40 font-sans font-bold text-[0.62rem] flex items-center gap-0.5 shadow-sm whitespace-nowrap">
                                        {unitDiff.toLocaleString()}G安
                                      </span>
                                    )}
                                  </>
                                ) : item.method === 'buy_npc' ? (
                                  <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-md bg-teal-500/25 text-teal-300 border border-teal-500/40 flex items-center gap-1 shadow-sm">
                                    <i className="fa-solid fa-shop text-[0.55rem]"></i> 店売
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-md bg-amber-500/25 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm">
                                      <i className="fa-solid fa-cart-shopping text-[0.55rem]"></i> 購入
                                    </span>
                                    {hasCraftOption && isActive && unitDiff > 0 && (
                                      <span className="text-amber-300 bg-amber-950/90 px-1.5 py-0.5 rounded-md border border-amber-500/40 font-sans font-bold text-[0.62rem] flex items-center gap-0.5 shadow-sm whitespace-nowrap">
                                        {unitDiff.toLocaleString()}G安
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-[0.7rem] text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis">
                              <span className={`font-extrabold font-mono ${isDirectlyCompleted ? 'text-emerald-400' : isParentSatisfied ? 'text-slate-400' : isActive ? 'text-cyan-300' : 'text-slate-400'}`}>
                                必要: {effectiveNeeded.toLocaleString()} 個
                              </span>
                              {effectiveNeeded < initialNeeded && !isParentSatisfied && (
                                <span
                                  className="text-[0.6rem] px-1.5 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 shrink-0 font-sans font-bold shadow-sm"
                                  title={`全体必要数: ${initialNeeded}個 (完了した親工程の分 ${initialNeeded - effectiveNeeded}個 を差し引いた残必要数)`}
                                >
                                  親完了分 -{initialNeeded - effectiveNeeded}個
                                </span>
                              )}
                              {item.occurrences > 1 && (
                                <span className="text-[0.6rem] px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0" title={`${item.occurrences}箇所のパーツで必要`}>
                                  {item.occurrences}箇所合算
                                </span>
                              )}
                              {item.yieldAmt && item.yieldAmt > 1 && (
                                <span
                                  className="text-[0.62rem] font-bold px-1.5 py-0.5 rounded-md bg-sky-950/70 text-sky-300 border border-sky-500/40 shrink-0 shadow-sm"
                                  title={`1回の製作で${item.yieldAmt}個完成 (必要数${effectiveNeeded}個のため ${Math.ceil(effectiveNeeded / item.yieldAmt)}回製作)`}
                                >
                                  1回{item.yieldAmt}個{item.method === 'craft' ? ` (${Math.ceil(effectiveNeeded / item.yieldAmt)}回製作)` : ''}
                                </span>
                              )}
                              {item.method === 'buy_npc' ? (
                                <span className="text-teal-400 font-semibold">NPC店売り</span>
                              ) : isSelf ? (
                                <span className="text-emerald-400 font-semibold">採集・自給 (0G)</span>
                              ) : item.method === 'craft' ? null : (
                                <span className="text-amber-300 font-semibold truncate max-w-[120px]" title={item.world}>
                                  仕入: {item.world}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 中段: 所持数入力 ＆ 残数表示 ＆ 操作ボタン（ゆとりのある統合ツールバー） */}
                        {onSetPurchased && onToggleFullPurchased && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`my-1.5 px-3 py-1 rounded-xl border flex items-center justify-between text-xs transition-all h-[36px] shrink-0 ${
                              !isActive ? 'bg-slate-900/60 border-slate-700/40' : 'bg-black/35 border-white/10'
                            }`}
                          >
                            {/* 左: 所持数入力 ＆ 残数表示（左詰めでグループ化） */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => onToggleFullPurchased(item.id, effectiveNeeded)}
                                disabled={isParentSatisfied}
                                className={`w-5 h-5 rounded flex items-center justify-center text-xs transition-all ${
                                  isParentSatisfied
                                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                                    : isDirectlyCompleted
                                    ? 'bg-emerald-500 text-slate-950 font-black shadow-[0_0_8px_rgba(16,185,129,0.5)] cursor-pointer'
                                    : 'bg-slate-700/60 hover:bg-slate-700 text-slate-400 border border-white/10 cursor-pointer'
                                }`}
                                title={
                                  isParentSatisfied
                                    ? '親工程が完了しているため調達不要です'
                                    : isDirectlyCompleted
                                    ? '未完了に戻す'
                                    : `全数（${effectiveNeeded}個）を手持ち確保（充足）にする`
                                }
                              >
                                <i className="fa-solid fa-check text-[0.65rem]"></i>
                              </button>
                              <div className="flex items-center gap-1">
                                <span className="text-[0.68rem] text-slate-400 font-bold">所持:</span>
                                <WheelNumberInput
                                  value={owned}
                                  min={0}
                                  max={9999}
                                  step={1}
                                  shiftStep={5}
                                  onChange={(val) => onSetPurchased(item.id, val)}
                                  className={`w-12 text-center text-xs font-bold font-mono py-0.5 rounded border ${
                                    isParentSatisfied
                                      ? 'bg-slate-900/60 text-slate-400 border-slate-700/40'
                                      : isDirectlyCompleted
                                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                                      : owned > 0
                                      ? 'bg-slate-800 text-cyan-300 border-cyan-500/40'
                                      : 'bg-slate-800 text-slate-300 border-white/10'
                                  } focus:border-cyan-400 focus:outline-none`}
                                  title="ホイールまたは直接入力で所持数を変更"
                                />
                              </div>

                              {/* 残数表示（左詰めで所持数のすぐ右隣） */}
                              <div className="flex items-center gap-1 font-mono text-[0.68rem] px-2 py-0.5 rounded-md bg-slate-900/90 border border-white/5 whitespace-nowrap shadow-inner">
                                <span className="text-[0.62rem] text-slate-400 font-sans">残:</span>
                                <strong className={`${isSatisfied ? 'text-emerald-400 font-extrabold' : shortage > 0 ? 'text-amber-300 font-extrabold' : 'text-slate-400'}`}>
                                  {shortage}
                                </strong>
                                <span className="text-[0.62rem] text-slate-500 font-sans">/{effectiveNeeded}</span>
                                {isParentSatisfied ? (
                                  <span className="text-[0.55rem] text-slate-300 font-sans font-bold ml-0.5">
                                    ✔連動済
                                  </span>
                                ) : isDirectlyCompleted ? (
                                  <span className="text-[0.55rem] text-emerald-300 font-sans font-bold ml-0.5">
                                    {isSelf ? '✔自給' : '✔充足'}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* 右: 操作ボタン */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.hasHqOption && onToggleQuality && (
                                <button
                                  onClick={() => onToggleQuality(item.id)}
                                  className={`px-2 py-0.5 rounded-md text-[0.65rem] font-bold border transition-all ${
                                    item.quality === 'hq'
                                      ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
                                      : 'bg-slate-700/60 text-slate-400 border-white/10 hover:text-white'
                                  }`}
                                  title="HQ相場とNQ相場を切り替え"
                                >
                                  {item.quality === 'hq' ? 'HQ' : 'NQ'}
                                </button>
                              )}
                              {onToggleSelfSufficient && (
                                <button
                                  onClick={() => onToggleSelfSufficient(item.id)}
                                  className={`px-2 py-0.5 rounded-md text-[0.65rem] font-bold border transition-all ${
                                    isSelf
                                      ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50'
                                      : 'bg-slate-700/60 text-slate-400 border-white/10 hover:text-emerald-300'
                                  }`}
                                  title={isSelf ? '自給解除（通常調達へ戻す）' : '自給自足にする（残数0・費用0G）'}
                                >
                                  <i className="fa-solid fa-leaf text-[0.55rem]"></i> 自給
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isFocused) {
                                    setFocusItemId(null);
                                  } else {
                                    setFocusItemId(item.id);
                                  }
                                }}
                                className={`px-2 py-0.5 rounded-md text-[0.65rem] font-bold border transition-all ${
                                  isFocused
                                    ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                                    : 'bg-slate-700/60 text-slate-300 border-white/10 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-400/50'
                                }`}
                                title={isFocused ? '絞り込みを解除' : 'この素材と関連材料だけに絞り込む'}
                              >
                                <i className={`fa-solid ${isFocused ? 'fa-xmark' : 'fa-filter'} text-[0.55rem]`}></i>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 下部: 2列ミニパネル比較（余裕のある広々レイアウト） */}
                        {hasCraftOption ? (
                          /* 【中間素材】製作パネル vs 購入パネル (左右独立2列カード) */
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 shrink-0">
                            {/* 製作ルートパネル */}
                            <div className={`h-[64px] p-2 rounded-xl border flex flex-col justify-between transition-all ${
                              isCraftAdopted && isActive
                                ? 'bg-sky-950/40 border-sky-500/50 shadow-[0_0_12px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/30'
                                : 'bg-black/25 border-white/5 opacity-70'
                            }`}>
                              <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-white/5 text-[0.68rem] font-mono">
                                <span className="text-slate-400 font-sans flex items-center gap-1">
                                  <i className="fa-solid fa-hammer text-[0.58rem] text-sky-400"></i> 製作原価
                                </span>
                                <strong className="text-sky-300 font-bold">{unitCraftCost.toLocaleString()} G</strong>
                              </div>
                              <div className="flex items-center justify-between font-mono">
                                <span className={`text-[0.65rem] font-sans ${isCraftAdopted && isActive ? 'text-sky-300 font-bold' : 'text-slate-400'}`}>
                                  製作小計
                                </span>
                                <strong className={`${isCraftAdopted && isActive ? 'text-sky-200 font-extrabold text-[0.88rem]' : 'text-sky-300/70 font-semibold text-[0.78rem]'}`}>
                                  {craftSubtotal.toLocaleString()} G
                                </strong>
                              </div>
                            </div>

                            {/* 購入ルートパネル */}
                            <div className={`h-[64px] p-2 rounded-xl border flex flex-col justify-between transition-all ${
                              isBuyAdopted && isActive
                                ? 'bg-amber-950/40 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30'
                                : 'bg-black/25 border-white/5 opacity-70'
                            }`}>
                              <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-white/5 text-[0.68rem] font-mono">
                                <span className="text-slate-400 font-sans flex items-center gap-1">
                                  <i className="fa-solid fa-cart-shopping text-[0.58rem] text-amber-400"></i> 目標仕入
                                </span>
                                <strong className="text-amber-300 font-bold">{targetBuyPrice.toLocaleString()} G</strong>
                              </div>
                              <div className="flex items-center justify-between font-mono">
                                <span className={`text-[0.65rem] font-sans ${isBuyAdopted && isActive ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                                  購入小計
                                </span>
                                <strong className={`${isBuyAdopted && isActive ? 'text-amber-200 font-extrabold text-[0.88rem]' : 'text-amber-300/70 font-semibold text-[0.78rem]'}`}>
                                  {buySubtotal.toLocaleString()} G
                                </strong>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* 【1次素材】目標仕入単価 ＆ 購入小計 (中間素材と同じ高さ・質感のフルワイドカード) */
                          <div className="pt-2 border-t border-white/10 shrink-0">
                            <div className="h-[64px] px-3 py-2 rounded-xl border bg-amber-950/25 border-amber-500/30 flex items-center justify-between shadow-sm">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="text-slate-400 font-sans text-[0.7rem]">
                                    {item.method === 'buy_npc' ? 'NPC店売単価:' : '目標仕入単価:'}
                                  </span>
                                  <strong className="text-amber-300 font-bold font-mono text-xs">
                                    {targetBuyPrice.toLocaleString()} G
                                  </strong>
                                  {item.method !== 'buy_npc' && (
                                    <span className="text-amber-400 font-sans font-bold text-[0.65rem]">以下</span>
                                  )}
                                </div>
                                <div className="text-[0.65rem] text-slate-500 font-mono">
                                  (必要数 {calcQty} 個分)
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[0.65rem] text-slate-400 block font-sans">
                                  {item.method === 'buy_npc' ? '店売小計' : '購入小計'}
                                </span>
                                <strong className="text-amber-200 font-extrabold text-[0.95rem] font-mono">
                                  {buySubtotal.toLocaleString()} G
                                </strong>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 列と列を繋ぐフロー矢印 */}
              <div className="flex items-center justify-center flex-shrink-0 text-slate-600 px-0">
                <i className="fa-solid fa-arrow-right text-xs text-cyan-500/40"></i>
              </div>
            </React.Fragment>
          );
        })}

        {/* 最終ステップ: 完成品カード一覧 */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-[340px] max-w-[540px] flex-shrink-0 flex flex-col bg-slate-900/95 border border-amber-500/30 rounded-2xl p-3 shadow-xl transition-all"
        >
          {/* 列ヘッダー */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[0.68rem] font-black font-mono">
                FINAL
              </span>
              <h4 className="text-xs font-extrabold text-amber-300 tracking-wide">
                最終完成品 {targets.length > 1 ? `(${targets.length}品目)` : ''}
              </h4>
            </div>
            <div className="text-right">
              <span className="text-[0.68rem] font-bold text-slate-300 block">{targets.length}品目</span>
            </div>
          </div>

          {/* 完成品カードリスト（複数時はスクロール可能、他カードと完全同サイズ h-[188px]） */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {targets.map((target) => {
              const item = target.item;
              const count = target.craftCount;
              const isFocused = focusItemId === item.item_id;
              const isTargetHovered = hoveredItemId === item.item_id;
              const isAncestorOfHovered = hoveredItemId !== null && hasDescendantInTree(target.tree, hoveredItemId);
              const isRelatedInFocus = focusedVisibleIds ? focusedVisibleIds.has(item.item_id) : true;
              const metric = targetMetricsMap.get(target.cardKey) || {
                procureCost: item.craft_cost * count,
                remainingCost: 0,
                totalItems: 0,
                completedItems: 0,
              };
              const isAllProcured = metric.totalItems > 0 && metric.completedItems === metric.totalItems;

              // ハイライトと透過度の算出（絞り込み検索時のみハイライト・減光を適用）
              let cardOpacity = 'opacity-100';
              let borderHighlight = isAllProcured
                ? 'border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                : 'border-amber-500/30 hover:border-amber-400';
              let glowClass = '';

              if (isFocused) {
                borderHighlight = 'border-cyan-400 shadow-[0_0_18px_rgba(0,210,255,0.6)]';
                glowClass = 'ring-2 ring-cyan-400';
                cardOpacity = 'opacity-100';
              } else if (focusItemId !== null) {
                if (activeRelations) {
                  if (isTargetHovered) {
                    borderHighlight = 'border-cyan-400 shadow-[0_0_15px_rgba(0,210,255,0.4)]';
                    glowClass = 'ring-2 ring-cyan-400/50';
                    cardOpacity = 'opacity-100';
                  } else if (isAncestorOfHovered) {
                    borderHighlight = 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]';
                    glowClass = 'ring-2 ring-amber-400/50';
                    cardOpacity = 'opacity-100';
                  } else {
                    cardOpacity = isRelatedInFocus ? 'opacity-70' : 'opacity-30';
                  }
                } else {
                  cardOpacity = isRelatedInFocus ? 'opacity-100' : 'opacity-30';
                }
              }

              return (
                <div
                  key={target.cardKey}
                  onMouseEnter={() => {
                    if (focusItemId !== null) {
                      setHoveredItemId(item.item_id);
                    }
                  }}
                  onMouseLeave={() => {
                    if (focusItemId !== null) {
                      setHoveredItemId(null);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick(item.item_id, currentWorld, Boolean(item.is_hq));
                  }}
                  className={`relative h-[188px] p-3 rounded-2xl flex flex-col justify-between transition-all cursor-pointer border ${borderHighlight} ${cardOpacity} ${glowClass} shadow-md group ${
                    isFocused
                      ? 'bg-cyan-950/40'
                      : isAllProcured
                      ? 'bg-emerald-950/30 hover:bg-emerald-950/40'
                      : 'bg-slate-800/80 hover:bg-slate-800'
                  }`}
                >
                  {/* 上部: アイコン + 名前 + ジョブ/Lv + バッジ */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <img
                      src={item.icon}
                      alt={item.name}
                      className={`w-9 h-9 rounded-xl border bg-black/40 flex-shrink-0 object-contain shadow-inner ${
                        isAllProcured ? 'border-emerald-500/50' : 'border-amber-500/40'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5 mb-0.5">
                        <span
                          className={`text-[0.82rem] font-bold truncate ${
                            isFocused
                              ? 'text-cyan-200 font-black'
                              : isAllProcured
                              ? 'text-emerald-300 font-extrabold'
                              : 'text-slate-100 group-hover:text-amber-300'
                          }`}
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isAllProcured && (
                            <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold flex items-center gap-0.5">
                              <i className="fa-solid fa-check text-[0.55rem]"></i> 調達完了
                            </span>
                          )}
                          {isFocused && (
                            <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 font-bold">
                              絞込中
                            </span>
                          )}
                          <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-md bg-amber-500/25 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm">
                            <i className="fa-solid fa-crown text-[0.55rem]"></i> 完成品
                          </span>
                          {targets.length > 1 && onRemoveTarget && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveTarget(target.cardKey);
                              }}
                              className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 text-xs transition-all cursor-pointer"
                              title="この品目をクラフト対象から除外"
                            >
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ジョブバッジ ＋ Lv ＋ IL ＋ カテゴリ */}
                      <div className="flex items-center gap-2 text-[0.7rem] text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis">
                        <span className={getJobBadgeStyle(item.job, item.is_company)}>
                          {item.job}
                        </span>
                        <span>Lv.{item.lvl}</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-slate-300">
                          IL{item.ilvl || 1} · {item.cat || ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 中段: 製作回数 ＆ 個別調達進捗 ＆ 絞り込みボタン (h-[36px] 他カードと統一) */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="my-1.5 px-3 py-1 rounded-xl border flex items-center justify-between text-xs transition-all h-[36px] shrink-0 bg-black/35 border-white/10"
                  >
                    {/* 左: 製作回数 */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[0.68rem] text-slate-400 font-bold flex items-center gap-1">
                        <i className="fa-solid fa-hammer text-cyan-400 text-[0.65rem]"></i> 製作:
                      </span>
                      <WheelNumberInput
                        value={count}
                        min={1}
                        max={999}
                        step={1}
                        shiftStep={5}
                        onChange={(val) => {
                          if (onUpdateTargetCraftCount) {
                            onUpdateTargetCraftCount(target.cardKey, val);
                          }
                        }}
                        className="w-12 text-center text-xs font-bold font-mono py-0.5 rounded border bg-slate-800 text-amber-300 border-white/10 focus:border-amber-400 focus:outline-none"
                        title="ホイールまたは直接入力で製作回数を変更"
                      />
                      <span className="text-[0.68rem] text-slate-400 font-mono">
                        回 (計<strong>{count * (item.amt || 1)}</strong>個)
                      </span>
                    </div>

                    {/* 右: 調達進捗 ＆ 絞り込みボタン */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* 個別調達進捗 */}
                      <div
                        className="flex items-center gap-1.5 font-mono text-[0.68rem] px-2 py-0.5 rounded-md bg-slate-900/90 border border-white/5 shadow-inner"
                        title={`材料調達進捗: ${metric.completedItems}/${metric.totalItems}品目`}
                      >
                        <span className="text-[0.62rem] text-slate-400 font-sans">調達:</span>
                        <strong className={isAllProcured ? 'text-emerald-400 font-extrabold' : 'text-amber-300 font-extrabold'}>
                          {metric.completedItems}/{metric.totalItems}
                        </strong>
                        <div className="w-8 h-1.5 bg-slate-700 rounded-full overflow-hidden ml-0.5">
                          <div
                            className="h-full bg-emerald-400 transition-all duration-300"
                            style={{
                              width: `${metric.totalItems > 0 ? (metric.completedItems / metric.totalItems) * 100 : 0}%`,
                            }}
                          ></div>
                        </div>
                      </div>

                      {/* 絞り込みボタン */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isFocused) {
                            setFocusItemId(null);
                          } else {
                            setFocusItemId(item.item_id);
                          }
                        }}
                        className={`px-2 py-0.5 rounded-md text-[0.65rem] font-bold border transition-all cursor-pointer ${
                          isFocused
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-extrabold shadow-[0_0_8px_rgba(0,210,255,0.4)]'
                            : 'bg-slate-700/60 text-slate-300 border-white/10 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-400/50'
                        }`}
                        title={isFocused ? '絞り込みを解除' : 'この完成品の材料ツリーだけに絞り込む'}
                      >
                        <i className={`fa-solid ${isFocused ? 'fa-xmark' : 'fa-filter'} text-[0.55rem]`}></i>
                      </button>
                    </div>
                  </div>

                  {/* 下部: 製作原価/残額 ＆ 想定販売/利益 (h-[64px] 2分割カード) */}
                  <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 shrink-0">
                    {/* 左: 調達費用（製作原価 ＆ 調達残額） */}
                    <div className="h-[64px] p-2 rounded-xl border bg-slate-900/70 border-white/10 flex flex-col justify-between shadow-sm">
                      <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-white/5 text-[0.68rem] font-mono">
                        <span className="text-slate-400 font-sans flex items-center gap-1">
                          <i className="fa-solid fa-coins text-[0.58rem] text-slate-400"></i> 製作原価
                        </span>
                        <strong className="text-slate-200 font-bold">{metric.procureCost.toLocaleString()} G</strong>
                      </div>
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-[0.65rem] font-sans text-slate-400">調達残額</span>
                        {metric.remainingCost > 0 ? (
                          <strong className="text-amber-300 font-extrabold text-[0.88rem]">
                            {metric.remainingCost.toLocaleString()} G
                          </strong>
                        ) : (
                          <span className="text-emerald-400 font-bold text-[0.72rem] flex items-center gap-0.5">
                            <i className="fa-solid fa-check text-[0.6rem]"></i> 完了 0G
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 右: 想定販売 ＆ 見込み利益 */}
                    <div className="h-[64px] p-2 rounded-xl border bg-slate-900/70 border-white/10 flex flex-col justify-between shadow-sm">
                      <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-white/5 text-[0.68rem] font-mono">
                        <span className="text-slate-400 font-sans flex items-center gap-1">
                          <i className="fa-solid fa-store text-[0.58rem] text-sky-400"></i> 想定販売
                        </span>
                        <strong className="text-sky-300 font-bold">{(item.sell_price * count).toLocaleString()} G</strong>
                      </div>
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-[0.65rem] font-sans text-slate-400">見込み利益</span>
                        {(() => {
                          const itemProfitTotal = item.profit * count;
                          return (
                            <strong className={`${itemProfitTotal > 0 ? 'text-emerald-400' : 'text-rose-400'} font-extrabold text-[0.88rem]`}>
                              {itemProfitTotal > 0 ? '+' : ''}{itemProfitTotal.toLocaleString()} G
                            </strong>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
