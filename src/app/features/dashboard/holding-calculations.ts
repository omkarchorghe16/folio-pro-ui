import { HoldingPrice, StockHolding } from '../../core/models/stock-holdings.models';

/** A holding joined with its price. Values that need a price are null while there is none. */
export interface HoldingRow {
  holding: StockHolding;
  invested: number;
  price: number | null;
  dayChangePercent: number | null;
  currentValue: number | null;
  profit: number | null;
  profitPercent: number | null;
  asOf: string | null;
}

/** Totals over the priced holdings only, so that value, invested and profit describe the same shares. */
export interface HoldingTotals {
  invested: number;
  currentValue: number;
  profit: number;
  profitPercent: number | null;
  pricedCount: number;
  count: number;
}

export function toHoldingRow(holding: StockHolding, price: HoldingPrice | undefined): HoldingRow {
  const invested = holding.quantity * holding.averageCost;
  const currentValue = price?.price === null || price?.price === undefined ? null : holding.quantity * price.price;
  const profit = currentValue === null ? null : currentValue - invested;
  return {
    holding,
    invested,
    price: price?.price ?? null,
    dayChangePercent: price?.dayChangePercent ?? null,
    currentValue,
    profit,
    profitPercent: profit === null ? null : percentOf(profit, invested),
    asOf: price?.asOf ?? null,
  };
}

/** Null when no holding has a price. */
export function totalHoldings(rows: readonly HoldingRow[]): HoldingTotals | null {
  const priced = rows.filter((row) => row.currentValue !== null);
  if (!priced.length) {
    return null;
  }
  const invested = priced.reduce((sum, row) => sum + row.invested, 0);
  const currentValue = priced.reduce((sum, row) => sum + (row.currentValue ?? 0), 0);
  const profit = currentValue - invested;
  return {
    invested, currentValue, profit, profitPercent: percentOf(profit, invested),
    pricedCount: priced.length, count: rows.length,
  };
}

function percentOf(part: number, whole: number): number | null {
  return whole === 0 ? null : (part / whole) * 100;
}
