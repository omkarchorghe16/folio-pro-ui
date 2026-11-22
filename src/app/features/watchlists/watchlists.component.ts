import { CommonModule } from '@angular/common';
import { HttpErrorResponse, HttpEventType, HttpResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  Observable, Subject, Subscription, catchError, debounceTime, distinctUntilChanged, forkJoin, from, map, mergeMap, of, switchMap,
} from 'rxjs';
import { WatchlistGroup, WatchlistItem, WatchlistMarket, WatchlistMetricKey } from '../../core/models/wealth.models';
import { FmpProfile, FmpProfilesService } from '../../core/services/fmp-profiles.service';
import { NseSymbol, NseSymbolsService } from '../../core/services/nse-symbols.service';
import { UsSymbol, UsSymbolsService } from '../../core/services/us-symbols.service';
import { TapetideProfilePayload, TapetideProfileService } from '../../core/services/tapetide-profile.service';
import {
  WatchlistImportMarket,
  WatchlistImportResponse,
  WatchlistImportService,
} from '../../core/services/watchlist-import.service';
import { WatchlistExportService } from '../../core/services/watchlist-export.service';
import { WatchlistPageResponse, WatchlistsService } from '../../core/services/watchlists.service';
import {
  WatchlistColumnPreferencesResponse,
  WatchlistColumnPreferencesService,
} from '../../core/services/watchlist-column-preferences.service';
import { environment } from '../../../environments/environment';
import { ShellComponent } from '../../shared/components/shell/shell.component';

type WatchlistColumnKey = 'symbol' | 'name' | 'assetType' | 'price' | 'change' | 'trend' | 'sector' | 'score' | 'volume' | WatchlistMetricKey;

interface WatchlistColumn {
  key: WatchlistColumnKey;
  label: string;
  group: string;
}

const FAVORITE_SYMBOLS_STORAGE_KEY = 'folio-pro.favorite-symbols';
const DEFAULT_COLUMN_KEYS: WatchlistColumnKey[] = ['symbol', 'name', 'assetType', 'price', 'change', 'trend'];
const FAVORITES_LIST_ID = '__favorites__';
/** Default table order whenever a watchlist is opened: market capitalization, highest first. */
const DEFAULT_SORT_COLUMN: WatchlistColumnKey = 'marketCap';
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc';
/** Name of the USA watchlist shown first in the dropdown and preselected on load (matched case-insensitively). */
const DEFAULT_US_WATCHLIST_NAME = 'TOP';
const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
/** External research links shown next to "View" in the description column; {symbol} is the row's ticker. */
interface ResearchSite {
  label: string;
  name: string;
  urlTemplate: string;
  /** Button colour class (see .tone-* in styles.scss), loosely after each site's own colours. */
  tone: string;
}
const INDIA_RESEARCH_SITES: readonly ResearchSite[] = [
  { label: 'TV', name: 'TradingView', urlTemplate: 'https://in.tradingview.com/symbols/NSE-{symbol}/', tone: 'tone-teal' },
  { label: 'SC', name: 'Screener', urlTemplate: 'https://www.screener.in/company/{symbol}/consolidated/', tone: 'tone-indigo' },
  { label: 'FIN', name: 'Finology', urlTemplate: 'https://ticker.finology.in/company/{symbol}', tone: 'tone-amber' },
  { label: 'IMG', name: 'Google image search', urlTemplate: 'https://www.google.com/search?q={symbol}+business+products+services+images+photos', tone: 'tone-pink' },
];
const US_RESEARCH_SITES: readonly ResearchSite[] = [
  { label: 'Yahoo', name: 'Yahoo Finance', urlTemplate: 'https://finance.yahoo.com/quote/{symbol}/', tone: 'tone-purple' },
  { label: 'TV', name: 'TradingView', urlTemplate: 'https://www.tradingview.com/symbols/NASDAQ-{symbol}/', tone: 'tone-teal' },
  { label: 'Finviz', name: 'Finviz', urlTemplate: 'https://finviz.com/stock?t={symbol}&p=d', tone: 'tone-orange' },
  { label: 'GoogleFin', name: 'Google Finance', urlTemplate: 'https://www.google.com/finance/beta/quote/{symbol}:NASDAQ', tone: 'tone-green' },
  { label: 'IMG', name: 'Google image search', urlTemplate: 'https://www.google.com/search?q={symbol}+business+products+services+images+photos', tone: 'tone-pink' },
];
/** Parallel Tapetide profile requests for the India page. */
const INDIA_PROFILE_CONCURRENCY = 4;
/** "Add stocks" type-ahead (NSE on India, Nasdaq Trader on US): wait this long after the last keystroke, then ask for this many matches. */
const SYMBOL_SEARCH_DEBOUNCE_MS = 250;
const SYMBOL_SUGGESTION_LIMIT = 20;
/** Tapetide reports money in ₹ crore; 1 crore = 10,000,000 rupees. */
const RUPEES_PER_CRORE = 1e7;
/** Money columns stored in full currency units and shown as T / B / M (e.g. ₹12.40T). */
const AMOUNT_COLUMNS = new Set<string>(['marketCap', 'salesTtm', 'netProfitTtm']);
/** Columns holding a percentage number, shown with two decimals and a % sign. */
const PERCENT_COLUMNS = new Set<string>([
  'dividendYield', 'roe', 'roce', 'roa', 'promoterHolding', 'revenueGrowth', 'earningsGrowth',
  'salesGrowthQoQ', 'salesGrowthYoY', 'profitGrowthQoQ', 'profitGrowthYoY', 'salesCagr3y', 'salesCagr5y',
  'profitCagr3y', 'profitCagr5y', 'roe3y', 'priceCagr1y', 'priceCagr3y', 'priceCagr5y', 'analystBuyPercent',
]);

