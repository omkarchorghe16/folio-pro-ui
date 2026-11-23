import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, from, mergeMap } from 'rxjs';

/** Row returned by folio-market-feed-svc (upstox_stock_quotes). Upstox has no fundamentals, only market data. */
export interface UpstoxQuote {
  symbol: string;
  exchange?: string | null;
  name?: string | null;
  isin?: string | null;
  lastPrice?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  /** Upstox's ohlc.close; not the previous close (that is lastPrice - netChange). */
  close?: number | null;
  /** Last price minus the previous close. */
  netChange?: number | null;
  volume?: number | null;
  averagePrice?: number | null;
  /** Exchange time of the quote, e.g. 2026-11-20T15:59:41.061+05:30. */
  quoteTimestamp?: string | null;
  /** When folio-market-feed-svc saved it (server local time, no zone). */
  updatedDate?: string | null;
}

/** Symbols per request, to keep the query string short; the service batches up to 500 per Upstox call. */
const SYMBOLS_PER_REQUEST = 100;
const PARALLEL_REQUESTS = 2;

/**
 * Live NSE quotes from Upstox through folio-market-feed-svc (port 8082, dev proxy at /api/india). Used on the India
 * page as the price source next to Tapetide. The service returns saved rows when Upstox fails and leaves out symbols
 * it cannot quote, so a batch never errors for one bad symbol.
 */
@Injectable({ providedIn: 'root' })
export class UpstoxQuotesService {
  private readonly quotesUrl = '/api/india/upstox/quotes';

  constructor(private readonly http: HttpClient) {}

  /** Emits one array per batch of symbols as each batch arrives. */
  getQuotes(symbols: readonly string[]): Observable<UpstoxQuote[]> {
    const batches: string[][] = [];
    for (let index = 0; index < symbols.length; index += SYMBOLS_PER_REQUEST) {
      batches.push(symbols.slice(index, index + SYMBOLS_PER_REQUEST));
    }
    return from(batches).pipe(
      mergeMap((batch) => this.http.get<UpstoxQuote[]>(this.quotesUrl, {
        params: new HttpParams().set('symbols', batch.join(',')).set('exchange', 'NSE'),
      }), PARALLEL_REQUESTS),
    );
  }
}
