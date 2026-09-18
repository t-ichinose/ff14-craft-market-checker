import React from 'react';

interface PaneSplitterProps {
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing: boolean;
  accentColor?: string;
}

export const PaneSplitter: React.FC<PaneSplitterProps> = ({
  onMouseDown,
  isResizing,
  accentColor = '#10b981',
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`group relative flex items-center justify-center cursor-col-resize select-none shrink-0 transition-all z-20 ${
        isResizing ? 'w-3' : 'w-2 hover:w-3'
      }`}
      style={{
        margin: '0 -2px',
      }}
      title="ドラッグして左右の表示幅を調整"
    >
      {/* 掴みやすい背景ヒットエリア */}
      <div
        className={`absolute inset-0 transition-colors rounded-full ${
          isResizing ? 'bg-white/10' : 'group-hover:bg-white/5'
        }`}
      />

      {/* スプリッター中央の視覚的ハンドル（つまみ） */}
      <div
        className="h-10 w-1 rounded-full transition-all group-hover:h-16 group-hover:w-1.5 flex flex-col items-center justify-center gap-1"
        style={{
          backgroundColor: isResizing ? accentColor : 'rgba(255, 255, 255, 0.25)',
          boxShadow: isResizing
            ? `0 0 10px ${accentColor}, 0 0 20px ${accentColor}80`
            : undefined,
        }}
      >
        <span className="w-0.5 h-0.5 rounded-full bg-white/40 group-hover:bg-white" />
        <span className="w-0.5 h-0.5 rounded-full bg-white/40 group-hover:bg-white" />
        <span className="w-0.5 h-0.5 rounded-full bg-white/40 group-hover:bg-white" />
      </div>
    </div>
  );
};
