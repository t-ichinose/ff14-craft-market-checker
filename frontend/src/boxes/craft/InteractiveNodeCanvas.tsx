import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { CraftCardItem, RecipeTreeItem, SelectedCraftTarget } from './craftTypes';
import { calculateTreeLayout, buildMultiCraftPipeline, getJobBadgeStyle } from './craftTreeUtils';
import { MaterialCard } from './MaterialCard';
import { PipelineLineCanvas } from './PipelineLineCanvas';
import { WheelNumberInput } from './WheelNumberInput';

export interface InteractiveNodeCanvasProps {
  selectedItem: CraftCardItem;
  tree: RecipeTreeItem[];
  currentWorld: string;
  onOpenMarketModal?: (itemId: number, worldName?: string, isHq?: boolean) => void;
  onToggleQuality?: (itemId: number) => void;
  onToggleSelfSufficient?: (itemId: number) => void;
  craftCount?: number;
  onChangeCraftCount?: (count: number) => void;
  purchasedMap?: Record<number, number>;
  onSetPurchased?: (id: number, amount: number) => void;
  onToggleFullPurchased?: (id: number, neededAmount: number) => void;
  onClearPurchased?: () => void;
  selectedTargets?: SelectedCraftTarget[];
  onUpdateTargetCraftCount?: (cardKey: string, count: number) => void;
  onRemoveTarget?: (cardKey: string) => void;
}

