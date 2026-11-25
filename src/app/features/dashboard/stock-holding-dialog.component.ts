import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, OnInit, computed, inject, input, output,
  signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, Subscription, catchError, debounceTime, distinctUntilChanged, finalize, map, of, switchMap, tap, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { currencyOf } from '../../core/models/portfolio-entries.models';
import { StockHolding, StockHoldingAssetType } from '../../core/models/stock-holdings.models';
import { WatchlistMarket } from '../../core/models/wealth.models';
import { apiErrorMessage } from '../../core/services/api-error';
import { NseSymbolsService } from '../../core/services/nse-symbols.service';
import { SectorsService } from '../../core/services/sectors.service';
import { StockHoldingsService } from '../../core/services/stock-holdings.service';
import { UsSymbolsService } from '../../core/services/us-symbols.service';
import { currencySymbol, parseDecimal } from './dashboard-format';

const SEARCH_DEBOUNCE_MS = 250;
const SUGGESTION_LIMIT = 8;
const MAX_INTEGER_DIGITS = 12;
const MAX_QUANTITY_DECIMALS = 8;
const MAX_COST_DECIMALS = 6;
/** US symbols that FMP can price; preferred shares such as ABR$D are left out. */
const PRICEABLE_US_SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const SECTOR_LOOKUP_TIMEOUT_MS = 10_000;

interface SymbolChoice {
  symbol: string;
  name: string;
  assetType: StockHoldingAssetType;
}

