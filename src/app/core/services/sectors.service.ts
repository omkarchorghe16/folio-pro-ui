import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, switchMap, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StockHoldingAssetType } from '../models/stock-holdings.models';
import { WatchlistMarket } from '../models/wealth.models';
import { FmpProfilesService } from './fmp-profiles.service';
import { TapetideProfileService } from './tapetide-profile.service';
import { ApiWatchlist, WatchlistsService } from './watchlists.service';

/** A list of favourites among the US sectors; not the sector of a stock. */
const TOP_LIST = 'TOP';
const GENERAL_ETF_SECTOR = 'ETF';
const PROFILE_TIMEOUT_MS = 6000;

export interface StockSectors {
  /** The default first; empty when nothing is known. */
  names: string[];
  /** The default should come from a provider profile, but it has no value. */
  profileMissing: boolean;
}

interface StockProfile {
  sector: string | null;
  industry: string | null;
}

interface SectorResponse {
  id: number;
  sectorName: string;
}

interface SectorStockResponse {
  id: number;
  ticker: string;
  sectorName: string;
}

/**
 * Sectors and the stocks in them. Each market has its own sector list in table sectors of folio-market-feed-svc, which is
 * called directly (CORS) and not through the dev proxy. The sectors a stock is in come from table stocks for the US and
 * from the user's India watchlists in folio-portfolio-api, which are organized by sector, for India.
 */
@Injectable({ providedIn: 'root' })
export class SectorsService {
  private readonly sectorsUrl = `${environment.marketFeedBaseUrl}/api/sectors`;
  private readonly stocksUrl = `${environment.marketFeedBaseUrl}/api/stocks`;

  constructor(
    private readonly http: HttpClient,
    private readonly watchlistsService: WatchlistsService,
    private readonly fmpProfilesService: FmpProfilesService,
    private readonly tapetideProfileService: TapetideProfileService,
  ) {}

  /** Every sector name of the market, A to Z. */
  listSectorNames(market: WatchlistMarket): Observable<string[]> {
    const params = new HttpParams().set('market', market === 'India' ? 'INDIA' : 'US');
    return this.http.get<SectorResponse[]>(this.sectorsUrl, { params })
      .pipe(map((sectors) => toSortedNames(sectors.map((sector) => sector.sectorName))));
  }

  /**
   * The stock's default sector, then the sectors it is listed under in our own tables. The default is:
   * - ETF: the sector it is listed under first, or the general US sector ETF when it is in none. Provider profiles are
   *   not used, since they describe the fund company and not what the ETF holds;
   * - stock listed under several sectors: its industry (FMP for the US, Tapetide for India);
   * - other US stock: the sector of its FMP profile;
   * - other India stock: the sector it is listed under.
   * A stock without a provider profile has the sector it was listed under first. Like a price, an FMP profile can use one
   * FMP request a day.
   */
  findSectorsOfStock(market: WatchlistMarket, symbol: string, assetType: StockHoldingAssetType): Observable<StockSectors> {
    return this.listListedSectors(market, symbol).pipe(switchMap((listed) => {
      const usesIndustry = listed.length > 1;
      if (assetType === 'ETF') {
        return (listed.length || market === 'India' ? of(listed) : this.listGeneralEtfSector())
          .pipe(map((names) => ({ names, profileMissing: false })));
      }
      if (market === 'India' && !usesIndustry) {
        return of({ names: listed, profileMissing: false });
      }
      const profile$ = market === 'India' ? this.getTapetideProfile(symbol) : this.getFmpProfile(symbol);
      return profile$.pipe(
        timeout(PROFILE_TIMEOUT_MS),
        // Without a profile our own sectors still give a default; with neither, the failure reaches the user.
        catchError((error: unknown) => listed.length || isWithoutProfile(error) ? of(null) : throwError(() => error)),
        map((profile) => {
          const name = (usesIndustry ? profile?.industry : profile?.sector)?.trim();
          return { names: [...new Set(name ? [name, ...listed] : listed)], profileMissing: !name };
        }),
      );
    }));
  }

  /** In our own tables, the sector the stock was listed under first leading. */
  private listListedSectors(market: WatchlistMarket, symbol: string): Observable<string[]> {
    if (market === 'India') {
      return this.listIndiaWatchlists().pipe(map((watchlists) => watchlists
        .filter((watchlist) => watchlist.items.some((item) => toNseSymbol(item.symbol) === symbol))
        .sort((first, second) => first.id - second.id)
        .map((watchlist) => watchlist.name)));
    }
    return this.http.get<SectorStockResponse[]>(this.stocksUrl, { params: new HttpParams().set('ticker', symbol) }).pipe(
      map((stocks) => [...stocks].sort((first, second) => first.id - second.id)
        .map((stock) => stock.sectorName).filter((name) => name !== TOP_LIST)),
    );
  }

  /** Empty when the US list has no such sector. */
  private listGeneralEtfSector(): Observable<string[]> {
    return this.listSectorNames('US').pipe(map((names) => names.filter((name) => name === GENERAL_ETF_SECTOR)));
  }

  private getFmpProfile(symbol: string): Observable<StockProfile | null> {
    return this.fmpProfilesService.getProfiles([symbol]).pipe(
      map((response) => Array.isArray(response) ? toStockProfile(response[0]) : null),
    );
  }

  /** Answers with the saved profile while Tapetide is paused; null when none is saved. */
  private getTapetideProfile(symbol: string): Observable<StockProfile | null> {
    return this.tapetideProfileService.getProfile(symbol).pipe(
      map((response) => toStockProfile(response?.payload?.data?.company)),
    );
  }

  private listIndiaWatchlists(): Observable<ApiWatchlist[]> {
    return this.watchlistsService.getWatchlists('India').pipe(
      map((watchlists) => watchlists.filter((watchlist) => watchlist.userId === environment.currentUserId)),
    );
  }
}

/** The providers' fields are not guaranteed, so each is checked here. */
function toStockProfile(value: unknown): StockProfile | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { sector, industry } = value as { sector?: unknown; industry?: unknown };
  return {
    sector: typeof sector === 'string' ? sector : null,
    industry: typeof industry === 'string' ? industry : null,
  };
}

/** The provider does not cover the symbol, or its daily quota is used up. */
function isWithoutProfile(error: unknown): boolean {
  return error instanceof HttpErrorResponse && [400, 404, 429].includes(error.status);
}

/** Without duplicates. */
function toSortedNames(names: readonly string[]): string[] {
  return [...new Set(names)].sort((first, second) => first.localeCompare(second));
}

/** Watchlist symbols may carry an exchange suffix, e.g. RELIANCE.NS. */
function toNseSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
}
