import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PortfolioEntriesSummary,
  PortfolioMonth,
  PortfolioMonthRequest,
} from '../models/portfolio-entries.models';
import { WatchlistMarket } from '../models/wealth.models';

/** Monthly portfolio entries in folio-portfolio-api (portfolio_entries_usa / portfolio_entries_india). */
@Injectable({ providedIn: 'root' })
export class PortfolioEntriesService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/users`;

  constructor(private readonly http: HttpClient) {}

  getSummary(userId: number, market: WatchlistMarket): Observable<PortfolioEntriesSummary> {
    return this.http.get<PortfolioEntriesSummary>(`${this.url(userId, market)}/summary`);
  }

  /** `month` is yyyy-MM. An unsaved month comes back with the latest earlier month's entries as a suggestion. */
  getMonth(userId: number, market: WatchlistMarket, month: string): Observable<PortfolioMonth> {
    return this.http.get<PortfolioMonth>(`${this.url(userId, market)}/months/${month}`);
  }

  /** Saves new and renamed asset types and replaces the month: types left out of `entries` lose their amounts. */
  saveMonth(
    userId: number, market: WatchlistMarket, month: string, request: PortfolioMonthRequest,
  ): Observable<PortfolioMonth> {
    return this.http.put<PortfolioMonth>(`${this.url(userId, market)}/months/${month}`, request);
  }

  private url(userId: number, market: WatchlistMarket): string {
    return `${this.baseUrl}/${userId}/portfolio-entries/${market}`;
  }
}