export const InteractiveNodeCanvas: React.FC<InteractiveNodeCanvasProps> = React.memo(({
  selectedItem,
  tree,
  currentWorld,
  onOpenMarketModal,
  onToggleQuality,
  onToggleSelfSufficient,
  craftCount = 1,
  onChangeCraftCount,
  purchasedMap = {},
  onSetPurchased,
  onToggleFullPurchased,
  onClearPurchased,
  selectedTargets,
  onUpdateTargetCraftCount,
  onRemoveTarget,
}) => {
  const [viewMode, setViewMode] = useState<'pipeline' | 'tree'>('pipeline');
  const [focusItemId, setFocusItemId] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const panRef = useRef<{ x: number; y: number }>({ x: 40, y: 40 });
  const zoomRef = useRef<number>(0.85);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);

  // Keep refs in sync with state
  panRef.current = pan;
  zoomRef.current = zoom;

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

  const isMultiTargets = targets.length > 1;

  // 樹形図ツリーのレイアウト計算（単一品目時・ツリービュー用）
  const { nodes, edges } = useMemo(() => {
    return calculateTreeLayout(selectedItem, tree, craftCount);
  }, [selectedItem, tree, craftCount]);

  // 製造ライン（パイプライン）のデータ計算（複数品目対応）
  const { steps } = useMemo(() => {
    return buildMultiCraftPipeline(targets);
  }, [targets]);

  const allItemMap = useMemo(() => {
    const map = new Map<number, any>();
    for (const s of steps) {
      for (const item of s.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [steps]);

  const focusedItemName = useMemo(() => {
    if (focusItemId === null) return '';
    const matchedTarget = targets.find((t) => t.item.item_id === focusItemId);
    if (matchedTarget) return matchedTarget.item.name;
    return allItemMap.get(focusItemId)?.name || `アイテム #${focusItemId}`;
  }, [focusItemId, targets, allItemMap]);

  // 調達進捗・調達費用の集計（全ターゲットの末端仕入れ素材基準で正確に算出・中間素材の二重計上を防止）
  const { totalProcureCost, remainingProcureCost, totalProcureItemsCount, completedCount } = useMemo(() => {
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

    for (const t of targets) {
      const safeMult = Math.max(1, t.craftCount || 1);
      traverse(t.tree || [], safeMult, safeMult, false);
    }

    let total = 0;
    let remaining = 0;
    let comp = 0;

    for (const item of procMap.values()) {
      total += item.unitPrice * item.amount;
      remaining += item.unitPrice * item.remainingAmount;
      if (item.remainingAmount === 0) {
        comp++;
      }
    }

    return {
      totalProcureCost: total,
      remainingProcureCost: remaining,
      totalProcureItemsCount: procMap.size,
      completedCount: comp,
    };
  }, [targets, purchasedMap]);

  const hasAnyOwned = useMemo(() => {
    return Object.values(purchasedMap).some((val) => val > 0);
  }, [purchasedMap]);

  const canvasSize = useMemo(() => {
    let maxX = 800;
    let maxY = 600;
    nodes.forEach((n) => {
      maxX = Math.max(maxX, n.x + n.width + 100);
      maxY = Math.max(maxY, n.y + n.height + 100);
    });
    return { width: maxX, height: maxY };
  }, [nodes]);

  const updateTransformDirect = useCallback((x: number, y: number, scale: number) => {
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    }
  }, []);

  const handleResetView = useCallback(() => {
    const root = nodes.find((n) => n.type === 'root');
    const containerH = containerRef.current?.clientHeight || 600;
    const initialZoom = 0.82;

    let targetPanY = 40;
    if (root) {
      const rootCenterY = (root.y + root.height / 2) * initialZoom;
      targetPanY = Math.max(20, Math.round((containerH / 2) - rootCenterY));
    }

    setZoom(initialZoom);
    setPan({ x: 40, y: targetPanY });
    panRef.current = { x: 40, y: targetPanY };
    zoomRef.current = initialZoom;
    updateTransformDirect(40, targetPanY, initialZoom);
  }, [updateTransformDirect, nodes]);

  const lastItemIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastItemIdRef.current !== selectedItem.item_id) {
      lastItemIdRef.current = selectedItem.item_id;
      setFocusItemId(null);
      handleResetView();
    }
  }, [selectedItem.item_id, handleResetView]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.interactive-node-card')) return;
    setIsDragging(true);
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - panRef.current.x,
      y: e.clientY - panRef.current.y,
    };
    if (contentRef.current) {
      contentRef.current.style.willChange = 'transform';
      contentRef.current.style.transition = 'none';
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const nextX = e.clientX - dragStartRef.current.x;
    const nextY = e.clientY - dragStartRef.current.y;
    panRef.current = { x: nextX, y: nextY };

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        updateTransformDirect(panRef.current.x, panRef.current.y, zoomRef.current);
        rafIdRef.current = null;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    setIsDragging(false);
    isDraggingRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (contentRef.current) {
      contentRef.current.style.willChange = 'auto';
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setPan({ ...panRef.current });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    const currentZ = zoomRef.current;
    const currentP = panRef.current;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const nextZoom = Math.min(Math.max(currentZ * zoomFactor, 0.35), 2.2);

    if (nextZoom === currentZ) return;

    const worldX = (mouseX - currentP.x) / currentZ;
    const worldY = (mouseY - currentP.y) / currentZ;

    const nextPanX = mouseX - worldX * nextZoom;
    const nextPanY = mouseY - worldY * nextZoom;

    panRef.current = { x: nextPanX, y: nextPanY };
    zoomRef.current = nextZoom;

    updateTransformDirect(nextPanX, nextPanY, nextZoom);
    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  return (
    <div className="relative flex-1 w-full h-full overflow-hidden rounded-xl bg-slate-950/80 border border-white/10 shadow-inner select-none flex flex-col">
      {/* 統合 1行コントロールヘッダーバー */}
      <div className="flex-shrink-0 w-full bg-slate-900/95 border-b border-white/10 px-3 py-1.5 flex items-center justify-between gap-3 z-40 backdrop-blur-md">
        {/* 左: モード切替タブ ＋ 製作回数 ＋ フォーカス表示 */}
        <div className="flex items-center gap-2.5">
          {/* モード切替タブ */}
          <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'pipeline'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="工程ステップ順（製造ライン型）で表示"
            >
              <i className="fa-solid fa-industry"></i>
              <span>製造ライン</span>
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'tree'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="従来の枝分かれ樹形図で表示"
            >
              <i className="fa-solid fa-network-wired"></i>
              <span>樹形図ツリー</span>
            </button>
          </div>

          {/* 製作回数 (単一選択時) または 複数品目バッジ (複数選択時) */}
          {isMultiTargets ? (
            <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 rounded-lg text-xs">
              <span className="text-[0.7rem] text-amber-300 font-extrabold flex items-center gap-1 font-mono">
                <i className="fa-solid fa-layer-group text-amber-400"></i>
                バッチ製作: {targets.length}品目
              </span>
              <span className="text-[0.62rem] text-slate-400">
                (各数量は最終完成品列で設定)
              </span>
            </div>
          ) : (
            onChangeCraftCount && (
              <div className="flex items-center gap-1 bg-black/40 border border-white/15 px-2 py-0.5 rounded-lg text-xs">
                <span className="text-[0.68rem] text-slate-400 font-bold">製作:</span>
                <WheelNumberInput
                  value={craftCount}
                  min={1}
                  max={999}
                  step={1}
                  shiftStep={5}
                  onChange={onChangeCraftCount}
                  className="w-10 bg-slate-800 border border-white/20 rounded text-center text-xs font-bold text-amber-300 font-mono py-0.2 focus:border-amber-400 focus:outline-none"
                  title="ホイールまたは直接入力で製作回数を変更"
                />
                <span className="text-[0.65rem] text-slate-400 font-mono">
                  回 (計<strong>{craftCount * (selectedItem.amt || 1)}</strong>個)
                </span>
              </div>
            )
          )}

          {/* フォーカス絞り込み表示 */}
          {focusItemId !== null ? (
            <div className="flex items-center gap-2 bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 rounded-lg text-xs">
              <span className="text-cyan-300 font-extrabold flex items-center gap-1 text-[0.72rem]">
                <i className="fa-solid fa-filter"></i> 【{focusedItemName}】絞込中
              </span>
              <button
                onClick={() => setFocusItemId(null)}
                className="px-1.5 py-0.2 rounded bg-cyan-400/20 hover:bg-cyan-400/40 text-cyan-200 text-[0.65rem] font-bold transition-all cursor-pointer"
                title="絞り込みを解除して全品目を表示"
              >
                ✕ 解除
              </button>
            </div>
          ) : (
            <span className="text-[0.68rem] text-slate-400 hidden md:inline">
              全 {steps.reduce((c, s) => c + s.items.length, 0)} 品目
            </span>
          )}
        </div>

        {/* 中央: (ツリー時のみ)ズームコントロール */}
        <div className="flex items-center gap-3">
          {viewMode === 'tree' && (
            <div className="flex items-center gap-1 bg-black/40 border border-white/10 px-1.5 py-0.5 rounded-lg">
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.15, 2.0))}
                className="w-6 h-6 rounded bg-black/40 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-xs flex items-center justify-center cursor-pointer"
                title="拡大 (Zoom In)"
              >
                <i className="fa-solid fa-plus text-[0.65rem]"></i>
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.15, 0.35))}
                className="w-6 h-6 rounded bg-black/40 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-xs flex items-center justify-center cursor-pointer"
                title="縮小 (Zoom Out)"
              >
                <i className="fa-solid fa-minus text-[0.65rem]"></i>
              </button>
              <span className="text-[0.68rem] font-mono font-bold text-cyan-300 px-1">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleResetView}
                className="px-1.5 h-6 rounded bg-black/40 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-[0.65rem] font-bold flex items-center gap-1 cursor-pointer"
                title="表示位置をリセット"
              >
                <i className="fa-solid fa-arrows-to-dot text-[0.6rem]"></i> リセット
              </button>
            </div>
          )}
        </div>

        {/* 右: 調達進捗 ＋ 調達費用（原価総額・残額） ＋ クリアボタン */}
        <div className="flex items-center gap-3">
          {/* 調達進捗（品目数） */}
          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 px-2 py-0.5 rounded-lg text-xs">
            <span className="text-[0.65rem] text-slate-400">調達:</span>
            <span className="font-mono font-bold text-xs text-emerald-400">
              {completedCount}/{totalProcureItemsCount}
            </span>
            <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{
                  width: `${totalProcureItemsCount > 0 ? (completedCount / totalProcureItemsCount) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>

          {/* 調達費用: 製作原価（総額） ＆ 調達残額 */}
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-2.5 py-0.5 rounded-lg text-xs font-mono">
            <div className="flex items-center gap-1 text-[0.7rem] text-slate-400">
              <span>製作原価:</span>
              <strong className="text-slate-200 font-bold">
                {totalProcureCost.toLocaleString()} G
              </strong>
              {!isMultiTargets && craftCount > 1 && (
                <span className="text-[0.62rem] text-slate-400 hidden sm:inline">
                  (1回 {selectedItem.craft_cost.toLocaleString()}G)
                </span>
              )}
            </div>

            <span className="text-white/15">|</span>

            <div className="flex items-center gap-1 text-xs">
              <span className="text-[0.7rem] text-slate-400">残額:</span>
              {remainingProcureCost > 0 ? (
                <strong className="text-amber-300 font-extrabold text-sm">
                  {remainingProcureCost.toLocaleString()} G
                </strong>
              ) : (
                <span className="text-emerald-400 font-bold text-xs flex items-center gap-0.5">
                  <i className="fa-solid fa-check text-[0.65rem]"></i> 完了 0 G
                </span>
              )}
            </div>
          </div>

          {/* 所持数クリア */}
          {hasAnyOwned && onClearPurchased && (
            <button
              onClick={onClearPurchased}
              className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
              title="入力した所持数をすべてクリア (0個に戻す)"
            >
              <i className="fa-solid fa-rotate-left text-[0.65rem]"></i>
              <span className="hidden sm:inline">クリア</span>
            </button>
          )}
        </div>
      </div>

      {/* Floating Canvas Legend (Tree View Only) */}
      {viewMode === 'tree' && (
        <div className="absolute right-4 bottom-4 z-30 bg-slate-900/90 border border-white/15 rounded-xl px-3 py-1.5 text-[0.68rem] text-slate-300 flex items-center gap-3 backdrop-blur-md shadow-xl pointer-events-none">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,210,255,0.8)]"></span>
            <strong className="text-white">🌟 採用ルート（仕入れ対象）</strong>
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-500"></span>
            <span>🚫 スキップ（購入不要・計算除外）</span>
          </span>
        </div>
      )}

      {/* Content Rendering: Pipeline View or Tree Canvas View */}
      {viewMode === 'pipeline' ? (
        <div className="flex-1 w-full h-full overflow-hidden">
          <PipelineLineCanvas
            selectedItem={selectedItem}
            tree={tree}
            currentWorld={currentWorld}
            craftCount={craftCount}
            purchasedMap={purchasedMap}
            onSetPurchased={onSetPurchased}
            onToggleFullPurchased={onToggleFullPurchased}
            onOpenMarketModal={onOpenMarketModal}
            onToggleQuality={onToggleQuality}
            onToggleSelfSufficient={onToggleSelfSufficient}
            focusItemId={focusItemId}
            onSetFocusItemId={setFocusItemId}
            selectedTargets={targets}
            onUpdateTargetCraftCount={onUpdateTargetCraftCount}
            onRemoveTarget={onRemoveTarget}
            steps={steps}
            allItemMap={allItemMap}
          />
        </div>
      ) : (
        /* Infinite Grid Background & Transform Layer */
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          className={`w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} relative touch-none select-none`}
          style={{
            backgroundImage: `
              radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
          }}
        >
          <div
            ref={contentRef}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              width: canvasSize.width,
              height: canvasSize.height,
              position: 'absolute',
              left: 0,
              top: 0,
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
            }}
          >
            {/* SVG Layer */}
            <svg
              className="absolute left-0 top-0 pointer-events-none z-0 overflow-visible"
              style={{ width: canvasSize.width, height: canvasSize.height }}
            >
              <defs>
                <linearGradient id="edge-grad-default" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.7" />
                </linearGradient>
                <linearGradient id="edge-grad-crafted" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.7" />
                </linearGradient>
              </defs>

              {edges.map((edge) => {
                const { startX, startY, endX, endY, isCrafted, isActive } = edge;
                const dx = Math.max(36, (endX - startX) * 0.5);
                const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

                if (!isActive) {
                  return (
                    <g key={edge.id}>
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#475569"
                        strokeWidth="1.8"
                        strokeDasharray="4 4"
                        strokeOpacity="0.5"
                      />
                      <circle cx={endX} cy={endY} r="2.5" fill="#475569" opacity="0.6" />
                    </g>
                  );
                }

                return (
                  <g key={edge.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isCrafted ? '#38bdf8' : '#00d2ff'}
                      strokeWidth="5"
                      strokeOpacity="0.18"
                      strokeLinecap="round"
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isCrafted ? 'url(#edge-grad-crafted)' : 'url(#edge-grad-default)'}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={startX}
                      cy={startY}
                      r="2.5"
                      fill={isCrafted ? '#38bdf8' : '#00d2ff'}
                      opacity="0.85"
                    />
                    <circle
                      cx={endX}
                      cy={endY}
                      r="3.5"
                      fill={isCrafted ? '#38bdf8' : '#00d2ff'}
                      className="drop-shadow-[0_0_6px_rgba(0,210,255,0.9)]"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Cards Layer */}
            {nodes.map((node) => {
              if (node.type === 'root') {
                const root = node.data as CraftCardItem;
                const jobStyle = getJobBadgeStyle(root.job, root.is_company);

                return (
                  <div
                    key={node.id}
                    onClick={() => onOpenMarketModal && onOpenMarketModal(root.item_id, currentWorld, root.is_hq)}
                    className="interactive-node-card absolute z-10 cursor-pointer group"
                    style={{
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      height: node.height,
                    }}
                  >
                    <div className="relative p-2 rounded-xl bg-slate-900/90 border border-cyan-500/40 hover:border-cyan-400 shadow-[0_0_20px_rgba(0,210,255,0.2)] hover:shadow-[0_0_25px_rgba(0,210,255,0.35)] transition-all">
                      <div className="flex items-center gap-2 mb-1.5">
                        <img
                          src={root.icon}
                          alt={root.name}
                          className="w-9 h-9 rounded-lg border border-cyan-500/30 bg-black/40 object-contain flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white group-hover:text-cyan-300 truncate">
                              {root.name}
                            </span>
                            {root.is_hq ? (
                              <span className="text-[0.62rem] font-black text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/40">
                                HQ
                              </span>
                            ) : (
                              <span className="text-[0.62rem] font-bold text-slate-400 bg-slate-800 px-1 py-0.2 rounded border border-slate-700">
                                NQ
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`px-1.5 py-0.2 rounded text-[0.62rem] font-semibold border ${jobStyle}`}>
                              {root.job}
                            </span>
                            <span className="text-[0.68rem] text-slate-400">Lv.{root.lvl}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="text-slate-400 text-[0.55rem] whitespace-nowrap">製作原価</span>
                            <strong className="text-emerald-400 font-['Outfit'] text-[0.68rem] whitespace-nowrap">
                              {root.craft_cost.toLocaleString()}G
                            </strong>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-400 text-[0.55rem] whitespace-nowrap">販売価格</span>
                            <strong className="text-amber-300 font-['Outfit'] text-[0.68rem] whitespace-nowrap">
                              {root.sell_price.toLocaleString()}G
                            </strong>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-400 text-[0.55rem] whitespace-nowrap">純利益</span>
                            <strong className={`font-['Outfit'] font-bold text-[0.68rem] whitespace-nowrap ${root.profit > 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
                              {root.profit > 0 ? '+' : ''}{root.profit.toLocaleString()}G
                            </strong>
                          </div>
                        </div>
                      </div>

                      {((craftCount > 1) || root.amt > 1) && (
                        <div className="mt-1 pt-1 border-t border-cyan-500/20 bg-cyan-950/40 -mx-1 -mb-0.5 px-2 py-0.5 rounded flex items-center justify-between text-[0.58rem] text-cyan-300">
                          <span>
                            🔨 {craftCount > 1 ? `${craftCount}回製作 ➔ 計` : ''}<strong>{(root.amt || 1) * craftCount}個</strong>完成
                            (総素材: {((root.batch_cost || root.craft_cost) * craftCount).toLocaleString()}G)
                          </span>
                          <span className={`font-bold ${root.profit > 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                            総利益: {((root.profit * (root.amt || 1)) * craftCount).toLocaleString()}G
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              if (node.type === 'material') {
                const mat = node.data as RecipeTreeItem;
                return (
                  <MaterialCard
                    key={node.id}
                    mat={mat}
                    multiplier={node.multiplier}
                    currentWorld={currentWorld}
                    onOpenMarketModal={onOpenMarketModal}
                    onToggleQuality={onToggleQuality}
                    onToggleSelfSufficient={onToggleSelfSufficient}
                    className="absolute z-10"
                    style={{
                      left: node.x,
                      top: node.y,
                      width: node.width,
                    }}
                  />
                );
              }

              return null;
            })}
          </div>
        </div>
      )}
    </div>
  );
});
