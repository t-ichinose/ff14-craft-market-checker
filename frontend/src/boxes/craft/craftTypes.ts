import type { ScopeOptions } from '../../types';

export type SourcingScope = 'all_dc' | 'dc' | 'world';

export interface RecipeTreeItem {
  id: number;
  name: string;
  icon: string;
  cost: number;
  marketPrice: number;
  craftCost?: number;     // この素材自作時の1個あたり原価 (中間素材の場合)
  method: 'buy_npc' | 'craft' | 'buy_market' | 'self_sufficient';
  world: string;
  amount: number;
  isActive: boolean;
  savings?: number;
  yieldAmt?: number;      // この素材自体を自作した時の完成個数 (例: 発酵バター 3個)
  batchCost?: number;     // この素材自作1回分の総素材費 (例: 1,496G)
  parentYield?: number;   // 親素材の完成個数 (例: 3個)
  effectiveCost?: number; // 親1個あたりの実質負担額 (例: 1,195G / 3 = 398G)
  quality?: 'nq' | 'hq';  // 素材の指定品質 (デフォルト: 'nq')
  hasHqOption?: boolean;  // HQが存在するかどうか
  isSelfSufficient?: boolean; // 自給自足 (コスト0G) フラグ
  subs?: RecipeTreeItem[];
}

export interface ResolveTreeOptions {
  isParentActive?: boolean;
  depth?: number;
  parentYield?: number;
  materialHqPriceMap?: Map<number, { price: number; world: string }>;
  qualityMap?: Record<number, 'nq' | 'hq'>;
  selfSufficientMap?: Record<number, boolean>;
}

export interface HistoryRecord {
  price?: number;
  quantity?: number;
  timestamp?: number;
  buyer_name?: string;
  hq?: boolean;
  world_name?: string;
}

export interface MarketItemPayload {
  item_id: number;
  item_name: string;
  category_name: string;
  icon_url: string;
  shop_price: number;
  level_item: number;
  hq: boolean;
  min_price: number;
  avg_price: number;
  max_price: number;
  region_median_price?: number;
  sale_velocity: number;
  sale_trades: number;
  daily_revenue: number;
  daily_trend?: { date: string; weighted_avg: number; volume: number }[];
  trend_pct?: number;
  history?: HistoryRecord[];
}

export interface MarketDataPayload {
  last_updated: string;
  items: Record<string, { name: string; category: string; icon: string; price_mid?: number; shop_price?: number; ilvl?: number }>;
  data: Record<string, MarketItemPayload[]>;
}

export interface CraftCardItem {
  item_id: number;
  name: string;
  cat: string;
  icon: string;
  ilvl: number;
  job: string;
  lvl: number;
  is_company?: boolean;
  is_hq?: boolean;
  amt: number;
  batch_cost: number;
  sell_price: number;
  max_buy_price?: number;
  craft_cost: number;
  profit: number;
  profit_rate: number;
  daily_sales_qty: number;
  daily_profit: number;
  daily_trend?: { date: string; weighted_avg: number; volume: number }[];
  trend_pct?: number;
}

export interface SelectedCraftTarget {
  cardKey: string;
  item: CraftCardItem;
  craftCount: number;
  tree?: RecipeTreeItem[];
}

export interface CraftPlannerViewProps {
  scopes: ScopeOptions | null;
  categories?: string[];
  initialSalesWorld?: string;
  initialSourcingScope?: SourcingScope;
  onSelectItemForModal?: (itemId: number, worldName?: string, isHq?: boolean) => void;
}

export interface CanvasNode {
  id: string;
  type: 'root' | 'material';
  x: number;
  y: number;
  width: number;
  height: number;
  data: CraftCardItem | RecipeTreeItem;
  multiplier?: number;
  isActive?: boolean;
}

export interface CanvasEdge {
  id: string;
  fromId: string;
  toId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isCrafted: boolean;
  isActive: boolean;
}

export interface ProcurementItem {
  id: number;
  name: string;
  icon: string;
  unitPrice: number;
  method: 'buy_npc' | 'buy_market' | 'self_sufficient';
  world: string;
  amount: number;
  category: 'market' | 'npc' | 'crystal';
  quality?: 'nq' | 'hq';
  hasHqOption?: boolean;
  isSelfSufficient?: boolean;
}
