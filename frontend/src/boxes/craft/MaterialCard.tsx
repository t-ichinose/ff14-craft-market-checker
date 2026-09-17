import React from 'react';
import type { RecipeTreeItem } from './craftTypes';

export interface MaterialCardProps {
  mat: RecipeTreeItem;
  multiplier?: number;
  currentWorld: string;
  onOpenMarketModal?: (itemId: number, worldName?: string, isHq?: boolean) => void;
  onToggleQuality?: (itemId: number) => void;
  onToggleSelfSufficient?: (itemId: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const MaterialCard: React.FC<MaterialCardProps> = React.memo(({
  mat,
  multiplier = 1,
  currentWorld,
  onOpenMarketModal,
  onToggleQuality,
  onToggleSelfSufficient,
  className = '',
  style = {},
}) => {
  const amount = mat.amount * multiplier;
  const isSelfSufficient = !!mat.isSelfSufficient;
  const totalCost = isSelfSufficient ? 0 : mat.cost * amount;
  const isCrafted = mat.method === 'craft';
  const isNpc = mat.method === 'buy_npc';
  const isActive = mat.isActive;
  const isHq = mat.quality === 'hq';
  const hasSubs = mat.subs && mat.subs.length > 0;
  const lodestoneUrl = `https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/?patch=&db_search_category=item&category2=&q=${encodeURIComponent(mat.name || '')}`;
  const targetModalWorld = (mat.world && mat.world !== '自作' && mat.world !== 'NPC店売り' && mat.world !== '不明' && !mat.world.includes('自給')) ? mat.world : currentWorld;

  // 親が複数完成レシピの場合の実質負担額
  const parentYield = mat.parentYield || 1;
  const effectiveTotalCost = isSelfSufficient ? 0 : (mat.effectiveCost !== undefined ? mat.effectiveCost : (parentYield > 1 ? Math.round(totalCost / parentYield) : totalCost));

  return (
    <div
      onClick={() => onOpenMarketModal && onOpenMarketModal(mat.id, targetModalWorld, isHq)}
      className={`interactive-node-card transition-all duration-300 cursor-pointer group hover:-translate-y-0.5 ${
        !isActive ? 'opacity-40 hover:opacity-90' : 'opacity-100'
      } ${className}`}
      style={style}
      title={`クリックして相場モニターを開く (仕入先: ${targetModalWorld})`}
    >
      <div
        className={`rounded-xl border px-2.5 py-2 transition-all shadow-lg backdrop-blur-md relative flex flex-col justify-between h-[96px] ${
          !isActive
            ? 'bg-slate-950/85 border-slate-800 shadow-none'
            : isSelfSufficient
            ? 'bg-gradient-to-br from-emerald-950/70 via-slate-900/95 to-slate-950 border-emerald-400/80 group-hover:border-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.25)]'
            : isCrafted
            ? 'bg-gradient-to-br from-sky-950/70 via-slate-900/95 to-slate-950 border-sky-500/60 group-hover:border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.2)]'
            : isNpc
            ? 'bg-gradient-to-br from-emerald-950/70 via-slate-900/95 to-slate-950 border-emerald-500/60 group-hover:border-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.2)]'
            : 'bg-gradient-to-br from-amber-950/50 via-slate-900/95 to-slate-950 border-amber-500/40 group-hover:border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.15)]'
        }`}
      >
        {!isActive && (
          <div className="absolute -top-2 right-2 bg-slate-800 border border-slate-600 text-slate-300 text-[0.55rem] font-bold px-1.5 py-0.2 rounded-md shadow-md flex items-center gap-1 z-30">
            <i className="fa-solid fa-ban text-rose-400 text-[0.5rem]"></i> スキップ
          </div>
        )}

        {/* Row 1 (上段): アイコン + アイテム名 + 右側アクション(×数量 / 相場 / Lodestone) */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <img
              src={mat.icon || 'https://xivapi.com/i/000000/000000.png'}
              alt={mat.name || `Item #${mat.id}`}
              className={`w-7 h-7 rounded-lg border object-contain bg-slate-950 shadow-sm ${
                isSelfSufficient
                  ? 'border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                  : isHq
                  ? 'border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                  : isCrafted
                  ? 'border-sky-500/50'
                  : isNpc
                  ? 'border-emerald-500/50'
                  : 'border-amber-500/40'
              }`}
              loading="lazy"
            />
            {isHq && (
              <span className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 text-[0.5rem] font-black px-0.5 rounded leading-tight shadow border border-amber-300">
                HQ
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
            <span
              className={`text-[0.78rem] font-bold truncate group-hover:text-cyan-300 transition-colors ${
                !isActive ? 'text-slate-400 line-through' : 'text-slate-100'
              }`}
              title={mat.name}
            >
              {mat.name || `Item #${mat.id}`}
            </span>

            {/* 右上: 数量バッジ + 相場ボタン + Lodestone */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[0.72rem] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono shadow-sm">
                ×{amount}
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenMarketModal) onOpenMarketModal(mat.id, targetModalWorld, isHq);
                }}
                className="text-slate-400 hover:text-cyan-300 text-[0.68rem] p-0.5 transition-colors cursor-pointer"
                title={`全32ワールド相場モニターを開く (${targetModalWorld})`}
              >
                <i className="fa-solid fa-chart-line"></i>
              </span>
              <a
                href={lodestoneUrl}
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                className="text-slate-500 hover:text-cyan-400 text-[0.68rem] p-0.5 transition-colors"
                title="Lodestoneで確認"
              >
                <i className="fa-solid fa-arrow-up-right-from-square"></i>
              </a>
            </div>
          </div>
        </div>

        {/* Row 2 (中段): 調達方法・ワールド (左) ＆ NQ/HQ・自給スイッチ群 (右) */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* 左: 調達バッジ + ワールド + 1回個数 */}
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            {isSelfSufficient ? (
              <span className="text-[0.6rem] font-black px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950 border border-emerald-300 flex items-center gap-0.5 shrink-0 shadow-sm">
                <i className="fa-solid fa-leaf text-[0.5rem]"></i> 自給 (0G)
              </span>
            ) : isCrafted ? (
              <span className="text-[0.6rem] font-black px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-0.5 shrink-0">
                <i className="fa-solid fa-hammer text-[0.5rem]"></i> 自作
              </span>
            ) : isNpc ? (
              <span className="text-[0.6rem] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-0.5 shrink-0">
                <i className="fa-solid fa-shop text-[0.5rem]"></i> 店売
              </span>
            ) : (
              <span className="text-[0.6rem] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5 shrink-0">
                <i className="fa-solid fa-cart-shopping text-[0.5rem]"></i> マケボ
              </span>
            )}

            <span className="text-[0.64rem] text-slate-300 font-medium flex items-center gap-0.5 truncate" title={mat.world}>
              <i className="fa-solid fa-location-dot text-cyan-400 text-[0.55rem]"></i> {mat.world}
            </span>

            {isCrafted && mat.yieldAmt && mat.yieldAmt > 1 && (
              <span className="text-[0.58rem] text-sky-300 bg-sky-950/60 px-1 py-0.2 rounded border border-sky-500/30 shrink-0">
                1回{mat.yieldAmt}個
              </span>
            )}
          </div>

          {/* 右: NQ/HQ スイッチ ＆ 自給ボタン */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 1. NQ / HQ 常時表示セグメントスイッチ */}
            {mat.hasHqOption && (
              <div
                className="inline-flex items-center rounded-md bg-slate-950 p-0.5 border border-slate-700/80 shadow-inner shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isHq && onToggleQuality) onToggleQuality(mat.id);
                  }}
                  className={`px-1.5 py-0.2 text-[0.58rem] font-bold rounded transition-all cursor-pointer ${
                    !isHq
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
                    if (!isHq && onToggleQuality) onToggleQuality(mat.id);
                  }}
                  className={`px-1.5 py-0.2 text-[0.58rem] font-black rounded transition-all cursor-pointer ${
                    isHq
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                      : 'text-slate-400 hover:text-amber-300'
                  }`}
                  title="HQ相場で計算"
                >
                  HQ
                </button>
              </div>
            )}

            {/* 2. 自給 (0G) トグルボタン */}
            {onToggleSelfSufficient && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelfSufficient(mat.id);
                }}
                className={`text-[0.6rem] font-black px-1.5 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-0.5 shrink-0 ${
                  isSelfSufficient
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.6)] hover:bg-emerald-400'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-emerald-300 hover:border-emerald-500/50'
                }`}
                title={isSelfSufficient ? '自給中 (コスト0G) - クリックで通常調達に戻す' : '自給自足 (採集等でコスト0Gにする)'}
              >
                <i className="fa-solid fa-leaf text-[0.55rem]"></i>
                <span>自給</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 3 (下段): Price Grid (単価 + 推奨/実質バッジ + 総額) */}
        <div className="bg-black/70 rounded-md px-2 py-0.8 border border-white/10 flex items-center justify-between text-[0.65rem] gap-1 overflow-hidden">
          <div className="flex items-center gap-1 text-slate-300 font-mono whitespace-nowrap shrink-0">
            <span className="text-[0.62rem] font-sans text-slate-400">{isSelfSufficient ? '調達:' : isNpc ? '店売:' : '単価:'}</span>
            <strong className={`${isSelfSufficient ? 'text-emerald-400' : 'text-sky-300'} font-bold text-[0.74rem]`}>
              {isSelfSufficient ? '0' : mat.cost.toLocaleString()}
            </strong>
            <span className="text-[0.58rem] font-bold text-amber-400 font-sans">
              {isSelfSufficient ? 'G (自給)' : isNpc ? 'G' : 'G/以下'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            {isSelfSufficient ? (
              <span className="text-[0.55rem] font-bold text-emerald-300 bg-emerald-950/70 px-1 py-0.2 rounded border border-emerald-500/40 whitespace-nowrap">
                自給自足 (0G)
              </span>
            ) : parentYield > 1 ? (
              <span className="text-[0.55rem] font-bold text-emerald-300 bg-emerald-950/70 px-1 py-0.2 rounded border border-emerald-500/40 whitespace-nowrap">
                親{parentYield}個分: {effectiveTotalCost.toLocaleString()}G
              </span>
            ) : hasSubs && mat.savings !== undefined && mat.savings > 0 ? (
              <span className={`text-[0.55rem] font-bold px-1 py-0.2 rounded border whitespace-nowrap ${
                isCrafted
                  ? 'text-sky-300 bg-sky-950/70 border-sky-500/40'
                  : 'text-amber-300 bg-amber-950/70 border-amber-500/40'
              }`}>
                {isCrafted ? '自作' : 'マケボ'}+{mat.savings.toLocaleString()}G
              </span>
            ) : null}

            <div className="flex items-center gap-0.5 font-mono whitespace-nowrap">
              <span className="text-slate-400 text-[0.58rem] font-sans">総額:</span>
              <strong className={`${isSelfSufficient ? 'text-emerald-400' : 'text-amber-400'} font-['Outfit'] font-bold text-[0.74rem]`}>
                {totalCost.toLocaleString()}G
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});


