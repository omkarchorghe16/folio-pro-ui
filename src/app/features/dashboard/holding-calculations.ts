import { HoldingPrice, StockHolding } from '../../core/models/stock-holdings.models';

/** A holding joined with its price. Values that need a price or quantity are null while there is none. */
export interface HoldingRow {
  holding: StockHolding;
  invested: number | null;
  price: number | null;
  dayChangePercent: number | null;
  currentValue: number | null;
  profit: number | null;
  profitPercent: number | null;
  asOf: string | null;
}

/** Totals over the holdings with a price and a quantity only, so that value, invested and profit describe the same shares. */
export interface HoldingTotals {
  invested: number;
  currentValue: number;
  profit: number;
  profitPercent: number | null;
  valuedCount: number;
  count: number;
}

export function toHoldingRow(holding: StockHolding, price: HoldingPrice | undefined): HoldingRow {
  const quantity = holding.quantity ?? null;
  const currentPrice = price?.price ?? null;
  const invested = quantity === null ? null : quantity * holding.averageCost;
  const currentValue = quantity === null || currentPrice === null ? null : quantity * currentPrice;
  const profit = currentValue === null || invested === null ? null : currentValue - invested;
  return {
    holding,
    invested,
    price: currentPrice,
    dayChangePercent: price?.dayChangePercent ?? null,
    currentValue,
    profit,
    // The same for any quantity, so it is shown without one too.
    profitPercent: currentPrice === null ? null : percentOf(currentPrice - holding.averageCost, holding.averageCost),
    asOf: price?.asOf ?? null,
  };
}

/** Null when no holding has both a price and a quantity. */
export function totalHoldings(rows: readonly HoldingRow[]): HoldingTotals | null {
  const valued = rows.filter((row) => row.currentValue !== null);
  if (!valued.length) {
    return null;
  }
  const invested = valued.reduce((sum, row) => sum + (row.invested ?? 0), 0);
  const currentValue = valued.reduce((sum, row) => sum + (row.currentValue ?? 0), 0);
  const profit = currentValue - invested;
  return {
    invested, currentValue, profit, profitPercent: percentOf(profit, invested),
    valuedCount: valued.length, count: rows.length,
  };
}

function percentOf(part: number, whole: number): number | null {
  return whole === 0 ? null : (part / whole) * 100;
}