@Component({
  selector: 'app-watchlists',
  standalone: true,
  // Angular 22 defaults components to OnPush. This component updates plain fields from HTTP callbacks
  // (watchlists, selection, profile data), so it must be checked eagerly or the view only refreshes on a click.
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ShellComponent],
  template: `
    <app-shell>
      <div class="page-shell watchlists-page">
        <div class="page-header">
          <div>
            <h1>{{ selectedMarket === 'US' ? 'US Watchlist' : 'India Watchlist' }}</h1>
            <p>Monitor {{ selectedMarket === 'US' ? 'US' : 'India' }} assets in your watchlists.</p>
          </div>
          <span class="sample-note">{{ selectedMarket === 'US' ? 'Market data from FMP.' : 'Market data from Tapetide.' }} Informational only, not investment advice.</span>
        </div>

        <section class="card watchlist-panel">
          <div class="toolbar">
            <div class="actions">
              <input #fileInput class="file-input" type="file" accept=".csv,text/csv"
                aria-label="Choose watchlist CSV to import" [disabled]="isImporting" (change)="importCsv($event)">
              <button class="tool-button tone-teal" type="button" [disabled]="isImporting" (click)="fileInput.click()">
                {{ isImporting ? 'Importing…' : 'Import CSV' }}
              </button>
              <button class="tool-button tone-purple" type="button" [disabled]="isExporting" (click)="exportCsv()">
                {{ isExporting ? 'Exporting…' : 'Export CSV' }}
              </button>
              <button class="tool-button tone-amber" type="button" [attr.aria-expanded]="columnsEditorOpen"
                aria-controls="columns-editor" (click)="openColumnEditor()">Edit columns</button>
            </div>
          </div>

          <div class="favorite-strip" aria-label="Favorite watchlists">
            <span class="favorite-label">Favorites</span>
            <button type="button" class="favorite-chip" *ngFor="let watchlist of favoriteWatchlists"
              [class.selected]="selectedWatchlistId === watchlist.id" (click)="selectFavoriteWatchlist(watchlist.id)">
              <span aria-hidden="true">★</span> {{ watchlist.name }}
            </button>
            <span class="favorite-empty" *ngIf="favoriteWatchlists.length === 0">Favorite a watchlist from the dropdown to pin it here.</span>
          </div>

          <div class="modal-backdrop" *ngIf="columnsEditorOpen" (click)="cancelColumnEditor()">
            <section class="columns-modal" id="columns-editor" role="dialog" aria-modal="true"
              aria-labelledby="columns-title" (click)="$event.stopPropagation()" (keydown.escape)="cancelColumnEditor()">
              <header class="modal-header">
                <div>
                  <span class="eyebrow">Table preferences</span>
                  <h2 id="columns-title">Edit columns</h2>
                </div>
                <button type="button" class="modal-close" aria-label="Close column editor" (click)="cancelColumnEditor()">×</button>
              </header>
              <p class="modal-description">Select the columns to show in your watchlist. Changes are applied after saving.</p>
              <button type="button" class="tool-button" (click)="selectProfileColumns()">
                Select all profile fields
              </button>
              <div class="columns-editor">
                <ng-container *ngFor="let group of columnGroups">
                  <strong class="column-group-title">{{ group }}</strong>
                  <label class="column-option" *ngFor="let column of columnsForGroup(group)">
                    <input type="checkbox" [checked]="isDraftColumnVisible(column.key)"
                      (change)="toggleDraftColumn(column.key, $event)">
                    {{ column.label }}
                  </label>
                </ng-container>
              </div>
              <div class="column-order" *ngIf="draftColumnKeys.length">
                <strong class="column-group-title">Selected column order</strong>
                <div class="column-order-row" *ngFor="let key of draftColumnKeys; let index = index">
                  <span>{{ columnLabel(key) }}</span>
                  <div class="column-order-actions">
                    <button type="button" [disabled]="index === 0" (click)="moveDraftColumn(index, -1)"
                      [attr.aria-label]="'Move ' + columnLabel(key) + ' up'">↑</button>
                    <button type="button" [disabled]="index === draftColumnKeys.length - 1" (click)="moveDraftColumn(index, 1)"
                      [attr.aria-label]="'Move ' + columnLabel(key) + ' down'">↓</button>
                  </div>
                </div>
              </div>
              <p class="modal-error" *ngIf="columnEditorMessage" role="status">{{ columnEditorMessage }}</p>
              <footer class="modal-actions">
                <button type="button" class="tool-button" (click)="cancelColumnEditor()">Cancel</button>
                <button type="button" class="save-button" [disabled]="isSavingColumns" (click)="saveColumnPreferences()">
                  {{ isSavingColumns ? 'Saving…' : 'Save columns' }}
                </button>
              </footer>
            </section>
          </div>

          <div class="list-controls">
            <div class="list-select">
              <label id="watchlist-select-label">{{ selectedMarket }} watchlist</label>
              <div class="watchlist-dropdown" (click)="$event.stopPropagation()">
                <button id="watchlist-select" type="button" class="watchlist-select-button"
                  aria-labelledby="watchlist-select-label" [attr.aria-expanded]="watchlistDropdownOpen"
                  aria-haspopup="listbox" (click)="watchlistDropdownOpen = !watchlistDropdownOpen">
                <span>{{ selectedWatchlist.name }}</span><span class="dropdown-chevron" aria-hidden="true">⌄</span>
                </button>
                <div class="watchlist-menu" role="listbox" *ngIf="watchlistDropdownOpen">
                  <p class="watchlist-loading" *ngIf="isLoadingWatchlists" role="status">Loading watchlists…</p>
                  <button *ngIf="hasFavoriteSymbols" type="button" class="watchlist-option"
                    [class.active]="isFavoritesList" role="option" [attr.aria-selected]="isFavoritesList"
                    (click)="selectWatchlist(favoritesListId)">
                    <span class="option-name"><span class="favorite-star" aria-hidden="true">★</span> Favorites</span>
                  </button>
                  <div class="watchlist-option-row" *ngFor="let watchlist of watchlists">
                    <button type="button" class="watchlist-option" [class.active]="selectedWatchlistId === watchlist.id"
                      role="option" [attr.aria-selected]="selectedWatchlistId === watchlist.id"
                      (click)="selectWatchlist(watchlist.id)">
                      <span class="option-name">
                        <span class="favorite-star" *ngIf="isFavoriteWatchlist(watchlist)" aria-hidden="true">★</span>
                        {{ watchlist.name }}
                        <span class="default-badge" *ngIf="isDefaultWatchlist(watchlist)">Default</span>
                      </span>
                    </button>
                    <button type="button" class="dropdown-favorite-button"
                      [class.is-favorite]="isFavoriteWatchlist(watchlist)"
                      [attr.aria-pressed]="isFavoriteWatchlist(watchlist)"
                      [disabled]="isFavoriteUpdating(watchlist)"
                      [attr.aria-label]="isFavoriteWatchlist(watchlist) ? 'Remove ' + watchlist.name + ' from favorites' : 'Add ' + watchlist.name + ' to favorites'"
                       (click)="toggleFavoriteWatchlist(watchlist)">{{ isFavoriteWatchlist(watchlist) ? '★' : '☆' }}</button>
                  </div>
                  <button type="button" class="watchlist-option add-watchlist-option" role="option"
                    aria-selected="false" [disabled]="isLoadingWatchlists" (click)="openAddWatchlistDialog()">
                    <span class="option-name"><span aria-hidden="true">＋</span> Add watchlist</span>
                  </button>
                </div>
              </div>
            </div>
            <button type="button" class="add-stocks-button" [disabled]="isFavoritesList"
              (click)="openAddStocksDialog()" aria-haspopup="dialog">
              <span aria-hidden="true">＋</span> Add stocks
            </button>
            <div class="list-summary">
              <strong>{{ selectedWatchlist.items.length }}</strong>
              <span>assets · {{ selectedWatchlist.currency }}</span>
            </div>
          </div>

          <div class="modal-backdrop" *ngIf="addStocksDialogOpen" (click)="closeAddStocksDialog()">
            <section class="columns-modal add-stocks-modal" role="dialog" aria-modal="true"
              aria-labelledby="add-stocks-title" (click)="$event.stopPropagation()" (keydown.escape)="closeAddStocksDialog()">
              <header class="modal-header">
                <div>
                  <span class="eyebrow">{{ selectedWatchlist.name }}</span>
                  <h2 id="add-stocks-title">Add stocks</h2>
                </div>
                <button type="button" class="modal-close" aria-label="Close add stocks dialog" (click)="closeAddStocksDialog()">×</button>
              </header>
              <p class="modal-description">Search by company name or ticker, then add multiple stocks before saving.</p>
              <form class="stock-entry" (submit)="addStockFromInput($event)">
                <label for="stock-search">Stock name or ticker symbol</label>
                <div class="stock-entry-row">
                  <input id="stock-search" name="stockSearch" type="text" autocomplete="off"
                    [placeholder]="selectedMarket === 'India' ? 'e.g. Reliance or RELIANCE' : 'e.g. Apple or AAPL'"
                    [value]="stockSearchText"
                    (input)="updateStockSearch($event)">
                  <button type="submit" class="save-button" [disabled]="!stockSearchText.trim()">Add</button>
                </div>
              </form>
              <p class="suggestion-status" *ngIf="isSearchingSymbols" role="status">Searching {{ symbolListLabel }} symbols…</p>
              <p class="modal-error" *ngIf="symbolSearchMessage && !isSearchingSymbols" role="status">{{ symbolSearchMessage }}</p>
              <p class="suggestion-status" role="status"
                *ngIf="!isSearchingSymbols && !symbolSearchMessage && symbolSearchedQuery
                  && symbolSearchedQuery === stockSearchText.trim() && !stockSuggestions.length">
                No {{ symbolListLabel }} symbols match “{{ symbolSearchedQuery }}”.
              </p>
              <div class="stock-suggestions" *ngIf="stockSuggestions.length">
                <span class="suggestion-label">Matching {{ symbolListLabel }} symbols</span>
                <button type="button" class="suggestion-item" *ngFor="let suggestion of stockSuggestions"
                  (click)="stageStock(suggestion)">
                  <span>
                    <strong>{{ suggestion.symbol }}</strong>
                    <small>{{ suggestion.name }}<ng-container *ngIf="suggestion.assetType === 'ETF'"> · ETF</ng-container></small>
                  </span>
                  <span class="suggestion-add">＋ Add</span>
                </button>
              </div>
              <p class="sample-warning">
                Saved to <strong>{{ selectedWatchlist.name }}</strong> for user {{ currentUserId }}. Market data loads after saving.
              </p>
              <div class="staged-heading"><strong>Stocks to add</strong><span>{{ stagedStocks.length }} selected</span></div>
              <div class="staged-list" *ngIf="stagedStocks.length; else noStagedStocks">
                <div class="staged-row" *ngFor="let stock of stagedStocks; let index = index">
                  <span><strong>{{ stock.symbol }}</strong><small>{{ stock.name }}</small></span>
                  <button type="button" class="remove-staged" [attr.aria-label]="'Remove ' + stock.symbol"
                    (click)="removeStagedStock(index)">Remove</button>
                </div>
              </div>
              <ng-template #noStagedStocks><p class="empty-staged">No stocks added yet.</p></ng-template>
              <p class="modal-error" *ngIf="addStocksMessage" role="status">{{ addStocksMessage }}</p>
              <footer class="modal-actions">
                <button type="button" class="tool-button" (click)="closeAddStocksDialog()">Cancel</button>
                <button type="button" class="save-button" [disabled]="stagedStocks.length === 0 || isSavingStocks"
                  (click)="saveStagedStocks()">
                  {{ isSavingStocks ? 'Saving…' : 'Save ' + stagedStocks.length + ' ' + (stagedStocks.length === 1 ? 'stock' : 'stocks') }}
                </button>
              </footer>
            </section>
          </div>

          <div class="modal-backdrop" *ngIf="addWatchlistDialogOpen" (click)="closeAddWatchlistDialog()">
            <section class="columns-modal create-watchlist-modal" role="dialog" aria-modal="true"
              aria-labelledby="create-watchlist-title" (click)="$event.stopPropagation()" (keydown.escape)="closeAddWatchlistDialog()">
              <header class="modal-header">
                <div>
                  <span class="eyebrow">{{ selectedMarket }} watchlists</span>
                  <h2 id="create-watchlist-title">Create watchlist</h2>
                </div>
                <button type="button" class="modal-close" aria-label="Close create watchlist dialog" (click)="closeAddWatchlistDialog()">×</button>
              </header>
              <p class="modal-description">Create a named list for this market. You can add stocks after saving.</p>
              <form class="stock-entry" (submit)="saveNewWatchlist()">
                <label for="new-watchlist-name">Watchlist name</label>
                <input id="new-watchlist-name" name="watchlistName" type="text" maxlength="40"
                  placeholder="e.g. Long-term ideas" [value]="newWatchlistName"
                  (input)="updateWatchlistName($event)">
              </form>
              <p class="modal-error" *ngIf="newWatchlistMessage" role="status">{{ newWatchlistMessage }}</p>
              <footer class="modal-actions">
                <button type="button" class="tool-button" (click)="closeAddWatchlistDialog()">Cancel</button>
                <button type="button" class="save-button" [disabled]="!newWatchlistName.trim()"
                  (click)="saveNewWatchlist()">Save watchlist</button>
              </footer>
            </section>
          </div>

          <div class="modal-backdrop" *ngIf="descriptionDialogItem" (click)="closeDescriptionDialog()">
            <section class="columns-modal description-modal" role="dialog" aria-modal="true" tabindex="-1" autofocus
              aria-labelledby="company-description-title" (click)="$event.stopPropagation()" (keydown.escape)="closeDescriptionDialog()">
              <header class="modal-header">
                <div>
                  <span class="eyebrow">{{ descriptionDialogItem.symbol }}</span>
                  <h2 id="company-description-title">{{ descriptionDialogItem.name }}</h2>
                </div>
                <button type="button" class="modal-close" aria-label="Close company description"
                  (click)="closeDescriptionDialog()">×</button>
              </header>
              <p class="description-content">{{ descriptionDialogItem.profileData?.['description'] || 'No company description is available.' }}</p>
            </section>
          </div>

          <p class="status-message" role="status" aria-live="polite" *ngIf="statusMessage">{{ statusMessage }}</p>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th *ngFor="let column of visibleColumns" [attr.aria-sort]="ariaSort(column.key)">
                    <button type="button" class="sort-header-button" [class.is-sorted]="sortColumnKey === column.key"
                      [title]="'Sort by ' + column.label" (click)="toggleSort(column.key)">
                      {{ column.label }}
                      <span class="sort-indicator" aria-hidden="true">{{ sortIndicator(column.key) }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of paginatedItems">
                  <td *ngFor="let column of visibleColumns" [ngSwitch]="column.key">
                    <ng-container *ngSwitchCase="'name'">
                      <a *ngIf="companyWebsite(item) as website; else plainName" class="company-link" [href]="website"
                        target="_blank" rel="noopener noreferrer" [title]="website"
                        [attr.aria-label]="'Open the ' + item.name + ' website in a new tab'">{{ item.name }}</a>
                      <ng-template #plainName><span>{{ item.name }}</span></ng-template>
                    </ng-container>
                    <span *ngSwitchCase="'symbol'" class="symbol-cell">
                      <strong>{{ item.symbol }}</strong>
                      <button type="button" class="star-symbol-button"
                        [class.is-favorite]="isFavoriteSymbol(item)"
                        [attr.aria-pressed]="isFavoriteSymbol(item)"
                        [attr.aria-label]="isFavoriteSymbol(item) ? 'Remove ' + item.symbol + ' from favorites' : 'Add ' + item.symbol + ' to favorites'"
                        (click)="toggleFavoriteSymbol(item)">{{ isFavoriteSymbol(item) ? '★' : '☆' }}</button>
                      <button type="button" class="delete-symbol-button" *ngIf="canDeleteStocks"
                        [disabled]="deletingSymbols.has(item.symbol)"
                        [attr.aria-label]="'Remove ' + item.symbol + ' from ' + selectedWatchlist.name"
                        [title]="'Remove ' + item.symbol + ' from ' + selectedWatchlist.name"
                        (click)="removeStock(item)">
                        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor"
                          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </span>
                    <span *ngSwitchCase="'price'">{{ item.price === undefined ? '—' : (item.price | currency:selectedWatchlist.currency:'symbol':'1.2-2') }}</span>
                    <span *ngSwitchCase="'change'" [ngClass]="item.change === undefined ? '' : item.change >= 0 ? 'text-success' : 'text-danger'">
                      {{ item.change === undefined ? '—' : (item.change > 0 ? '+' : '') + (item.change | number:'1.2-2') + '%' }}
                    </span>
                    <span *ngSwitchCase="'marketCap'">{{ formatMarketCap(getColumnValue(item, column.key)) }}</span>
                    <span *ngSwitchCase="'trend'" class="badge"
                      [ngClass]="item.trend === 'Bullish' ? 'up' : item.trend === 'Bearish' ? 'down' : 'neutral'">{{ item.trend ?? '—' }}</span>
                    <span *ngSwitchCase="'description'" class="description-actions">
                      <button type="button" class="description-view-button tone-blue"
                        [disabled]="!item.profileData?.['description']"
                        [attr.aria-label]="'View description for ' + item.name"
                        (click)="openDescriptionDialog(item)">View</button>
                      <a *ngFor="let site of researchSites" class="description-view-button research-link" [ngClass]="site.tone"
                        [href]="researchUrl(site, item)" target="_blank" rel="noopener noreferrer"
                        [title]="'Open ' + item.symbol + ' on ' + site.name"
                        [attr.aria-label]="'Open ' + item.symbol + ' on ' + site.name + ' in a new tab'">{{ site.label }}</a>
                    </span>
                    <span *ngSwitchDefault>{{ formatCell(item, column.key) }}</span>
                  </td>
                </tr>
                <tr *ngIf="paginatedItems.length === 0">
                  <td [attr.colspan]="visibleColumns.length" class="empty-state">
                    {{ isLoadingWatchlists ? 'Loading watchlist items…' : 'No assets in this watchlist.' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pagination" aria-label="Watchlist pagination">
            <span aria-live="polite">Showing {{ startIndex + 1 }}–{{ endIndex }} of {{ selectedWatchlist.items.length }}</span>
            <div class="pagination-actions">
              <button type="button" (click)="previousPage()" [disabled]="currentPage === 1" aria-label="Previous page">Previous</button>
              <span>Page {{ currentPage }} of {{ totalPages }}</span>
              <button type="button" (click)="nextPage()" [disabled]="currentPage === totalPages" aria-label="Next page">Next</button>
            </div>
          </div>
        </section>
      </div>
    </app-shell>
  `,
})
export class WatchlistsComponent implements OnDestroy {
  readonly pageSize = 15;
  readonly availableColumns: WatchlistColumn[] = [
    { key: 'symbol', label: 'Symbol', group: 'Overview' },
    { key: 'name', label: 'Asset name', group: 'Overview' },
    { key: 'assetType', label: 'Asset type', group: 'Overview' },
    { key: 'price', label: 'Price', group: 'Market data' },
    { key: 'change', label: 'Change %', group: 'Market data' },
    { key: 'trend', label: 'Trend', group: 'Technical' },
    { key: 'sector', label: 'Sector / industry', group: 'Overview' },
    { key: 'score', label: 'Quality score', group: 'Overview' },
    { key: 'volume', label: 'Volume', group: 'Market data' },
    { key: 'open', label: 'Open', group: 'Market data' },
    { key: 'previousClose', label: 'Previous close', group: 'Market data' },
    { key: 'dayHigh', label: 'Day high', group: 'Market data' },
    { key: 'dayLow', label: 'Day low', group: 'Market data' },
    { key: 'marketCap', label: 'Market capitalization', group: 'Market data' },
    { key: 'changeAmount', label: 'Price change', group: 'Market data' },
    { key: 'averageVolume', label: 'Average volume', group: 'Market data' },
    { key: 'relativeVolume', label: 'Relative volume', group: 'Market data' },
    { key: 'peRatio', label: 'P/E ratio (TTM)', group: 'Fundamentals' },
    { key: 'forwardPE', label: 'Forward P/E', group: 'Fundamentals' },
    { key: 'eps', label: 'EPS (TTM)', group: 'Fundamentals' },
    { key: 'pegRatio', label: 'PEG ratio', group: 'Fundamentals' },
    { key: 'priceToBook', label: 'Price / book', group: 'Fundamentals' },
    { key: 'priceToSales', label: 'Price / sales', group: 'Fundamentals' },
    { key: 'dividendYield', label: 'Dividend yield', group: 'Fundamentals' },
    { key: 'roe', label: 'Return on equity', group: 'Fundamentals' },
    { key: 'roa', label: 'Return on assets', group: 'Fundamentals' },
    { key: 'grossMargin', label: 'Gross margin', group: 'Fundamentals' },
    { key: 'operatingMargin', label: 'Operating margin', group: 'Fundamentals' },
    { key: 'profitMargin', label: 'Profit margin', group: 'Fundamentals' },
    { key: 'debtToEquity', label: 'Debt / equity', group: 'Fundamentals' },
    { key: 'revenueGrowth', label: 'Revenue growth', group: 'Fundamentals' },
    { key: 'earningsGrowth', label: 'Earnings growth', group: 'Fundamentals' },
    { key: 'freeCashFlow', label: 'Free cash flow', group: 'Fundamentals' },
    { key: 'analystTarget', label: 'Analyst target', group: 'Fundamentals' },
    { key: 'week52High', label: '52-week high', group: 'Technical' },
    { key: 'week52Low', label: '52-week low', group: 'Technical' },
    { key: 'movingAverage50', label: '50-day moving average', group: 'Technical' },
    { key: 'movingAverage200', label: '200-day moving average', group: 'Technical' },
    { key: 'rsi14', label: 'RSI (14)', group: 'Technical' },
    { key: 'macd', label: 'MACD', group: 'Technical' },
    { key: 'macdSignal', label: 'MACD signal', group: 'Technical' },
    { key: 'beta', label: 'Beta (5Y monthly)', group: 'Risk' },
    { key: 'shortFloat', label: 'Short float', group: 'Risk' },
    { key: 'nextEarnings', label: 'Next earnings date', group: 'Events' },
    { key: 'currency', label: 'Currency', group: 'Profile' },
    { key: 'exchange', label: 'Exchange', group: 'Profile' },
    { key: 'exchangeFullName', label: 'Exchange full name', group: 'Profile' },
    { key: 'exchangeShortName', label: 'Exchange short name', group: 'Profile' },
    { key: 'country', label: 'Country', group: 'Profile' },
    { key: 'industry', label: 'Industry', group: 'Profile' },
    { key: 'description', label: 'Company description', group: 'Profile' },
    { key: 'updatedAt', label: 'Profile updated', group: 'Profile' },
    { key: 'profileId', label: 'Profile ID', group: 'Profile' },
    { key: 'cik', label: 'CIK', group: 'Profile' },
    { key: 'isin', label: 'ISIN', group: 'Profile' },
    { key: 'cusip', label: 'CUSIP', group: 'Profile' },
    { key: 'website', label: 'Website', group: 'Profile' },
    { key: 'lastDividend', label: 'Last dividend', group: 'Profile' },
    { key: 'priceRange', label: 'Price range', group: 'Profile' },
    { key: 'range', label: 'Provider price range', group: 'Profile' },
    { key: 'image', label: 'Company image URL', group: 'Profile' },
    { key: 'ceo', label: 'CEO', group: 'Profile' },
    { key: 'fullTimeEmployees', label: 'Full-time employees', group: 'Profile' },
    { key: 'phone', label: 'Phone', group: 'Profile' },
    { key: 'address', label: 'Address', group: 'Profile' },
    { key: 'city', label: 'City', group: 'Profile' },
    { key: 'state', label: 'State', group: 'Profile' },
    { key: 'zip', label: 'ZIP / postal code', group: 'Profile' },
    { key: 'ipoDate', label: 'IPO date', group: 'Profile' },
    { key: 'activelyTrading', label: 'Actively trading', group: 'Profile' },
    { key: 'etf', label: 'ETF', group: 'Profile' },
    { key: 'fund', label: 'Fund', group: 'Profile' },
    { key: 'adr', label: 'ADR', group: 'Profile' },
    { key: 'delisted', label: 'Delisted', group: 'Profile' },
    { key: 'nseSymbol', label: 'NSE symbol', group: 'India market' },
    { key: 'bseCode', label: 'BSE code', group: 'India market' },
    { key: 'marketCapCategory', label: 'Cap category', group: 'India market' },
    { key: 'macroSector', label: 'Macro sector', group: 'India market' },
    { key: 'basicIndustry', label: 'Basic industry', group: 'India market' },
    { key: 'fnoListed', label: 'F&O listed', group: 'India market' },
    { key: 'faceValue', label: 'Face value', group: 'India market' },
    { key: 'bookValue', label: 'Book value / share', group: 'India market' },
    { key: 'sharesOutstanding', label: 'Shares outstanding', group: 'India market' },
    { key: 'promoterHolding', label: 'Promoter holding', group: 'India market' },
    { key: 'roce', label: 'ROCE', group: 'India market' },
    { key: 'salesTtm', label: 'Sales (TTM)', group: 'India market' },
    { key: 'netProfitTtm', label: 'Net profit (TTM)', group: 'India market' },
    { key: 'peerMedianPE', label: 'Peer median P/E', group: 'India market' },
    { key: 'latestQuarter', label: 'Latest quarter', group: 'India growth' },
    { key: 'salesGrowthQoQ', label: 'Sales growth QoQ', group: 'India growth' },
    { key: 'salesGrowthYoY', label: 'Sales growth YoY', group: 'India growth' },
    { key: 'profitGrowthQoQ', label: 'Profit growth QoQ', group: 'India growth' },
    { key: 'profitGrowthYoY', label: 'Profit growth YoY', group: 'India growth' },
    { key: 'salesCagr3y', label: 'Sales CAGR 3Y', group: 'India growth' },
    { key: 'salesCagr5y', label: 'Sales CAGR 5Y', group: 'India growth' },
    { key: 'profitCagr3y', label: 'Profit CAGR 3Y', group: 'India growth' },
    { key: 'profitCagr5y', label: 'Profit CAGR 5Y', group: 'India growth' },
    { key: 'roe3y', label: 'ROE 3Y avg', group: 'India growth' },
    { key: 'priceCagr1y', label: 'Stock return 1Y', group: 'India growth' },
    { key: 'priceCagr3y', label: 'Stock CAGR 3Y', group: 'India growth' },
    { key: 'priceCagr5y', label: 'Stock CAGR 5Y', group: 'India growth' },
    { key: 'analystRatings', label: 'Analyst ratings', group: 'India analysts' },
    { key: 'analystBuyPercent', label: 'Analyst buy %', group: 'India analysts' },
    { key: 'analystCount', label: 'Analyst count', group: 'India analysts' },
    { key: 'pros', label: 'Pros', group: 'India analysts' },
    { key: 'cons', label: 'Cons', group: 'India analysts' },
  ];
  readonly columnGroups = [...new Set(this.availableColumns.map((column) => column.group))];
  /** Columns shown in the table, in order. Always taken from the user's saved preferences (or the defaults). */
  visibleColumnKeys: WatchlistColumnKey[] = [...DEFAULT_COLUMN_KEYS];
  draftColumnKeys: WatchlistColumnKey[] = [];
  watchlists: WatchlistGroup[] = [];
  /** Watchlist IDs with a favorite PATCH in flight, so a double click cannot send conflicting updates. */
  private readonly favoriteUpdatesInFlight = new Set<string>();
  private favoriteSymbolsByMarket: Record<WatchlistMarket, Set<string>> = { US: new Set(), India: new Set() };
  selectedMarket: WatchlistMarket = 'US';
  selectedWatchlistId = '';
  watchlistDropdownOpen = false;
  currentPage = 1;
  columnsEditorOpen = false;
  descriptionDialogItem: WatchlistItem | null = null;
  addStocksDialogOpen = false;
  stockSearchText = '';
  stagedStocks: WatchlistItem[] = [];
  addStocksMessage = '';
  isSavingStocks = false;
  /** India stocks with a delete request in flight, so a double click cannot send two deletes. */
  readonly deletingSymbols = new Set<string>();
  readonly currentUserId = environment.currentUserId;
  /** NSE (India) or US symbol-directory matches for the text in the Add stocks search box. */
  symbolSuggestions: WatchlistItem[] = [];
  isSearchingSymbols = false;
  symbolSearchMessage = '';
  /** Query whose results are in symbolSuggestions, so "no matches" is shown only for a finished search. */
  symbolSearchedQuery = '';
  private readonly symbolSearchText$ = new Subject<string>();
  private readonly symbolSearchSubscription: Subscription;
  addWatchlistDialogOpen = false;
  newWatchlistName = '';
  newWatchlistMessage = '';
  columnEditorMessage = '';
  isSavingColumns = false;
  /** India symbols already requested from Tapetide (bare NSE symbols). */
  private readonly indiaProfilesRequested = new Set<string>();
  private indiaProfilesInFlight = 0;
  private readonly indiaProfileSubscriptions = new Subscription();
  /** Every watchlist opens sorted by market cap, largest first (T → B → M); header clicks can change it. */
  sortColumnKey: WatchlistColumnKey | null = DEFAULT_SORT_COLUMN;
  sortDirection: 'asc' | 'desc' = DEFAULT_SORT_DIRECTION;
  /** Only the newest column-preferences request may update the table, so a slow older response cannot win. */
  private columnPreferencesRequestId = 0;
  statusMessage = '';
  isImporting = false;
  isExporting = false;
  isLoadingProfiles = false;
  isLoadingWatchlists = false;
  private watchlistRequestId = 0;
  /** The backend caps page size at 100; the dropdown has no paging, so every page is fetched and merged. */
  private readonly watchlistPageSize = 100;
  readonly favoritesListId = FAVORITES_LIST_ID;

