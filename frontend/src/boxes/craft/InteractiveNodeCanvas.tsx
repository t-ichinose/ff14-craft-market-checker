import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { CraftCardItem, RecipeTreeItem } from './craftTypes';
import { calculateTreeLayout, getJobBadgeStyle } from './craftTreeUtils';
import { MaterialCard } from './MaterialCard';

export interface InteractiveNodeCanvasProps {
  selectedItem: CraftCardItem;
  tree: RecipeTreeItem[];
  currentWorld: string;
  onOpenMarketModal?: (itemId: number, worldName?: string, isHq?: boolean) => void;
  onToggleQuality?: (itemId: number) => void;
  onSetAllHq?: () => void;
  onSetAllNq?: () => void;
  onToggleSelfSufficient?: (itemId: number) => void;
  onSetAllSelfSufficient?: () => void;
  onClearSelfSufficient?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const InteractiveNodeCanvas: React.FC<InteractiveNodeCanvasProps> = React.memo(({
  selectedItem,
  tree,
  currentWorld,
  onOpenMarketModal,
  onToggleQuality,
  onSetAllHq,
  onSetAllNq,
  onToggleSelfSufficient,
  onSetAllSelfSufficient,
  onClearSelfSufficient,
  isFullscreen,
  onToggleFullscreen,
}) => {
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

  const { nodes, edges } = useMemo(() => {
    return calculateTreeLayout(selectedItem, tree);
  }, [selectedItem, tree]);

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
    <div className="relative flex-1 w-full h-full overflow-hidden rounded-xl bg-slate-950/80 border border-white/10 shadow-inner select-none">
      
      {/* Floating Canvas Controls Toolbar */}
      <div className="absolute left-4 top-4 z-40 flex items-center gap-1.5 bg-slate-900/90 border border-white/15 rounded-xl p-1.5 shadow-2xl backdrop-blur-md">
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.15, 2.0))}
          className="w-7 h-7 rounded-lg bg-black/40 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-400/50 flex items-center justify-center text-xs transition-all cursor-pointer"
          title="拡大 (Zoom In)"
        >
          <i className="fa-solid fa-plus"></i>
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.15, 0.35))}
          className="w-7 h-7 rounded-lg bg-black/40 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-400/50 flex items-center justify-center text-xs transition-all cursor-pointer"
          title="縮小 (Zoom Out)"
        >
          <i className="fa-solid fa-minus"></i>
        </button>
        <span className="text-[0.7rem] font-extrabold text-cyan-300 px-2 font-mono">
          {Math.round(zoom * 100)}%
        </span>
        <div className="w-[1px] h-4 bg-white/15 mx-0.5"></div>
        <button
          onClick={handleResetView}
          className="px-2.5 h-7 rounded-lg bg-black/40 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-400/50 text-[0.7rem] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          title="表示位置をリセット"
        >
          <i className="fa-solid fa-arrows-to-dot"></i> リセット
        </button>
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className={`px-2.5 h-7 rounded-lg text-[0.7rem] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              isFullscreen
                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 hover:border-amber-400'
                : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400'
            }`}
            title={isFullscreen ? '全画面表示を解除 (Esc)' : 'ツリーを画面いっぱいに全画面表示'}
          >
            <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
            <span>{isFullscreen ? '通常表示' : '全画面'}</span>
          </button>
        )}
        {(onSetAllHq || onSetAllNq) && (
          <>
            <div className="w-[1px] h-4 bg-white/15 mx-0.5"></div>
            {onSetAllHq && (
              <button
                onClick={onSetAllHq}
                className="px-2.5 h-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 hover:border-amber-400 text-[0.68rem] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="全素材をHQ相場で計算"
              >
                <i className="fa-solid fa-bolt text-[0.6rem]"></i> 全てHQ
              </button>
            )}
            {onSetAllNq && (
              <button
                onClick={onSetAllNq}
                className="px-2.5 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-600 hover:border-slate-500 text-[0.68rem] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="全素材をNQ相場に戻す"
              >
                <i className="fa-solid fa-rotate-left text-[0.6rem]"></i> 全てNQ
              </button>
            )}
          </>
        )}
        {(onSetAllSelfSufficient || onClearSelfSufficient) && (
          <>
            <div className="w-[1px] h-4 bg-white/15 mx-0.5"></div>
            {onSetAllSelfSufficient && (
              <button
                onClick={onSetAllSelfSufficient}
                className="px-2.5 h-7 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 text-[0.68rem] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="末端素材をすべて自給(0G)にする"
              >
                <i className="fa-solid fa-leaf text-[0.6rem]"></i> 全て自給
              </button>
            )}
            {onClearSelfSufficient && (
              <button
                onClick={onClearSelfSufficient}
                className="px-2.5 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-600 hover:border-slate-500 text-[0.68rem] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="自給を解除してすべて購入・調達に戻す"
              >
                <i className="fa-solid fa-rotate-left text-[0.6rem]"></i> 調達に戻す
              </button>
            )}
          </>
        )}
      </div>

      {/* Floating Canvas Legend (Moved to bottom-right to never overlap with toolbar buttons) */}
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

      {/* Infinite Grid Background & Transform Layer */}
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
              // Smooth Cubic Bezier S-curve
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
                  {/* Outer soft glow line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isCrafted ? '#38bdf8' : '#00d2ff'}
                    strokeWidth="5"
                    strokeOpacity="0.18"
                    strokeLinecap="round"
                  />
                  {/* Inner gradient line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isCrafted ? 'url(#edge-grad-crafted)' : 'url(#edge-grad-default)'}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  {/* Start connector pin */}
                  <circle
                    cx={startX}
                    cy={startY}
                    r="2.5"
                    fill={isCrafted ? '#38bdf8' : '#00d2ff'}
                    opacity="0.85"
                  />
                  {/* End connector pin */}
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
                  }}
                  title="クリックして全32ワールド相場・取引履歴を表示"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[0.68rem] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fa-solid fa-crown text-amber-400"></i> 完成品
                    </span>
                    <div className="flex items-center gap-1">
                      {root.is_company && (
                        <span className="text-[0.6rem] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                          <i className="fa-solid fa-anchor text-[0.55rem]"></i> カンパニー
                        </span>
                      )}
                      <span className="text-[0.62rem] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 opacity-70 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <i className="fa-solid fa-chart-line text-[0.55rem]"></i> 相場
                      </span>
                    </div>
                  </div>

                  <div className={`relative rounded-xl border transition-all flex flex-col justify-between p-2 shadow-xl overflow-hidden ${root.amt > 1 ? 'min-h-[116px]' : 'min-h-[96px]'} ${
                    root.profit <= 0
                      ? 'border-rose-500/60 bg-gradient-to-br from-rose-950/50 via-slate-900/95 to-slate-950 shadow-[0_0_24px_rgba(244,63,94,0.25)] group-hover:border-rose-400'
                      : 'border-cyan-500/50 group-hover:border-cyan-400 bg-gradient-to-br from-cyan-950/50 via-slate-900/95 to-slate-950 shadow-[0_0_24px_rgba(0,210,255,0.25)] group-hover:shadow-[0_0_30px_rgba(0,210,255,0.45)]'
                  }`}>
                    <div>
                      {/* Row 1: Icon + Title + Job */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <img
                          src={root.icon}
                          alt={root.name}
                          className="w-7 h-7 rounded-lg border border-cyan-400/40 object-contain bg-slate-950 shrink-0 shadow-sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className="text-[0.78rem] font-extrabold text-white truncate group-hover:text-cyan-200 transition-colors" title={root.name}>
                              {root.name}
                            </div>
                            {root.is_hq ? (
                              <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[0.58rem] font-black shrink-0">
                                HQ
                              </span>
                            ) : (
                              <span className="px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[0.58rem] font-bold shrink-0">
                                NQ
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[0.55rem] font-bold px-1 py-0.2 rounded border ${jobStyle}`}>
                              {root.is_company ? '⚓ カンパニークラフト' : `${root.job} Lv${root.lvl}`}
                            </span>
                            <span className="text-[0.58rem] text-slate-400">IL{root.ilvl}</span>
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Price & Profit Bar */}
                      <div className="bg-black/60 rounded-md px-2 py-0.5 border border-white/5 grid grid-cols-3 gap-1 text-center items-center text-[0.62rem]">
                        <div className="flex flex-col">
                          <span className="text-slate-400 text-[0.55rem] whitespace-nowrap">出品売値</span>
                          <strong className="text-sky-300 font-['Outfit'] font-bold text-[0.68rem] whitespace-nowrap">{root.sell_price.toLocaleString()}G</strong>
                        </div>
                        <div className="flex flex-col border-x border-white/10">
                          <span className="text-slate-400 text-[0.55rem] whitespace-nowrap">製作原価</span>
                          <strong className="text-purple-300 font-['Outfit'] font-bold text-[0.68rem] whitespace-nowrap">{root.craft_cost.toLocaleString()} G/以下</strong>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400 text-[0.55rem] whitespace-nowrap">純利益</span>
                          <strong className={`font-['Outfit'] font-bold text-[0.68rem] whitespace-nowrap ${root.profit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {root.profit > 0 ? '+' : ''}{root.profit.toLocaleString()}G
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Multi-yield Banner if root.amt > 1 */}
                    {root.amt > 1 && (
                      <div className="mt-1 pt-1 border-t border-cyan-500/20 bg-cyan-950/40 -mx-1 -mb-0.5 px-2 py-0.5 rounded flex items-center justify-between text-[0.58rem] text-cyan-300">
                        <span>🔨 1回で<strong>{root.amt}個</strong>完成 (素材費: {root.batch_cost.toLocaleString()}G)</span>
                        <span className={`font-bold ${root.profit > 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                          利益: {(root.profit * root.amt).toLocaleString()}G
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
    </div>
  );
});
