import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
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

  /**
   * Removes an asset type (with its sub asset types) or a sub asset type from the month: its amounts are deleted and it
   * is hidden. The backend has no type delete, since earlier months refer to the types.
   */
  deleteType(userId: number, market: WatchlistMarket, month: string, code: string): Observable<PortfolioMonth> {
    return this.getMonth(userId, market, month).pipe(
      switchMap((current) => this.saveMonth(userId, market, month, {
        entries: current.entries.filter((entry) => entry.assetType !== code && entry.subAssetType !== code),
        assetTypes: current.assetTypes.filter((type) => type.assetType === code).map((type) => ({ ...type, hidden: true })),
        subAssetTypes: current.subAssetTypes.filter((type) => type.subAssetType === code)
          .map((type) => ({ ...type, hidden: true })),
      })),
    );
  }

  private url(userId: number, market: WatchlistMarket): string {
    return `${this.baseUrl}/${userId}/portfolio-entries/${market}`;
  }
}
