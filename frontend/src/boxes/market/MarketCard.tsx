import React from 'react';
import type { MarketItem } from '../../services/marketDataService';
import { renderSparklineAndBadge } from './marketUtils';

interface MarketCardProps {
  item: MarketItem;
  idx: number;
  isSelected: boolean;
  onSelect: (item: MarketItem) => void;
}

export const MarketCard: React.FC<MarketCardProps> = React.memo(({
  item,
  idx,
  isSelected,
  onSelect,
}) => {
  const cleanTitle = (item.item_name || `Item #${item.item_id}`).replace(/\s*\[(NQ|HQ)\]\s*$/i, '').trim();
  const primaryIcon = item.icon_url || 'https://v2.xivapi.com/api/asset?path=ui/icon/020000/021001_hr1.tex&format=png';
  const lodestoneUrl = `https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/?patch=&db_search_category=item&category2=&q=${encodeURIComponent(cleanTitle)}`;
  const dailyRev = Math.round((item.avg_price || 0) * (item.sale_velocity || 0));
  const hasHistory = (item.sale_trades || 0) > 0 || (item.min_price || 0) > 0;

  return (
    <div
      onClick={() => onSelect(item)}
      style={{
        borderRadius: '12px',
        padding: '8px 10px',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        position: 'relative',
        ...(isSelected
          ? {
              background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid #00d2ff',
              boxShadow: '0 0 16px rgba(0, 210, 255, 0.45)',
            }
          : {
              background: 'rgba(22, 30, 49, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }),
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <img
          src={primaryIcon}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: '#0b111e',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', lineHeight: 1.2 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>
              #{idx + 1}
            </span>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#ffffff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {cleanTitle}
            </span>
            {item.hq && (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '1px 4px',
                  borderRadius: '4px',
                  background: 'rgba(234,179,8,0.25)',
                  border: '1px solid rgba(234,179,8,0.6)',
                  color: '#ffb703',
                  marginLeft: '4px',
                }}
              >
                HQ
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {hasHistory ? (
                renderSparklineAndBadge(item)
              ) : (
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(148, 163, 184, 0.12)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    color: '#94a3b8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <i className="fa-regular fa-clock" style={{ fontSize: '0.6rem' }}></i>
                  履歴なし
                </span>
              )}
              <a
                href={lodestoneUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: '#94a3b8', fontSize: '0.7rem', padding: '2px' }}
                title="Lodestoneで開く"
              >
                <i className="fa-solid fa-arrow-up-right-from-square"></i>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column 3-Row Metrics Grid or No-History notice */}
      {!hasHistory ? (
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: '8px',
            padding: '12px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.72rem' }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ color: '#38bdf8', fontSize: '0.75rem' }}></i>
            <span>直近7日間の取引履歴なし</span>
          </div>
          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>タップで出品確認</span>
        </div>
      ) : (
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '6px 8px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          rowGap: '4px',
          columnGap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            paddingRight: '8px',
            height: '22px',
          }}
        >
          <span style={{ color: '#94a3b8', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <i className="fa-solid fa-bolt" style={{ color: '#00d2ff', width: '12px', textAlign: 'center' }}></i> 売買数:
          </span>
          <strong style={{ color: '#00d2ff', fontSize: '0.76rem', fontFamily: 'Outfit, sans-serif' }}>
            {(item.sale_velocity || 0).toFixed(1)}個/日
          </strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '22px' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <i className="fa-solid fa-tag" style={{ color: '#38bdf8', width: '12px', textAlign: 'center' }}></i> 最安:
          </span>
          <strong style={{ color: '#38bdf8', fontSize: '0.76rem', fontFamily: 'Outfit, sans-serif' }}>
            {(item.min_price || 0).toLocaleString()}G
          </strong>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            paddingRight: '8px',
            height: '22px',
          }}
        >
          <span style={{ color: '#94a3b8', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <i className="fa-solid fa-receipt" style={{ color: '#94a3b8', width: '12px', textAlign: 'center' }}></i> 取引数:
          </span>
          <strong style={{ color: '#f1f5f9', fontSize: '0.76rem', fontFamily: 'Outfit, sans-serif' }}>
            {Math.round((item.sale_trades || 0) / 7.0)}件/日
          </strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '22px' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <i className="fa-solid fa-scale-balanced" style={{ color: '#c084fc', width: '12px', textAlign: 'center' }}></i> 平均:
          </span>
          <strong style={{ color: '#c084fc', fontSize: '0.76rem', fontFamily: 'Outfit, sans-serif' }}>
            {Math.round(item.avg_price || 0).toLocaleString()}G
          </strong>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            paddingRight: '8px',
            height: '22px',
          }}
        >
          <span style={{ color: '#94a3b8', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <i className="fa-solid fa-coins" style={{ color: '#ffb703', width: '12px', textAlign: 'center' }}></i> 流通:
          </span>
          <strong style={{ color: '#ffb703', fontSize: '0.76rem', fontFamily: 'Outfit, sans-serif' }}>
            {dailyRev.toLocaleString()}G
          </strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '22px' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <i className="fa-solid fa-arrow-trend-up" style={{ color: '#f87171', width: '12px', textAlign: 'center' }}></i> 最高:
          </span>
          <strong style={{ color: '#f87171', fontSize: '0.76rem', fontFamily: 'Outfit, sans-serif' }}>
            {(item.max_price || 0).toLocaleString()}G
          </strong>
        </div>
      </div>
      )}
    </div>
  );
});

MarketCard.displayName = 'MarketCard';
