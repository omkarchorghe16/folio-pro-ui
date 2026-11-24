import { Currency } from './portfolio-entries.models';
import { WatchlistMarket } from './wealth.models';

export type StockHoldingAssetType = 'STOCK' | 'ETF';

/** What the user owns; averageCost is per share. Prices come from HoldingPricesService. */
export interface StockHolding {
  id: number;
  userId: number;
  country: WatchlistMarket;
  currency: Currency;
  symbol: string;
  /** India only. */
  exchange?: string | null;
  name: string;
  assetType: StockHoldingAssetType;
  quantity: number;
  averageCost: number;
}

export interface StockHoldingPositionRequest {
  quantity: number;
  averageCost: number;
}

export interface StockHoldingRequest extends StockHoldingPositionRequest {
  symbol: string;
  name: string;
  assetType: StockHoldingAssetType;
}

/** Latest known price of one holding; missing values are null. */
export interface HoldingPrice {
  symbol: string;
  price: number | null;
  dayChangePercent: number | null;
  /** Display text such as "23 Nov 2026, 10:11 IST". */
  asOf: string | null;
}
