import { gunzip, strFromU8 } from 'fflate';

export interface RecipeDef {
  id: number;
  job: string;
  lvl: number;
  amt: number;
  is_company?: boolean;
  ings: [number, number][];
}

export type RecipesMap = Record<string, RecipeDef>;

let cachedRecipesMap: RecipesMap | null = null;
let loadPromise: Promise<RecipesMap> | null = null;

async function fetchFromGz(): Promise<RecipesMap> {
  const gzUrl = `${import.meta.env.BASE_URL}recipes.json.gz?t=${Date.now()}`;
  const res = await fetch(gzUrl);
  if (!res.ok) throw new Error(`HTTP error fetching recipes.json.gz: ${res.status}`);
  const buf = await res.arrayBuffer();
  const u8 = new Uint8Array(buf);
  const decompressedStr = await new Promise<string>((resolve, reject) => {
    gunzip(u8, (err, data) => {
      if (err) reject(err);
      else resolve(strFromU8(data));
    });
  });
  return JSON.parse(decompressedStr) as RecipesMap;
}

/**
 * Fetch and cache recipes.json in memory.
 * If already fetching or cached, returns the shared promise / data immediately.
 * Falls back to recipes.json.gz if recipes.json fails or returns 404.
 */
export function fetchRecipes(): Promise<RecipesMap> {
  if (cachedRecipesMap) {
    return Promise.resolve(cachedRecipesMap);
  }

  if (loadPromise) {
    return loadPromise;
  }

  const recipesUrl = `${import.meta.env.BASE_URL}recipes.json?t=${Date.now()}`;
  loadPromise = (async () => {
    let data: RecipesMap;
    try {
      const res = await fetch(recipesUrl);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      data = await res.json();
    } catch (err) {
      console.warn('recipes.json load failed, attempting recipes.json.gz fallback...', err);
      data = await fetchFromGz();
    }

    // 魔導機械修理材(10373)など全職クラフト可能品目の補正（古いキャッシュ対策）
    if (data && data['10373'] && data['10373'].job !== '全職') {
      data['10373'].job = '全職';
    }
    cachedRecipesMap = data;
    loadPromise = null;
    return data;
  })().catch((err) => {
    loadPromise = null;
    console.error('Failed to load recipes (both .json and .json.gz):', err);
    throw err;
  });

  return loadPromise;
}

/**
 * Get synchronously cached recipes if already loaded.
 */
export function getCachedRecipes(): RecipesMap | null {
  return cachedRecipesMap;
}

/**
 * Prefetch recipes in the background early during app boot.
 */
export function prefetchRecipes(): void {
  if (!cachedRecipesMap && !loadPromise) {
    fetchRecipes().catch(() => {});
  }
}
