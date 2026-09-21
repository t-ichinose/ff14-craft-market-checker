import React, { useEffect, useRef } from 'react';

export interface TrendPoint {
  date?: string;
  weighted_avg: number;
  volume: number;
}

export interface TrendChartCanvasProps {
  trend: TrendPoint[];
  trendPct?: number;
  lineColor?: string;
  volumeColor?: string;
  height?: number;
  showDateLabels?: boolean;
  className?: string;
}

/**
 * 7日相場推移チャート HTML5 Canvas 描画共通コンポーネント
 * （MarketBox, ArbitrageBox, ItemMarketModal で共有）
 */
export const TrendChartCanvas: React.FC<TrendChartCanvasProps> = React.memo(({
  trend,
  trendPct = 0,
  lineColor,
  volumeColor = 'rgba(96, 165, 250, 0.25)',
  height = 105,
  showDateLabels = true,
  className = 'w-full block',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderChart = () => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const parent = canvas.parentElement;
      const displayW = parent ? parent.clientWidth : 480;
      const displayH = height;
      const dpr = window.devicePixelRatio || 1;

      // Adjust buffer size to Retina/HiDPI resolution
      canvas.width = Math.round(displayW * dpr);
      canvas.height = Math.round(displayH * dpr);
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, displayW, displayH);

      if (!trend || trend.length === 0) {
        ctx.restore();
        return;
      }

      // Single-pass extraction of min/max and valid metrics
      let minP = Infinity;
      let maxP = -Infinity;
      let maxVol = 1;
      let validCount = 0;

      for (let i = 0; i < trend.length; i++) {
        const item = trend[i];
        const p = item.weighted_avg || 0;
        const v = item.volume || 0;
        if (p > 0) {
          if (p < minP) minP = p;
          if (p > maxP) maxP = p;
          validCount++;
        }
        if (v > maxVol) maxVol = v;
      }

      if (validCount === 0) {
        ctx.restore();
        return;
      }

      const pRange = maxP - minP || maxP * 0.1 || 1;
      const numPoints = trend.length;
      const colWidthHalf = displayW / (2 * Math.max(1, numPoints));
      const paddingLeft = colWidthHalf;
      const paddingRight = colWidthHalf;
      const paddingTop = 12;
      const paddingBottom = showDateLabels ? 18 : 14;
      const plotW = displayW - paddingLeft - paddingRight;
      const plotH = displayH - paddingTop - paddingBottom;
      const stepX = plotW / Math.max(1, numPoints - 1);

      // 1. Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, paddingTop);
      ctx.lineTo(displayW - paddingRight, paddingTop);
      ctx.moveTo(paddingLeft, paddingTop + plotH / 2);
      ctx.lineTo(displayW - paddingRight, paddingTop + plotH / 2);
      ctx.moveTo(paddingLeft, displayH - paddingBottom);
      ctx.lineTo(displayW - paddingRight, displayH - paddingBottom);
      ctx.stroke();

      // 2. Volume Bars
      const points: { x: number; y: number; val: number; date?: string }[] = new Array(numPoints);
      for (let idx = 0; idx < numPoints; idx++) {
        const d = trend[idx];
        const x = paddingLeft + idx * stepX;
        const barW = Math.min(16, stepX * 0.38);
        const barH = (d.volume / maxVol) * (plotH * 0.55);
        const y = displayH - paddingBottom - barH;

        ctx.fillStyle = volumeColor;
        ctx.fillRect(x - barW / 2, y, barW, barH);

        const val = d.weighted_avg > 0 ? d.weighted_avg : minP;
        const ptY = displayH - paddingBottom - ((val - minP) / pRange) * plotH;
        points[idx] = { x, y: ptY, val: d.weighted_avg, date: d.date };
      }

      const finalLineColor = lineColor || (trendPct >= 0 ? '#4ade80' : '#f87171');

      // 3. Gradient Fill under Price Curve
      const grad = ctx.createLinearGradient(0, paddingTop, 0, displayH - paddingBottom);
      if (lineColor) {
        grad.addColorStop(0, `${lineColor}33`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        grad.addColorStop(0, trendPct >= 0 ? 'rgba(74, 222, 128, 0.22)' : 'rgba(248, 113, 113, 0.22)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineTo(points[points.length - 1].x, displayH - paddingBottom);
      ctx.lineTo(points[0].x, displayH - paddingBottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 4. Line Stroke
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = finalLineColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 5. Dot Circles & Date Labels
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        ctx.fillStyle = finalLineColor;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();

        if (showDateLabels && pt.date) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(pt.date, pt.x, displayH - 4);
        }
      }

      ctx.restore();
    };

    const scheduleRender = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        renderChart();
        rafRef.current = null;
      });
    };

    scheduleRender();

    // Responsive redraw using ResizeObserver
    const parent = canvas.parentElement;
    let observer: ResizeObserver | null = null;
    if (parent && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        scheduleRender();
      });
      observer.observe(parent);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (observer) {
        observer.disconnect();
      }
    };
  }, [trend, trendPct, lineColor, volumeColor, height, showDateLabels]);

  return <canvas ref={canvasRef} className={className} />;
});