  constructor(
    route: ActivatedRoute,
    private readonly watchlistImportService: WatchlistImportService,
    private readonly watchlistExportService: WatchlistExportService,
    private readonly watchlistsService: WatchlistsService,
    private readonly fmpProfilesService: FmpProfilesService,
    private readonly tapetideProfileService: TapetideProfileService,
    private readonly nseSymbolsService: NseSymbolsService,
    private readonly usSymbolsService: UsSymbolsService,
    private readonly columnPreferencesService: WatchlistColumnPreferencesService,
  ) {
    this.loadFavorites();
    // Each route (/watchlists/us, /watchlists/india) fixes the market for its page.
    this.selectedMarket = route.snapshot.data['market'] === 'India' ? 'India' : 'US';
    this.loadWatchlists(this.selectedMarket);
    this.symbolSearchSubscription = this.watchSymbolSearch();
  }

  get selectedWatchlist(): WatchlistGroup {
    if (this.isFavoritesList) {
      const favoriteSymbols = this.favoriteSymbolsByMarket[this.selectedMarket];
      return {
        id: FAVORITES_LIST_ID,
        name: 'Favorites',
        market: this.selectedMarket,
        currency: this.selectedMarket === 'US' ? 'USD' : 'INR',
        items: this.watchlists.flatMap((watchlist) => watchlist.items)
          .filter((item, index, items) => favoriteSymbols.has(item.symbol)
            && items.findIndex((candidate) => candidate.symbol === item.symbol) === index),
      };
    }
    return this.watchlists.find((watchlist) => watchlist.id === this.selectedWatchlistId)
      ?? this.watchlists[0]
      ?? {
        id: '',
        name: this.isLoadingWatchlists ? 'Loading watchlists…' : 'No watchlists',
        market: this.selectedMarket,
        currency: this.selectedMarket === 'US' ? 'USD' : 'INR',
        items: [],
      };
  }

