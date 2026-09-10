import React from 'react';
import { JAPAN_DCS, VELOCITY_FILTER_OPTIONS } from '../shared/marketConstants';

interface MobileWorldVelocityBarProps {
  world: string;
  onWorldChange?: (world: string) => void;
  worldLabel?: string;
  worldIcon?: string;
  minVelocity: number;
  onMinVelocityChange: (val: number) => void;
  accentColor?: string;
  accentTextClass?: string;
}

export const MobileWorldVelocityBar: React.FC<MobileWorldVelocityBarProps> = React.memo(({
  world,
  onWorldChange,
  worldLabel = 'ワールド:',
  worldIcon = 'fa-globe',
  minVelocity,
  onMinVelocityChange,
  accentColor = '#00d2ff',
  accentTextClass = 'text-[#00d2ff]',
}) => {
  return (
    <div className="flex items-center gap-2 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs">
      {/* ワールド選択 */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <span className="text-[0.7rem] text-slate-400 font-bold flex items-center gap-1 shrink-0">
          <i className={`fa-solid ${worldIcon}`} style={{ color: accentColor }}></i> {worldLabel}
        </span>
        <select
          value={world}
          onChange={(e) => onWorldChange?.(e.target.value)}
          className={`w-full bg-transparent text-xs ${accentTextClass} font-bold focus:outline-none cursor-pointer truncate`}
        >
          {(Object.entries(JAPAN_DCS) as [string, string[]][]).map(([dc, worlds]) => (
            <optgroup key={dc} label={`DC: ${dc}`} className="bg-slate-900 text-slate-200">
              {worlds.map((w: string) => (
                <option key={w} value={w} className="bg-slate-900 text-slate-200">
                  {w} ({dc})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="w-[1px] h-3.5 bg-white/15 shrink-0" />

      {/* 日当たり販売数足切りフィルター */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[0.7rem] text-slate-400 font-bold flex items-center gap-1 shrink-0">
          <i className="fa-solid fa-chart-line" style={{ color: accentColor }}></i> 日販:
        </span>
        <select
          value={minVelocity}
          onChange={(e) => onMinVelocityChange(Number(e.target.value))}
          className={`bg-transparent text-xs ${accentTextClass} font-bold focus:outline-none cursor-pointer`}
        >
          {VELOCITY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
});
