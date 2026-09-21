import { WORLD_TO_DC } from '../../shared/marketConstants';
import type { MarketItem, RawListingTuple } from '../../services/marketDataService';
import type { ArbitrageOpportunity, ArbitrageFilterOptions } from './arbitrageTypes';

/**
 * ワールドの生出品タプル配列から、捨て値・桁ミスを排除したクリーンな最安値を抽出
 */
export function extractCleanMinListing(
  rawTuples: RawListingTuple[] | undefined,
  isHq: boolean,
  benchmarkPrice: number
): { price: number; quantity: number } | null {
  if (!rawTuples || rawTuples.length === 0) return null;

  // 1. 指定された品質（HQ/NQ）でフィルタ
  const filtered: { price: number; quantity: number }[] = [];
  for (let i = 0; i < rawTuples.length; i++) {
    const [price, qty, hqFlag] = rawTuples[i];
    if (Boolean(hqFlag) === isHq && price > 0) {
      filtered.push({ price, quantity: qty });
    }
  }
  if (filtered.length === 0) return null;

  // 2. 価格昇順ソート
  filtered.sort((a, b) => a.price - b.price);

  // 3. 捨て値・桁ミス除外判定
  let candidateIdx = 0;

  // 極端な1桁・2桁安値（10G未満）は捨て値として除外
  while (candidateIdx < filtered.length && filtered[candidateIdx].price < 10) {
    candidateIdx++;
  }
  if (candidateIdx >= filtered.length) return null;

  // 相場基準値（中央値など）がある場合、相場の30%未満の極端な安値は除外
  if (benchmarkPrice >= 3000) {
    while (
      candidateIdx < filtered.length &&
      filtered[candidateIdx].price < benchmarkPrice * 0.30
    ) {
      candidateIdx++;
    }
  }
  if (candidateIdx >= filtered.length) return null;

  // 1位と2位の極端な乖離チェック（例: 1位が100G、2位が10,000Gなどの桁ミス）
  if (candidateIdx + 1 < filtered.length) {
    const firstPrice = filtered[candidateIdx].price;
    const secondPrice = filtered[candidateIdx + 1].price;
    if (secondPrice >= 1000 && firstPrice < secondPrice * 0.40) {
      candidateIdx++;
    }
  }

  return filtered[candidateIdx] || null;
}

