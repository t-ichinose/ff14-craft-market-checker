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
  maxBuyPrice?: number;
  sellPrice: number;
  unitProfit: number;
  dailyProfit: number;
  stockQuantity: number;
  totalProfit: number;
  roiPercent: number;
  velocity: number;
  trades: number;
  availableWorldsCount?: number;
  sourceTrend?: { date: string; weighted_avg: number; volume: number }[];
  sourceTrendPct?: number;
  homeTrend?: { date: string; weighted_avg: number; volume: number }[];
  homeTrendPct?: number;
}

import type { UniversalisListingItem, ListingEntry } from '../../services/universalisClient';

export type { UniversalisListingItem, ListingEntry };

export type ArbitrageSortMode = 'dailyProfit' | 'unitProfit' | 'roiPercent' | 'velocity' | 'totalProfit';

export type ArbitrageViewMode = 'history' | 'listings';

export interface ArbitrageFilterOptions {
  homeWorld: string;
  sortMode: ArbitrageSortMode;
  minVelocity: number;
  excludeCrystals: boolean;
  searchQuery: string;
  availableCategories: string[];
  selectedCategories: string[];
  sourcingScope?: 'all_dc' | 'dc';
}
