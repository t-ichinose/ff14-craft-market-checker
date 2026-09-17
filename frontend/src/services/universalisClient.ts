/**
 * Universalis API Client
 * Universalis v2 REST API への通信とレスポンス正規化を一元管理するモジュール
 */

import { apiHealthManager } from './apiHealthService';
import { getPreloadedListings } from './marketDataService';
import { JAPAN_DCS, WORLD_TO_DC } from '../shared/marketConstants';

export interface UniversalisListingItem {
  pricePerUnit: number;
  quantity: number;
  total: number;
  worldName: string;
  retainerName: string;
  hq: boolean;
}

// 既存コードとの互換用エイリアス
export type ListingEntry = UniversalisListingItem;

export interface UniversalisHistoryItem {
  price: number;
  qty: number;
  ts: number;
  buyer: string;
  hq: boolean;
}

export interface FetchListingsOptions {
  isHq?: boolean;
  limit?: number;
  signal?: AbortSignal;
  forceLive?: boolean;
}

export interface FetchListingsResult {
  listings: UniversalisListingItem[];
  unitsForSale: number;
}

export interface FetchHistoryOptions {
  isHq?: boolean;
  limit?: number;
  signal?: AbortSignal;
}

export interface FetchHistoryResult {
  entries: UniversalisHistoryItem[];
  regularSaleVelocity: number;
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
}

export interface TriadSummary {
  selWorldMin: number;
  dcMin: { price: number; world: string };
  allMin: { price: number; world: string };
}

export interface TriadListingsResult {
  world: UniversalisListingItem[];
  dc: UniversalisListingItem[];
  all: UniversalisListingItem[];
  worldUnits: number;
  dcUnits: number;
  allUnits: number;
  worldError: boolean;
  dcError: boolean;
  allError: boolean;
  summary: TriadSummary;
}

export interface FetchTriadOptions {
  world: string;
  dc: string;
  itemId: number;
  isHq?: boolean;
  signal?: AbortSignal;
  limitWorld?: number;
  limitDc?: number;
  limitAll?: number;
  forceLive?: boolean;
}

const BASE_URL = 'https://universalis.app/api/v2';

/**
 * 指定したスコープ（World/DC/Region）の出品一覧を取得
 */
export async function fetchMarketListings(
  scope: string,
  itemId: number,
  options: FetchListingsOptions = {}
): Promise<FetchListingsResult> {
  const { isHq, limit = 50, signal, forceLive } = options;

  // 1. 事前ロードされた出品データが存在し、forceLiveでない場合は即時返却 (0ms)
  if (!forceLive) {
    const preloaded = getPreloadedListings(scope, itemId, isHq);
    if (preloaded) {
      const limited = limit ? preloaded.listings.slice(0, limit) : preloaded.listings;
      return {
        listings: limited,
        unitsForSale: preloaded.unitsForSale
      };
    }
  }

  const hqParam = isHq !== undefined ? `&hq=${isHq ? 1 : 0}` : '';
  const url = `${BASE_URL}/${encodeURIComponent(scope)}/${itemId}?listings=${limit}${hqParam}`;

  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { signal });
    apiHealthManager.recordApiCall(url, performance.now() - t0, res.status);
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      apiHealthManager.recordApiCall(url, performance.now() - t0, 0);
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Universalis API error: ${res.status}`);
  }

  const data = await res.json();
  let rawListings: any[] = data.listings || [];

  // 必要に応じてHQ/NQを厳密フィルタ
  if (isHq !== undefined) {
    rawListings = rawListings.filter((l: any) => Boolean(l.hq) === isHq);
  }

  const listings: UniversalisListingItem[] = rawListings.map((l: any) => ({
    pricePerUnit: l.pricePerUnit || 0,
    quantity: l.quantity || 0,
    total: l.total || (l.pricePerUnit || 0) * (l.quantity || 0),
    worldName: l.worldName || scope,
    retainerName: l.retainerName || '-',
    hq: Boolean(l.hq),
  }));

  const unitsForSale = data.unitsForSale !== undefined
    ? Number(data.unitsForSale)
    : listings.reduce((sum, l) => sum + l.quantity, 0);

  return { listings, unitsForSale };
}

/**
 * 指定したスコープ（World等）の取引履歴（Entries）を取得
 */
export async function fetchMarketHistory(
  scope: string,
  itemId: number,
  options: FetchHistoryOptions = {}
): Promise<FetchHistoryResult> {
  const { isHq, limit = 50, signal } = options;
  const url = `${BASE_URL}/${encodeURIComponent(scope)}/${itemId}?entries=${limit}`;

  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { signal });
    apiHealthManager.recordApiCall(url, performance.now() - t0, res.status);
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      apiHealthManager.recordApiCall(url, performance.now() - t0, 0);
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Universalis API error: ${res.status}`);
  }

  const liveData = await res.json();
  let rawEntries: any[] = liveData.entries || [];

  if (isHq !== undefined) {
    rawEntries = rawEntries.filter((e: any) => Boolean(e.hq) === isHq);
  }

  const entries: UniversalisHistoryItem[] = rawEntries.map((e: any) => ({
    price: e.pricePerUnit || 0,
    qty: e.quantity || 0,
    ts: e.timestamp || 0,
    buyer: e.buyerName || '-',
    hq: Boolean(e.hq),
  }));

  const prices = entries.map((e) => e.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const avgPrice = prices.length > 0
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : 0;

  return {
    entries,
    regularSaleVelocity: liveData.regularSaleVelocity || 0,
    minPrice,
    avgPrice,
    maxPrice,
  };
}

