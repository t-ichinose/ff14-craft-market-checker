/**
 * Universalis API Client
 * Universalis v2 REST API への通信とレスポンス正規化を一元管理するモジュール
 */

import { apiHealthManager } from './apiHealthService';

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
  const { isHq, limit = 50, signal } = options;
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
  } = options;

  let worldError = false;
  let dcError = false;
  let allError = false;

  const [resWorld, resDc, resAll] = await Promise.all([
    fetchMarketListings(world, itemId, { isHq, limit: limitWorld, signal }).catch((err) => {
      if (err?.name !== 'AbortError') worldError = true;
      return null;
    }),
    fetchMarketListings(dc, itemId, { isHq, limit: limitDc, signal }).catch((err) => {
      if (err?.name !== 'AbortError') dcError = true;
      return null;
    }),
    fetchMarketListings('Japan', itemId, { isHq, limit: limitAll, signal }).catch((err) => {
      if (err?.name !== 'AbortError') allError = true;
      return null;
    }),
  ]);

  const worldEntries = resWorld?.listings || [];
  const dcEntries = resDc?.listings || [];
  const allEntries = resAll?.listings || [];

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
    worldUnits: resWorld?.unitsForSale ?? worldEntries.reduce((s, l) => s + l.quantity, 0),
    dcUnits: resDc?.unitsForSale ?? dcEntries.reduce((s, l) => s + l.quantity, 0),
    allUnits: resAll?.unitsForSale ?? allEntries.reduce((s, l) => s + l.quantity, 0),
    worldError,
    dcError,
    allError,
    summary,
  };
}
