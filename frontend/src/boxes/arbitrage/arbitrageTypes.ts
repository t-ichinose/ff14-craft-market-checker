export interface ArbitrageOpportunity {
  itemId: number;
  itemName: string;
  itemIcon: string;
  categoryName: string;
  isHq: boolean;
  sourceWorld: string;
  sourceDc: string;
  homeWorld: string;
  homeDc: string;
  buyPrice: number;
  sellPrice: number;
  unitProfit: number;
  dailyProfit: number;
  roiPercent: number;
  velocity: number;
  trades: number;
  sourceTrend?: { date: string; weighted_avg: number; volume: number }[];
  sourceTrendPct?: number;
  homeTrend?: { date: string; weighted_avg: number; volume: number }[];
  homeTrendPct?: number;
}

export interface ListingEntry {
  pricePerUnit: number;
  quantity: number;
  total: number;
  worldName: string;
  retainerName: string;
  hq: boolean;
}

export type ArbitrageSortMode = 'unitProfit' | 'dailyProfit';

export type ArbitrageViewMode = 'history' | 'listings';

export interface ArbitrageFilterOptions {
  homeWorld: string;
  sortMode: ArbitrageSortMode;
  minVelocity: number;
  excludeCrystals: boolean;
  searchQuery: string;
  availableCategories: string[];
  selectedCategories: string[];
}
