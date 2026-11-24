import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, inject, input, output,
  signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { currencyOf } from '../../core/models/portfolio-entries.models';
import { StockHolding, StockHoldingAssetType } from '../../core/models/stock-holdings.models';
import { WatchlistMarket } from '../../core/models/wealth.models';
import { apiErrorMessage } from '../../core/services/api-error';
import { NseSymbolsService } from '../../core/services/nse-symbols.service';
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

interface SymbolChoice {
  symbol: string;
  name: string;
  assetType: StockHoldingAssetType;
}

/** Adds a holding (pick a symbol first) or changes the quantity and average cost of an existing one. */
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
          <label>Ticker or company name
            <input type="text" autocomplete="off" [value]="searchText()" (input)="updateSearch($event)"
              [placeholder]="market() === 'India' ? 'e.g. RELIANCE' : 'e.g. AAPL'">
          </label>
          <p class="dialog-note" role="status">{{ searchStatus() }}</p>
          <div class="suggestions">
            @for (suggestion of suggestions(); track suggestion.symbol) {
              <button type="button" class="suggestion" (click)="choose(suggestion)">
                <strong>{{ suggestion.symbol }}</strong>
                <small>{{ suggestion.name }} · {{ suggestion.assetType === 'ETF' ? 'ETF' : 'Stock' }}</small>
              </button>
            }
          </div>
        }
        <label>Quantity
          <input type="text" inputmode="decimal" autocomplete="off" [value]="quantity()" (input)="quantity.set(textOf($event))">
        </label>
        <label>Average buy price per share ({{ currency() }})
          <span class="money-field"><span aria-hidden="true">{{ symbol() }}</span>
          <input type="text" inputmode="decimal" autocomplete="off" [value]="averageCost()" (input)="averageCost.set(textOf($event))"></span>
        </label>
        <p class="dialog-hint">For several purchases, enter the total quantity and the average price.</p>
        @if (error()) { <p class="dialog-error" role="alert">{{ error() }}</p> }
        <footer class="dialog-actions">
          <button type="button" class="secondary-button" (click)="requestClose()">Cancel</button>
          <button type="submit" class="primary-button" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </footer>
      </form>
    </dialog>
  `,
  styles: [`
    .holding-form { display:grid; gap:12px; }
    .holding-form label { display:grid; gap:5px; color:var(--muted); font-size:.72rem; }
    .chosen { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0; font-size:.82rem; }
    .suggestions { display:grid; gap:6px; max-height:230px; overflow:auto; }
    .suggestion { padding:8px 10px; border:1px solid var(--border); border-radius:5px; background:var(--panel-raised); color:var(--text); text-align:left; }
    .suggestion:hover { border-color:var(--primary); }
    .suggestion small { display:block; margin-top:3px; color:var(--muted); font-size:.68rem; }
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
  readonly quantity = signal('');
  readonly averageCost = signal('');
  readonly error = signal('');
  readonly saving = signal(false);

  private readonly stockHoldingsService = inject(StockHoldingsService);
  private readonly nseSymbolsService = inject(NseSymbolsService);
  private readonly usSymbolsService = inject(UsSymbolsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search$ = new Subject<string>();

  ngOnInit(): void {
    const holding = this.holding();
    if (holding) {
      this.choice.set({ symbol: holding.symbol, name: holding.name, assetType: holding.assetType });
      this.quantity.set(plainNumber(holding.quantity));
      this.averageCost.set(plainNumber(holding.averageCost));
    }
    this.watchSearch();
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
    this.search$.next(this.searchText().trim());
  }

  choose(choice: SymbolChoice): void {
    this.choice.set(choice);
    this.error.set('');
  }

  clearChoice(): void {
    this.choice.set(null);
  }

  save(event: Event): void {
    event.preventDefault();
    if (this.saving()) {
      return;
    }
    const choice = this.choice();
    const quantity = parseDecimal(this.quantity(), MAX_INTEGER_DIGITS, MAX_QUANTITY_DECIMALS);
    const averageCost = parseDecimal(this.averageCost(), MAX_INTEGER_DIGITS, MAX_COST_DECIMALS);
    if (!choice) {
      this.error.set('Pick a stock or ETF from the search results.');
      return;
    }
    if (!quantity) {
      this.error.set('Quantity must be a number above 0, with at most 8 decimals.');
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

  private saveHolding(choice: SymbolChoice, quantity: number, averageCost: number): Observable<StockHolding> {
    const holding = this.holding();
    return holding
      ? this.stockHoldingsService.updateHoldingPosition(
        environment.currentUserId, this.market(), holding.id, { quantity, averageCost })
      : this.stockHoldingsService.createHolding(
        environment.currentUserId, this.market(), { ...choice, quantity, averageCost });
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
