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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parentWidth = canvas.parentElement ? canvas.parentElement.offsetWidth : 480;
    const w = (canvas.width = parentWidth || 480);
    const h = (canvas.height = height);

    ctx.clearRect(0, 0, w, h);
    if (!trend || trend.length === 0) return;

    const validPrices = trend.map((d) => d.weighted_avg || 0).filter((p) => p > 0);
    const validVolumes = trend.map((d) => d.volume || 0);
    const maxVol = Math.max(...validVolumes, 1);

    if (validPrices.length === 0) return;

    const minP = Math.min(...validPrices);
    const maxP = Math.max(...validPrices);
    const pRange = maxP - minP || maxP * 0.1 || 1;

    const numPoints = trend.length;
    const colWidthHalf = w / (2 * Math.max(1, numPoints));
    const paddingLeft = colWidthHalf;
    const paddingRight = colWidthHalf;
    const paddingTop = 12;
    const paddingBottom = showDateLabels ? 18 : 14;
    const plotW = w - paddingLeft - paddingRight;
    const plotH = h - paddingTop - paddingBottom;
    const stepX = plotW / Math.max(1, numPoints - 1);

    // 1. Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop);
    ctx.lineTo(w - paddingRight, paddingTop);
    ctx.moveTo(paddingLeft, paddingTop + plotH / 2);
    ctx.lineTo(w - paddingRight, paddingTop + plotH / 2);
    ctx.moveTo(paddingLeft, h - paddingBottom);
    ctx.lineTo(w - paddingRight, h - paddingBottom);
    ctx.stroke();

    // 2. Volume Bars
    trend.forEach((d, idx) => {
      const x = paddingLeft + idx * stepX;
      const barW = Math.min(16, stepX * 0.38);
      const barH = (d.volume / maxVol) * (plotH * 0.55);
      const y = h - paddingBottom - barH;

      ctx.fillStyle = volumeColor;
      ctx.fillRect(x - barW / 2, y, barW, barH);
    });

    // 3. Price Points
    const points: { x: number; y: number; val: number; date?: string }[] = [];
    trend.forEach((d, idx) => {
      const x = paddingLeft + idx * stepX;
      const val = d.weighted_avg > 0 ? d.weighted_avg : minP;
      const y = h - paddingBottom - ((val - minP) / pRange) * plotH;
      points.push({ x, y, val: d.weighted_avg, date: d.date });
    });

    const finalLineColor = lineColor || (trendPct >= 0 ? '#4ade80' : '#f87171');

    // 4. Gradient Fill under Price Curve
    const grad = ctx.createLinearGradient(0, paddingTop, 0, h - paddingBottom);
    if (lineColor) {
      grad.addColorStop(0, `${lineColor}33`); // 20% alpha
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
    ctx.lineTo(points[points.length - 1].x, h - paddingBottom);
    ctx.lineTo(points[0].x, h - paddingBottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 5. Line Stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = finalLineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 6. Dot Circles & (Optional) Date Labels
    points.forEach((pt) => {
      ctx.fillStyle = finalLineColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();

      if (showDateLabels && pt.date) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pt.date, pt.x, h - 4);
      }
    });
  }, [trend, trendPct, lineColor, volumeColor, height, showDateLabels]);

  return <canvas ref={canvasRef} className={className} style={{ height }} />;
});
