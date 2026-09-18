import React, { useRef, useEffect } from 'react';

export interface WheelNumberInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  shiftStep?: number;
  onChange: (val: number) => void;
  className?: string;
  title?: string;
}

/**
 * ホイール操作時に親や画面のスクロールを100%防止（e.preventDefault）し、
 * カーソル選択時に全選択（全ハイライト）される数値入力コンポーネント
 */
export const WheelNumberInput: React.FC<WheelNumberInputProps> = ({
  value,
  min = 0,
  max = 9999,
  step = 1,
  shiftStep = 5,
  onChange,
  className = '',
  title = '',
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // ★ passive: false なのでブラウザのスクロールが100%確実に停止する
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY < 0 ? 1 : -1;
      const currentStep = e.shiftKey ? shiftStep : step;
      const nextVal = Math.min(max, Math.max(min, valueRef.current + delta * currentStep));
      onChangeRef.current(nextVal);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [min, max, step, shiftStep]);

  return (
    <input
      ref={inputRef}
      type="number"
      min={min}
      max={max}
      value={value}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        e.stopPropagation();
        const val = parseInt(e.target.value, 10);
        onChange(isNaN(val) || val < min ? min : Math.min(max, val));
      }}
      className={className}
    />
  );
};
