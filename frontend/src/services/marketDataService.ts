import { gunzip, strFromU8 } from 'fflate';
import { JAPAN_DCS, ALL_JAPAN_WORLDS } from '../shared/marketConstants';

export interface MarketItem {
  item_id: number;
  item_name?: string;
  category_name?: string;
  icon_url?: string;
  hq: boolean;
  min_price: number;
  avg_price: number;
  max_price: number;
  units_for_sale?: number;
  sale_velocity: number;
  sale_trades: number;
  daily_revenue?: number;
  daily_trend?: { date: string; weighted_avg: number; volume: number }[];
  trend_pct?: number;
  history?: { price: number; qty: number; ts: number; buyer?: string; hq: boolean }[];
  region_median_price?: number;
  shop_price?: number;
}

export interface MasterCatalogItem {
  id: number;
  name: string;
  category: string;
  icon?: string;
  hq?: boolean;
  shop_price?: number;
  price_mid?: number;
}

export interface MarketDataset {
  last_updated?: string;
  data: Record<string, MarketItem[]>;
  items: Record<string, MasterCatalogItem>;
  dc_worlds?: Record<string, string[]>;
}

export type RawListingTuple = [
  number, // price
  number, // qty
  number, // hq (1 or 0)
  string, // retainer
  number  // ts
];

export interface ListingsDataset {
  last_updated?: string;
  listings: Record<string, Record<string, RawListingTuple[]>>;
}

let inMemoryDataset: MarketDataset | null = null;
let loadPromise: Promise<MarketDataset> | null = null;

let inMemoryListingsDataset: ListingsDataset | null = null;
let loadListingsPromise: Promise<ListingsDataset | null> | null = null;

const DEFAULT_FETCH_TIMEOUT_MS = 15000;

