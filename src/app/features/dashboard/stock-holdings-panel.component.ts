import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, filter, interval } from 'rxjs';
import { environment } from '../../../environments/environment';
import { currencyOf } from '../../core/models/portfolio-entries.models';
import { HoldingPrice, StockHolding } from '../../core/models/stock-holdings.models';
import { WatchlistMarket } from '../../core/models/wealth.models';
import { apiErrorMessage } from '../../core/services/api-error';
import { HoldingPricesService } from '../../core/services/holding-prices.service';
import { StockHoldingsService } from '../../core/services/stock-holdings.service';
import { MISSING, formatMoney, formatQuantity, formatSignedMoney, formatSignedPercent, gainClass } from './dashboard-format';
import { toHoldingRow, totalHoldings } from './holding-calculations';
import { HoldingsState } from './sector-allocation-calculations';
import { StockHoldingDialogComponent } from './stock-holding-dialog.component';

const INDIA_REFRESH_MS = 60_000;

/** One country's stocks and ETFs, valued with the latest prices of folio-market-feed-svc. */
@Component({
  selector: 'app-stock-holdings-panel',
  standalone: true,
  imports: [StockHoldingDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card holdings-panel" [attr.aria-labelledby]="headingId()">
      <div class="holdings-header">
        <div>
          <span class="eyebrow">{{ currency() }} · detail view, not added to net worth</span>
          <h2 [id]="headingId()">{{ market() }} stocks &amp; ETFs portfolio</h2>
          <p class="price-note">{{ priceNote() }}</p>
        </div>
        <div class="holdings-actions">
          <button type="button" class="secondary-button" [disabled]="!holdings().length || loadingPrices()"
            [attr.aria-label]="'Refresh ' + market() + ' prices'" (click)="loadPrices()">
            {{ loadingPrices() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button type="button" class="primary-button" [attr.aria-label]="'Add ' + market() + ' stock or ETF'"
            (click)="openDialog(null)">＋ Add</button>
        </div>
      </div>

      @if (error()) {
        <p class="dialog-error" role="alert">{{ error() }}
          <button type="button" class="secondary-button" (click)="loadHoldings()">Try again</button></p>
      }
      @if (priceError()) { <p class="dialog-error" role="status">{{ priceError() }}</p> }

      @if (rows().length) {
        <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="market() + ' stocks and ETFs table'">
          <table>
            <thead>
              <tr>
                <th>Symbol</th><th>Name</th><th>Type</th><th>Sector</th><th class="num">Quantity</th>
                <th class="num">Avg buy price</th><th class="num">Invested</th><th class="num">{{ market() === 'India' ? 'Live price' : 'Price' }}</th><th class="num">Day change</th>
                <th class="num">Current value</th><th class="num">Profit</th><th class="num">Profit %</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.holding.id) {
                <tr>
                  <td><strong>{{ row.holding.symbol }}</strong></td>
                  <td class="name">{{ row.holding.name }}</td>
                  <td>{{ row.holding.assetType === 'ETF' ? 'ETF' : 'Stock' }}</td>
                  <td>{{ row.holding.sector || missing }}</td>
                  <td class="num">{{ quantity(row.holding.quantity) }}</td>
                  <td class="num">{{ money(row.holding.averageCost) }}</td>
                  <td class="num">{{ money(row.invested) }}</td>
                  <td class="num">{{ money(row.price) }}<small class="as-of">{{ row.asOf ?? missing }}</small></td>
                  <td class="num" [class]="gain(row.dayChangePercent)">{{ percent(row.dayChangePercent) }}</td>
                  <td class="num">{{ money(row.currentValue) }}</td>
                  <td class="num" [class]="gain(row.profit)">{{ signedMoney(row.profit) }}</td>
                  <td class="num" [class]="gain(row.profitPercent)">{{ percent(row.profitPercent) }}</td>
                  <td><div class="row-actions">
                    <button type="button" class="edit-button" [attr.aria-label]="'Edit ' + row.holding.symbol"
                      (click)="openDialog(row.holding)">Edit</button>
                    <button type="button" class="secondary-button" [attr.aria-label]="'Remove ' + row.holding.symbol"
                      [disabled]="removingId() === row.holding.id" (click)="remove(row.holding)">Remove</button>
                  </div></td>
                </tr>
              }
            </tbody>
            @if (totals(); as total) {
              <tfoot>
                <tr>
                  <td colspan="6"><strong>Total</strong>
                    @if (total.valuedCount < total.count) {
                      <span class="price-note"> · {{ total.count - total.valuedCount }} of {{ total.count }} have no price or quantity and are left out</span>
                    }
                  </td>
                  <td class="num"><strong>{{ money(total.invested) }}</strong></td>
                  <td colspan="2"></td>
                  <td class="num"><strong>{{ money(total.currentValue) }}</strong></td>
                  <td class="num" [class]="gain(total.profit)"><strong>{{ signedMoney(total.profit) }}</strong></td>
                  <td class="num" [class]="gain(total.profit)"><strong>{{ percent(total.profitPercent) }}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
      } @else if (loading()) {
        <p class="price-note" role="status">Loading {{ market() }} holdings…</p>
      } @else if (!error()) {
        <p class="price-note">No {{ market() }} stocks or ETFs yet. Use Add to enter what you hold.</p>
      }
    </section>

    @if (dialogOpen()) {
      <app-stock-holding-dialog [market]="market()" [holding]="editedHolding()"
        (closed)="dialogOpen.set(false)" (saved)="onSaved()"></app-stock-holding-dialog>
    }
  `,
  styles: [`
    .holdings-panel { padding:20px; margin-bottom:18px; }
    .holdings-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
    .holdings-header h2 { margin:7px 0 0; font-size:1.2rem; }
    .holdings-actions,.row-actions { display:flex; gap:7px; }
    .price-note { margin:6px 0 0; color:var(--muted); font-size:.74rem; }
    .num { text-align:right; white-space:nowrap; }
    .name { min-width:105px; }
    .as-of { display:block; margin-top:3px; color:var(--muted); font-size:.64rem; }
    th,td { padding:11px 6px; }
    @media(max-width:620px) { .holdings-panel { padding:15px; } .holdings-header { flex-direction:column; } }
  `],
})
export class StockHoldingsPanelComponent implements OnInit {
  readonly market = input.required<WatchlistMarket>();

  readonly missing = MISSING;
  readonly holdings = signal<StockHolding[]>([]);
  readonly loading = signal(true);
  readonly loadingPrices = signal(false);
  readonly error = signal('');
  readonly priceError = signal('');
  readonly removingId = signal<number | null>(null);
  readonly dialogOpen = signal(false);
  readonly editedHolding = signal<StockHolding | null>(null);
  private readonly pricesBySymbol = signal<ReadonlyMap<string, HoldingPrice>>(new Map());

  readonly currency = computed(() => currencyOf(this.market()));
  readonly headingId = computed(() => `holdings-${this.market().toLowerCase()}`);
  readonly priceNote = computed(() => this.market() === 'India'
    ? 'Live NSE prices from Upstox, refreshed every minute while the market is open.'
    : 'Prices from FMP, refreshed at most once a day. The time is shown under each price.');
  readonly rows = computed(() =>
    this.holdings().map((holding) => toHoldingRow(holding, this.pricesBySymbol().get(holding.symbol))));
  readonly totals = computed(() => totalHoldings(this.rows()));
  /** For the sector allocation, which shows the same holdings. */
  readonly state = computed<HoldingsState>(() => ({
    rows: this.rows(), loading: this.loading(), failed: !!this.error() && !this.holdings().length,
  }));

  private readonly stockHoldingsService = inject(StockHoldingsService);
  private readonly holdingPricesService = inject(HoldingPricesService);
  private readonly destroyRef = inject(DestroyRef);
  private priceSubscription?: Subscription;

  ngOnInit(): void {
    this.loadHoldings();
    if (this.market() === 'India') {
      interval(INDIA_REFRESH_MS).pipe(
        filter(() => !document.hidden && !this.loadingPrices() && this.holdingPricesService.isNseOpen()),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(() => this.loadPrices());
    }
  }

  money(value: number | null): string {
    return formatMoney(value, this.currency());
  }

  signedMoney(value: number | null): string {
    return formatSignedMoney(value, this.currency());
  }

  percent(value: number | null): string {
    return formatSignedPercent(value);
  }

  quantity(value: number | null | undefined): string {
    return formatQuantity(value);
  }

  gain(value: number | null): string {
    return gainClass(value);
  }

  openDialog(holding: StockHolding | null): void {
    this.editedHolding.set(holding);
    this.dialogOpen.set(true);
  }

  onSaved(): void {
    this.dialogOpen.set(false);
    this.loadHoldings();
  }

  remove(holding: StockHolding): void {
    if (!window.confirm(`Remove ${holding.symbol} from your ${this.market()} holdings?`)) {
      return;
    }
    this.removingId.set(holding.id);
    this.stockHoldingsService.deleteHolding(environment.currentUserId, this.market(), holding.id).subscribe({
      next: () => {
        this.removingId.set(null);
        this.loadHoldings();
      },
      error: (error: unknown) => {
        this.removingId.set(null);
        this.error.set(apiErrorMessage(error, `${holding.symbol} could not be removed.`));
      },
    });
  }

  loadHoldings(): void {
    this.loading.set(true);
    this.error.set('');
    this.stockHoldingsService.listHoldings(environment.currentUserId, this.market())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (holdings) => {
          this.loading.set(false);
          this.holdings.set(holdings);
          this.loadPrices();
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(apiErrorMessage(error, `${this.market()} holdings could not be loaded.`));
        },
      });
  }

  /** Keeps the last known prices on screen while loading and when the request fails. */
  loadPrices(): void {
    this.priceSubscription?.unsubscribe();
    this.loadingPrices.set(true);
    this.priceSubscription = this.holdingPricesService
      .getPrices(this.market(), this.holdings().map((holding) => holding.symbol))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (prices) => {
          this.priceError.set('');
          this.pricesBySymbol.update((current) =>
            new Map([...current, ...prices.map((price): [string, HoldingPrice] => [price.symbol, price])]));
        },
        error: () => {
          this.loadingPrices.set(false);
          this.priceError.set(`${this.market()} prices could not be loaded from the market data service (port 8082).`);
        },
        complete: () => this.loadingPrices.set(false),
      });
  }
}
