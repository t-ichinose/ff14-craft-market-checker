/**
 * 🛡️ 統一マーケットノイズフィルター (3層アンカー方式)
 * 
 * 役割:
 * 1. 真の相場アンカー (AnchorPrice) の階層的算出 (NPC店売り > 全日本中央値 > 全出品中央値)
 * 2. 異常取引 (ギル移動、捨て値、桁ミス) の完全除外 (取引履歴クレンジング)
 * 3. 異常出品 (倉庫代わりの超高額、捨て売り) の完全除外 (出品テーブルクレンジング)
 * 4. クリーンデータに基づく min / avg / max / velocity の再集計
 */

export interface RawHistoryEntry {
  price: number;
  qty: number;
  ts: number;
  buyer?: string;
  hq: boolean;
}

export interface RawListingEntry {
  pricePerUnit: number;
  quantity: number;
  total: number;
  worldName?: string;
  retainerName?: string;
  hq: boolean;
}

export interface ItemNoiseMeta {
  shop_price?: number; // NPC店売り価格 (正解キー)
  price_mid?: number;
  region_median_price?: number; // 全DC相場中央値
  avg_price?: number;
}

/**
 * 1. 【相場アンカー (基準価格) の決定】
 */
export function determineAnchorPrice(
  meta?: ItemNoiseMeta,
  history?: RawHistoryEntry[],
  listings?: RawListingEntry[]
): { anchorPrice: number; isNpcItem: boolean; shopPrice: number } {
  const shopPrice = meta?.shop_price || meta?.price_mid || 0;
  if (shopPrice > 0) {
    return { anchorPrice: shopPrice, isNpcItem: true, shopPrice };
  }

  // 全DC中央値があれば最優先の基準相場とする
  if (meta?.region_median_price && meta.region_median_price > 0) {
    return { anchorPrice: meta.region_median_price, isNpcItem: false, shopPrice: 0 };
  }

  // 履歴からの相場中央値
  if (history && history.length > 0) {
    const validPrices = history.map((h) => h.price).filter((p) => p > 0).sort((a, b) => a - b);
    if (validPrices.length > 0) {
      const mid = Math.floor(validPrices.length / 2);
      const median = validPrices.length % 2 === 0
        ? Math.round((validPrices[mid - 1] + validPrices[mid]) / 2)
        : validPrices[mid];
      return { anchorPrice: median, isNpcItem: false, shopPrice: 0 };
    }
  }

  // 出品からの相場中央値
  if (listings && listings.length > 0) {
    const validPrices = listings.map((l) => l.pricePerUnit).filter((p) => p > 0).sort((a, b) => a - b);
    if (validPrices.length > 0) {
      const mid = Math.floor(validPrices.length / 2);
      return { anchorPrice: validPrices[mid], isNpcItem: false, shopPrice: 0 };
    }
  }

  return { anchorPrice: meta?.avg_price || 0, isNpcItem: false, shopPrice: 0 };
}

/**
 * 2. 【取引履歴の完全クレンジング (異常取引の抹消)】
 */
export function filterCleanHistory(
  history: RawHistoryEntry[],
  anchorPrice: number,
  isNpcItem: boolean,
  shopPrice: number = 0
): RawHistoryEntry[] {
  if (!history || history.length === 0) return [];
  if (anchorPrice <= 0 && shopPrice <= 0) return history;

  return history.filter((h) => {
    const price = h.price || 0;
    if (price <= 0) return false;

    // A. 店売りアイテムのギル移動排除 (店売り価格の 50倍 または 3,000G を超える高額取引は 100% ギル移動として完全除外)
    if (isNpcItem && shopPrice > 0) {
      const npcCeiling = Math.max(shopPrice * 50, 3000);
      if (price > npcCeiling) {
        return false;
      }
    }

    // B. 下限ノイズガード: 基準相場 5,000G 以上の品で、相場の 25% (1/4) 未満の桁ミス・捨て売りを除外
    if (anchorPrice >= 5000 && price < anchorPrice * 0.25) {
      return false;
    }

    // C. 上限ノイズガード: 基準相場の 3.5倍を超え、かつ差額が 10,000G 以上開いているギル移動取引を除外
    if (!isNpcItem && anchorPrice > 0 && price > anchorPrice * 3.5 && (price - anchorPrice) >= 10000) {
      return false;
    }

    // D. 極端な高額品 (100万G以上) の異常暴騰 (2倍超) を除外
    if (!isNpcItem && anchorPrice >= 1000000 && price > anchorPrice * 2.0) {
      return false;
    }

    return true;
  });
}