/**
 * 自鯖・同DC・全DC（Japan）の3スコープの出品一覧および最安値（Triad）を並列取得
 */
export async function fetchCheapestTriad(
  options: FetchTriadOptions
): Promise<TriadListingsResult> {
  const {
    world,
    dc,
    itemId,
    isHq,
    signal,
    limitWorld = 30,
    limitDc = 50,
    limitAll = 100,
    forceLive,
  } = options;

  // 1. 事前ロードされた出品データが存在し、forceLiveでない場合は即座に組み立てて返却 (0ms)
  if (!forceLive) {
    const preWorld = getPreloadedListings(world, itemId, isHq);
    const preDc = getPreloadedListings(dc, itemId, isHq);
    const preAll = getPreloadedListings('Japan', itemId, isHq);

    if (preWorld && preDc && preAll) {
      const worldEntries = limitWorld ? preWorld.listings.slice(0, limitWorld) : preWorld.listings;
      const dcEntries = limitDc ? preDc.listings.slice(0, limitDc) : preDc.listings;
      const allEntries = limitAll ? preAll.listings.slice(0, limitAll) : preAll.listings;

      const selMinP = worldEntries[0]?.pricePerUnit || 0;
      const dcMin = dcEntries[0] || worldEntries[0];
      const allMin = allEntries[0] || dcMin || worldEntries[0];

      const summary: TriadSummary = {
        selWorldMin: selMinP,
        dcMin: { price: dcMin?.pricePerUnit || 0, world: dcMin?.worldName || dc },
        allMin: { price: allMin?.pricePerUnit || 0, world: allMin?.worldName || '-' },
      };

      return {
        world: worldEntries,
        dc: dcEntries,
        all: allEntries,
        worldUnits: preWorld.unitsForSale,
        dcUnits: preDc.unitsForSale,
        allUnits: preAll.unitsForSale,
        worldError: false,
        dcError: false,
        allError: false,
        summary,
      };
    }
  }

  let worldError = false;
  let dcError = false;
  let allError = false;

  // Japan リージョンで1回のみフェッチし、自鯖（world）と同DC（dc）をクライアント側で抽出・分割
  const resAll = await fetchMarketListings('Japan', itemId, {
    isHq,
    limit: limitAll,
    signal,
    forceLive,
  }).catch((err) => {
    if (err?.name !== 'AbortError') {
      worldError = true;
      dcError = true;
      allError = true;
    }
    return null;
  });

  const allListings = resAll?.listings || [];
  const dcWorlds = JAPAN_DCS[dc] || [];
  const dcEntries = limitDc
    ? allListings.filter((l) => dcWorlds.includes(l.worldName) || WORLD_TO_DC[l.worldName] === dc).slice(0, limitDc)
    : allListings.filter((l) => dcWorlds.includes(l.worldName) || WORLD_TO_DC[l.worldName] === dc);
  const worldEntries = limitWorld
    ? allListings.filter((l) => l.worldName === world).slice(0, limitWorld)
    : allListings.filter((l) => l.worldName === world);
  const allEntries = limitAll ? allListings.slice(0, limitAll) : allListings;

  // 最安値の算出
  const selMinP = worldEntries[0]?.pricePerUnit || 0;
  const dcMin = dcEntries[0] || worldEntries[0];
  const allMin = allEntries[0] || dcMin || worldEntries[0];

  const summary: TriadSummary = {
    selWorldMin: selMinP,
    dcMin: { price: dcMin?.pricePerUnit || 0, world: dcMin?.worldName || dc },
    allMin: { price: allMin?.pricePerUnit || 0, world: allMin?.worldName || '-' },
  };

  return {
    world: worldEntries,
    dc: dcEntries,
    all: allEntries,
    worldUnits: worldEntries.reduce((s, l) => s + l.quantity, 0),
    dcUnits: dcEntries.reduce((s, l) => s + l.quantity, 0),
    allUnits: resAll?.unitsForSale ?? allEntries.reduce((s, l) => s + l.quantity, 0),
    worldError,
    dcError,
    allError,
    summary,
  };
}
