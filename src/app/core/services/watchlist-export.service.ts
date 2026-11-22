import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { WatchlistMarket } from '../models/wealth.models';
import { environment } from '../../../environments/environment';

export interface WatchlistCsvFile {
  blob: Blob;
  /** From the server's Content-Disposition header, e.g. "india-watchlists.csv". */
  fileName: string | null;
}

/**
 * Downloads watchlists as CSV from invesment-management-svc, in the same column-oriented format the import
 * reads: watchlist names in the first row, each one's ticker symbols in the column below.
 */
@Injectable({ providedIn: 'root' })
export class WatchlistExportService {
  private readonly exportUrl = `${environment.apiBaseUrl}/api/v1/watchlists/export`;

  constructor(private readonly http: HttpClient) {}

  /** One watchlist when watchlistId is given, otherwise every watchlist the user has in the market. */
  exportWatchlists(market: WatchlistMarket, userId: number, watchlistId?: string | number): Observable<WatchlistCsvFile> {
    let params = new HttpParams().set('market', market).set('userId', userId);
    if (watchlistId !== undefined) {
      params = params.set('watchlistId', watchlistId);
    }
    return this.http.get(this.exportUrl, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((response: HttpResponse<Blob>) => ({
        blob: response.body ?? new Blob([], { type: 'text/csv' }),
        fileName: fileNameFrom(response.headers.get('Content-Disposition')),
      })),
    );
  }
}

/** Reads filename*=UTF-8''… (preferred) or filename="…" from a Content-Disposition header. */
function fileNameFrom(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Fall through to the plain form.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}