/**
 * 3. 【リアルタイム出品の完全クレンジング (倉庫出品・捨て値の抹消)】
 */
export function filterCleanListings(
  listings: RawListingEntry[],
  anchorPrice: number,
  isNpcItem: boolean,
  shopPrice: number = 0
): RawListingEntry[] {
  if (!listings || listings.length === 0) return [];
  if (anchorPrice <= 0 && shopPrice <= 0) return listings;

  return listings.filter((l) => {
    const price = l.pricePerUnit || 0;
    if (price <= 0) return false;

    // A. 店売り品の超高額転売・倉庫出品 (店売り価格の 50倍 または 5,000G 超は除外)
    if (isNpcItem && shopPrice > 0) {
      const npcCeiling = Math.max(shopPrice * 50, 5000);
      if (price > npcCeiling) {
        return false;
      }
    }

    // B. リテイナー倉庫代わりの超高額出品 (相場の 4.0倍を超え、かつ差額 20,000G 以上は売る気がないので除外)
    if (!isNpcItem && anchorPrice > 0 && price > anchorPrice * 4.0 && (price - anchorPrice) >= 20000) {
      return false;
    }

    // C. 桁間違いの極端な捨て値出品 (相場の 20% 未満、かつ相場 5,000G 以上)
    if (anchorPrice >= 5000 && price < anchorPrice * 0.20) {
      return false;
    }

    return true;
  });
}

/**
 * 4. 【クリーンデータからの指標再集計】
 */
export function recomputeMetricsFromCleanData(
  cleanHistory: RawHistoryEntry[],
  cleanListings: RawListingEntry[],
  fallbackItem: { min_price: number; avg_price: number; max_price: number; sale_velocity: number; sale_trades?: number; history?: RawHistoryEntry[] }
) {
  const prices = cleanHistory.map((h) => h.price).filter((p) => p > 0);
  const listingPrices = cleanListings.map((l) => l.pricePerUnit).filter((p) => p > 0);

  // 最安値: クリーンな出品の最安値、なければクリーン履歴の最安値
  const minPrice = listingPrices.length > 0
    ? Math.min(...listingPrices)
    : (prices.length > 0 ? Math.min(...prices) : (fallbackItem.min_price || 0));

  // 最高値: クリーンな履歴の最高値 (なければクリーン出品最高値、なければ元データ)
  const maxPrice = prices.length > 0
    ? Math.max(...prices)
    : (listingPrices.length > 0 ? Math.max(...listingPrices) : (fallbackItem.max_price || 0));

  // 平均値: クリーン履歴の加重平均
  let totalRev = 0;
  let totalQty = 0;
  for (const h of cleanHistory) {
    totalRev += (h.price || 0) * (h.qty || 1);
    totalQty += (h.qty || 1);
  }
  const avgPrice = totalQty > 0 ? Math.round(totalRev / totalQty) : (fallbackItem.avg_price || minPrice || 0);

  // 取引数 & 売買数: fallbackItem に入っている7日間の全量データを維持
  // ※ history 配列は直近最大20件のサンプルのため、cleanHistory.length で上書きしてはならない！
  const rawHistoryLen = fallbackItem.history ? fallbackItem.history.length : cleanHistory.length;
  const cleanRatio = rawHistoryLen > 0 ? (cleanHistory.length / rawHistoryLen) : 1;

  const originalVelocity = fallbackItem.sale_velocity || 0;
  const originalTrades = fallbackItem.sale_trades || 0;

  const velocity = Math.round(originalVelocity * cleanRatio * 10) / 10;
  const trades = Math.round(originalTrades * cleanRatio);

  return {
    min_price: minPrice,
    avg_price: avgPrice,
    max_price: maxPrice,
    sale_velocity: velocity,
    sale_trades: trades,
    daily_revenue: Math.round(avgPrice * velocity),
  };
}
