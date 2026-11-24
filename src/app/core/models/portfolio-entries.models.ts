import { WatchlistMarket } from './wealth.models';

export type Currency = 'USD' | 'INR';

/** assetType is a fixed code (a default such as STOCKS, or CUSTOM_...); the name can be changed by the user.
 *  Hidden types are not suggested for new months but keep the amounts of past months. */
export interface PortfolioAssetType {
  assetType: string;
  name: string;
  hidden: boolean;
}

/** One of the many sub asset types of an asset type; subAssetType is a fixed code. */
export interface PortfolioSubAssetType {
  subAssetType: string;
  assetType: string;
  name: string;
  hidden: boolean;
}

/**
 * Amounts of one asset type, or of one of its sub asset types, in one month. An asset type has either its own entry
 * or entries of its sub asset types. investedAmount is the total cost still held, not the amount added that month.
 */
export interface PortfolioEntry {
  assetType: string;
  subAssetType?: string | null;
  investedAmount: number;
  currentValue: number;
}

/** assetTypes and subAssetTypes list only new and changed ones; they apply to every month. */
export interface PortfolioMonthRequest {
  entries: PortfolioEntry[];
  assetTypes: PortfolioAssetType[];
  subAssetTypes: PortfolioSubAssetType[];
}

/** Months are yyyy-MM. When saved is false, entries are a suggestion copied from sourceMonth (if there is one). */
export interface PortfolioMonth {
  userId: number;
  country: WatchlistMarket;
  currency: Currency;
  month: string;
  saved: boolean;
  sourceMonth?: string | null;
  entries: PortfolioEntry[];
  /** Every type of this user and country, in display order. */
  assetTypes: PortfolioAssetType[];
  subAssetTypes: PortfolioSubAssetType[];
}

export interface PortfolioTotals {
  investedAmount: number;
  currentValue: number;
  profit: number;
  profitPercent?: number | null;
  monthlyReturnPercent?: number | null;
}

export interface PortfolioSubAssetSummary {
  subAssetType: string;
  name: string;
  investedAmount: number;
  currentValue: number;
  profit: number;
  profitPercent?: number | null;
}

/** Amounts are the sum of subAssets, or the asset type's own amounts when subAssets is empty. */
export interface PortfolioAssetSummary {
  assetType: string;
  subAssets: PortfolioSubAssetSummary[];
  investedAmount: number;
  currentValue: number;
  name: string;
  profit: number;
  profitPercent?: number | null;
  allocationPercent?: number | null;
}

export interface PortfolioHistoryPoint {
  month: string;
  investedAmount: number;
  currentValue: number;
  profit: number;
}

/** The backend leaves out latestMonth and totals when nothing is recorded. history is oldest first. */
export interface PortfolioEntriesSummary {
  userId: number;
  country: WatchlistMarket;
  currency: Currency;
  latestMonth?: string | null;
  totals?: PortfolioTotals | null;
  assets: PortfolioAssetSummary[];
  history: PortfolioHistoryPoint[];
}

export function currencyOf(market: WatchlistMarket): Currency {
  return market === 'India' ? 'INR' : 'USD';
}
