import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { WatchlistMarket } from '../models/wealth.models';
import { environment } from '../../../environments/environment';

export interface ApiWatchlistItem {
  id: number;
  symbol: string;
  name: string;
  isFavorite: boolean;
}

export interface ApiWatchlist {
  id: number;
  name: string;
  market: WatchlistMarket;
  currency: 'USD' | 'INR';
  userId: number;
  isFavorite: boolean;
  items: ApiWatchlistItem[];
}

export interface NewWatchlistItem {
  symbol: string;
  name: string;
}

export interface WatchlistPageResponse {
  content: ApiWatchlist[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class WatchlistsService {
  private readonly watchlistsUrl = `${environment.apiBaseUrl}/api/v1/watchlists`;

  constructor(private readonly http: HttpClient) {}

  getWatchlists(page: number, size: number, market: WatchlistMarket): Observable<WatchlistPageResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size)
      .set('market', market);
    return this.http.get<WatchlistPageResponse>(this.watchlistsUrl, { params });
  }

  /**
   * Saves stocks into an India watchlist (watchlist_items_india) owned by the user. All or none: the backend
   * answers 400 if a symbol is already in the list, 404 if the list is not an India list of this user.
   */
  addIndiaItems(watchlistId: string | number, items: NewWatchlistItem[], userId: number): Observable<ApiWatchlistItem[]> {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<ApiWatchlistItem[]>(`${this.watchlistsUrl}/india/${watchlistId}/items`, { items }, { params });
  }

  /** Stars or un-stars a USA or India watchlist for the given user. */
  setFavorite(watchlistId: string | number, isFavorite: boolean, userId: number): Observable<ApiWatchlist> {
    const params = new HttpParams().set('userId', userId);
    return this.http.patch<ApiWatchlist>(`${this.watchlistsUrl}/${watchlistId}/favorite`, { isFavorite }, { params });
  }
}
