/**
 * FF14 Craft & Market Checker - Shared Domain Types
 */

export interface ScopeOptions {
  all_dc: string[];
  dcs: string[];
  dc_worlds: Record<string, string[]>;
  all_worlds: string[];
}

// Re-export common market and listings types
export type {
  MarketItem,
  MasterCatalogItem,
  MarketDataset,
  ListingsDataset,
  RawListingTuple,
  PreloadedListingItem,
} from '../services/marketDataService';

// Re-export universalis client types
export type {
  UniversalisListingItem,
  ListingEntry,
  UniversalisHistoryItem,
  FetchListingsOptions,
  FetchListingsResult,
  FetchHistoryOptions,
  FetchHistoryResult,
  TriadSummary,
  TriadListingsResult,
  FetchTriadOptions,
} from '../services/universalisClient';

// Re-export craft tree types
export type {
  CraftCardItem,
  RecipeTreeItem,
  SelectedCraftTarget,
} from '../boxes/craft/craftTypes';

export type {
  PipelineItem,
} from '../boxes/craft/craftTreeUtils';