/** Adds a holding (pick a symbol first) or changes the sector, quantity and average cost of an existing one. */
@Component({
  selector: 'app-stock-holding-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dashboard-dialog narrow" aria-labelledby="holding-dialog-title" (cancel)="requestClose($event)"
      (keydown.escape)="requestClose($event)" (close)="onNativeClose()">
      <header class="dialog-header">
        <div>
          <span class="eyebrow">{{ market() }} · {{ currency() }}</span>
          <h2 id="holding-dialog-title">{{ holding() ? 'Edit ' + holding()?.symbol : 'Add stock or ETF' }}</h2>
        </div>
        <button type="button" class="dialog-close" aria-label="Close holding dialog" (click)="requestClose()">×</button>
      </header>
      <form class="holding-form" (submit)="save($event)" novalidate>
        @if (choice(); as chosen) {
          <p class="chosen">
            <span><strong>{{ chosen.symbol }}</strong> {{ chosen.name }} · {{ chosen.assetType === 'ETF' ? 'ETF' : 'Stock' }}</span>
            @if (!holding()) { <button type="button" class="secondary-button" (click)="clearChoice()">Change</button> }
          </p>
        } @else {
          <div class="symbol-search">
            <label>Ticker symbol or company name
              <input #searchInput type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="symbol-options"
                [attr.aria-expanded]="isListOpen()" [attr.aria-activedescendant]="isListOpen() && activeIndex() >= 0 ? 'symbol-option-' + activeIndex() : null"
                [value]="searchText()" (input)="updateSearch($event)" (keydown)="onSearchKey($event)"
                (focus)="listClosed.set(false)" (blur)="listClosed.set(true)"
                [placeholder]="market() === 'India' ? 'e.g. RELIANCE or Tata' : 'e.g. AAPL or Apple'">
            </label>
            <!-- mousedown is prevented so that the input keeps the focus until the click picks an option. -->
            <div class="symbol-options" id="symbol-options" role="listbox" aria-label="Matching symbols" [hidden]="!isListOpen()"
              (mousedown)="$event.preventDefault()">
              @for (suggestion of suggestions(); track suggestion.symbol; let index = $index) {
                <div class="symbol-option" role="option" [id]="'symbol-option-' + index" [class.active]="index === activeIndex()"
                  [attr.aria-selected]="index === activeIndex()" (mouseenter)="activeIndex.set(index)" (click)="choose(suggestion)">
                  <strong>{{ suggestion.symbol }}</strong>
                  <small>{{ suggestion.name }} · {{ suggestion.assetType === 'ETF' ? 'ETF' : 'Stock' }}</small>
                </div>
              }
            </div>
            <p class="dialog-note" role="status">{{ searchStatus() }}</p>
          </div>
        }
        <label>Sector
          <select (change)="pickSector($event)">
            <option value="" [selected]="!sector()">No sector</option>
            @if (suggestedSectors().length) {
              <optgroup [label]="'Suggested for ' + choice()?.symbol">
                @for (name of suggestedSectors(); track name) { <option [value]="name" [selected]="name === sector()">{{ name }}</option> }
              </optgroup>
            }
            <optgroup label="All sectors">
              @for (name of otherSectors(); track name) { <option [value]="name" [selected]="name === sector()">{{ name }}</option> }
            </optgroup>
          </select>
        </label>
        <p class="dialog-note sector-note" role="status">{{ sectorLookup() }}</p>
        @if (sectorError()) {
          <p class="dialog-error" role="status">{{ sectorError() }}
            <button type="button" class="secondary-button" (click)="loadSectors()">Try again</button></p>
        }
        <label>Quantity (optional)
          <input type="text" inputmode="decimal" autocomplete="off" [value]="quantity()" (input)="quantity.set(textOf($event))">
        </label>
        <label>Average buy price per share ({{ currency() }})
          <span class="money-field"><span aria-hidden="true">{{ symbol() }}</span>
          <input type="text" inputmode="decimal" autocomplete="off" [value]="averageCost()" (input)="averageCost.set(textOf($event))"></span>
        </label>
        <p class="dialog-hint">For several purchases, enter the total quantity and the average price. Without a quantity, value and profit are shown as —.</p>
        @if (error()) { <p class="dialog-error" role="alert">{{ error() }}</p> }
        <footer class="dialog-actions">
          <button type="button" class="secondary-button" (click)="requestClose()">Cancel</button>
          <button type="submit" class="primary-button" [disabled]="saving() || lookingUpSector()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </footer>
      </form>
    </dialog>
  `,
  styles: [`
    .holding-form { display:grid; gap:12px; }
    .holding-form label { display:grid; gap:5px; color:var(--muted); font-size:.72rem; }
    .chosen { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0; font-size:.82rem; }
    .symbol-search { position:relative; }
    .symbol-search .dialog-note { margin:6px 0 0; }
    .symbol-options { position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:2; max-height:240px; padding:5px; overflow:auto; border:1px solid var(--border); border-radius:7px; background:var(--panel-raised); box-shadow:0 12px 30px #000a; }
    .symbol-search:has(.dialog-note:empty) .dialog-note { display:none; }
    .sector-note { margin:0; }
    .sector-note:empty { display:none; }
    .symbol-option { padding:8px 10px; border-radius:5px; color:var(--text); font-size:.8rem; cursor:pointer; }
    .symbol-option.active { background:color-mix(in srgb, var(--primary) 22%, transparent); }
    .symbol-option small { display:block; margin-top:3px; color:var(--muted); font-size:.68rem; }
  `],
})
export class StockHoldingDialogComponent implements OnInit, AfterViewInit {
  readonly market = input.required<WatchlistMarket>();
  /** The holding to edit; null to add one. */
  readonly holding = input<StockHolding | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  readonly currency = computed(() => currencyOf(this.market()));
  readonly symbol = computed(() => currencySymbol(this.currency()));
  readonly choice = signal<SymbolChoice | null>(null);
  readonly searchText = signal('');
  readonly searchStatus = signal('');
  readonly suggestions = signal<SymbolChoice[]>([]);
  /** Option the arrow keys are on; -1 for none. */
  readonly activeIndex = signal(-1);
  readonly listClosed = signal(false);
  readonly isListOpen = computed(() => !this.listClosed() && this.suggestions().length > 0);
  readonly sector = signal('');
  readonly sectorNames = signal<string[]>([]);
  /** Sectors the picked stock is listed under. */
  readonly suggestedSectors = signal<string[]>([]);
  readonly sectorError = signal('');
  /** Save waits for the lookup, so that the sector is not left out. */
  readonly lookingUpSector = signal(false);
  /** Progress or outcome of looking up the picked stock's sector. */
  readonly sectorLookup = signal('');
  /** Includes a saved sector that is not in the list, so that editing does not drop it. */
  readonly otherSectors = computed(() => {
    const names = this.sectorNames().filter((name) => !this.suggestedSectors().includes(name));
    const saved = this.sector();
    return !saved || names.includes(saved) || this.suggestedSectors().includes(saved) ? names : [saved, ...names];
  });
  readonly quantity = signal('');
  readonly averageCost = signal('');
  readonly error = signal('');
  readonly saving = signal(false);

  private readonly stockHoldingsService = inject(StockHoldingsService);
  private readonly nseSymbolsService = inject(NseSymbolsService);
  private readonly usSymbolsService = inject(UsSymbolsService);
  private readonly sectorsService = inject(SectorsService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly search$ = new Subject<string>();
  private sectorPicked = false;
  private suggestionSubscription?: Subscription;

  ngOnInit(): void {
    const holding = this.holding();
    if (holding) {
      this.choice.set({ symbol: holding.symbol, name: holding.name, assetType: holding.assetType });
      this.sector.set(holding.sector ?? '');
      this.sectorPicked = !!holding.sector;
      this.quantity.set(holding.quantity === null || holding.quantity === undefined ? '' : plainNumber(holding.quantity));
      this.loadSuggestedSectors(holding.symbol, holding.assetType);
      this.averageCost.set(plainNumber(holding.averageCost));
    }
    this.watchSearch();
    this.loadSectors();
  }

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
    this.dialog().nativeElement.querySelector('input')?.focus();
  }

  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  updateSearch(event: Event): void {
    this.searchText.set(this.textOf(event));
    this.listClosed.set(false);
    this.activeIndex.set(-1);
    this.search$.next(this.searchText().trim());
  }

  /** Arrow keys move through the list, Enter picks and Escape closes the list but not the dialog. */
  onSearchKey(event: KeyboardEvent): void {
    if (!this.isListOpen()) {
      if (event.key === 'ArrowDown') {
        this.listClosed.set(false);
      }
      return;
    }
    const count = this.suggestions().length;
    switch (event.key) {
      case 'ArrowDown':
        this.moveTo((this.activeIndex() + 1) % count);
        break;
      case 'ArrowUp':
        this.moveTo(this.activeIndex() <= 0 ? count - 1 : this.activeIndex() - 1);
        break;
      case 'Enter':
        this.choose(this.suggestions()[Math.max(this.activeIndex(), 0)]);
        break;
      case 'Escape':
        event.stopPropagation();
        this.listClosed.set(true);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  choose(choice: SymbolChoice): void {
    this.choice.set(choice);
    this.error.set('');
    this.loadSuggestedSectors(choice.symbol, choice.assetType);
    // The search field, which had the focus, is gone.
    this.dialog().nativeElement.querySelector('select')?.focus();
  }

  clearChoice(): void {
    this.suggestionSubscription?.unsubscribe();
    this.choice.set(null);
    this.suggestedSectors.set([]);
    this.sectorLookup.set('');
    this.sector.set('');
    this.sectorPicked = false;
    // Renders the search field now, so that it can take the focus.
    this.changeDetector.detectChanges();
    this.searchInput()?.nativeElement.focus();
    this.searchInput()?.nativeElement.select();
  }

  pickSector(event: Event): void {
    this.sector.set((event.target as HTMLSelectElement).value);
    this.sectorPicked = true;
  }

  loadSectors(): void {
    this.sectorError.set('');
    this.sectorsService.listSectorNames(this.market()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (names) => this.sectorNames.set(names),
      error: () => this.sectorError.set('Sectors could not be loaded. Check that the market data service (port 8082) is running.'),
    });
  }

  save(event: Event): void {
    event.preventDefault();
    if (this.saving() || this.lookingUpSector()) {
      return;
    }
    const choice = this.choice();
    const hasQuantity = this.quantity().trim() !== '';
    const quantity = hasQuantity ? parseDecimal(this.quantity(), MAX_INTEGER_DIGITS, MAX_QUANTITY_DECIMALS) : null;
    const averageCost = parseDecimal(this.averageCost(), MAX_INTEGER_DIGITS, MAX_COST_DECIMALS);
    if (!choice) {
      this.error.set('Pick a stock or ETF from the search results.');
      return;
    }
    if (hasQuantity && !quantity) {
      this.error.set('Quantity must be a number above 0, with at most 8 decimals, or blank.');
      return;
    }
    if (averageCost === null) {
      this.error.set('Average buy price must be a number of 0 or more, with at most 6 decimals.');
      return;
    }
    this.error.set('');
    this.saving.set(true);
    this.saveHolding(choice, quantity, averageCost).subscribe({
      next: () => this.saved.emit(),
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error, 'The holding could not be saved.'));
      },
    });
  }

  /** The browser may close the dialog without a cancelable event; keep the component in step with it. */
  onNativeClose(): void {
    if (this.saving()) {
      this.dialog().nativeElement.showModal();
    } else {
      this.closed.emit();
    }
  }

  requestClose(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) {
      this.closed.emit();
    }
  }

  private saveHolding(choice: SymbolChoice, quantity: number | null, averageCost: number): Observable<StockHolding> {
    const holding = this.holding();
    const sector = this.sector() || null;
    return holding
      ? this.stockHoldingsService.updateHoldingPosition(
        environment.currentUserId, this.market(), holding.id, { quantity, averageCost, sector })
      : this.stockHoldingsService.createHolding(
        environment.currentUserId, this.market(), { ...choice, quantity, averageCost, sector });
  }

  private moveTo(index: number): void {
    this.activeIndex.set(index);
    document.getElementById(`symbol-option-${index}`)?.scrollIntoView({ block: 'nearest' });
  }

  /** Fills in the stock's default sector unless the user picked one. */
  private loadSuggestedSectors(symbol: string, assetType: StockHoldingAssetType): void {
    this.suggestionSubscription?.unsubscribe();
    this.lookingUpSector.set(true);
    this.sectorLookup.set('Looking up the sector…');
    this.suggestionSubscription = this.sectorsService.findSectorsOfStock(this.market(), symbol, assetType).pipe(
      timeout(SECTOR_LOOKUP_TIMEOUT_MS),
      finalize(() => this.lookingUpSector.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ names, profileMissing }) => {
        this.sectorLookup.set(!names.length ? `No sector is saved for ${symbol}. Pick one from the list.`
          : profileMissing ? `The ${this.market() === 'India' ? 'Tapetide' : 'FMP'} profile of ${symbol} is not available; filled in from your own sector list.` : '');
        this.suggestedSectors.set(names);
        if (names.length && !this.sectorPicked) {
          this.sector.set(names[0]);
        }
      },
      error: () => this.sectorLookup.set(`The sector of ${symbol} could not be looked up. Pick one from the list.`),
    });
  }

  private watchSearch(): void {
    this.search$.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      tap((query) => this.searchStatus.set(query ? 'Searching…' : '')),
      switchMap((query) => !query ? of({ choices: [] as SymbolChoice[], status: '' }) : this.findSymbols(query).pipe(
        map((choices) => ({ choices, status: choices.length ? '' : `No symbols match “${query}”.` })),
        catchError(() => of({ choices: [] as SymbolChoice[], status: 'Symbol search is not available right now.' })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ choices, status }) => {
      this.suggestions.set(choices);
      this.searchStatus.set(status);
    });
  }

  private findSymbols(query: string): Observable<SymbolChoice[]> {
    const symbols$: Observable<{ symbol: string; name: string | null; type: 'EQUITY' | 'ETF' }[]> =
      this.market() === 'India'
        ? this.nseSymbolsService.search(query, SUGGESTION_LIMIT)
        : this.usSymbolsService.search(query, SUGGESTION_LIMIT);
    return symbols$.pipe(map((symbols) => symbols
      .filter((symbol) => this.market() === 'India' || PRICEABLE_US_SYMBOL.test(symbol.symbol))
      .map((symbol) => ({
        symbol: symbol.symbol,
        name: (symbol.name ?? symbol.symbol).slice(0, 160),
        assetType: symbol.type === 'ETF' ? 'ETF' : 'STOCK',
      }))));
  }
}

/** Without exponent notation, so that a very small number can be saved again. */
function plainNumber(value: number): string {
  return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 8 });
}
