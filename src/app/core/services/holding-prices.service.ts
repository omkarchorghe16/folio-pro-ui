import { Injectable } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { HoldingPrice } from '../models/stock-holdings.models';
import { WatchlistMarket } from '../models/wealth.models';
import { FmpProfilesService } from './fmp-profiles.service';
import { UpstoxQuote, UpstoxQuotesService } from './upstox-quotes.service';

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
};
const NSE_OPEN_MINUTE = 9 * 60 + 15;
const NSE_CLOSE_MINUTE = 15 * 60 + 30;

/**
 * Prices of held stocks from folio-market-feed-svc, using the same endpoints as the watchlist pages:
 * US from FMP (fmp_stock_profiles, refreshed at most once a day), India from Upstox (upstox_stock_quotes, live).
 */
@Injectable({ providedIn: 'root' })
export class HoldingPricesService {
  constructor(
    private readonly fmpProfilesService: FmpProfilesService,
    private readonly upstoxQuotesService: UpstoxQuotesService,
  ) {}

  /** May emit several times (India arrives in batches). Symbols without a price are left out. */
  getPrices(market: WatchlistMarket, symbols: readonly string[]): Observable<HoldingPrice[]> {
    if (!symbols.length) {
      return of([]);
    }
    return market === 'India'
      ? this.upstoxQuotesService.getQuotes(symbols).pipe(map((quotes) => quotes.map(toIndiaPrice)))
      : this.fmpProfilesService.getProfiles([...symbols]).pipe(map(toUsPrices));
  }

  /** Normal NSE hours, Monday to Friday 9:15–15:30 IST; exchange holidays are not known here. */
  isNseOpen(now = new Date()): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((entry) => entry.type === type)?.value ?? '';
    const minute = Number(part('hour')) * 60 + Number(part('minute'));
    return !['Sat', 'Sun'].includes(part('weekday')) && minute >= NSE_OPEN_MINUTE && minute <= NSE_CLOSE_MINUTE;
  }
}

function toIndiaPrice(quote: UpstoxQuote): HoldingPrice {
  const price = toNumber(quote.lastPrice);
  const netChange = toNumber(quote.netChange);
  const previousClose = price === null || netChange === null ? null : price - netChange;
  return {
    symbol: quote.symbol.trim().toUpperCase(),
    price,
    dayChangePercent: netChange !== null && previousClose ? (netChange / previousClose) * 100 : null,
    asOf: formatZoned(quote.quoteTimestamp) ?? formatServerLocal(quote.updatedDate),
  };
}

/** The FMP endpoint is typed as unknown, so each field is checked here. */
function toUsPrices(response: unknown): HoldingPrice[] {
  if (!Array.isArray(response)) {
    return [];
  }
  return response.filter(isRecord).filter((profile) => typeof profile['symbol'] === 'string').map((profile) => ({
    symbol: String(profile['symbol']).trim().toUpperCase(),
    price: toNumber(profile['price']),
    dayChangePercent: toNumber(profile['changePercentage']),
    asOf: formatServerLocal(profile['updatedDate']),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A timestamp with an offset, shown in India time. */
function formatZoned(value: unknown): string | null {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time)
    ? `${new Intl.DateTimeFormat('en-GB', { ...DATE_TIME_FORMAT, timeZone: 'Asia/Kolkata' }).format(time)} IST`
    : null;
}

/** A server timestamp without a zone: shown as sent, not shifted to the browser's zone. */
function formatServerLocal(value: unknown): string | null {
  const time = typeof value === 'string' ? Date.parse(`${value}Z`) : Number.NaN;
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat('en-GB', { ...DATE_TIME_FORMAT, timeZone: 'UTC' }).format(time)
    : null;
}
