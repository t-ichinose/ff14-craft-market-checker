import React from 'react';
import type { SelectedCraftTarget } from './craftTypes';
import type { TargetMetric } from './pipelineCalculationUtils';
import { getJobBadgeStyle } from './craftTreeUtils';
import { WheelNumberInput } from './WheelNumberInput';

export interface PipelineTargetCardProps {
  target: SelectedCraftTarget;
  currentWorld: string;
  isFocused: boolean;
  isTargetHovered: boolean;
  isAncestorOfHovered: boolean;
  isRelatedInFocus: boolean;
  isAnyFocusActive: boolean;
  hasActiveRelations: boolean;
  metric: TargetMetric;
  showRemoveButton: boolean;
  onCardClick: (itemId: number, world: string, isHq: boolean) => void;
  onUpdateTargetCraftCount?: (cardKey: string, count: number) => void;
  onRemoveTarget?: (cardKey: string) => void;
  onToggleFocus: (itemId: number) => void;
  onMouseEnter: (itemId: number) => void;
  onMouseLeave: () => void;
}

export const PipelineTargetCard: React.FC<PipelineTargetCardProps> = React.memo(({
  target,
  currentWorld,
  isFocused,
  isTargetHovered,
  isAncestorOfHovered,
  isRelatedInFocus,
  isAnyFocusActive,
  hasActiveRelations,
  metric,
  showRemoveButton,
  onCardClick,
  onUpdateTargetCraftCount,
  onRemoveTarget,
  onToggleFocus,
  onMouseEnter,
  onMouseLeave,
}) => {
  const item = target.item;
  const count = target.craftCount;
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
  } else if (isAnyFocusActive) {
    if (hasActiveRelations) {
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
      onMouseEnter={() => {
        if (isAnyFocusActive) onMouseEnter(item.item_id);
      }}
      onMouseLeave={() => {
        if (isAnyFocusActive) onMouseLeave();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onCardClick(item.item_id, currentWorld, Boolean(item.is_hq));
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
              {showRemoveButton && onRemoveTarget && (
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
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFocus(item.item_id);
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
});
