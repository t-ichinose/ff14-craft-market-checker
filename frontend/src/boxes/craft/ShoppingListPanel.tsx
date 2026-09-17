import React, { useState, useMemo } from 'react';
import type { CraftCardItem, RecipeTreeItem, ProcurementItem } from './craftTypes';
import { aggregateProcurementItems } from './craftTreeUtils';

export interface ShoppingListPanelProps {
  selectedItem: CraftCardItem;
  tree: RecipeTreeItem[];
  salesWorld: string;
  craftCount: number;
  onChangeCraftCount: (count: number) => void;
  purchasedMap: Record<number, number>;
  onSetPurchased: (id: number, amount: number) => void;
  onToggleFullPurchased: (id: number, neededAmount: number) => void;
  onClearPurchased: () => void;
  onOpenMarketModal?: (itemId: number, worldName?: string, isHq?: boolean) => void;
  onToggleQuality?: (itemId: number) => void;
  onToggleSelfSufficient?: (itemId: number) => void;
  onClose: () => void;
}

export const ShoppingListPanel: React.FC<ShoppingListPanelProps> = React.memo(({
  selectedItem,
  tree,
  salesWorld,
  craftCount,
  onChangeCraftCount,
  purchasedMap,
  onSetPurchased,
  onToggleFullPurchased,
  onClearPurchased,
  onOpenMarketModal,
  onToggleQuality,
  onToggleSelfSufficient,
  onClose,
}) => {
  const [groupMode, setGroupMode] = useState<'category' | 'world'>('category');
  const [copied, setCopied] = useState<boolean>(false);

  const procurementList = useMemo(() => {
    return aggregateProcurementItems(tree, craftCount);
  }, [tree, craftCount]);

  const totalCost = useMemo(() => {
    return procurementList.reduce((sum, it) => sum + it.unitPrice * it.amount, 0);
  }, [procurementList]);

  const remainingCost = useMemo(() => {
    return procurementList.reduce((sum, it) => {
      const purchased = purchasedMap[it.id] || 0;
      const remainingAmt = Math.max(0, it.amount - purchased);
      return sum + it.unitPrice * remainingAmt;
    }, 0);
  }, [procurementList, purchasedMap]);

  const completedCount = useMemo(() => {
    return procurementList.filter((it) => (purchasedMap[it.id] || 0) >= it.amount).length;
  }, [procurementList, purchasedMap]);

  const hasAnyPurchased = useMemo(() => {
    return procurementList.some((it) => (purchasedMap[it.id] || 0) > 0);
  }, [procurementList, purchasedMap]);

  const totalYield = craftCount * (selectedItem.amt || 1);

  // Groupings
  const categoryGroups = useMemo(() => {
    const marketItems = procurementList.filter((it) => it.category === 'market');
    const npcItems = procurementList.filter((it) => it.category === 'npc');
    const crystalItems = procurementList.filter((it) => it.category === 'crystal');
    return [
      { id: 'market', title: 'マーケットボード調達', badge: 'マケボ', icon: 'fa-cart-shopping', color: 'text-sky-300 border-sky-500/40 bg-sky-500/20', items: marketItems },
      { id: 'npc', title: 'NPCショップ店売り', badge: '店売り', icon: 'fa-shop', color: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/20', items: npcItems },
      { id: 'crystal', title: 'クリスタル・触媒', badge: '触媒', icon: 'fa-gem', color: 'text-purple-300 border-purple-500/40 bg-purple-500/20', items: crystalItems },
    ].filter((g) => g.items.length > 0);
  }, [procurementList]);

  const worldGroups = useMemo(() => {
    const map = new Map<string, ProcurementItem[]>();
    procurementList.forEach((it) => {
      const w = it.world || '不明';
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(it);
    });

    const groups = Array.from(map.entries()).map(([world, items]) => {
      const isNpc = world === 'NPC店売り';
      const cost = items.reduce((s, it) => s + it.unitPrice * it.amount, 0);
      return {
        world,
        items,
        cost,
        isNpc,
      };
    });

    groups.sort((a, b) => {
      if (a.isNpc) return 1;
      if (b.isNpc) return -1;
      if (a.world === salesWorld) return -1;
      if (b.world === salesWorld) return 1;
      return b.cost - a.cost;
    });

    return groups;
  }, [procurementList, salesWorld]);

  const handleCopy = () => {
    const lines: string[] = [];
    lines.push(`【${selectedItem.name} 買い物リスト】`);
    lines.push(`製作数: ${craftCount}回 (完成: ${totalYield}個)`);
    lines.push('');

    if (groupMode === 'category') {
      categoryGroups.forEach((g) => {
        lines.push(`■ ${g.title}:`);
        g.items.forEach((it) => {
          const purchased = purchasedMap[it.id] || 0;
          let status = '';
          if (purchased >= it.amount) {
            status = ' [調達完了]';
          } else if (purchased > 0) {
            status = ` [確保: ${purchased}/${it.amount}・残${it.amount - purchased}]`;
          }
          const loc = it.isSelfSufficient ? '自給 (0G)' : it.method === 'buy_npc' ? '店売り' : it.world;
          const qTag = it.quality === 'hq' ? ' [HQ]' : '';
          const priceStr = it.isSelfSufficient ? '自給: 0G' : `単価: ${it.unitPrice.toLocaleString()} G/以下 ${loc}`;
          lines.push(`・${it.name}${qTag} ×${it.amount}個 (${priceStr})${status}`);
        });
        lines.push('');
      });
    } else {
      worldGroups.forEach((g) => {
        lines.push(`■ ${g.world} (${g.cost.toLocaleString()}G):`);
        g.items.forEach((it) => {
          const purchased = purchasedMap[it.id] || 0;
          let status = '';
          if (purchased >= it.amount) {
            status = ' [調達完了]';
          } else if (purchased > 0) {
            status = ` [確保: ${purchased}/${it.amount}・残${it.amount - purchased}]`;
          }
          const qTag = it.quality === 'hq' ? ' [HQ]' : '';
          const priceStr = it.isSelfSufficient ? '自給: 0G' : `単価: ${it.unitPrice.toLocaleString()} G/以下`;
          lines.push(`・${it.name}${qTag} ×${it.amount}個 (${priceStr})${status}`);
        });
        lines.push('');
      });
    }

    lines.push('------------------------');
    lines.push(`総調達費用: ${totalCost.toLocaleString()} G`);
    if (remainingCost < totalCost) {
      lines.push(`残り必要額: ${remainingCost.toLocaleString()} G (調達完了: ${completedCount}/${procurementList.length}品目)`);
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error('Clipboard copy failed:', err);
    });
  };

  const renderItemRow = (it: ProcurementItem, showWorldBadge: boolean) => {
    const isSelfSufficient = it.isSelfSufficient || false;
    const purchased = purchasedMap[it.id] || 0;
    const isCompleted = purchased >= it.amount;
    const remainingAmt = Math.max(0, it.amount - purchased);
    const itemRemainingCost = isSelfSufficient ? 0 : remainingAmt * it.unitPrice;
    const subtotal = isSelfSufficient ? 0 : it.unitPrice * it.amount;

    return (
      <div
        key={it.id}
        className={`p-2.5 rounded-xl border transition-all flex flex-col gap-2 ${
          isSelfSufficient
            ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
            : isCompleted
            ? 'bg-slate-950/40 border-white/5 opacity-55 hover:opacity-90'
            : purchased > 0
            ? 'bg-cyan-950/20 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
            : 'bg-black/45 hover:bg-slate-800/60 border-white/10 hover:border-slate-500 shadow-sm'
        }`}
      >
        {/* 1. Upper Row: Toggle Check + Icon + Name + Controls + Large Needed Amount Badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Full toggle button (0 <-> Needed Amount) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFullPurchased(it.id, it.amount);
              }}
              className={`w-5 h-5 rounded-md flex items-center justify-center text-[0.7rem] border transition-all cursor-pointer shrink-0 ${
                isCompleted
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                  : purchased > 0
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-950 border-slate-700 hover:border-slate-400 text-transparent'
              }`}
              title={isCompleted ? '購入数を0にリセット' : '全数調達済みにする'}
            >
              <i className={`fa-solid ${isCompleted ? 'fa-check font-black' : purchased > 0 ? 'fa-minus text-[0.55rem]' : 'fa-check'}`}></i>
            </button>

            {/* Icon with HQ indicator */}
            <div className="relative shrink-0">
              <img
                src={it.icon}
                alt={it.name}
                onClick={() => onOpenMarketModal && onOpenMarketModal(it.id, it.world !== 'NPC店売り' ? it.world : salesWorld, it.quality === 'hq')}
                className={`w-7 h-7 rounded-md border bg-slate-950 object-contain cursor-pointer hover:scale-110 transition-transform ${
                  it.quality === 'hq' ? 'border-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]' : 'border-white/10'
                }`}
                loading="lazy"
                title="クリックで全ワールド相場モニターを開く"
              />
              {it.quality === 'hq' && (
                <span className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 text-[0.5rem] font-black px-0.5 rounded leading-tight shadow border border-amber-300">
                  HQ
                </span>
              )}
            </div>

            {/* Name */}
            <div className="min-w-0 flex-1">
              <span
                onClick={() => onOpenMarketModal && onOpenMarketModal(it.id, it.world !== 'NPC店売り' ? it.world : salesWorld, it.quality === 'hq')}
                className={`text-[0.76rem] font-bold truncate block transition-colors cursor-pointer hover:text-cyan-300 ${
                  isCompleted ? 'line-through text-slate-500' : 'text-slate-100'
                }`}
                title={`${it.name} (クリックで相場モニター)`}
              >
                {it.name}
              </span>
            </div>
          </div>

          {/* Controls: NQ/HQ Segment Switch + Self-Sufficient Toggle + Needed Badge */}
          <div className="shrink-0 flex items-center gap-1.5">
            {/* 1. NQ / HQ Always-Visible Segment Toggle */}
            {it.hasHqOption && onToggleQuality && (
              <div className="flex items-center rounded bg-black/60 p-0.5 border border-white/15 shrink-0 shadow-inner">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (it.quality === 'hq' && onToggleQuality) onToggleQuality(it.id);
                  }}
                  className={`px-1.5 py-0.2 text-[0.58rem] font-bold rounded transition-all cursor-pointer ${
                    it.quality !== 'hq'
                      ? 'bg-slate-600 text-white shadow-sm font-black'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="NQ相場で計算"
                >
                  NQ
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (it.quality !== 'hq' && onToggleQuality) onToggleQuality(it.id);
                  }}
                  className={`px-1.5 py-0.2 text-[0.58rem] font-black rounded transition-all cursor-pointer ${
                    it.quality === 'hq'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                      : 'text-slate-400 hover:text-amber-300'
                  }`}
                  title="HQ相場で計算"
                >
                  HQ
                </button>
              </div>
            )}

            {/* 2. Self-Sufficient Button */}
            {onToggleSelfSufficient && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelfSufficient(it.id);
                }}
                className={`text-[0.6rem] font-black px-1.5 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-0.5 shrink-0 ${
                  isSelfSufficient
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.6)] hover:bg-emerald-400'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-emerald-300 hover:border-emerald-500/50'
                }`}
                title={isSelfSufficient ? '自給中 (コスト0G) - クリックで調達に戻す' : '自給自足 (採集等でコスト0Gにする)'}
              >
                <i className="fa-solid fa-leaf text-[0.55rem]"></i>
                <span>自給</span>
              </button>
            )}

            <span className="text-[0.62rem] text-slate-400 font-bold">必要:</span>
            <span className="text-xs font-black font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
              {it.amount} 個
            </span>
          </div>
        </div>

        {/* 2. Middle Row: World/Shop + Target Unit Price ("G/以下") + Subtotal/Remaining */}
        <div className="flex items-center justify-between text-xs px-0.5 pt-1.5 border-t border-white/10 gap-2 overflow-hidden">
          {/* Left: Location & Unit Price with "G/以下" */}
          <div className="flex items-center gap-1.5 text-slate-300 min-w-0 flex-1 whitespace-nowrap">
            {isSelfSufficient ? (
              <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950 border border-emerald-300 text-[0.62rem] font-black shrink-0 shadow-sm flex items-center gap-0.5">
                <i className="fa-solid fa-leaf text-[0.5rem]"></i> 自給 (0G)
              </span>
            ) : it.method === 'buy_npc' ? (
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[0.62rem] font-bold shrink-0">
                店売り
              </span>
            ) : showWorldBadge && (
              <button
                type="button"
                onClick={() => onOpenMarketModal && onOpenMarketModal(it.id, it.world, it.quality === 'hq')}
                className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[0.62rem] font-bold hover:bg-sky-500/30 cursor-pointer shrink-0 truncate max-w-[85px]"
                title="全ワールド相場モニターを開く"
              >
                <i className="fa-solid fa-location-dot text-[0.52rem]"></i>
                <span className="truncate">{it.world}</span>
              </button>
            )}

            <div className="flex items-center gap-1 font-mono text-slate-200 shrink-0">
              <span className="text-[0.62rem] text-slate-400 font-sans">{isSelfSufficient ? '調達:' : '単価:'}</span>
              <strong className={`text-[0.74rem] font-black font-mono ${isSelfSufficient ? 'text-emerald-400' : 'text-amber-300'}`}>
                {isSelfSufficient ? '0' : it.unitPrice.toLocaleString()}
              </strong>
              <span className="text-[0.62rem] font-bold text-amber-400/90 font-sans">
                {isSelfSufficient ? 'G (自給)' : 'G/以下'}
              </span>
            </div>
          </div>

          {/* Right: Subtotal or Remaining Cost */}
          <div className="text-right font-mono shrink-0 whitespace-nowrap">
            {isSelfSufficient ? (
              <span className="text-[0.65rem] font-bold text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30">
                自給 (0G)
              </span>
            ) : isCompleted ? (
              <span className="text-[0.65rem] font-bold text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30">
                調達完了
              </span>
            ) : purchased > 0 ? (
              <div className="flex items-center gap-1">
                <span className="text-[0.62rem] text-cyan-400 font-sans font-bold">残:</span>
                <span className="text-xs font-black text-cyan-300">{itemRemainingCost.toLocaleString()} G</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-[0.62rem] text-slate-400 font-sans">計:</span>
                <span className="text-xs font-black text-amber-300">{subtotal.toLocaleString()} G</span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Lower Row: Purchased Counter Stepper (Wheel-supported) */}
        <div className="flex items-center justify-between bg-black/45 px-2.5 py-1.5 rounded-lg border border-white/10 gap-2">
          <div className="flex items-center gap-1 text-slate-300 text-xs min-w-0 flex-1 truncate">
            <span className="text-[0.65rem] text-slate-400 font-bold whitespace-nowrap">購入済:</span>
            {purchased > 0 && !isCompleted && (
              <span className="text-[0.68rem] text-cyan-300 font-bold whitespace-nowrap">
                (残 <strong className="text-xs font-black">{remainingAmt}</strong> 個)
              </span>
            )}
            {isCompleted && (
              <span className="text-[0.65rem] text-emerald-400 font-bold whitespace-nowrap">
                (全数確保済)
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-1.5"
            onWheel={(e) => {
              e.stopPropagation();
              const step = e.shiftKey ? 5 : 1;
              if (e.deltaY < 0) {
                onSetPurchased(it.id, Math.min(9999, purchased + step));
              } else if (e.deltaY > 0) {
                onSetPurchased(it.id, Math.max(0, purchased - step));
              }
            }}
            title="購入数（マウスホイールで±1、Shift+ホイールで±5）"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetPurchased(it.id, Math.max(0, purchased - 1));
              }}
              disabled={purchased <= 0}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-20 text-slate-200 flex items-center justify-center text-xs font-bold border border-white/15 cursor-pointer transition-colors"
            >
              -
            </button>

            <input
              type="number"
              min={0}
              max={9999}
              value={purchased}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                const val = parseInt(e.target.value, 10);
                onSetPurchased(it.id, isNaN(val) || val < 0 ? 0 : val);
              }}
              className={`w-11 h-5 text-center text-xs font-black font-mono rounded border focus:outline-none focus:border-cyan-400 cursor-ns-resize shadow-inner ${
                isCompleted
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                  : purchased > 0
                  ? 'bg-cyan-950/60 text-cyan-200 border-cyan-500/50'
                  : 'bg-slate-950 text-slate-200 border-white/15'
              }`}
            />

            <span className="text-xs font-extrabold text-slate-400 font-mono">
              / <span className="text-amber-300">{it.amount}</span>
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetPurchased(it.id, purchased + 1);
              }}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center text-xs font-bold border border-white/15 cursor-pointer transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-[380px] shrink-0 h-full flex flex-col rounded-xl bg-slate-900/95 border border-white/15 shadow-2xl backdrop-blur-md overflow-hidden select-none animate-fadeIn">
      <div className="p-2.5 border-b border-white/10 flex items-center justify-between bg-slate-950/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center text-xs shadow-sm shrink-0">
            <i className="fa-solid fa-cart-shopping"></i>
          </span>
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-white flex items-center gap-1.5 truncate">
              調達・買い物リスト
              <span className="text-[0.62rem] font-bold px-1.5 py-0.2 rounded bg-black/50 text-emerald-300 border border-emerald-500/30 shrink-0">
                計 {procurementList.length} 品目
              </span>
            </div>
            <div className="text-[0.6rem] text-slate-400 truncate">
              {selectedItem.amt > 1
                ? `1回${selectedItem.amt}個 ➔ 計 ${totalYield} 個完成`
                : `完成目標: ${totalYield} 個`}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md bg-black/40 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer border border-white/10 shrink-0"
          title="閉じる"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div
        className="px-3 py-2 border-b border-white/10 bg-black/30 shrink-0 flex items-center justify-between"
        onWheel={(e) => {
          e.stopPropagation();
          const step = e.shiftKey ? 5 : 1;
          if (e.deltaY < 0) {
            onChangeCraftCount(Math.min(999, craftCount + step));
          } else if (e.deltaY > 0) {
            onChangeCraftCount(Math.max(1, craftCount - step));
          }
        }}
        title="製作回数（マウスホイールで±1、Shift+ホイールで±5）"
      >
        <span className="text-[0.68rem] font-bold text-slate-300 flex items-center gap-1.5">
          <i className="fa-solid fa-hammer text-cyan-400 text-[0.65rem]"></i>
          <span>製作回数:</span>
          <span className="text-[0.6rem] text-slate-400 font-normal">
            ({selectedItem.amt > 1 ? `1回${selectedItem.amt}個 ➔ 計${totalYield}個` : `計${totalYield}個`})
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChangeCraftCount(Math.max(1, craftCount - 1))}
            disabled={craftCount <= 1}
            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center text-xs border border-white/10 cursor-pointer transition-colors"
          >
            -
          </button>
          <div className="relative group">
            <input
              type="number"
              min={1}
              max={999}
              value={craftCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onChangeCraftCount(isNaN(val) || val < 1 ? 1 : Math.min(999, val));
              }}
              className="w-14 h-6 text-center text-xs font-black font-mono text-cyan-300 bg-slate-950 border border-cyan-500/40 rounded focus:outline-none focus:border-cyan-400 cursor-ns-resize shadow-inner"
              title="ホイールで増減 / 直接入力"
            />
          </div>
          <button
            type="button"
            onClick={() => onChangeCraftCount(Math.min(999, craftCount + 1))}
            disabled={craftCount >= 999}
            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center text-xs border border-white/10 cursor-pointer transition-colors"
          >
            +
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-white/10 bg-slate-950/40 shrink-0 flex items-center justify-between">
        <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
          <button
            onClick={() => setGroupMode('category')}
            className={`px-2 py-0.5 rounded text-[0.62rem] font-bold flex items-center gap-1 transition-all cursor-pointer ${
              groupMode === 'category'
                ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <i className="fa-solid fa-layer-group text-[0.55rem]"></i> カテゴリ別
          </button>
          <button
            onClick={() => setGroupMode('world')}
            className={`px-2 py-0.5 rounded text-[0.62rem] font-bold flex items-center gap-1 transition-all cursor-pointer ${
              groupMode === 'world'
                ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <i className="fa-solid fa-globe text-[0.55rem]"></i> ワールド別
          </button>
        </div>

        <div className="flex items-center gap-1">
          {hasAnyPurchased && (
            <button
              onClick={onClearPurchased}
              className="px-1.5 py-0.5 text-[0.6rem] rounded bg-slate-800 hover:bg-rose-950/50 hover:text-rose-300 text-slate-400 border border-white/10 transition-colors cursor-pointer"
              title="すべての素材の購入数を0にリセット"
            >
              リセット
            </button>
          )}
          <button
            onClick={handleCopy}
            className={`px-2 py-0.5 rounded text-[0.62rem] font-bold flex items-center gap-1 border transition-all cursor-pointer ${
              copied
                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400'
                : 'bg-black/50 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border-white/15'
            }`}
            title="買い物リストをクリップボードにコピー"
          >
            <i className={`fa-solid ${copied ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
            <span>{copied ? 'コピー済！' : 'コピー'}</span>
          </button>
        </div>
      </div>

      <div className="p-2.5 bg-gradient-to-r from-slate-950/80 via-slate-900/90 to-slate-950/80 border-b border-white/10 shrink-0 flex items-center justify-between">
        <div>
          <div className="text-[0.6rem] text-slate-400">総調達費用:</div>
          <div className="text-[0.95rem] font-black text-amber-400 font-['Outfit']">
            {totalCost.toLocaleString()} <span className="text-[0.65rem] text-amber-400/80">G</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[0.6rem] text-slate-400 flex items-center justify-end gap-1">
            <span>残り必要額:</span>
            {completedCount > 0 && (
              <span className="text-[0.58rem] font-bold px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {completedCount}/{procurementList.length} 完了
              </span>
            )}
          </div>
          <div className={`text-[0.95rem] font-black font-['Outfit'] ${remainingCost === 0 ? 'text-emerald-400' : 'text-cyan-300'}`}>
            {remainingCost.toLocaleString()} <span className="text-[0.65rem] opacity-80">G</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2.5 custom-scrollbar">
        {groupMode === 'category' ? (
          categoryGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              <div className="flex items-center justify-between px-1 py-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[0.58rem] font-bold px-1.5 py-0.2 rounded border ${group.color} flex items-center gap-1`}>
                    <i className={`fa-solid ${group.icon} text-[0.52rem]`}></i> {group.badge}
                  </span>
                  <span className="text-[0.68rem] font-bold text-slate-300">{group.title}</span>
                </div>
                <span className="text-[0.6rem] text-slate-400 font-mono font-bold">
                  {group.items.reduce((s, it) => s + it.unitPrice * it.amount, 0).toLocaleString()}G
                </span>
              </div>
              <div className="space-y-1.5">
                {group.items.map((it) => renderItemRow(it, true))}
              </div>
            </div>
          ))
        ) : (
          worldGroups.map((group) => (
            <div key={group.world} className="space-y-1">
              <div className="flex items-center justify-between px-1 py-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[0.58rem] font-bold px-1.5 py-0.2 rounded border flex items-center gap-1 ${
                    group.isNpc
                      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/20'
                      : 'text-amber-300 border-amber-500/40 bg-amber-500/20'
                  }`}>
                    <i className={`fa-solid ${group.isNpc ? 'fa-shop' : 'fa-location-dot'} text-[0.52rem]`}></i>
                    {group.world}
                  </span>
                  <span className="text-[0.65rem] text-slate-400 font-mono">({group.items.length}品目)</span>
                </div>
                <span className="text-[0.62rem] text-amber-400 font-mono font-bold">
                  {group.cost.toLocaleString()} G
                </span>
              </div>
              <div className="space-y-1.5">
                {group.items.map((it) => renderItemRow(it, false))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
