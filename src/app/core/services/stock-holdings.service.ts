import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StockHolding, StockHoldingPositionRequest, StockHoldingRequest } from '../models/stock-holdings.models';
import { WatchlistMarket } from '../models/wealth.models';

/** Stocks and ETFs the user holds, in folio-portfolio-api (stock_holdings_usa / stock_holdings_india). */
@Injectable({ providedIn: 'root' })
export class StockHoldingsService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/users`;

  constructor(private readonly http: HttpClient) {}

  listHoldings(userId: number, market: WatchlistMarket): Observable<StockHolding[]> {
    return this.http.get<StockHolding[]>(this.url(userId, market));
  }

  /** Answers 409 when the user already holds the symbol. */
  createHolding(userId: number, market: WatchlistMarket, request: StockHoldingRequest): Observable<StockHolding> {
    return this.http.post<StockHolding>(this.url(userId, market), request);
  }

  updateHoldingPosition(
    userId: number, market: WatchlistMarket, id: number, request: StockHoldingPositionRequest,
  ): Observable<StockHolding> {
    return this.http.put<StockHolding>(`${this.url(userId, market)}/${id}`, request);
  }

  deleteHolding(userId: number, market: WatchlistMarket, id: number): Observable<void> {
    return this.http.delete<void>(`${this.url(userId, market)}/${id}`);
  }

  private url(userId: number, market: WatchlistMarket): string {
    return `${this.baseUrl}/${userId}/stock-holdings/${market}`;
  }
}
