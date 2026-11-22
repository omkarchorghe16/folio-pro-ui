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

@Injectable({ providedIn: 'root' })
export class WatchlistsService {
  private readonly watchlistsUrl = `${environment.apiBaseUrl}/api/v1/watchlists`;

  constructor(private readonly http: HttpClient) {}

  /** Every watchlist of the market with all of its items (the backend does not paginate). */
  getWatchlists(market: WatchlistMarket): Observable<ApiWatchlist[]> {
    const params = new HttpParams().set('market', market);
    return this.http.get<ApiWatchlist[]>(this.watchlistsUrl, { params });
  }

  /**
   * Saves stocks into a watchlist owned by the user (watchlist_items_usa or watchlist_items_india). All or none:
   * the backend answers 400 if a symbol is already in the list, 404 if the list is not this market's or user's.
   */
  addItems(market: WatchlistMarket, watchlistId: string | number, items: NewWatchlistItem[],
           userId: number): Observable<ApiWatchlistItem[]> {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<ApiWatchlistItem[]>(`${this.itemsUrl(market, watchlistId)}`, { items }, { params });
  }

  /** Deletes one stock from a watchlist of this market owned by the user. 404 if it is not there. */
  removeItem(market: WatchlistMarket, watchlistId: string | number, symbol: string, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);
    return this.http.delete<void>(`${this.itemsUrl(market, watchlistId)}/${encodeURIComponent(symbol)}`, { params });
  }

  private itemsUrl(market: WatchlistMarket, watchlistId: string | number): string {
    return `${this.watchlistsUrl}/${market === 'US' ? 'us' : 'india'}/${watchlistId}/items`;
  }

  /** Stars or un-stars a USA or India watchlist for the given user. */
  setFavorite(watchlistId: string | number, isFavorite: boolean, userId: number): Observable<ApiWatchlist> {
    const params = new HttpParams().set('userId', userId);
    return this.http.patch<ApiWatchlist>(`${this.watchlistsUrl}/${watchlistId}/favorite`, { isFavorite }, { params });
  }
}
