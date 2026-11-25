export interface MetricCardModel {
  title: string;
  value: string;
  change: string;
  tone: 'up' | 'down' | 'neutral';
  valueTone: 'up' | 'down' | 'neutral';
  detail: string;
}

export interface StockAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  sector: string;
  score: number;
  volume: string;
}

export interface CryptoAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  marketCap: string;
  volume: string;
}

export interface Holding {
  symbol: string;
  company: string;
  quantity: number;
  avgCost: number;
  marketValue: number;
  change: number;
  allocation: number;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  trend?: 'Bullish' | 'Neutral' | 'Bearish';
  assetType?: string;
  sector?: string;
  score?: number;
  volume?: string;
  metrics?: Partial<Record<WatchlistMetricKey, string | number>>;
  profileData?: Record<string, string | number>;
}

export type WatchlistMetricKey =
  | 'open'
  | 'previousClose'
  | 'dayHigh'
  | 'dayLow'
  | 'marketCap'
  | 'averageVolume'
  | 'relativeVolume'
  | 'peRatio'
  | 'forwardPE'
  | 'eps'
  | 'pegRatio'
  | 'priceToBook'
  | 'priceToSales'
  | 'dividendYield'
  | 'roe'
  | 'roa'
  | 'grossMargin'
  | 'operatingMargin'
  | 'profitMargin'
  | 'debtToEquity'
  | 'revenueGrowth'
  | 'earningsGrowth'
  | 'freeCashFlow'
  | 'analystTarget'
  | 'week52High'
  | 'week52Low'
  | 'movingAverage50'
  | 'movingAverage200'
  | 'rsi14'
  | 'macd'
  | 'macdSignal'
  | 'beta'
  | 'shortFloat'
  | 'nextEarnings'
  | 'changeAmount'
  | 'currency'
  | 'exchange'
  | 'exchangeShortName'
  | 'exchangeFullName'
  | 'country'
  | 'industry'
  | 'description'
  | 'updatedAt'
  | 'profileId'
  | 'cik'
  | 'isin'
  | 'cusip'
  | 'website'
  | 'lastDividend'
  | 'priceRange'
  | 'range'
  | 'image'
  | 'ceo'
  | 'fullTimeEmployees'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'ipoDate'
  | 'activelyTrading'
  | 'etf'
  | 'fund'
  | 'adr'
  | 'delisted'
  // India (Tapetide) columns
  | 'nseSymbol'
  | 'bseCode'
  | 'basicIndustry'
  | 'macroSector'
  | 'marketCapCategory'
  | 'fnoListed'
  | 'faceValue'
  | 'bookValue'
  | 'roce'
  | 'promoterHolding'
  | 'salesTtm'
  | 'netProfitTtm'
  | 'sharesOutstanding'
  | 'latestQuarter'
  | 'salesGrowthQoQ'
  | 'salesGrowthYoY'
  | 'profitGrowthQoQ'
  | 'profitGrowthYoY'
  | 'salesCagr3y'
  | 'salesCagr5y'
  | 'profitCagr3y'
  | 'profitCagr5y'
  | 'roe3y'
  | 'priceCagr1y'
  | 'priceCagr3y'
  | 'priceCagr5y'
  | 'analystBuyPercent'
  | 'analystRatings'
  | 'analystCount'
  | 'peerMedianPE'
  // India price source (Tapetide or Upstox, whichever is newer) and age of the Tapetide fundamentals
  | 'priceSource'
  | 'priceAsOf'
  | 'fundamentalsAsOf'
  | 'pros'
  | 'cons';

export interface PortfolioSummary {
  totalValue: number;
  dayChange: number;
  monthlyReturn: number;
  riskScore: number;
}

export interface WatchlistGroup {
  id: string;
  name: string;
  market: WatchlistMarket;
  currency: 'USD' | 'INR';
  /** Starred in the dropdown; stored in watchlists_usa / watchlists_india.is_favorite. */
  isFavorite?: boolean;
  items: WatchlistItem[];
}

export type WatchlistMarket = 'US' | 'India';
