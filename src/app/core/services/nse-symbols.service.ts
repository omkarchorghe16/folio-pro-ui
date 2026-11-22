import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type NseSymbolType = 'EQUITY' | 'ETF';

/** One NSE-listed security from news-scheduler-svc (NSE's official equity and ETF lists). */
export interface NseSymbol {
  /** NSE trading symbol, e.g. RELIANCE or NIFTYBEES. */
  symbol: string;
  name: string | null;
  type: NseSymbolType;
  /** NSE series such as EQ or BE; null for ETFs. */
  series: string | null;
  isin: string | null;
}

/**
 * Type-ahead search over NSE tickers and names (news-scheduler-svc on port 8082, reached through the dev
 * proxy at /api/india). Best matches come first. The service answers 503 until the lists are downloaded.
 */
@Injectable({ providedIn: 'root' })
export class NseSymbolsService {
  private readonly symbolsUrl = '/api/india/nse/symbols';

  constructor(private readonly http: HttpClient) {}

  /** Every NSE-listed ETF (a few hundred symbols); used to mark ETF rows on the India watchlist. */
  listEtfs(): Observable<NseSymbol[]> {
    return this.http.get<NseSymbol[]>(this.symbolsUrl, { params: new HttpParams().set('type', 'ETF') });
  }

  search(query: string, limit = 20): Observable<NseSymbol[]> {
    const params = new HttpParams().set('query', query.trim()).set('limit', limit);
    return this.http.get<NseSymbol[]>(this.symbolsUrl, { params });
  }
}
