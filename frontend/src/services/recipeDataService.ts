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

/**
 * Fetch and cache recipes.json in memory.
 * If already fetching or cached, returns the shared promise / data immediately.
 */
export function fetchRecipes(): Promise<RecipesMap> {
  if (cachedRecipesMap) {
    return Promise.resolve(cachedRecipesMap);
  }

  if (loadPromise) {
    return loadPromise;
  }

  const recipesUrl = `${import.meta.env.BASE_URL}recipes.json?t=${Date.now()}`;
  loadPromise = fetch(recipesUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then((data: RecipesMap) => {
      // 魔導機械修理材(10373)など全職クラフト可能品目の補正（古いキャッシュ対策）
      if (data && data['10373'] && data['10373'].job !== '全職') {
        data['10373'].job = '全職';
      }
      cachedRecipesMap = data;
      loadPromise = null;
      return data;
    })
    .catch((err) => {
      loadPromise = null;
      console.error('Failed to load recipes.json:', err);
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
