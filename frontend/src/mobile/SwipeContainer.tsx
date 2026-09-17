import React, { useRef, useState, useEffect } from 'react';

// Mobile swipe container with native touch direction-locking & vertical scroll prevention
interface SwipeContainerProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  pageCount?: number;
  children: React.ReactNode;
}

export const SwipeContainer: React.FC<SwipeContainerProps> = ({
  currentPage,
  onPageChange,
  pageCount,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);
  const isDirectionLocked = useRef<boolean>(false);
  const isSwipingRef = useRef<boolean>(false);

  const validChildren = React.Children.toArray(children).filter(Boolean);

  // イベントリスナー内から常に最新の props / state を参照するための ref
  const stateRef = useRef({
    currentPage,
    pageCount,
    onPageChange,
    touchDeltaX: 0,
    validChildrenCount: validChildren.length,
  });

  useEffect(() => {
    stateRef.current = {
      currentPage,
      pageCount,
      onPageChange,
      touchDeltaX,
      validChildrenCount: validChildren.length,
    };
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isSwipingRef.current = false;
      isDirectionLocked.current = false;
      setIsSwiping(false);
      setTouchDeltaX(0);
      stateRef.current.touchDeltaX = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - touchStartX.current;
      const deltaY = currentY - touchStartY.current;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // 方向がまだ確定していない場合（指を動かし始めた最初の数ピクセル）
      if (!isDirectionLocked.current) {
        if (absY > absX && absY > 6) {
          // 縦の動きが強い → 縦スクロールと判定。横スワイプを無効化しブラウザに任せる
          isDirectionLocked.current = true;
          isSwipingRef.current = false;
          setIsSwiping(false);
          touchStartX.current = null;
          touchStartY.current = null;
          return;
        }
        if (absX > 6 && absX >= absY) {
          // 横の動きが強い → 横スワイプ確定！
          isDirectionLocked.current = true;
          isSwipingRef.current = true;
          setIsSwiping(true);
        }
      }

      if (isSwipingRef.current) {
        // ★重要: 横スワイプ中はブラウザの縦スクロールを完全に防止（ロック）
        if (e.cancelable) {
          e.preventDefault();
        }

        const totalPages = Math.max(1, stateRef.current.pageCount ?? stateRef.current.validChildrenCount);
        const safePage = Math.max(0, Math.min(stateRef.current.currentPage, totalPages - 1));

        // 左右の端での抵抗感
        let newDeltaX = deltaX;
        if ((safePage === 0 && deltaX > 0) || (safePage === totalPages - 1 && deltaX < 0)) {
          newDeltaX = deltaX * 0.25;
        }

        setTouchDeltaX(newDeltaX);
        stateRef.current.touchDeltaX = newDeltaX;
      }
    };

    const onTouchEnd = () => {
      const totalPages = Math.max(1, stateRef.current.pageCount ?? stateRef.current.validChildrenCount);
      const safePage = Math.max(0, Math.min(stateRef.current.currentPage, totalPages - 1));
      const deltaX = stateRef.current.touchDeltaX;

      if (isSwipingRef.current && touchStartX.current !== null) {
        const threshold = typeof window !== 'undefined' ? window.innerWidth * 0.18 : 60;
        if (deltaX < -threshold && safePage < totalPages - 1) {
          stateRef.current.onPageChange(safePage + 1);
        } else if (deltaX > threshold && safePage > 0) {
          stateRef.current.onPageChange(safePage - 1);
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
      isSwipingRef.current = false;
      isDirectionLocked.current = false;
      setIsSwiping(false);
      setTouchDeltaX(0);
      stateRef.current.touchDeltaX = 0;
    };

    // passive: false で登録することで e.preventDefault() のスクロールロックをブラウザに効かせる
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const totalPages = Math.max(1, pageCount ?? validChildren.length);
  const safePage = Math.max(0, Math.min(currentPage, totalPages - 1));

  const baseOffset = -safePage * 100;
  const dragOffsetPercent = typeof window !== 'undefined' && window.innerWidth > 0
    ? (touchDeltaX / window.innerWidth) * 100
    : 0;

  const totalOffset = baseOffset + (isSwiping ? dragOffsetPercent : 0);

  return (
    <div
      ref={containerRef}
      className="w-full flex-1 overflow-hidden relative select-none"
      style={{ touchAction: 'pan-y' }}
    >
      <div
        className="flex w-full h-full"
        style={{
          transform: `translateX(${totalOffset}%)`,
          transition: isSwiping ? 'none' : 'transform 0.28s cubic-bezier(0.2, 0.8, 0.25, 1)',
        }}
      >
        {validChildren.map((child, idx) => (
          <div key={idx} className="w-full h-full shrink-0 overflow-hidden">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
};