import { getRobustHistoryPrice } from '../market/marketUtils';
export { getRobustHistoryPrice };

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
  options: ArbitrageFilterOptions,
  itemsCatalog?: Record<string, any>,
  listingsMap?: Record<string, Record<string, RawListingTuple[]>>
): ArbitrageOpportunity[] {
  const {
    homeWorld,
    sortMode,
    minVelocity,
    excludeCrystals,
    searchQuery,
    availableCategories,
    selectedCategories,
    sourcingScope = 'all_dc',
  } = options;

  if (Object.keys(allData).length === 0) return [];

  const homeItems = allData[homeWorld] || [];
  if (homeItems.length === 0 && (!itemsCatalog || Object.keys(itemsCatalog).length === 0)) return [];

  if (selectedCategories.length === 0) return [];
  const isFilterCategory = selectedCategories.length < availableCategories.length;
  const q = searchQuery.trim().toLowerCase();

  const homeItemMap = new Map<string, MarketItem>();
  for (const item of homeItems) {
    // 検索時は日販数フィルターで除外しない
    if (!q && minVelocity > 0 && (item.sale_velocity || 0) < minVelocity) continue;
    if ((item.sale_trades || 0) > 0) {
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

  const homeDc = WORLD_TO_DC[homeWorld] || '';
  const otherWorlds = Object.keys(allData).filter((w) => {
    if (w === homeWorld) return false;
    if (sourcingScope === 'dc') {
      return (WORLD_TO_DC[w] || '') === homeDc;
    }
    return true;
  });
  const results: ArbitrageOpportunity[] = [];
  const hasListings = listingsMap && Object.keys(listingsMap).length > 0;

  for (const [itemKey, homeItem] of homeItemMap.entries()) {
    const itemId = homeItem.item_id;
    const isHq = Boolean(homeItem.hq);

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

    // 販売履歴基準相場 (直近取引の中央値/平均値)
    const historyPrice = getRobustHistoryPrice(homeItem);
    const benchmarkPrice = homeItem.region_median_price || historyPrice || homeItem.avg_price || 0;

    // 目標売価 (sellPrice) の算出:
    // 出品データがある場合は自鯖の出品最安値と履歴基準相場を比較し、
    // 「安い方」を基準にして目標売価を決定（最安値が高い場合は履歴相場から、低い場合は最安値から算出）
    let sellPrice = 0;
    const itemListings = hasListings ? listingsMap[String(itemId)] : undefined;
    const homeRawListings = itemListings ? itemListings[homeWorld] : undefined;
    const cleanHomeMin = extractCleanMinListing(homeRawListings, isHq, benchmarkPrice);

    const trendPct = homeItem.trend_pct || 0;
    // 下落トレンドなら -8%、上昇トレンドなら -2%、横ばいなら -5%
    const discountRate = trendPct <= -5 ? 0.92 : (trendPct >= 5 ? 0.98 : 0.95);

    if (cleanHomeMin && cleanHomeMin.price > 0 && historyPrice > 0) {
      // 出品最安値と履歴相場を比較して、より安い方を基準価格とする
      const basePrice = Math.min(cleanHomeMin.price, historyPrice);
      sellPrice = Math.max(1, Math.round(basePrice * discountRate));
    } else if (cleanHomeMin && cleanHomeMin.price > 0) {
      sellPrice = Math.max(1, Math.round(cleanHomeMin.price * discountRate));
    } else {
      // 自鯖に出品がない場合 (品切れチャンス) または出品データ未ロード時
      sellPrice = historyPrice || homeItem.avg_price || homeItem.min_price || benchmarkPrice || 0;
    }

    if (sellPrice <= 0) continue;

    // ★ 販売目標から逆算した「目標仕入上限額 (maxBuyPrice)」
    // 手数料 (他鯖購入税5% + 自鯖販売税5% = 計10%) を考慮し、最低利回り15%を確保できる仕入上限
    // netReturn = sellPrice * 0.95, netCost = buyPrice * 1.05
    // netReturn - netCost >= netCost * 0.15  =>  buyPrice <= (sellPrice * 0.95) / (1.05 * 1.15)
    const maxBuyPrice = Math.floor((sellPrice * 0.95) / (1.05 * 1.15));
    if (maxBuyPrice <= 0) continue;

    // 他ワールドの出品最安値を集める
    interface Candidate {
      world: string;
      price: number;
      quantity: number;
      sourceItem?: MarketItem;
    }
    const candidates: Candidate[] = [];

    for (const srcWorld of otherWorlds) {
      const sourceItem = worldItemMaps[srcWorld]?.get(itemKey);

      let buyPrice = 0;
      let quantity = 1;
      const srcRawListings = itemListings ? itemListings[srcWorld] : undefined;
      const cleanSrcMin = extractCleanMinListing(srcRawListings, isHq, benchmarkPrice);

      if (cleanSrcMin && cleanSrcMin.price > 0) {
        buyPrice = cleanSrcMin.price;
        quantity = cleanSrcMin.quantity;
      } else if (!hasListings && sourceItem) {
        // 出品データがない場合のフォールバック (履歴データ)
        buyPrice = sourceItem.avg_price || sourceItem.min_price || 0;
      }

      if (buyPrice > 0) {
        candidates.push({ world: srcWorld, price: buyPrice, quantity, sourceItem });
      }
    }

    if (candidates.length === 0) continue;

    // 価格昇順ソート
    candidates.sort((a, b) => a.price - b.price);

    // ★ ポツン半値（突発的な単発処分・他鯖と乖離した外れ値）の除外フィルター
    // 候補が複数ある場合、1位が2位の55%未満（ほぼ半値以下）なら1位をスキップ
    let validCandidates = candidates;
    while (
      validCandidates.length >= 2 &&
      validCandidates[1].price >= 1000 &&
      validCandidates[0].price < validCandidates[1].price * 0.55
    ) {
      validCandidates = validCandidates.slice(1);
    }

    // 目標仕入上限額 (maxBuyPrice) 以下の候補（確実に利益が出る仕入れ先）を抽出
    const profitableCandidates = validCandidates.filter((c) => c.price <= maxBuyPrice);
    if (profitableCandidates.length === 0) continue; // 利益が出る仕入れ先がなければスキップ

    // 最も安く仕入れられる最安ワールドを採用
    const bestCandidate = profitableCandidates[0];
    const buyPrice = bestCandidate.price;
    const srcWorld = bestCandidate.world;
    const sourceItem = bestCandidate.sourceItem;

    // 手数料計算 (FF14税制: 購入税5% netCost、販売手取り netReturn 5%税引)
    // 方式B: 「目標仕入額 (maxBuyPrice)」を基準にした手残り単価利益を算出
    const targetNetCost = Math.round(maxBuyPrice * 1.05);
    const netReturn = Math.round(sellPrice * 0.95);
    const unitProfit = netReturn - targetNetCost;
    if (unitProfit <= 0) continue;

    const roiPercent = Math.round((unitProfit / targetNetCost) * 100);

    // 実仕入れ最安値（buyPrice）の実質コストと利益率（ノイズフィルター検証用）
    const actualNetCost = Math.round(buyPrice * 1.05);
    const actualRoiPercent = Math.round(((netReturn - actualNetCost) / actualNetCost) * 100);

    // === 堅牢なノイズフィルター (ギル移動・外れ値・虚偽の利益を完全排除) ===
    // 1. 自鯖に現在出品がある場合、販売想定値が現在最安値(min_price)の2倍を超えていたらノイズとして除外
    if (homeItem.min_price > 0 && sellPrice > homeItem.min_price * 2.0) continue;
    // 2. 利益率が500% (5倍) を超える極端な異常値を除外 (ギル移動の典型)
    if (actualRoiPercent > 500) continue;
    // 3. 販売想定値が仕入れ値の5倍を超える異常乖離を除外
    if (sellPrice > buyPrice * 5) continue;
    // 4. 仕入れが1,000G以下の低額品なのに販売が2万Gを超える店売り悪用を除外
    if (buyPrice <= 1000 && sellPrice > 20000) continue;
    // 5. 100万G以上の高額品で、7日間の取引実績が2件以下しかない通常装備(ギル移動)を除外
    if (sellPrice >= 1000000 && ((homeItem.sale_trades || 0) <= 2 || ((sourceItem?.sale_trades || 0) <= 2))) {
      const cat = homeItem.category_name || '';
      const isCollectible = ['その他', 'ミニオン', 'マウント', '雑貨', 'オーケストリオン関連'].includes(cat);
      if (!isCollectible) continue;
    }
    // 6. 下限ノイズガード: 基準相場 (全国中央値) が 30,000G 以上の品目で、仕入れ値が全国相場の 35% 未満の極端な安値 (捨て値・誤出品) は除外
    if (benchmarkPrice >= 30000 && buyPrice < benchmarkPrice * 0.35) continue;

    const vel = homeItem.sale_velocity || 0;

    // 仕入れ先ワールド (srcWorld) において、目標仕入上限額 (maxBuyPrice) 以下で出品されている現物数量の合計
    let stockQuantity = bestCandidate.quantity || 1;
    const bestWorldRawListings = itemListings ? itemListings[srcWorld] : undefined;
    if (bestWorldRawListings && bestWorldRawListings.length > 0) {
      let totalQty = 0;
      for (let i = 0; i < bestWorldRawListings.length; i++) {
        const [p, q, hqFlag] = bestWorldRawListings[i];
        if (Boolean(hqFlag) === isHq && p > 0 && p <= maxBuyPrice) {
          totalQty += q;
        }
      }
      if (totalQty > 0) {
        stockQuantity = totalQty;
      }
    }

    // ★ パターンA: 供給 (仕入れ先在庫) と 需要 (自鯖の1日販売消化力) のボトルネックを考慮した実効1日消化量
    // 日販が1個未満の高額品でも在庫1個なら正当に評価できるよう max(1, vel) を採用
    const effectiveDailyQty = Math.min(stockQuantity, Math.max(1, vel));
    const dailyProfit = Math.round(unitProfit * effectiveDailyQty);
    const totalProfit = Math.round(unitProfit * stockQuantity);

    const bestOp: ArbitrageOpportunity = {
      itemId,
      itemName: homeItem.item_name || `Item #${itemId}`,
      itemIcon: homeItem.icon_url || 'https://v2.xivapi.com/api/asset?path=ui/icon/020000/021001_hr1.tex&format=png',
      categoryName: homeItem.category_name || '一般',
      isHq,
      sourceWorld: srcWorld,
      sourceDc: WORLD_TO_DC[srcWorld] || '-',
      homeWorld,
      homeDc: WORLD_TO_DC[homeWorld] || '-',
      buyPrice,
      maxBuyPrice,
      sellPrice,
      unitProfit,
      dailyProfit,
      stockQuantity,
      totalProfit,
      roiPercent,
      velocity: vel,
      trades: homeItem.sale_trades || 0,
      availableWorldsCount: profitableCandidates.length,
      sourceTrend: sourceItem?.daily_trend,
      sourceTrendPct: sourceItem?.trend_pct,
      homeTrend: homeItem.daily_trend,
      homeTrendPct: homeItem.trend_pct,
    };

    results.push(bestOp);
  }

  // Sort opportunities (日当利益順 / 単価利益順 / 利益率順 / 日販数順)
  if (sortMode === 'unitProfit') {
    results.sort((a, b) => b.unitProfit - a.unitProfit);
  } else if (sortMode === 'roiPercent') {
    results.sort((a, b) => b.roiPercent - a.roiPercent);
  } else if (sortMode === 'velocity') {
    results.sort((a, b) => b.velocity - a.velocity);
  } else {
    // dailyProfit / totalProfit (日当利益順)
    results.sort((a, b) => b.dailyProfit - a.dailyProfit);
  }

  // 検索時: カタログ全件からマッチする品目もプレースホルダーとして追加
  if (q && itemsCatalog && Object.keys(itemsCatalog).length > 0) {
    const existingIds = new Set(results.map((r) => r.itemId));
    const matchedCatalog: ArbitrageOpportunity[] = [];

    for (const [idStr, meta] of Object.entries(itemsCatalog)) {
      const itemId = Number(idStr);
      if (excludeCrystals && itemId >= 2 && itemId <= 19) continue;
      if (isFilterCategory && !selectedCategories.includes(meta.category || '')) continue;

      const title = (meta.name || '').toLowerCase();
      if (title.includes(q) || idStr.includes(q)) {
        if (!existingIds.has(itemId)) {
          const hItem = homeItems.find((x) => x.item_id === itemId);
          const sellPrice = hItem ? (hItem.avg_price || hItem.min_price || 0) : 0;

          matchedCatalog.push({
            itemId,
            itemName: meta.name || `Item #${itemId}`,
            itemIcon: meta.icon || 'https://v2.xivapi.com/api/asset?path=ui/icon/020000/021001_hr1.tex&format=png',
            categoryName: meta.category || '一般',
            isHq: false,
            sourceWorld: '-',
            sourceDc: '-',
            homeWorld,
            homeDc: WORLD_TO_DC[homeWorld] || '-',
            buyPrice: 0,
            sellPrice,
            unitProfit: 0,
            dailyProfit: 0,
            stockQuantity: 0,
            totalProfit: 0,
            roiPercent: 0,
            velocity: hItem?.sale_velocity || 0,
            trades: hItem?.sale_trades || 0,
            sourceTrend: [],
            sourceTrendPct: 0,
            homeTrend: hItem?.daily_trend,
            homeTrendPct: hItem?.trend_pct,
          });
        }
      }
    }
    matchedCatalog.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
    return [...results, ...matchedCatalog].slice(0, 100);
  }

  return results.slice(0, 50);
}