  get favoriteWatchlists(): WatchlistGroup[] {
    return this.watchlists.filter((watchlist) => this.isFavoriteWatchlist(watchlist));
  }

  get hasFavoriteSymbols(): boolean {
    return this.favoriteSymbolsByMarket[this.selectedMarket].size > 0;
  }

  get isFavoritesList(): boolean {
    return this.selectedWatchlistId === FAVORITES_LIST_ID;
  }

  get visibleColumns(): WatchlistColumn[] {
    return this.visibleColumnKeys
      .map((key) => this.availableColumns.find((column) => column.key === key))
      .filter((column): column is WatchlistColumn => column !== undefined);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.selectedWatchlist.items.length / this.pageSize));
  }

  get startIndex(): number {
    return this.selectedWatchlist.items.length ? (this.currentPage - 1) * this.pageSize : 0;
  }

  get endIndex(): number {
    return Math.min(this.startIndex + this.pageSize, this.selectedWatchlist.items.length);
  }

  get paginatedItems(): WatchlistItem[] {
    return this.sortedItems.slice(this.startIndex, this.endIndex);
  }

  /** The selected watchlist's items in the current sort order (sorting covers every page, not just the visible one). */
  get sortedItems(): WatchlistItem[] {
    const items = this.selectedWatchlist.items;
    const key = this.sortColumnKey;
    if (!key) {
      return items;
    }
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return items
      .map((item, index) => ({ item, index, value: this.sortValue(item, key) }))
      .sort((first, second) => {
        // Empty values always go last, whichever direction is chosen.
        if (first.value === null || second.value === null) {
          return first.value === second.value ? first.index - second.index : first.value === null ? 1 : -1;
        }
        const result = typeof first.value === 'number' && typeof second.value === 'number'
          ? first.value - second.value
          : String(first.value).localeCompare(String(second.value), undefined, { numeric: true, sensitivity: 'base' });
        return result * direction || first.index - second.index;
      })
      .map(({ item }) => item);
  }

  private resetSortToMarketCap(): void {
    this.sortColumnKey = DEFAULT_SORT_COLUMN;
    this.sortDirection = DEFAULT_SORT_DIRECTION;
  }

  /** Header click cycles: ascending → descending → unsorted. */
  toggleSort(key: WatchlistColumnKey): void {
    if (this.sortColumnKey !== key) {
      this.sortColumnKey = key;
      this.sortDirection = 'asc';
    } else if (this.sortDirection === 'asc') {
      this.sortDirection = 'desc';
    } else {
      this.sortColumnKey = null;
    }
    this.currentPage = 1;
  }

  sortIndicator(key: WatchlistColumnKey): string {
    if (this.sortColumnKey !== key) {
      return '↕';
    }
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  ariaSort(key: WatchlistColumnKey): 'ascending' | 'descending' | 'none' {
    if (this.sortColumnKey !== key) {
      return 'none';
    }
    return this.sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  /** Formats a raw market cap as e.g. $3.25T, $812.40B, $45.10M. Non-numeric values are shown as-is. */
  formatMarketCap(value: string | number): string {
    const amount = this.toSortableNumber(value);
    if (amount === null) {
      return String(value);
    }
    const symbol = this.selectedWatchlist.currency === 'INR' ? '₹' : '$';
    const sign = amount < 0 ? '-' : '';
    const absolute = Math.abs(amount);
    const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    const unit = units.find(([threshold]) => absolute >= threshold);
    return unit
      ? `${sign}${symbol}${(absolute / unit[0]).toFixed(2)}${unit[1]}`
      : `${sign}${symbol}${absolute.toFixed(2)}`;
  }

  private sortValue(item: WatchlistItem, key: WatchlistColumnKey): number | string | null {
    const raw = this.getColumnValue(item, key);
    if (raw === '—' || raw === '' || raw === null || raw === undefined) {
      return null;
    }
    return this.toSortableNumber(raw) ?? String(raw).trim().toLowerCase();
  }

  /** Reads numbers, including strings such as "1,234.5", "$12", "3.4%". Returns null for anything else. */
  private toSortableNumber(value: string | number): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const cleaned = value.trim().replace(/[,$₹%\s]/g, '');
    if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  get stockSuggestions(): WatchlistItem[] {
    return this.symbolSuggestions.filter((item) => !this.isAlreadyAdded(item.symbol));
  }

  /** Name of the symbol list searched by the Add stocks dialog. */
  get symbolListLabel(): string {
    return this.selectedMarket === 'India' ? 'NSE' : 'US';
  }

  selectWatchlist(id: string): void {
    this.selectedWatchlistId = id;
    this.resetSortToMarketCap();
    this.currentPage = 1;
    this.watchlistDropdownOpen = false;
    this.statusMessage = '';
    this.loadFmpProfiles();
  }

  selectFavoriteWatchlist(id: string): void {
    this.selectedWatchlistId = id;
    this.resetSortToMarketCap();
    this.currentPage = 1;
    this.statusMessage = '';
    this.loadFmpProfiles();
  }

  isFavoriteWatchlist(watchlist: WatchlistGroup): boolean {
    return watchlist.isFavorite === true;
  }

  isFavoriteUpdating(watchlist: WatchlistGroup): boolean {
    return this.favoriteUpdatesInFlight.has(watchlist.id);
  }

  /**
   * Star click: saves the new value with PATCH /api/v1/watchlists/{id}/favorite (USA and India).
   * The star flips immediately and is reverted if the request fails.
   */
  toggleFavoriteWatchlist(watchlist: WatchlistGroup): void {
    if (!watchlist.id || this.favoriteUpdatesInFlight.has(watchlist.id)) {
      return;
    }
    const isFavorite = !this.isFavoriteWatchlist(watchlist);
    this.favoriteUpdatesInFlight.add(watchlist.id);
    this.setWatchlistFavoriteLocally(watchlist.id, isFavorite);
    this.watchlistsService.setFavorite(watchlist.id, isFavorite, environment.currentUserId).subscribe({
      next: (saved) => {
        this.favoriteUpdatesInFlight.delete(watchlist.id);
        this.setWatchlistFavoriteLocally(watchlist.id, saved.isFavorite === true);
        this.statusMessage = saved.isFavorite
          ? `${watchlist.name} added to favorites.`
          : `${watchlist.name} removed from favorites.`;
      },
      error: (error: unknown) => {
        this.favoriteUpdatesInFlight.delete(watchlist.id);
        this.setWatchlistFavoriteLocally(watchlist.id, !isFavorite);
        console.error('[Watchlists] Failed to update favorite', error);
        this.statusMessage = error instanceof HttpErrorResponse && error.status !== 0
          ? `Could not update favorite for ${watchlist.name} (HTTP ${error.status}).`
          : 'Unable to reach the watchlist service. The favorite was not saved.';
      },
    });
  }

  private setWatchlistFavoriteLocally(watchlistId: string, isFavorite: boolean): void {
    this.watchlists = this.sortFavoritesFirst(
      this.watchlists.map((list) => list.id === watchlistId ? { ...list, isFavorite } : list));
  }

  isDefaultWatchlist(watchlist: WatchlistGroup): boolean {
    return watchlist.market === 'US'
      && watchlist.name.trim().toUpperCase() === DEFAULT_US_WATCHLIST_NAME;
  }

  openAddStocksDialog(): void {
    if (this.isFavoritesList) {
      this.statusMessage = 'Select a watchlist before adding stocks.';
      return;
    }
    this.stockSearchText = '';
    this.stagedStocks = [];
    this.addStocksMessage = '';
    this.resetSymbolSearch();
    this.addStocksDialogOpen = true;
  }

  closeAddStocksDialog(): void {
    if (this.isSavingStocks) {
      return;
    }
    this.addStocksDialogOpen = false;
    this.addStocksMessage = '';
    this.resetSymbolSearch();
  }

  updateStockSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.stockSearchText = event.target.value;
      this.addStocksMessage = '';
      this.symbolSearchText$.next(this.stockSearchText);
    }
  }

  addStockFromInput(event: Event): void {
    event.preventDefault();
    const query = this.stockSearchText.trim();
    if (!query) {
      return;
    }
    const match = this.symbolSuggestions.find((item) => item.symbol.toLowerCase() === query.toLowerCase())
      ?? this.watchlists.flatMap((watchlist) => watchlist.items)
      .find((item) => item.symbol.toLowerCase() === query.toLowerCase()
        || item.name.toLowerCase() === query.toLowerCase());
    if (match) {
      this.stageStock(match);
      return;
    }
    const symbol = query.toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9.&$-]{1,15}$/.test(symbol)) {
      this.addStocksMessage = 'Enter a ticker symbol or choose a matching asset from the suggestions.';
      return;
    }
    if (this.isAlreadyAdded(symbol)) {
      this.addStocksMessage = `${symbol} is already in this watchlist or the pending list.`;
      return;
    }
    this.stageStock({
      symbol,
      name: symbol,
      price: 0,
      change: 0,
      trend: 'Neutral',
      assetType: 'Stock',
      sector: '—',
      volume: '—',
    });
  }

  stageStock(item: WatchlistItem): void {
    if (this.isAlreadyAdded(item.symbol)) {
      this.addStocksMessage = `${item.symbol} is already in this watchlist or the pending list.`;
      return;
    }
    this.stagedStocks = [...this.stagedStocks, { ...item }];
    this.stockSearchText = '';
    this.addStocksMessage = '';
    this.resetSymbolSearch();
  }

  /** True when the symbol is in the open watchlist or the pending list (India ignores a .NS/.BO suffix). */
  private isAlreadyAdded(symbol: string): boolean {
    const key = this.symbolKey(symbol);
    return [...this.selectedWatchlist.items, ...this.stagedStocks].some((item) => this.symbolKey(item.symbol) === key);
  }

  private symbolKey(symbol: string): string {
    return this.selectedMarket === 'India' ? this.indiaApiSymbol(symbol) : symbol;
  }

  /**
   * Type-ahead: debounces the search box, calls GET /api/india/nse/symbols (India) or /api/us/nasdaq/symbols (US),
   * and drops any response
   * that is no longer for the current text (switchMap also cancels the superseded request).
   */
  private watchSymbolSearch(): Subscription {
    return this.symbolSearchText$.pipe(
      map((text) => text.trim()),
      debounceTime(SYMBOL_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((query) => {
        if (!query) {
          return of({ query, items: [] as WatchlistItem[], error: '' });
        }
        this.isSearchingSymbols = true;
        const search: Observable<WatchlistItem[]> = this.selectedMarket === 'India'
          ? this.nseSymbolsService.search(query, SYMBOL_SUGGESTION_LIMIT)
            .pipe(map((symbols) => symbols.map((symbol) => this.nseSymbolToItem(symbol))))
          : this.usSymbolsService.search(query, SYMBOL_SUGGESTION_LIMIT)
            .pipe(map((symbols) => symbols.map((symbol) => this.usSymbolToItem(symbol))));
        return search.pipe(
          map((items) => ({ query, items, error: '' })),
          catchError((error: unknown) => {
            console.error(`[${this.symbolListLabel} symbols] Search failed for "${query}"`, error);
            return of({ query, items: [] as WatchlistItem[], error: this.symbolSearchErrorMessage(error) });
          }),
        );
      }),
    ).subscribe(({ query, items, error }) => {
      this.isSearchingSymbols = false;
      if (query !== this.stockSearchText.trim()) {
        return;
      }
      this.symbolSuggestions = items;
      this.symbolSearchMessage = error;
      this.symbolSearchedQuery = error ? '' : query;
    });
  }

  private resetSymbolSearch(): void {
    this.symbolSuggestions = [];
    this.symbolSearchMessage = '';
    this.symbolSearchedQuery = '';
    this.isSearchingSymbols = false;
    this.symbolSearchText$.next('');
  }

  private nseSymbolToItem(symbol: NseSymbol): WatchlistItem {
    return {
      symbol: symbol.symbol,
      name: symbol.name?.trim() || symbol.symbol,
      price: 0,
      change: 0,
      trend: 'Neutral',
      assetType: symbol.type === 'ETF' ? 'ETF' : 'Stock',
      sector: '—',
      volume: '—',
    };
  }

  private usSymbolToItem(symbol: UsSymbol): WatchlistItem {
    return {
      symbol: symbol.symbol,
      name: symbol.name?.trim() || symbol.symbol,
      assetType: symbol.type === 'ETF' ? 'ETF' : 'Stock',
    };
  }

  private symbolSearchErrorMessage(error: unknown): string {
    const label = this.symbolListLabel;
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return `Could not reach the market data service (news-scheduler-svc on port 8082) to search ${label} symbols.`;
      }
      if (error.status === 503) {
        const syncPath = this.selectedMarket === 'India' ? '/api/india/nse/sync' : '/api/us/nasdaq/sync';
        return `The ${label} symbol list has not been downloaded yet. Run POST ${syncPath} on news-scheduler-svc.`;
      }
      return `${label} symbol search failed (HTTP ${error.status}). You can still type a ticker and press Add.`;
    }
    return `${label} symbol search failed. You can still type a ticker and press Add.`;
  }

  removeStagedStock(index: number): void {
    this.stagedStocks = this.stagedStocks.filter((_, itemIndex) => itemIndex !== index);
  }

  openAddWatchlistDialog(): void {
    this.watchlistDropdownOpen = false;
    this.newWatchlistName = '';
    this.newWatchlistMessage = '';
    this.addWatchlistDialogOpen = true;
  }

  closeAddWatchlistDialog(): void {
    this.addWatchlistDialogOpen = false;
    this.newWatchlistMessage = '';
  }

  updateWatchlistName(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.newWatchlistName = event.target.value;
      this.newWatchlistMessage = '';
    }
  }

  saveNewWatchlist(): void {
    const name = this.newWatchlistName.trim();
    if (!name) {
      this.newWatchlistMessage = 'Enter a name for the watchlist.';
      return;
    }
    if (this.watchlists.some((watchlist) => watchlist.name.toLowerCase() === name.toLowerCase())) {
      this.newWatchlistMessage = 'A watchlist with this name already exists for the selected market.';
      return;
    }
    const newWatchlist: WatchlistGroup = {
      id: `custom-${Date.now()}`,
      name,
      market: this.selectedMarket,
      currency: this.selectedMarket === 'US' ? 'USD' : 'INR',
      items: [],
    };
    this.watchlists = [...this.watchlists, newWatchlist];
    this.selectedWatchlistId = newWatchlist.id;
    this.currentPage = 1;
    this.addWatchlistDialogOpen = false;
    this.newWatchlistMessage = '';
    this.statusMessage = `${name} added in this session. This backend currently only supports loading and importing watchlists.`;
  }

  saveStagedStocks(): void {
    if (this.isFavoritesList || this.stagedStocks.length === 0 || this.isSavingStocks) {
      return;
    }
    this.saveStagedStocksToServer();
  }

  /**
   * Saves the pending stocks to the selected watchlist in the database (all or none), then adds the saved rows
   * to the table and loads their FMP (US) or Tapetide (India) profiles. On failure the dialog stays open.
   */
  private saveStagedStocksToServer(): void {
    const watchlist = this.selectedWatchlist;
    if (!/^\d+$/.test(watchlist.id)) {
      this.addStocksMessage = 'This watchlist exists only in this session, so stocks cannot be saved to it.';
      return;
    }
    // The name column holds 160 characters; a few US security names are longer.
    const items = this.stagedStocks.map((stock) => ({ symbol: stock.symbol, name: stock.name.slice(0, 160) }));
    const market = this.selectedMarket;
    this.isSavingStocks = true;
    this.addStocksMessage = '';
    this.watchlistsService.addItems(market, watchlist.id, items, environment.currentUserId).subscribe({
      next: (saved) => {
        this.isSavingStocks = false;
        this.watchlists = this.watchlists.map((list) => list.id !== watchlist.id ? list : {
          ...list,
          items: [...list.items, ...saved.map((item) => ({ symbol: item.symbol, name: item.name }))],
        });
        this.stagedStocks = [];
        this.addStocksDialogOpen = false;
        this.resetSymbolSearch();
        if (this.selectedWatchlistId === watchlist.id) {
          this.currentPage = Math.ceil(this.selectedWatchlist.items.length / this.pageSize);
        }
        this.statusMessage = `${saved.length} ${saved.length === 1 ? 'stock' : 'stocks'} saved to ${watchlist.name}.`;
        this.loadFmpProfiles();
      },
      error: (error: unknown) => {
        console.error(`[Watchlists] Failed to save stocks to ${market} watchlist ${watchlist.id}`, error);
        this.isSavingStocks = false;
        this.addStocksMessage = this.saveStocksErrorMessage(error);
      },
    });
  }

  private saveStocksErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const serverMessage = typeof error.error?.message === 'string' ? error.error.message : '';
      if (error.status === 0) {
        return 'Could not reach the watchlist service (invesment-management-svc on port 8081). Nothing was saved.';
      }
      if (error.status === 400) {
        return `${serverMessage || 'The stocks could not be saved.'} Nothing was saved.`;
      }
      if (error.status === 404) {
        return 'This watchlist was not found for your user. Reload the page and try again.';
      }
      return `Saving failed (HTTP ${error.status}). Nothing was saved.`;
    }
    return 'Saving failed. Nothing was saved.';
  }

  columnLabel(key: WatchlistColumnKey): string {
    return this.availableColumns.find((column) => column.key === key)?.label ?? key;
  }

  isFavoriteSymbol(item: WatchlistItem): boolean {
    return this.favoriteSymbolsByMarket[this.selectedMarket].has(item.symbol);
  }

  toggleFavoriteSymbol(item: WatchlistItem): void {
    const favorites = this.favoriteSymbolsByMarket[this.selectedMarket];
    if (favorites.has(item.symbol)) {
      favorites.delete(item.symbol);
      this.statusMessage = `${item.symbol} removed from favorites.`;
    } else {
      favorites.add(item.symbol);
      this.statusMessage = `${item.symbol} added to favorites.`;
    }
    if (this.isFavoritesList && favorites.size === 0) {
      this.selectedWatchlistId = this.watchlists[0]?.id ?? '';
      this.currentPage = 1;
    }
    this.persistFavorites();
  }

  /** Delete is offered only on saved watchlists (not Favorites, which mixes lists, nor session-only lists). */
  get canDeleteStocks(): boolean {
    return !this.isFavoritesList && /^\d+$/.test(this.selectedWatchlist.id);
  }

  /** Asks for confirmation, deletes the stock from the selected watchlist in the database, then from the table. */
  removeStock(item: WatchlistItem): void {
    const watchlist = this.selectedWatchlist;
    if (!this.canDeleteStocks || this.deletingSymbols.has(item.symbol)
      || !window.confirm(`Remove ${item.symbol} from ${watchlist.name}?`)) {
      return;
    }
    this.deletingSymbols.add(item.symbol);
    const market = this.selectedMarket;
    this.watchlistsService.removeItem(market, watchlist.id, item.symbol, environment.currentUserId).subscribe({
      next: () => {
        this.deletingSymbols.delete(item.symbol);
        this.dropItemFromWatchlist(watchlist.id, item.symbol);
        this.statusMessage = `${item.symbol} removed from ${watchlist.name}.`;
      },
      error: (error: unknown) => {
        console.error(`[Watchlists] Failed to remove ${item.symbol} from ${market} watchlist ${watchlist.id}`, error);
        this.deletingSymbols.delete(item.symbol);
        if (error instanceof HttpErrorResponse && error.status === 404) {
          // Already gone on the server (e.g. deleted in another tab): match the table to the database.
          this.dropItemFromWatchlist(watchlist.id, item.symbol);
          this.statusMessage = `${item.symbol} was no longer in ${watchlist.name}; the table has been updated.`;
          return;
        }
        this.statusMessage = error instanceof HttpErrorResponse && error.status === 0
          ? `Could not reach the watchlist service (port 8081). ${item.symbol} was not removed.`
          : `Removing ${item.symbol} failed. It is still in ${watchlist.name}.`;
      },
    });
  }

  private dropItemFromWatchlist(watchlistId: string, symbol: string): void {
    this.watchlists = this.watchlists.map((list) => list.id !== watchlistId ? list : {
      ...list,
      items: list.items.filter((current) => current.symbol !== symbol),
    });
    this.currentPage = Math.min(this.currentPage, Math.max(1, this.totalPages));
  }

  openDescriptionDialog(item: WatchlistItem): void {
    if (item.profileData?.['description']) {
      this.descriptionDialogItem = item;
    }
  }

  closeDescriptionDialog(): void {
    this.descriptionDialogItem = null;
  }

  columnsForGroup(group: string): WatchlistColumn[] {
    return this.availableColumns.filter((column) => column.group === group);
  }

  selectProfileColumns(): void {
    const profileKeys = this.columnsForGroup('Profile').map((column) => column.key);
    this.draftColumnKeys = [
      ...this.draftColumnKeys,
      ...profileKeys.filter((key) => !this.draftColumnKeys.includes(key)),
    ];
  }

  openColumnEditor(): void {
    this.draftColumnKeys = [...this.visibleColumnKeys];
    this.columnEditorMessage = '';
    this.columnsEditorOpen = true;
  }

  isDraftColumnVisible(key: WatchlistColumnKey): boolean {
    return this.draftColumnKeys.includes(key);
  }

  toggleDraftColumn(key: WatchlistColumnKey, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    if (event.target.checked) {
      if (!this.draftColumnKeys.includes(key)) {
        this.draftColumnKeys = [...this.draftColumnKeys, key];
      }
      this.columnEditorMessage = '';
      return;
    }
    if (this.draftColumnKeys.length === 1) {
      event.target.checked = true;
      this.columnEditorMessage = 'Select at least one column.';
      return;
    }
    this.draftColumnKeys = this.draftColumnKeys.filter((draftKey) => draftKey !== key);
    this.columnEditorMessage = '';
  }

  moveDraftColumn(index: number, direction: -1 | 1): void {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= this.draftColumnKeys.length) {
      return;
    }
    const reordered = [...this.draftColumnKeys];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    this.draftColumnKeys = reordered;
  }

  saveColumnPreferences(): void {
    if (!this.draftColumnKeys.length) {
      this.columnEditorMessage = 'Select at least one column before saving.';
      return;
    }
    const columnKeys = [...this.draftColumnKeys];
    this.isSavingColumns = true;
    this.columnEditorMessage = '';
    // Invalidate any preferences request still in flight; it would carry the old columns.
    this.columnPreferencesRequestId++;
    this.columnPreferencesService.savePreferences(environment.currentUserId, columnKeys).subscribe({
      next: () => {
        this.isSavingColumns = false;
        this.columnsEditorOpen = false;
        this.columnEditorMessage = '';
        this.statusMessage = 'Columns saved. Refreshing the watchlist columns…';
        this.refreshColumnsFromDatabase();
      },
      error: (error: unknown) => {
        this.isSavingColumns = false;
        console.error('[Watchlist columns] Failed to save column preferences', error);
        // Keep the editor open so the user can retry; the table keeps showing what is in the database.
        this.columnEditorMessage = error instanceof HttpErrorResponse && error.status !== 0
          ? `Could not save columns (HTTP ${error.status}). Please try again.`
          : 'Could not reach the preferences service. Check that the backend on port 8081 is running.';
      },
    });
  }

  /** Re-reads the saved columns from the database and redraws the table with exactly those columns. */
  private refreshColumnsFromDatabase(): void {
    const requestId = ++this.columnPreferencesRequestId;
    this.fetchColumnPreferences().subscribe((columnKeys) => {
      if (requestId !== this.columnPreferencesRequestId) {
        return;
      }
      this.visibleColumnKeys = columnKeys;
      this.statusMessage = `${columnKeys.length} columns saved and loaded from your profile.`;
    });
  }

  cancelColumnEditor(): void {
    this.columnsEditorOpen = false;
    this.columnEditorMessage = '';
  }

  getColumnValue(item: WatchlistItem, key: WatchlistColumnKey): string | number {
    switch (key) {
      case 'symbol': return item.symbol;
      case 'name': return item.name;
      case 'assetType': return item.assetType ?? '—';
      case 'price': return item.price ?? '—';
      case 'change': return item.change ?? '—';
      case 'trend': return item.trend ?? '—';
      case 'sector': return item.sector ?? '—';
      case 'score': return item.score ?? '—';
      case 'volume': return item.volume ?? '—';
      case 'changeAmount':
      case 'currency':
      case 'exchange':
      case 'exchangeShortName':
      case 'exchangeFullName':
      case 'country':
      case 'industry':
      case 'description':
      case 'updatedAt':
      case 'profileId':
      case 'cik':
      case 'isin':
      case 'cusip':
      case 'website':
      case 'lastDividend':
      case 'priceRange':
      case 'range':
      case 'image':
      case 'ceo':
      case 'fullTimeEmployees':
      case 'phone':
      case 'address':
      case 'city':
      case 'state':
      case 'zip':
      case 'ipoDate':
      case 'activelyTrading':
      case 'etf':
      case 'fund':
      case 'adr':
      case 'delisted':
      case 'open':
      case 'previousClose':
      case 'dayHigh':
      case 'dayLow':
      case 'marketCap':
      case 'averageVolume':
      case 'relativeVolume':
      case 'peRatio':
      case 'forwardPE':
      case 'eps':
      case 'pegRatio':
      case 'priceToBook':
      case 'priceToSales':
      case 'dividendYield':
      case 'roe':
      case 'roa':
      case 'grossMargin':
      case 'operatingMargin':
      case 'profitMargin':
      case 'debtToEquity':
      case 'revenueGrowth':
      case 'earningsGrowth':
      case 'freeCashFlow':
      case 'analystTarget':
      case 'week52High':
      case 'week52Low':
      case 'movingAverage50':
      case 'movingAverage200':
      case 'rsi14':
      case 'macd':
      case 'macdSignal':
      case 'beta':
      case 'shortFloat':
      case 'nextEarnings':
      case 'nseSymbol':
      case 'bseCode':
      case 'basicIndustry':
      case 'macroSector':
      case 'marketCapCategory':
      case 'fnoListed':
      case 'faceValue':
      case 'bookValue':
      case 'roce':
      case 'promoterHolding':
      case 'salesTtm':
      case 'netProfitTtm':
      case 'sharesOutstanding':
      case 'latestQuarter':
      case 'salesGrowthQoQ':
      case 'salesGrowthYoY':
      case 'profitGrowthQoQ':
      case 'profitGrowthYoY':
      case 'salesCagr3y':
      case 'salesCagr5y':
      case 'profitCagr3y':
      case 'profitCagr5y':
      case 'roe3y':
      case 'priceCagr1y':
      case 'priceCagr3y':
      case 'priceCagr5y':
      case 'analystBuyPercent':
      case 'analystRatings':
      case 'analystCount':
      case 'peerMedianPE':
      case 'pros':
      case 'cons':
        return item.metrics?.[key] ?? this.profileMetric(item, key) ?? '—';
    }
  }

  previousPage(): void {
    this.currentPage = Math.max(1, this.currentPage - 1);
  }

  nextPage(): void {
    this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
  }

  /**
   * Fetches FMP profiles for the selected US watchlist. Runs automatically whenever watchlists load or
   * the selection changes; symbols that already have profile data are not requested again.
   */
  private loadFmpProfiles(): void {
    if (this.selectedMarket === 'India') {
      this.loadIndiaProfiles();
      return;
    }
    if (this.selectedMarket !== 'US' || this.isLoadingWatchlists) {
      return;
    }
    const watchlist = this.selectedWatchlist;
    const symbols = [...new Set(watchlist.items
      .filter((item) => !item.profileData)
      .map((item) => item.symbol.trim().toUpperCase())
      .filter((symbol) => symbol && !/(\.NS|\.BO)$/i.test(symbol)))];
    if (!symbols.length) {
      return;
    }

    const selectedWatchlistId = this.selectedWatchlistId;
    const selectedMarket = this.selectedMarket;
    this.isLoadingProfiles = true;
    this.fmpProfilesService.getProfiles(symbols).subscribe({
      next: (result) => {
        try {
          const profiles = this.parseFmpProfiles(result);
          if (selectedMarket !== this.selectedMarket || selectedWatchlistId !== this.selectedWatchlistId) {
            // The selection changed mid-request; the new selection triggers its own profile load.
            return;
          }
          const profilesBySymbol = new Map(profiles.map((profile) => [profile.symbol.trim().toUpperCase(), profile]));
          const isFavoritesSelection = selectedWatchlistId === this.favoritesListId;
          const matchedItemCount = this.watchlists
            .filter((list) => isFavoritesSelection ? list.market === 'US' : list.id === selectedWatchlistId)
            .flatMap((list) => list.items)
            .filter((item) => profilesBySymbol.has(item.symbol.trim().toUpperCase())).length;
          const matchedSymbols = [...profilesBySymbol.keys()].filter((symbol) =>
            this.watchlists
              .filter((list) => isFavoritesSelection ? list.market === 'US' : list.id === selectedWatchlistId)
              .some((list) => list.items.some((item) => item.symbol.trim().toUpperCase() === symbol)));
          this.watchlists = this.watchlists.map((list) => (selectedWatchlistId === this.favoritesListId
            ? list.market === 'US'
            : list.id === selectedWatchlistId)
            ? {
              ...list,
              items: list.items.map((item) => {
                const profile = profilesBySymbol.get(item.symbol.trim().toUpperCase());
                return profile ? this.applyFmpProfile(item, profile) : item;
              }),
            }
            : list);
          const returnedSymbols = new Set(profilesBySymbol.keys());
          const missingSymbols = symbols.filter((symbol) => !returnedSymbols.has(symbol));
          const displayedProfileFields = [
            'companyName', 'price', 'changePercentage', 'marketCap', 'currency', 'exchange',
            'country', 'sector', 'industry', 'volume', 'description', 'updatedAt',
          ].filter((field) => profiles.some((profile) => {
            const value = profile[field as keyof FmpProfile];
            return value !== undefined && value !== null && value !== '';
          }));
          console.info('[FMP Profiles] Watchlist mapping complete', {
            selectedWatchlist: this.selectedWatchlist.name,
            requestedProfileCount: symbols.length,
            receivedProfileCount: profiles.length,
            matchedRowCount: matchedItemCount,
            matchedSymbols,
            requestedWithoutProfiles: missingSymbols,
            profileFieldsWithValues: displayedProfileFields,
            visibleColumns: this.visibleColumnKeys,
          });
          if (profiles.length > 0 && matchedItemCount === 0) {
            console.warn('[FMP Profiles] No returned profile symbols matched items in the selected watchlist.', {
              requestedSymbols: symbols,
              returnedSymbols: [...returnedSymbols],
            });
          } else if (matchedItemCount > 0 && displayedProfileFields.length === 0) {
            console.warn('[FMP Profiles] Profiles matched rows but supported display fields are empty.', {
              returnedSymbols: [...returnedSymbols],
            });
          }
        } catch (error) {
          console.error('[FMP Profiles] Invalid response or profile data', error);
          this.statusMessage = error instanceof Error ? error.message : 'The profile service returned invalid data.';
        } finally {
          this.isLoadingProfiles = false;
        }
      },
      error: (error: unknown) => {
        console.error('[FMP Profiles] Unable to load profiles', error);
        this.statusMessage = this.fmpProfileErrorMessage(error);
        this.isLoadingProfiles = false;
      },
    });
  }

  private parseFmpProfiles(result: unknown): FmpProfile[] {
    if (!Array.isArray(result)) {
      throw new Error('The profile service returned an unexpected response. Expected an array of profiles.');
    }
    return result.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null || !('symbol' in entry) || typeof entry.symbol !== 'string') {
        throw new Error(`The profile service returned an invalid profile at position ${index + 1}.`);
      }
      return entry as FmpProfile;
    });
  }

  ngOnDestroy(): void {
    this.indiaProfileSubscriptions.unsubscribe();
    this.symbolSearchSubscription.unsubscribe();
  }

  /**
   * Closes the watchlist dropdown on any click outside it. Clicks inside the dropdown stop propagation
   * (see the .watchlist-dropdown element), so they never reach this listener.
   */
  @HostListener('document:click')
  closeWatchlistDropdownOnOutsideClick(): void {
    this.watchlistDropdownOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeWatchlistDropdownOnEscape(): void {
    this.watchlistDropdownOpen = false;
  }

  /** Table text for the generic columns: money as T/B/M, percentages with 2 decimals, other decimals rounded. */
  formatCell(item: WatchlistItem, key: WatchlistColumnKey): string | number {
    const value = this.getColumnValue(item, key);
    if (typeof value !== 'number') {
      return value;
    }
    if (AMOUNT_COLUMNS.has(key)) {
      return this.formatMarketCap(value);
    }
    if (PERCENT_COLUMNS.has(key)) {
      return `${value.toFixed(2)}%`;
    }
    return Number.isInteger(value) ? value : Number(value.toFixed(2));
  }

  /**
   * Fetches a Tapetide profile for each symbol of the selected India watchlist that has not been loaded yet,
   * a few at a time, and fills in each row as its response arrives. Results are written to every watchlist
   * that contains the symbol, so switching lists mid-load loses nothing.
   */
  private loadIndiaProfiles(): void {
    if (this.selectedMarket !== 'India' || this.isLoadingWatchlists) {
      return;
    }
    const symbols = [...new Set(this.selectedWatchlist.items
      .filter((item) => !item.profileData)
      .map((item) => this.indiaApiSymbol(item.symbol))
      .filter((symbol) => symbol && !this.indiaProfilesRequested.has(symbol)))];
    if (!symbols.length) {
      return;
    }
    symbols.forEach((symbol) => this.indiaProfilesRequested.add(symbol));
    this.isLoadingProfiles = true;
    this.indiaProfilesInFlight += symbols.length;
    let remaining = symbols.length;
    const failures: { symbol: string; error: unknown }[] = [];

    this.indiaProfileSubscriptions.add(from(symbols).pipe(
      mergeMap((symbol) => this.tapetideProfileService.getProfile(symbol).pipe(
        map((response) => ({ symbol, payload: response?.payload ?? null })),
        catchError((error: unknown) => {
          console.error(`[Tapetide] Failed to load India profile for ${symbol}`, error);
          failures.push({ symbol, error });
          // Allow a retry the next time this watchlist is opened.
          this.indiaProfilesRequested.delete(symbol);
          return of({ symbol, payload: null });
        }),
      ), INDIA_PROFILE_CONCURRENCY),
    ).subscribe(({ symbol, payload }) => {
      this.indiaProfilesInFlight--;
      this.isLoadingProfiles = this.indiaProfilesInFlight > 0;
      if (--remaining === 0 && failures.length) {
        this.statusMessage = this.indiaProfileErrorMessage(failures, symbols.length);
      }
      if (!payload?.data) {
        if (payload) {
          console.warn(`[Tapetide] No profile data returned for ${symbol}`);
        }
        return;
      }
      this.watchlists = this.watchlists.map((list) => list.market !== 'India' ? list : {
        ...list,
        items: list.items.map((item) => this.indiaApiSymbol(item.symbol) === symbol
          ? this.applyTapetideProfile(item, payload)
          : item),
      });
    }));
  }

  /** Explains why India stock data is missing, so a failure is visible on the page, not only in the console. */
  private indiaProfileErrorMessage(failures: { symbol: string; error: unknown }[], requested: number): string {
    const first = failures[0].error;
    const prefix = `India stock data failed for ${failures.length} of ${requested} symbols`;
    if (first instanceof HttpErrorResponse) {
      // A 200 that is not JSON means the dev server answered with index.html instead of proxying to port 8082.
      const body = typeof first.error?.text === 'string' ? first.error.text : '';
      if (first.status === 200 && body.trimStart().startsWith('<')) {
        return `${prefix}: /api/india returned the Angular page instead of JSON. Restart "ng serve" so proxy.conf.json is reloaded.`;
      }
      if (first.status === 0 || first.status === 504) {
        return `${prefix}: news-scheduler-svc (port 8082) is not reachable. Check that it is running.`;
      }
      return `${prefix} (HTTP ${first.status}). See the browser console for details.`;
    }
    return `${prefix}. See the browser console for details.`;
  }

  /** Research sites for the current page: Yahoo / TV / Finviz / GoogleFin on US, TV / SC / FIN on India. */
  /**
   * The company's own website from its FMP (US) or Tapetide (India) profile, as an absolute http(s) URL, or null
   * until the profile loads or when it has none. A bare domain such as "apple.com" gets https:// added.
   */
  companyWebsite(item: WatchlistItem): string | null {
    const value = this.getColumnValue(item, 'website');
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw || raw === '—') {
      return null;
    }
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.') ? url.href : null;
    } catch {
      return null;
    }
  }

  get researchSites(): readonly ResearchSite[] {
    return this.selectedMarket === 'India' ? INDIA_RESEARCH_SITES : US_RESEARCH_SITES;
  }

  /**
   * Research link for a row, using the ticker from the Symbol column (e.g. NVDA, RELIANCE).
   * India tickers lose any .NS/.BO suffix; special characters such as & are URL-encoded.
   */
  researchUrl(site: ResearchSite, item: WatchlistItem): string {
    const symbol = this.selectedMarket === 'India'
      ? this.indiaApiSymbol(item.symbol)
      : item.symbol.trim().toUpperCase();
    return site.urlTemplate.replace('{symbol}', encodeURIComponent(symbol));
  }

  /** Tapetide expects the bare NSE symbol, e.g. RELIANCE rather than RELIANCE.NS. */
  private indiaApiSymbol(symbol: string): string {
    return symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
  }

  /** Maps a Tapetide profile (with ratings and peers) onto a watchlist row. */
  private applyTapetideProfile(item: WatchlistItem, payload: TapetideProfilePayload): WatchlistItem {
    const data = payload.data ?? {};
    const company = data.company ?? {};
    const fundamentals = data.fundamentals ?? {};
    const priceMetrics = data.price_metrics ?? {};
    const quote = data.quote ?? {};
    const quarterly = data.quarterly_growth ?? {};
    const growth = data.growth_metrics ?? {};
    const unified = data.unified_growth_rates ?? {};
    const ratings = payload.ratings?.data ?? {};
    const peers = payload.peers?.data ?? {};
    const selfPeer = peers.rows?.find((row) => row.is_self)
      ?? peers.rows?.find((row) => row.symbol?.toUpperCase() === this.indiaApiSymbol(item.symbol));

    const num = (...values: unknown[]): number | undefined => {
      for (const value of values) {
        const parsed = this.profileNumber(typeof value === 'string' ? value.replace('%', '') : value);
        if (parsed !== undefined) {
          return parsed;
        }
      }
      return undefined;
    };
    const text = (...values: unknown[]): string | undefined =>
      values.map((value) => this.profileString(value)).find((value) => value !== undefined);
    const crore = (value: unknown): number | undefined => {
      const amount = num(value);
      return amount === undefined ? undefined : amount * RUPEES_PER_CRORE;
    };
    const yesNo = (value: boolean | null | undefined): string | undefined =>
      value === true ? 'Yes' : value === false ? 'No' : undefined;
    const ratingsSummary = ratings.total_ratings
      ? `${ratings.buy ?? 0} Buy / ${ratings.hold ?? 0} Hold / ${ratings.sell ?? 0} Sell`
      : undefined;

    const mapped: Partial<Record<WatchlistMetricKey, string | number | undefined>> = {
      // Market data
      open: num(quote.open),
      previousClose: num(quote.prev_close),
      dayHigh: num(quote.high),
      dayLow: num(quote.low),
      changeAmount: num(quote.change),
      marketCap: crore(fundamentals.market_cap ?? priceMetrics.market_cap),
      // Fundamentals
      peRatio: num(fundamentals.stock_pe, priceMetrics.pe_ttm),
      eps: num(fundamentals.eps, priceMetrics.eps_ttm),
      priceToBook: num(fundamentals.price_to_book, priceMetrics.pb),
      dividendYield: num(fundamentals.dividend_yield),
      roe: num(fundamentals.roe),
      roa: num(selfPeer?.roa),
      debtToEquity: num(fundamentals.debt_to_equity),
      revenueGrowth: num(fundamentals.revenue_growth_1y, unified['revenue_growth']?.['1Y']),
      earningsGrowth: num(unified['net_income_growth']?.['1Y']),
      // Technical
      week52High: num(fundamentals.high_52w, priceMetrics.high_52w),
      week52Low: num(fundamentals.low_52w, priceMetrics.low_52w),
      rsi14: num(fundamentals.day_rsi14),
      // Profile
      currency: 'INR',
      country: 'India',
      exchange: text(company.exchange),
      industry: text(company.industry),
      description: text(company.about),
      updatedAt: text(quote.updated_at, priceMetrics.as_of, company.updated_at),
      isin: text(company.isin),
      website: text(company.website),
      ceo: text(company.ceo)?.replace(/\s+/g, ' '),
      fullTimeEmployees: num(company.employees),
      ipoDate: text(company.listing_date),
      activelyTrading: yesNo(company.is_active),
      // India market
      nseSymbol: text(company.nse_symbol, company.symbol),
      bseCode: text(company.bse_code),
      basicIndustry: text(company.basic_industry),
      macroSector: text(company.macro_sector),
      marketCapCategory: text(fundamentals.company_classification),
      fnoListed: yesNo(company.is_fno),
      faceValue: num(company.face_value),
      bookValue: num(fundamentals.book_value, priceMetrics.book_value),
      sharesOutstanding: num(priceMetrics.shares_outstanding),
      promoterHolding: num(selfPeer?.promoter_holding),
      roce: num(fundamentals.roce),
      salesTtm: crore(selfPeer?.sales_ttm),
      netProfitTtm: crore(selfPeer?.net_profit_ttm),
      peerMedianPE: num(peers.median?.pe),
      // India growth
      latestQuarter: text(quarterly.latest_quarter),
      salesGrowthQoQ: num(quarterly.sales_qoq),
      salesGrowthYoY: num(quarterly.sales_yoy),
      profitGrowthQoQ: num(quarterly.net_profit_qoq),
      profitGrowthYoY: num(quarterly.net_profit_yoy, fundamentals.yoy_quarterly_profit_growth),
      salesCagr3y: num(growth['Compounded Sales Growth']?.['3 Years']),
      salesCagr5y: num(growth['Compounded Sales Growth']?.['5 Years']),
      profitCagr3y: num(growth['Compounded Profit Growth']?.['3 Years']),
      profitCagr5y: num(growth['Compounded Profit Growth']?.['5 Years']),
      roe3y: num(growth['Return on Equity']?.['3 Years']),
      priceCagr1y: num(growth['Stock Price CAGR']?.['1 Year']),
      priceCagr3y: num(growth['Stock Price CAGR']?.['3 Years']),
      priceCagr5y: num(growth['Stock Price CAGR']?.['5 Years']),
      // India analysts
      analystRatings: ratingsSummary,
      analystBuyPercent: num(ratings.percent_buy),
      analystCount: num(ratings.total_ratings),
      pros: company.pros?.length ? company.pros.join(' • ') : undefined,
      cons: company.cons?.length ? company.cons.join(' • ') : undefined,
    };
    const metrics: Partial<Record<WatchlistMetricKey, string | number>> = { ...item.metrics };
    for (const [key, value] of Object.entries(mapped) as [WatchlistMetricKey, string | number | undefined][]) {
      if (value !== undefined) {
        metrics[key] = value;
      }
    }

    const price = num(quote.price, priceMetrics.price);
    const volume = num(quote.volume, fundamentals.volume);
    const stockType = text(company.stock_type);
    return {
      ...item,
      name: text(company.name, company.display_name) ?? item.name,
      price: price ?? item.price,
      change: num(quote.change_pct) ?? item.change,
      sector: text(company.sector) ?? item.sector,
      assetType: stockType ? stockType.charAt(0) + stockType.slice(1).toLowerCase() : item.assetType,
      volume: volume === undefined ? item.volume : String(volume),
      metrics,
      // Marks the row as loaded and feeds the description dialog.
      profileData: { description: text(company.about) ?? '' },
    };
  }

  private applyFmpProfile(item: WatchlistItem, profile: FmpProfile): WatchlistItem {
    const rawData = this.parseRawProfilePayload(profile.rawPayload, profile.symbol);
    const profileValues = Object.fromEntries(Object.entries(profile).filter(([, value]) =>
      value !== null && value !== undefined && value !== ''));
    const profileData = this.flattenProfileData({ ...rawData, ...profileValues });
    const metricAliases: Partial<Record<WatchlistMetricKey, string[]>> = {
      marketCap: ['marketcap', 'mktcap'],
      changeAmount: ['change'],
      currency: ['currency'],
      exchange: ['exchange', 'exchangeshortname'],
      country: ['country'],
      industry: ['industry'],
      description: ['description'],
      updatedAt: ['updatedat'],
      profileId: ['id'],
      averageVolume: ['averagevolume', 'volavg'],
      beta: ['beta'],
    };
    const metrics: Partial<Record<WatchlistMetricKey, string | number>> = { ...item.metrics };
    for (const [metric, aliases] of Object.entries(metricAliases) as [WatchlistMetricKey, string[]][]) {
      const match = Object.entries(profileData).find(([key]) => aliases.includes(this.normalizeProfileKey(key)));
      if (match) {
        metrics[metric] = match[1];
      }
    }
    const price = this.profileNumber(profile.price ?? rawData['price']);
    const changePercentage = this.profileNumber(profile.changePercentage ?? rawData['changesPercentage'] ?? rawData['changePercentage']);
    const companyName = this.profileString(profile.companyName ?? rawData['companyName']);
    const sector = this.profileString(profile.sector ?? rawData['sector']);
    const volume = this.profileNumber(profile.volume ?? rawData['volume']);
    return {
      ...item,
      symbol: profile.symbol.toUpperCase(),
      name: companyName ?? item.name,
      price: price ?? item.price,
      change: changePercentage ?? item.change,
      sector: sector ?? item.sector,
      volume: volume === undefined ? item.volume : String(volume),
      metrics,
      profileData,
    };
  }

  private parseRawProfilePayload(rawPayload: unknown, symbol: string): Record<string, unknown> {
    if (typeof rawPayload === 'string') {
      try {
        const parsed: unknown = JSON.parse(rawPayload);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : {};
      } catch (error) {
        console.warn(`[FMP Profiles] Could not parse rawPayload for ${symbol}`, error);
        return {};
      }
    }
    return typeof rawPayload === 'object' && rawPayload !== null && !Array.isArray(rawPayload)
      ? rawPayload as Record<string, unknown>
      : {};
  }

  private flattenProfileData(value: Record<string, unknown>, prefix = ''): Record<string, string | number> {
    const data: Record<string, string | number> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'rawPayload' || entry === null || entry === undefined) {
        continue;
      }
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof entry === 'string' || typeof entry === 'number') {
        data[path] = entry;
      } else if (typeof entry === 'boolean') {
        data[path] = entry ? 'Yes' : 'No';
      } else if (typeof entry === 'object' && !Array.isArray(entry)) {
        Object.assign(data, this.flattenProfileData(entry as Record<string, unknown>, path));
      }
    }
    return data;
  }

  private normalizeProfileKey(key: string): string {
    return key.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() ?? '';
  }

  private profileMetric(item: WatchlistItem, key: WatchlistMetricKey): string | number | undefined {
    const aliases: Partial<Record<WatchlistMetricKey, string[]>> = {
      marketCap: ['mktcap'],
      averageVolume: ['volavg'],
      analystTarget: ['analysttargetprice'],
      nextEarnings: ['earningsannouncement'],
    };
    const acceptedKeys = [this.normalizeProfileKey(key), ...(aliases[key] ?? [])];
    const entry = Object.entries(item.profileData ?? {}).find(([profileKey]) =>
      acceptedKeys.includes(this.normalizeProfileKey(profileKey)));
    return entry?.[1];
  }

  private profileNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private profileString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private fmpProfileErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return error instanceof Error ? error.message : 'Unable to load FMP profiles.';
    }
    switch (error.status) {
      case 0: return 'Could not reach the FMP profile service. Check the backend on port 8082.';
      case 400: return 'The profile request contains an invalid or unsupported symbol. Only US-exchange symbols are supported.';
      case 404: return 'The profile service did not find a profile for one or more requested symbols.';
      case 429: return 'The FMP daily request quota has been exhausted. Try again after the quota resets.';
      case 502: return 'The profile backend could not retrieve data from FMP. Try again later.';
      case 503: return 'The FMP profile service is not configured on the backend.';
      default: return `Unable to load FMP profiles (HTTP ${error.status}).`;
    }
  }

  /**
   * Downloads the selected watchlist from the backend in the import format (name in row 1, tickers below).
   * Favorites and session-only lists are not stored on the server, so they are built here in the same format.
   */
  exportCsv(): void {
    const watchlist = this.selectedWatchlist;
    if (this.isFavoritesList || !/^\d+$/.test(watchlist.id)) {
      this.exportCsvLocally();
      return;
    }
    this.isExporting = true;
    this.watchlistExportService.exportWatchlists(this.selectedMarket, environment.currentUserId, watchlist.id).subscribe({
      next: ({ blob, fileName }) => {
        this.isExporting = false;
        this.downloadFile(blob, fileName ?? `${this.selectedMarket.toLowerCase()}-${watchlist.id}.csv`);
        this.statusMessage = `${watchlist.name} exported as CSV.`;
      },
      error: (error: unknown) => {
        console.error(`[Watchlist CSV Export] Failed for watchlist ${watchlist.id}`, error);
        this.isExporting = false;
        this.statusMessage = error instanceof HttpErrorResponse && error.status === 0
          ? 'Could not reach the watchlist service (port 8081) to export the CSV.'
          : error instanceof HttpErrorResponse && error.status === 404
            ? `${watchlist.name} was not found on the server. Reload the page and try again.`
            : 'Exporting the CSV failed. Check the backend logs.';
      },
    });
  }

  private exportCsvLocally(): void {
    const records = [
      [this.selectedWatchlist.name],
      ...this.selectedWatchlist.items.map((item) => [item.symbol]),
    ];
    const csv = records.map((record) => record.map((value) => this.csvEscape(value)).join(',')).join('\r\n') + '\r\n';
    this.downloadFile(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
      `${this.selectedMarket.toLowerCase()}-${this.selectedWatchlist.id}.csv`);
    this.statusMessage = `${this.selectedWatchlist.items.length} assets exported as CSV.`;
  }

  private downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  importCsv(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      this.statusMessage = 'CSV files must be 5 MB or smaller.';
      input.value = '';
      return;
    }
    const market: WatchlistImportMarket = this.selectedMarket === 'US' ? 'USA' : 'India';
    this.isImporting = true;
    this.statusMessage = `Uploading ${file.name} to ${market} watchlists…`;
    this.watchlistImportService.importWatchlists(file, market, environment.currentUserId).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const percent = event.total ? Math.round((event.loaded / event.total) * 100) : undefined;
          this.statusMessage = percent === undefined
            ? `Uploading ${file.name} to ${market} watchlists…`
            : `Uploading ${file.name}: ${percent}%`;
          return;
        }
        if (event instanceof HttpResponse) {
          const response = event.body;
          if (!response) {
            this.statusMessage = 'The server returned an empty import response. Check the backend logs.';
            console.error('[Watchlist CSV Import] Server returned an empty response body', {
              status: event.status,
              url: event.url,
            });
          } else {
            const names = response.watchlistNames.length ? ` Watchlists: ${response.watchlistNames.join(', ')}.` : '';
            this.statusMessage = this.importSummaryMessage(response, market) + names;
            this.loadWatchlists(this.selectedMarket, true);
          }
          this.isImporting = false;
          input.value = '';
        }
      },
      error: (error: unknown) => {
        this.statusMessage = this.importErrorMessage(error);
        console.error('[Watchlist CSV Import] UI import failed', error);
        this.isImporting = false;
        input.value = '';
      },
      complete: () => {
        if (this.isImporting) {
          this.statusMessage = 'The upload ended without a server response. Check the browser console and backend logs.';
          console.error('[Watchlist CSV Import] Request completed without a response event');
          this.isImporting = false;
          input.value = '';
        }
      },
    });
  }

  /** For example: "Imported into USA: 1 new watchlist, 1 existing watchlist updated; 3 symbols added, 2 already present." */
  private importSummaryMessage(response: WatchlistImportResponse, market: WatchlistImportMarket): string {
    const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
    const updated = response.watchlistsUpdated ?? 0;
    const skipped = response.itemsSkipped ?? 0;
    const watchlistParts = [`${plural(response.watchlistsCreated, 'new watchlist')}`];
    if (updated > 0) {
      watchlistParts.push(`${plural(updated, 'existing watchlist')} updated`);
    }
    const symbolParts = [`${plural(response.itemsCreated, 'symbol')} added`];
    if (skipped > 0) {
      symbolParts.push(`${skipped} already present`);
    }
    return `Imported into ${market}: ${watchlistParts.join(', ')}; ${symbolParts.join(', ')}.`;
  }

  private importErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return error instanceof Error && error.name === 'TimeoutError'
        ? 'The server did not respond within 120 seconds. Check that the backend is running and inspect its logs.'
        : error instanceof Error ? error.message : 'Unable to import this CSV file.';
    }
    if (error.status === 0) {
      return 'Unable to reach the watchlist service. Check that the backend is running and try again.';
    }
    if (error.status === 413) {
      return 'The CSV file is larger than the 5 MB limit.';
    }
    const payload: unknown = error.error;
    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }
    if (typeof payload === 'object' && payload !== null) {
      const errorPayload = payload as Record<string, unknown>;
      for (const key of ['message', 'error', 'detail', 'title']) {
        const message = errorPayload[key];
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
    }
    if (error.status === 400) {
      return 'The CSV could not be imported. Check the watchlist names, symbols, and CSV format.';
    }
    return `Unable to import this CSV file (HTTP ${error.status}).`;
  }

  /** Loads every watchlist of the market (all API pages) together with the saved table columns. */
  private loadWatchlists(market: WatchlistMarket, preserveStatusMessage = false): void {
    const requestId = ++this.watchlistRequestId;
    this.isLoadingWatchlists = true;
    this.watchlists = [];
    this.selectedWatchlistId = '';
    this.currentPage = 1;
    if (!preserveStatusMessage) {
      this.statusMessage = '';
    }

    // The table is drawn only after both arrive, so rows always appear with the saved columns and order.
    const columnsRequestId = ++this.columnPreferencesRequestId;
    forkJoin({
      page: this.fetchAllWatchlistPages(0, market),
      columnKeys: this.fetchColumnPreferences(),
    }).subscribe({
      next: ({ page: response, columnKeys }) => {
        if (requestId !== this.watchlistRequestId) {
          return;
        }
        if (columnsRequestId === this.columnPreferencesRequestId) {
          this.visibleColumnKeys = columnKeys;
        }
        this.applyWatchlistPage(response, market);
      },
      error: (error: unknown) => {
        if (requestId !== this.watchlistRequestId) {
          return;
        }
        this.watchlists = [];
        this.selectedWatchlistId = '';
        this.isLoadingWatchlists = false;
        console.error('[Watchlists] Failed to load watchlists', error);
        this.statusMessage = error instanceof HttpErrorResponse && error.status === 0
          ? 'Unable to reach the watchlist service. Check that the backend is running.'
          : error instanceof HttpErrorResponse
            ? `Unable to load watchlists (HTTP ${error.status}).`
            : 'Unable to load watchlists. Please try again.';
      },
    });
  }

  /** Fetches `firstPage`, then any later pages, and merges them into one response. */
  private fetchAllWatchlistPages(firstPage: number, market: WatchlistMarket): Observable<WatchlistPageResponse> {
    return this.watchlistsService.getWatchlists(firstPage, this.watchlistPageSize, market).pipe(
      switchMap((first) => {
        const remainingPages = Array.from(
          { length: Math.max(0, first.totalPages - first.page - 1) },
          (_, index) => first.page + index + 1,
        );
        if (!remainingPages.length) {
          return of(first);
        }
        return forkJoin(remainingPages.map((pageNumber) =>
          this.watchlistsService.getWatchlists(pageNumber, this.watchlistPageSize, market))).pipe(
          map((rest) => ({ ...first, content: [...first.content, ...rest.flatMap((response) => response.content)] })),
        );
      }),
    );
  }

  private applyWatchlistPage(response: WatchlistPageResponse, market: WatchlistMarket): void {
    const watchlists: WatchlistGroup[] = response.content.map((watchlist) => ({
      id: String(watchlist.id),
      name: watchlist.name,
      market: watchlist.market,
      currency: watchlist.currency,
      isFavorite: watchlist.isFavorite === true,
      items: watchlist.items.map((item) => ({
        symbol: item.symbol,
        name: item.name,
      })),
    }));
    const apiFavoriteSymbols = response.content.flatMap((watchlist) =>
      watchlist.items.filter((item) => item.isFavorite).map((item) => item.symbol));
    this.favoriteSymbolsByMarket[market] = new Set([
      ...this.favoriteSymbolsByMarket[market],
      ...apiFavoriteSymbols,
    ]);
    // Keep the server's order (favorites first, then the rest).
    this.watchlists = watchlists;
    // USA preselects the hardcoded default (TOP) wherever it sits in the list; otherwise the first watchlist.
    const defaultWatchlist = market === 'US'
      ? this.watchlists.find((watchlist) => this.isDefaultWatchlist(watchlist))
      : undefined;
    this.selectedWatchlistId = (defaultWatchlist ?? this.watchlists[0])?.id ?? '';
    this.resetSortToMarketCap();
    this.isLoadingWatchlists = false;
    this.currentPage = 1;
    this.loadFmpProfiles();
  }

  /** Same order as the backend: favorites first, then by id. */
  private sortFavoritesFirst(watchlists: WatchlistGroup[]): WatchlistGroup[] {
    return [...watchlists].sort((first, second) =>
      Number(second.isFavorite === true) - Number(first.isFavorite === true)
      || Number(first.id) - Number(second.id));
  }

  private loadFavorites(): void {
    const storedSymbols = this.readStoredRecord(FAVORITE_SYMBOLS_STORAGE_KEY);
    this.favoriteSymbolsByMarket = {
      US: new Set(storedSymbols.US ?? []),
      India: new Set(storedSymbols.India ?? []),
    };
  }

  /**
   * Fetches the user's saved columns (sorted by displayOrder). Never errors: a 404 means the user has
   * not saved any yet, and any other failure is logged; both fall back to the default columns.
   */
  private fetchColumnPreferences(): Observable<WatchlistColumnKey[]> {
    return this.columnPreferencesService.getPreferences(environment.currentUserId).pipe(
      map((response) => {
        const savedColumns = this.columnKeysFromResponse(response);
        return savedColumns.length ? savedColumns : [...DEFAULT_COLUMN_KEYS];
      }),
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse && error.status === 404)) {
          console.error('[Watchlist columns] Failed to load column preferences; showing default columns', error);
        }
        return of([...DEFAULT_COLUMN_KEYS]);
      }),
    );
  }

  /** Sorts by displayOrder and drops keys this UI no longer knows about. */
  private columnKeysFromResponse(response: WatchlistColumnPreferencesResponse | null): WatchlistColumnKey[] {
    const columns = Array.isArray(response?.columns) ? response.columns : [];
    return this.validColumnKeys([...columns]
      .sort((first, second) => first.displayOrder - second.displayOrder)
      .map((column) => column.columnKey));
  }

  private validColumnKeys(keys: string[]): WatchlistColumnKey[] {
    const validKeys = new Set<string>(this.availableColumns.map((column) => column.key));
    return [...new Set(keys)].filter((key): key is WatchlistColumnKey => validKeys.has(key));
  }

  private readStoredRecord(key: string): Partial<Record<WatchlistMarket, string[]>> {
    const value = localStorage.getItem(key);
    if (!value) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== 'object' || parsed === null) {
        return {};
      }
      const record = parsed as Record<string, unknown>;
      return {
        US: Array.isArray(record['US']) && record['US'].every((item) => typeof item === 'string') ? record['US'] as string[] : [],
        India: Array.isArray(record['India']) && record['India'].every((item) => typeof item === 'string') ? record['India'] as string[] : [],
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {};
      }
      throw error;
    }
  }

  private persistFavorites(): void {
    localStorage.setItem(FAVORITE_SYMBOLS_STORAGE_KEY, JSON.stringify({
      US: [...this.favoriteSymbolsByMarket.US],
      India: [...this.favoriteSymbolsByMarket.India],
    }));
  }

  /**
   * Same rules as the server export: a cell starting with =, +, -, @, tab or carriage return gets a leading
   * apostrophe so spreadsheets show it as plain text rather than a formula or hyperlink (the import removes it),
   * then RFC 4180 quoting is applied.
   */
  private csvEscape(value: string): string {
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
}