// タイムアウト制御用シグナル生成
function createFetchSignal(timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Fetch timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

// Non-blocking async decompression helper
function decompressAsync(u8: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    gunzip(u8, (err, data) => {
      if (err) {
        reject(new Error(`Gzip decompression failed: ${err.message || String(err)}`));
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * 2つの日付文字列（ISOフォーマット等）を比較し、より新しい方を返却
 */
export function getLatestTimestamp(ts1?: string | null, ts2?: string | null): string | null {
  if (!ts1 && !ts2) return null;
  if (!ts1) return ts2 || null;
  if (!ts2) return ts1 || null;
  const d1 = new Date(ts1).getTime();
  const d2 = new Date(ts2).getTime();
  if (isNaN(d1)) return ts2;
  if (isNaN(d2)) return ts1;
  return d1 >= d2 ? ts1 : ts2;
}

/**
 * マーケットデータのメモリキャッシュを無効化（リフレッシュ用）
 */
export function invalidateMarketDataCache(): void {
  inMemoryDataset = null;
  loadPromise = null;
  inMemoryListingsDataset = null;
  loadListingsPromise = null;
  if (typeof window !== 'undefined') {
    delete (window as any).__FF14_MARKET_DATA__;
    delete (window as any).__FF14_ITEMS_CATALOG__;
  }
}

export async function fetchAndPrepareMarketData(options: { forceRefresh?: boolean; timeoutMs?: number } = {}): Promise<MarketDataset> {
  const { forceRefresh = false, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  if (forceRefresh) {
    invalidateMarketDataCache();
  }

  // Return cached in-memory dataset if ready
  if (inMemoryDataset) return inMemoryDataset;

  // Check global window cache
  if (!forceRefresh && typeof window !== 'undefined' && (window as any).__FF14_MARKET_DATA__ && (window as any).__FF14_ITEMS_CATALOG__) {
    const wData = (window as any).__FF14_MARKET_DATA__;
    const wItems = (window as any).__FF14_ITEMS_CATALOG__;
    inMemoryDataset = {
      data: wData,
      items: wItems,
    };
    return inMemoryDataset;
  }

  // Prevent multiple concurrent fetch requests
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { signal, cleanup } = createFetchSignal(timeoutMs);
    try {
      const dataUrl = `${import.meta.env.BASE_URL}data.json.gz?_t=${Date.now()}`;
      console.log(`[marketDataService] Fetching ${dataUrl} ...`);
      const res = await fetch(dataUrl, { cache: 'no-cache', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} when fetching ${dataUrl}`);

      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);

      let dataJson: any = null;

      // Smart Gzip Detection: Check gzip magic bytes (0x1F, 0x8B = 31, 139)
      if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
        console.log('[marketDataService] Gzip detected. Decompressing asynchronously...');
        const decompressed = await decompressAsync(u8);
        const jsonStr = strFromU8(decompressed);
        try {
          dataJson = JSON.parse(jsonStr);
        } catch (parseErr: any) {
          throw new Error(`Failed to parse decompressed JSON: ${parseErr.message}`);
        }
      } else {
        console.log('[marketDataService] Auto-decompressed by browser. Parsing directly...');
        const jsonStr = strFromU8(u8);
        try {
          dataJson = JSON.parse(jsonStr);
        } catch (parseErr: any) {
          throw new Error(`Failed to parse raw JSON: ${parseErr.message}`);
        }
      }

      if (!dataJson || typeof dataJson !== 'object') {
        throw new Error('Invalid market dataset payload: root is not an object');
      }

      const allData: Record<string, MarketItem[]> = dataJson.data || dataJson.worlds || {};
      const itemsMap: Record<string, MasterCatalogItem> = dataJson.items || {};

      // Merge items metadata (name, icon, category) into each world's items
      for (const w in allData) {
        const list = allData[w];
        if (!Array.isArray(list)) continue;
        for (let i = 0; i < list.length; i++) {
          const itm = list[i];
          const meta = itemsMap[String(itm.item_id)] || itemsMap[itm.item_id as any];
          if (meta) {
            itm.item_name = meta.name || itm.item_name;
            itm.icon_url = meta.icon || itm.icon_url;
            itm.category_name = meta.category || itm.category_name;
            itm.shop_price = meta.shop_price || (meta as any).price_mid || itm.shop_price;
          }
        }
      }

      inMemoryDataset = {
        last_updated: dataJson.last_updated,
        data: allData,
        items: itemsMap,
        dc_worlds: dataJson.dc_worlds,
      };

      if (typeof window !== 'undefined') {
        (window as any).__FF14_MARKET_DATA__ = allData;
        (window as any).__FF14_ITEMS_CATALOG__ = itemsMap;
      }

      console.log('[marketDataService] Successfully prepared market dataset asynchronously!');
      return inMemoryDataset;
    } catch (err) {
      console.error('[marketDataService] Failed to load market data:', err);
      throw err;
    } finally {
      cleanup();
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function getCachedMarketDataset(): MarketDataset | null {
  return inMemoryDataset;
}

export function getCachedListingsDataset(): ListingsDataset | null {
  return inMemoryListingsDataset;
}

export async function fetchAndPrepareListingsData(options: { forceRefresh?: boolean; timeoutMs?: number } = {}): Promise<ListingsDataset | null> {
  const { forceRefresh = false, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  if (forceRefresh) {
    inMemoryListingsDataset = null;
    loadListingsPromise = null;
  }

  if (inMemoryListingsDataset) return inMemoryListingsDataset;
  if (loadListingsPromise) return loadListingsPromise;

  loadListingsPromise = (async () => {
    const { signal, cleanup } = createFetchSignal(timeoutMs);
    try {
      const dataUrl = `${import.meta.env.BASE_URL}listings.json.gz?_t=${Date.now()}`;
      console.log(`[marketDataService] Fetching listings from ${dataUrl} ...`);
      const res = await fetch(dataUrl, { cache: 'no-cache', signal });
      if (!res.ok) {
        console.warn(`[marketDataService] listings.json.gz returned HTTP ${res.status}. Preloaded listings unavailable.`);
        return null;
      }

      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);
      let parsed: any = null;

      if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
        const decompressed = await decompressAsync(u8);
        parsed = JSON.parse(strFromU8(decompressed));
      } else {
        parsed = JSON.parse(strFromU8(u8));
      }

      inMemoryListingsDataset = {
        last_updated: parsed?.last_updated,
        listings: parsed?.listings || {},
      };

      console.log(`[marketDataService] Successfully preloaded listings for ${Object.keys(inMemoryListingsDataset.listings).length} items!`);
      return inMemoryListingsDataset;
    } catch (err) {
      console.warn('[marketDataService] Failed to load listings.json.gz:', err);
      return null;
    } finally {
      cleanup();
      loadListingsPromise = null;
    }
  })();

  return loadListingsPromise;
}

export interface PreloadedListingItem {
  pricePerUnit: number;
  quantity: number;
  total: number;
  worldName: string;
  retainerName: string;
  hq: boolean;
}

/**
 * 事前取得された出品データから、指定アイテム・スコープ（ワールド/DC/全DC）の出品リストを取得
 */
export function getPreloadedListings(
  scope: string,
  itemId: number,
  isHq?: boolean
): { listings: PreloadedListingItem[]; unitsForSale: number } | null {
  if (!inMemoryListingsDataset || !inMemoryListingsDataset.listings) {
    return null;
  }

  const itemMap = inMemoryListingsDataset.listings[String(itemId)];
  if (!itemMap) {
    return null;
  }

  // スコープの判定
  let targetWorlds: string[] = [];
  if (scope === 'Japan' || scope.toLowerCase() === 'all') {
    targetWorlds = ALL_JAPAN_WORLDS;
  } else if (JAPAN_DCS[scope]) {
    targetWorlds = JAPAN_DCS[scope];
  } else {
    targetWorlds = [scope];
  }

  const allListings: PreloadedListingItem[] = [];
  for (const worldName of targetWorlds) {
    const rawList = itemMap[worldName];
    if (!rawList) continue;

    for (let i = 0; i < rawList.length; i++) {
      const [price, qty, hq, retainer] = rawList[i];
      const isItemHq = Boolean(hq);
      if (isHq !== undefined && isItemHq !== isHq) {
        continue;
      }
      allListings.push({
        pricePerUnit: price,
        quantity: qty,
        total: price * qty,
        worldName: worldName,
        retainerName: retainer || '-',
        hq: isItemHq,
      });
    }
  }

  // 価格昇順ソート
  allListings.sort((a, b) => a.pricePerUnit - b.pricePerUnit);

  const unitsForSale = allListings.reduce((sum, l) => sum + l.quantity, 0);
  return { listings: allListings, unitsForSale };
}

/**
 * マーケットデータセットから利用可能な全カテゴリ名一覧を抽出・ソートして取得
 */
export function extractAvailableCategories(dataset: {
  items?: Record<string, any>;
  data?: Record<string, MarketItem[]>;
}): string[] {
  const catSet = new Set<string>();
  if (dataset.items) {
    Object.values(dataset.items).forEach((item) => {
      if (item.category) catSet.add(item.category);
    });
  }
  if (catSet.size === 0 && dataset.data) {
    Object.values(dataset.data).forEach((worldItems) => {
      worldItems.forEach((it) => {
        if (it.category_name) catSet.add(it.category_name);
      });
    });
  }
  return Array.from(catSet).sort();
}
