import { HoldingRow } from './holding-calculations';

/** What one country's stocks & ETFs table shows; the sector allocation uses the same rows. */
export interface HoldingsState {
  rows: readonly HoldingRow[];
  loading: boolean;
  failed: boolean;
}

/** Money that was put in, or what it is worth now. */
export type AllocationBasis = 'invested' | 'currentValue';

export interface SectorHolding {
  symbol: string;
  name: string;
  amount: number;
  share: number;
}

export interface SectorSlice {
  name: string;
  amount: number;
  /** Percent of the country's total. */
  share: number;
  /** Largest first. */
  holdings: SectorHolding[];
}

export interface SectorAllocation {
  total: number;
  holdingCount: number;
  /** Largest first. */
  slices: SectorSlice[];
  /** Symbols without an amount, because the quantity (or the price, for the current value) is missing. */
  leftOut: string[];
}

const NO_SECTOR = 'No sector';

export function allocateBySector(rows: readonly HoldingRow[], basis: AllocationBasis): SectorAllocation {
  const counted = rows.filter((row) => row[basis] !== null);
  const total = counted.reduce((sum, row) => sum + (row[basis] ?? 0), 0);
  const shareOf = (amount: number): number => total === 0 ? 0 : (amount / total) * 100;
  const rowsBySector = new Map<string, HoldingRow[]>();
  for (const row of counted) {
    const sector = row.holding.sector?.trim() || NO_SECTOR;
    rowsBySector.set(sector, [...rowsBySector.get(sector) ?? [], row]);
  }
  const slices = [...rowsBySector].map(([name, sectorRows]) => {
    const holdings = sectorRows.map((row) => {
      const amount = row[basis] ?? 0;
      return { symbol: row.holding.symbol, name: row.holding.name, amount, share: shareOf(amount) };
    }).sort(byAmount);
    const amount = holdings.reduce((sum, holding) => sum + holding.amount, 0);
    return { name, amount, share: shareOf(amount), holdings };
  }).sort(byAmount);
  return {
    total,
    holdingCount: counted.length,
    slices,
    leftOut: rows.filter((row) => row[basis] === null).map((row) => row.holding.symbol),
  };
}

function byAmount(first: { amount: number }, second: { amount: number }): number {
  return second.amount - first.amount;
}
