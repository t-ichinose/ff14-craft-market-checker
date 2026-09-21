import { useState, useCallback, useEffect, useRef } from 'react';

interface UseResizablePaneOptions {
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function useResizablePane({
  storageKey = 'ff14_left_pane_width',
  defaultWidth = 440,
  minWidth = 320,
  maxWidth = 640,
}: UseResizablePaneOptions = {}) {
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    } catch {}
    // ノートPC等（幅1500px未満）の場合は初期幅を少しコンパクトに
    if (typeof window !== 'undefined' && window.innerWidth < 1500) {
      return 380;
    }
    return defaultWidth;
  });

  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const containerLeftRef = useRef<number>(0);
  const currentWidthRef = useRef<number>(width);

  currentWidthRef.current = width;

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    isResizingRef.current = true;

    // クリックされたスプリッターの親コンテナの左端座標を取得
    const target = e.currentTarget as HTMLElement;
    const parent = target.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      containerLeftRef.current = rect.left;
    } else {
      containerLeftRef.current = 0;
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const offsetLeft = containerLeftRef.current;
      const dynamicMax = Math.min(maxWidth, Math.floor(window.innerWidth * 0.45));
      const newWidth = Math.min(Math.max(e.clientX - offsetLeft, minWidth), dynamicMax);
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsResizing(false);
        try {
          localStorage.setItem(storageKey, String(currentWidthRef.current));
        } catch {}
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minWidth, maxWidth, storageKey]);

  return { width, isResizing, startResizing, setWidth };
}
