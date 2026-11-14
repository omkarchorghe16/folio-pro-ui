import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** One selected column and its position in the watchlist table (1 = leftmost). */
export interface WatchlistColumnPreference {
  columnKey: string;
  displayOrder: number;
}

export interface WatchlistColumnPreferencesRequest {
  columns: WatchlistColumnPreference[];
}

export interface WatchlistColumnPreferencesResponse {
  userId: number;
  columns: WatchlistColumnPreference[];
  updatedAt?: string | null;
}

/**
 * Reads and saves each user's watchlist column selection and order.
 *
 * GET returns 404 when the user has never saved columns; callers then fall back to the defaults.
 * PUT replaces the user's whole selection with the given list.
 */
@Injectable({ providedIn: 'root' })
export class WatchlistColumnPreferencesService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/users`;

  constructor(private readonly http: HttpClient) {}

  getPreferences(userId: number): Observable<WatchlistColumnPreferencesResponse> {
    return this.http.get<WatchlistColumnPreferencesResponse>(this.url(userId));
  }

  savePreferences(userId: number, columnKeys: readonly string[]): Observable<WatchlistColumnPreferencesResponse> {
    const body: WatchlistColumnPreferencesRequest = {
      columns: columnKeys.map((columnKey, index) => ({ columnKey, displayOrder: index + 1 })),
    };
    return this.http.put<WatchlistColumnPreferencesResponse>(this.url(userId), body);
  }

  private url(userId: number): string {
    return `${this.baseUrl}/${userId}/watchlist-column-preferences`;
  }
}
