import React from 'react';
import type { PipelineItem } from './craftTreeUtils';
import { WheelNumberInput } from './WheelNumberInput';

export interface PipelineItemCardProps {
  item: PipelineItem;
  isParentSatisfied: boolean;
  effectiveNeeded: number;
  initialNeeded: number;
  owned: number;
  isDirectlyCompleted: boolean;
  isSatisfied: boolean;
  shortage: number;
  isFocused: boolean;
  isHovered: boolean;
  isIngredient: boolean;
  isUsedIn: boolean;
  isAnyFocusActive: boolean;
  onCardClick: (itemId: number, worldName: string, isHq: boolean) => void;
  onToggleFullPurchased?: (id: number, neededAmount: number) => void;
  onSetPurchased?: (id: number, val: number) => void;
  onToggleQuality?: (id: number) => void;
  onToggleSelfSufficient?: (id: number) => void;
  onToggleFocus: (id: number) => void;
  onMouseEnter: (id: number) => void;
  onMouseLeave: () => void;
}

export const PipelineItemCard: React.FC<PipelineItemCardProps> = React.memo(({
  item,
  isParentSatisfied,
  effectiveNeeded,
  initialNeeded,
  owned,
  isDirectlyCompleted,
  isSatisfied,
  shortage,
  isFocused,
  isHovered,
  isIngredient,
  isUsedIn,
  isAnyFocusActive,
  onCardClick,
  onToggleFullPurchased,
  onSetPurchased,
  onToggleQuality,
  onToggleSelfSufficient,
  onToggleFocus,
  onMouseEnter,
  onMouseLeave,
}) => {
  const isSelf = item.isSelfSufficient;
  const isActive = item.isActive;

  // 関連付けハイライト: クリック集約表示中 (isAnyFocusActive) のみ発動
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
  } else if (isAnyFocusActive) {
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
      onMouseEnter={() => {
        if (isAnyFocusActive) onMouseEnter(item.id);
      }}
      onMouseLeave={() => {
        if (isAnyFocusActive) onMouseLeave();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onCardClick(item.id, item.world, item.quality === 'hq');
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
              type="button"
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
                type="button"
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
                type="button"
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
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFocus(item.id);
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
});
