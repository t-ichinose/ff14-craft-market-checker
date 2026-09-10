export interface ScopeOptions {
  all_dc: string[];
  dcs: string[];
  dc_worlds: Record<string, string[]>;
  all_worlds: string[];
}

export interface MaterialItem {
  item_id: number;
  name_ja: string;
  category: string;
  icon_url: string;
  level_item: number;
  price_mid: number;
  hq: boolean;
  median_price: number;
  lowest_median_world: string;
  lowest_median_price: number;
  weekly_volume: number;
  weekly_turnover: number;
  daily_turnover: number;
  daily_velocity: number;
  last_sale_time: number;
}

export interface RecipeIngredientDetail {
  item_id: number;
  name_ja: string;
  icon_url?: string;
  category?: string;
  amount: number;
  unit_cost: number;
  total_cost: number;
  market_price?: number | null;
  shop_price?: number;
  method: 'buy_market' | 'buy_npc' | 'craft' | 'unknown';
  world: string;
  is_craftable?: boolean;
  sub_ingredients: RecipeIngredientDetail[];
}

export interface CraftAnalyticsItem {
  item_id: number;
  name_ja: string;
  category: string;
  icon_url: string;
  level_item: number;
  price_mid: number;
  hq: boolean;
  job_name?: string;
  recipe_level?: number;
  sell_price: number;
  craft_cost: number;
  profit: number;
  profit_rate: number;
  daily_profit: number;
  daily_sales_qty: number;
  daily_turnover: number;
  sourcing_method: string;
  recipe_breakdown: RecipeIngredientDetail[];
}

export interface MaterialListResponse {
  items: MaterialItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  scope_type: string;
  scope_name: string;
  quality: string;
  min_velocity: number;
}

export interface CraftAnalyticsResponse {
  items: CraftAnalyticsItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  sales_scope_type: string;
  sales_scope_name: string;
  sourcing_scope: string;
  quality: string;
  min_velocity: number;
}
