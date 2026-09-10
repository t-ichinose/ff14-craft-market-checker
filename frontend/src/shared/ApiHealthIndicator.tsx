import React, { useState, useRef, useEffect } from 'react';
import { useApiHealth } from '../services/apiHealthService';

interface ApiHealthIndicatorProps {
  compact?: boolean;
  className?: string;
}

export const ApiHealthIndicator: React.FC<ApiHealthIndicatorProps> = ({
  compact = false,
  className = '',
}) => {
  const { health, checkProbe } = useApiHealth();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isManualChecking, setIsManualChecking] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleManualCheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isManualChecking) return;
    setIsManualChecking(true);
    try {
      await checkProbe();
    } finally {
      setTimeout(() => setIsManualChecking(false), 400);
    }
  };

  const getStatusDotColor = () => {
    switch (health.status) {
      case 'excellent':
        return '#4ade80';
      case 'good':
        return '#38bdf8';
      case 'slow':
        return '#ffb703';
      case 'down':
        return '#f87171';
      case 'limited':
        return '#fb923c';
      default:
        return '#94a3b8';
    }
  };

  const dotColor = getStatusDotColor();

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* トリガーボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Universalis API 通信状況（クリックで詳細表示）"
        style={{
          background: health.bgColor,
          borderColor: health.borderColor,
        }}
        className={`flex items-center gap-1.5 border rounded-[10px] transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer backdrop-blur shadow-sm select-none ${
          compact ? 'px-2 py-0.5 text-[0.68rem]' : 'px-2.5 py-1 text-[0.72rem]'
        }`}
      >
        {/* LED パルスドット */}
        <span className="relative flex h-2 w-2 shrink-0">
          {health.status === 'excellent' || health.status === 'good' ? (
            <span
              style={{ backgroundColor: dotColor }}
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            />
          ) : null}
          <span
            style={{ backgroundColor: dotColor }}
            className="relative inline-flex rounded-full h-2 w-2 shadow-[0_0_6px_currentColor]"
          />
        </span>

        {/* ラベル */}
        <span className="font-semibold font-mono tracking-tight flex items-center gap-1" style={{ color: dotColor }}>
          {!compact && <span className="font-sans text-slate-300 font-medium">API:</span>}
          <span>{health.badgeText}</span>
        </span>

        {!compact && (
          <i
            className={`fa-solid fa-chevron-down text-[0.55rem] text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {/* 詳細ポップオーバー */}
      {isOpen && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.96)',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 210, 255, 0.15)',
          }}
          className="absolute right-0 mt-1.5 w-72 rounded-xl border p-3 z-50 backdrop-blur-md text-xs animate-in fade-in zoom-in-95 duration-150"
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2.5">
            <div className="flex items-center gap-1.5">
              <i className="fa-solid fa-tower-broadcast text-[#00d2ff]" />
              <span className="font-bold text-slate-200">Universalis 通信状況</span>
            </div>
            <button
              onClick={handleManualCheck}
              disabled={isManualChecking}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[0.65rem] text-slate-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              title="Pingを再計測"
            >
              <i className={`fa-solid fa-arrows-rotate text-[0.6rem] ${isManualChecking ? 'fa-spin text-[#00d2ff]' : ''}`} />
              <span>Ping再測</span>
            </button>
          </div>

          {/* 現在のステータス判定 */}
          <div
            style={{ background: health.bgColor, borderColor: health.borderColor }}
            className="border rounded-lg p-2.5 mb-2.5 flex items-center gap-2.5"
          >
            <div
              style={{ color: dotColor }}
              className="w-7 h-7 rounded-lg bg-black/40 flex items-center justify-center text-sm shrink-0 border border-white/5"
            >
              <i className={health.icon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[0.78rem]" style={{ color: dotColor }}>
                {health.label}
              </div>
              <div className="text-[0.62rem] text-slate-400 truncate">
                {health.status === 'excellent' && '応答は非常に高速で極めて安定しています'}
                {health.status === 'good' && '通常通りの良好なレスポンスを維持しています'}
                {health.status === 'slow' && 'Universalisサーバー側で集計遅延が発生しています'}
                {health.status === 'down' && 'APIサーバーからの応答が途絶またはタイムアウト'}
                {health.status === 'limited' && '短時間のリクエスト集中により制限中'}
                {health.status === 'checking' && '現在の通信品質を測定しています'}
              </div>
            </div>
          </div>

          {/* 直近の通信ログ */}
          <div>
            <div className="text-[0.65rem] font-bold text-slate-400 mb-1.5 flex items-center justify-between">
              <span>直近のリクエスト履歴</span>
              <span className="text-[0.6rem] font-normal text-slate-500">最新 {health.history.length} 件</span>
            </div>
            {health.history.length === 0 ? (
              <div className="text-center py-3 text-slate-500 text-[0.68rem]">まだ通信履歴がありません</div>
            ) : (
              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-0.5">
                {health.history.map((log, idx) => {
                  const isOk = log.statusCode >= 200 && log.statusCode < 400;
                  const latColor = log.latencyMs < 600 ? '#4ade80' : log.latencyMs < 1500 ? '#38bdf8' : '#ffb703';
                  const timeAgoSec = Math.max(0, Math.round((Date.now() - log.timestamp) / 1000));
                  const timeText = timeAgoSec < 60 ? `${timeAgoSec}秒前` : `${Math.round(timeAgoSec / 60)}分前`;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-black/30 px-2 py-1 rounded border border-white/5 text-[0.65rem] font-mono"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 max-w-[130px]">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isOk ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        <span className="text-slate-300 truncate font-sans" title={log.endpoint}>
                          {log.endpoint}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span style={{ color: isOk ? latColor : '#f87171' }} className="font-bold">
                          {isOk ? `${Math.round(log.latencyMs)}ms` : log.statusCode === 0 ? 'Timeout' : `HTTP ${log.statusCode}`}
                        </span>
                        <span className="text-slate-500 text-[0.6rem] font-sans">{timeText}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* フッター */}
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[0.6rem] text-slate-500">
            <span>実通信レイテンシの移動平均</span>
            <span>Cloudflare CDN経由</span>
          </div>
        </div>
      )}
    </div>
  );
};
