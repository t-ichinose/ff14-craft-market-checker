import { WORLD_TO_DC } from '../../shared/marketConstants';
import type { MarketItem } from '../../services/marketDataService';
import type { ArbitrageOpportunity, ArbitrageFilterOptions, ListingEntry } from './arbitrageTypes';
import { fetchMarketListings } from '../../services/universalisClient';

/**
 * 過去7日間の日付ラベル (MM/DD) を厳密に生成 (JST基準)
 */
export function getWeekRangeJst(): string[] {
  const now = new Date();
  const jstNow = new Date(now.getTime() + (9 * 3600 + now.getTimezoneOffset() * 60) * 1000);
  const todayYear = jstNow.getFullYear();
  const todayMonth = jstNow.getMonth();
  const todayDate = jstNow.getDate();

  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayYear, todayMonth, todayDate - i);
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    const dStr = String(d.getDate()).padStart(2, '0');
    labels.push(`${mStr}/${dStr}`);
  }
  return labels;
}

/**
 * Unixタイムスタンプ (秒) を JST (MM-DD HH:mm) 形式にフォーマット
 */
export function formatTimeJst(ts: number): string {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}`;
}

/**
 * 日別相場推移配列を指定日付ラベル一覧に整列補完
 */
export function alignDailyTrend(
  dailyTrend: { date: string; weighted_avg: number; volume: number }[] | undefined,
  dates: string[]
): { date: string; weighted_avg: number; volume: number }[] {
  const map = new Map((dailyTrend || []).map((d) => [d.date, d]));
  return dates.map((dStr) => map.get(dStr) || { date: dStr, weighted_avg: 0, volume: 0 });
}

/**
 * 全ワールドの相場データからサヤ取り好機を計算・抽出
 */
export function computeArbitrageOpportunities(
  allData: Record<string, MarketItem[]>,
  options: ArbitrageFilterOptions
): ArbitrageOpportunity[] {
  const {
    homeWorld,
    sortMode,
    minVelocity,
    excludeCrystals,
    searchQuery,
    availableCategories,
    selectedCategories,
  } = options;

  if (Object.keys(allData).length === 0) return [];

  const homeItems = allData[homeWorld] || [];
  if (homeItems.length === 0) return [];

  if (selectedCategories.length === 0) return [];
  const isFilterCategory = selectedCategories.length < availableCategories.length;

  const homeItemMap = new Map<string, MarketItem>();
  for (const item of homeItems) {
    if ((item.sale_velocity || 0) >= minVelocity && (item.sale_trades || 0) > 0) {
      const itemKey = `${item.item_id}_${item.hq ? 'hq' : 'nq'}`;
      homeItemMap.set(itemKey, item);
    }
  }

  // Pre-build O(1) Lookup Maps for all 32 worlds (eliminates 700M loop freeze)
  const worldItemMaps: Record<string, Map<string, MarketItem>> = {};
  for (const [w, list] of Object.entries(allData)) {
    const m = new Map<string, MarketItem>();
    for (let i = 0; i < list.length; i++) {
      const itm = list[i];
      m.set(`${itm.item_id}_${itm.hq ? 'hq' : 'nq'}`, itm);
    }
    worldItemMaps[w] = m;
  }

  const otherWorlds = Object.keys(allData).filter((w) => w !== homeWorld);
  const results: ArbitrageOpportunity[] = [];

  const q = searchQuery.trim().toLowerCase();

  for (const [itemKey, homeItem] of homeItemMap.entries()) {
    const itemId = homeItem.item_id;

    // Category filter
    if (isFilterCategory) {
      const cat = homeItem.category_name || '';
      if (!selectedCategories.includes(cat)) continue;
    }

    // Crystal filter
    if (excludeCrystals && itemId >= 2 && itemId <= 19) continue;

    // Search filter
    if (q) {
      const title = (homeItem.item_name || '').toLowerCase();
      if (!title.includes(q) && !String(itemId).includes(q)) continue;
    }

    const sellPrice = homeItem.avg_price || homeItem.min_price || 0;
    if (sellPrice <= 0) continue;

    let bestOp: ArbitrageOpportunity | null = null;
    let maxProfit = -1;

    for (const srcWorld of otherWorlds) {
      const sourceItem = worldItemMaps[srcWorld]?.get(itemKey);
      if (!sourceItem) continue;

      const buyPrice = sourceItem.avg_price || sourceItem.min_price || 0;
      if (buyPrice <= 0) continue;

      const netCost = buyPrice * 1.05; // 5% fee
      const netReturn = sellPrice * 0.95; // 5% sales tax
      const unitProfit = Math.round(netReturn - netCost);
      if (unitProfit <= 0) continue;

      const roiPercent = Math.round((unitProfit / netCost) * 100);
      if (roiPercent < 15) continue; // Minimum 15% ROI

      // === 堅牢なノイズフィルター (ギル移動・外れ値・虚偽の利益を完全排除) ===
      // 1. 自鯖に現在出品がある場合、販売想定値が現在最安値(min_price)の2倍を超えていたらノイズとして除外
      if (homeItem.min_price > 0 && sellPrice > homeItem.min_price * 2.0) continue;
      // 2. 利益率が500% (5倍) を超える極端な異常値を除外 (ギル移動の典型)
      if (roiPercent > 500) continue;
      // 3. 販売想定値が仕入れ値の5倍を超える異常乖離を除外
      if (sellPrice > buyPrice * 5) continue;
      // 4. 仕入れが1,000G以下の低額品なのに販売が2万Gを超える店売り悪用を除外
      if (buyPrice <= 1000 && sellPrice > 20000) continue;
      // 5. 100万G以上の高額品で、7日間の取引実績が2件以下しかない通常装備(ギル移動)を除外
      if (sellPrice >= 1000000 && ((homeItem.sale_trades || 0) <= 2 || (sourceItem.sale_trades || 0) <= 2)) {
        const cat = homeItem.category_name || '';
        const isCollectible = ['その他', 'ミニオン', 'マウント', '雑貨', 'オーケストリオン関連'].includes(cat);
        if (!isCollectible) continue;
      }
      // 6. 下限ノイズガード: 基準相場 (全国中央値) が 30,000G 以上の品目で、仕入れ値が全国相場の 35% 未満の極端な安値 (捨て値・誤出品) は除外
      const refBenchmark = sourceItem.region_median_price || homeItem.region_median_price || 0;
      if (refBenchmark >= 30000 && buyPrice < refBenchmark * 0.35) continue;

      const vel = homeItem.sale_velocity || 0;
      const dailyProfit = Math.round(unitProfit * vel);

      // 各商品で最も純利益が大きい仕入れ元ワールドを選定
      if (unitProfit > maxProfit) {
        maxProfit = unitProfit;
        bestOp = {
          itemId,
          itemName: homeItem.item_name || `Item #${itemId}`,
          itemIcon: homeItem.icon_url || 'https://v2.xivapi.com/api/asset?path=ui/icon/020000/021001_hr1.tex&format=png',
          categoryName: homeItem.category_name || '一般',
          isHq: Boolean(homeItem.hq),
          sourceWorld: srcWorld,
          sourceDc: WORLD_TO_DC[srcWorld] || '-',
          homeWorld,
          homeDc: WORLD_TO_DC[homeWorld] || '-',
          buyPrice,
          sellPrice,
          unitProfit,
          dailyProfit,
          roiPercent,
          velocity: vel,
          trades: homeItem.sale_trades || 0,
          sourceTrend: sourceItem.daily_trend,
          sourceTrendPct: sourceItem.trend_pct,
          homeTrend: homeItem.daily_trend,
          homeTrendPct: homeItem.trend_pct,
        };
      }
    }

    if (bestOp) {
      results.push(bestOp);
    }
  }

  // Sort opportunities
  if (sortMode === 'unitProfit') {
    results.sort((a, b) => b.unitProfit - a.unitProfit);
  } else {
    results.sort((a, b) => b.dailyProfit - a.dailyProfit);
  }

  return results.slice(0, 50);
}

/**
 * Universalis API から出品データを取得（universalisClient へ委譲）
 */
export async function fetchListingsFromUniversalis(
  scope: string,
  itemId: number,
  isHq: boolean,
  signal?: AbortSignal
): Promise<ListingEntry[]> {
  const result = await fetchMarketListings(scope, itemId, {
    isHq,
    limit: 50,
    signal,
  });
  return result.listings;
}
