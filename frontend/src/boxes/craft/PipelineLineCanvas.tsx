import React, { useState, useMemo, useCallback } from 'react';
import type { CraftCardItem, RecipeTreeItem, SelectedCraftTarget } from './craftTypes';
import { buildMultiCraftPipeline, type PipelineItem } from './craftTreeUtils';
import { ALL_JAPAN_WORLDS } from '../../shared/marketConstants';
import {
  calculatePipelineDemandAndSatisfaction,
  calculateTargetMetrics,
  hasDescendantInTree,
} from './pipelineCalculationUtils';
import { PipelineItemCard } from './PipelineItemCard';
import { PipelineTargetCard } from './PipelineTargetCard';

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
  const handleCardClick = useCallback((itemId: number, worldName: string, isHq: boolean) => {
    const validWorld = (worldName && ALL_JAPAN_WORLDS.includes(worldName)) ? worldName : currentWorld;
    if (onOpenMarketModal) {
      onOpenMarketModal(itemId, validWorld, isHq);
    }
  }, [currentWorld, onOpenMarketModal]);

  const handleToggleFocus = useCallback((itemId: number) => {
    setFocusItemId(focusItemId === itemId ? null : itemId);
  }, [setFocusItemId, focusItemId]);

  const handleMouseEnter = useCallback((itemId: number) => {
    setHoveredItemId(itemId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredItemId(null);
  }, []);

  // 各アイテムの有効必要数量と親工程充足判定（外部純粋関数で計算）
  const { activeDemandMap, parentSatisfactionMap } = useMemo(() => {
    return calculatePipelineDemandAndSatisfaction(
      targets,
      allItemMap,
      purchasedMap,
      focusItemId,
      targetRootIds
    );
  }, [targets, allItemMap, purchasedMap, focusItemId, targetRootIds]);

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
    return calculateTargetMetrics(targets, purchasedMap);
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
                    const isParentSatisfied = parentSatisfactionMap.get(item.id) || false;
                    const isFocused = focusItemId === item.id;
                    const isHovered = hoveredItemId === item.id;
                    const isIngredient = Boolean(activeRelations?.ingredientIds.has(item.id));
                    const isUsedIn = Boolean(activeRelations?.usedInIds.has(item.id));
                    const isActive = item.isActive;

                    const initialNeeded = isActive
                      ? (item.activeAmount > 0 ? item.activeAmount : item.totalAmount)
                      : item.totalAmount;
                    const effectiveNeeded = isParentSatisfied
                      ? 0
                      : (activeDemandMap.has(item.id) ? activeDemandMap.get(item.id)! : initialNeeded);
                    const owned = purchasedMap[item.id] || 0;
                    const isDirectlyCompleted = isActive && (item.isSelfSufficient || (owned > 0 && owned >= effectiveNeeded));
                    const isSatisfied = isDirectlyCompleted || isParentSatisfied;
                    const shortage = isSatisfied ? 0 : Math.max(0, effectiveNeeded - owned);

                    return (
                      <PipelineItemCard
                        key={item.id}
                        item={item}
                        isParentSatisfied={isParentSatisfied}
                        effectiveNeeded={effectiveNeeded}
                        initialNeeded={initialNeeded}
                        owned={owned}
                        isDirectlyCompleted={isDirectlyCompleted}
                        isSatisfied={isSatisfied}
                        shortage={shortage}
                        isFocused={isFocused}
                        isHovered={isHovered}
                        isIngredient={isIngredient}
                        isUsedIn={isUsedIn}
                        isAnyFocusActive={focusItemId !== null}
                        onCardClick={handleCardClick}
                        onToggleFullPurchased={onToggleFullPurchased}
                        onSetPurchased={onSetPurchased}
                        onToggleQuality={onToggleQuality}
                        onToggleSelfSufficient={onToggleSelfSufficient}
                        onToggleFocus={handleToggleFocus}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                      />
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
              const isFocused = focusItemId === item.item_id;
              const isTargetHovered = hoveredItemId === item.item_id;
              const isAncestorOfHovered = hoveredItemId !== null && hasDescendantInTree(target.tree, hoveredItemId);
              const isRelatedInFocus = focusedVisibleIds ? focusedVisibleIds.has(item.item_id) : true;
              const metric = targetMetricsMap.get(target.cardKey) || {
                procureCost: item.craft_cost * target.craftCount,
                remainingCost: 0,
                totalItems: 0,
                completedItems: 0,
              };

              return (
                <PipelineTargetCard
                  key={target.cardKey}
                  target={target}
                  currentWorld={currentWorld}
                  isFocused={isFocused}
                  isTargetHovered={isTargetHovered}
                  isAncestorOfHovered={isAncestorOfHovered}
                  isRelatedInFocus={isRelatedInFocus}
                  isAnyFocusActive={focusItemId !== null}
                  hasActiveRelations={activeRelations !== null}
                  metric={metric}
                  showRemoveButton={targets.length > 1}
                  onCardClick={handleCardClick}
                  onUpdateTargetCraftCount={onUpdateTargetCraftCount}
                  onRemoveTarget={onRemoveTarget}
                  onToggleFocus={handleToggleFocus}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
