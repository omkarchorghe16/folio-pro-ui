import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type UsSymbolType = 'EQUITY' | 'ETF';

/** One US-listed security from news-scheduler-svc (Nasdaq Trader's symbol directory). */
export interface UsSymbol {
  /** Trading symbol as Nasdaq Trader publishes it, e.g. AAPL, BRK.B, or ABR$D for a preferred share. */
  symbol: string;
  name: string | null;
  type: UsSymbolType;
  /** NASDAQ, NYSE, NYSE American, NYSE Arca, Cboe BZX, IEX, or a one-letter code. */
  exchange: string | null;
}

/**
 * Type-ahead search over US tickers and names (news-scheduler-svc on port 8082, reached through the dev
 * proxy at /api/us). Best matches come first. The service answers 503 until the lists are downloaded.
 */
@Injectable({ providedIn: 'root' })
export class UsSymbolsService {
  private readonly symbolsUrl = '/api/us/nasdaq/symbols';

  constructor(private readonly http: HttpClient) {}

  /** Every US-listed ETF (several thousand symbols); used to mark ETF rows on the US watchlist. */
  listEtfs(): Observable<UsSymbol[]> {
    return this.http.get<UsSymbol[]>(this.symbolsUrl, { params: new HttpParams().set('type', 'ETF') });
  }

  search(query: string, limit = 20): Observable<UsSymbol[]> {
    const params = new HttpParams().set('query', query.trim()).set('limit', limit);
    return this.http.get<UsSymbol[]>(this.symbolsUrl, { params });
  }
}
