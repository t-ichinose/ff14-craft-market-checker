import { gunzip, strFromU8 } from 'fflate';

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

let inMemoryDataset: MarketDataset | null = null;
let loadPromise: Promise<MarketDataset> | null = null;

// Non-blocking async decompression helper
function decompressAsync(u8: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    gunzip(u8, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export async function fetchAndPrepareMarketData(): Promise<MarketDataset> {
  // Return cached in-memory dataset if ready
  if (inMemoryDataset) return inMemoryDataset;

  // Check global window cache
  if (typeof window !== 'undefined' && (window as any).__FF14_MARKET_DATA__ && (window as any).__FF14_ITEMS_CATALOG__) {
    const wData = (window as any).__FF14_MARKET_DATA__;
    const wItems = (window as any).__FF14_ITEMS_CATALOG__;
    inMemoryDataset = {
      data: wData,
      items: wItems
    };
    return inMemoryDataset;
  }

  // Prevent multiple concurrent fetch requests
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const dataUrl = `${import.meta.env.BASE_URL}data.json.gz`;
      console.log(`[marketDataService] Fetching ${dataUrl} ...`);
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} when fetching ${dataUrl}`);

      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);

      let dataJson: any = null;

      // Smart Gzip Detection: Check gzip magic bytes (0x1F, 0x8B = 31, 139)
      if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
        console.log('[marketDataService] Gzip detected. Decompressing asynchronously...');
        // Non-blocking decompression
        const decompressed = await decompressAsync(u8);
        const jsonStr = strFromU8(decompressed);
        dataJson = JSON.parse(jsonStr);
      } else {
        console.log('[marketDataService] Auto-decompressed by browser. Parsing directly...');
        const jsonStr = strFromU8(u8);
        dataJson = JSON.parse(jsonStr);
      }

      const allData: Record<string, MarketItem[]> = dataJson.data || dataJson.worlds || {};
      const itemsMap: Record<string, MasterCatalogItem> = dataJson.items || {};

      // Merge items metadata (name, icon, category) into each world's items
      for (const w in allData) {
        const list = allData[w];
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
        dc_worlds: dataJson.dc_worlds
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
      loadPromise = null;
    }
  })();

  return loadPromise;
}
