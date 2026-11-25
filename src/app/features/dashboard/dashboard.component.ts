import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, viewChildren } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  Currency,
  PortfolioAssetSummary,
  PortfolioEntriesSummary,
  currencyOf,
} from '../../core/models/portfolio-entries.models';
import { MetricCardModel, WatchlistMarket } from '../../core/models/wealth.models';
import { apiErrorMessage } from '../../core/services/api-error';
import { PortfolioEntriesService } from '../../core/services/portfolio-entries.service';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card.component';
import { ShellComponent } from '../../shared/components/shell/shell.component';
import { MISSING, formatMoney, formatSignedMoney, formatSignedPercent, gainClass } from './dashboard-format';
import { AssetBreakdownTableComponent } from './asset-breakdown-table.component';
import { PortfolioEntryDialogComponent } from './portfolio-entry-dialog.component';
import { PortfolioGrowthChartComponent } from './portfolio-growth-chart.component';
import { PortfolioViewDialogComponent } from './portfolio-view-dialog.component';
import { HoldingsState } from './sector-allocation-calculations';
import { SectorAllocationComponent } from './sector-allocation.component';
import { StockHoldingsPanelComponent } from './stock-holdings-panel.component';

/** One country's portfolio as shown on the dashboard. */
interface CountryView {
  market: WatchlistMarket;
  currency: Currency;
  loading: boolean;
  error: string;
  /** Whether entries were saved in this visit, for the confirmation. */
  saved: boolean;
  summary: PortfolioEntriesSummary | null;
  metrics: MetricCardModel[];
}

interface EntryDialogTarget {
  market: WatchlistMarket;
  /** Asset type or sub asset type to focus. */
  code: string | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, ShellComponent, MetricCardComponent, PortfolioGrowthChartComponent, PortfolioEntryDialogComponent,
    PortfolioViewDialogComponent, AssetBreakdownTableComponent, SectorAllocationComponent,
    StockHoldingsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-shell [wideRail]="true">
      <div class="page-shell">
        <div class="page-header">
          <div>
            <h1>Dashboard</h1>
            <p>Your wealth overview across US and India portfolios.</p>
          </div>
          <span class="data-note">Values you entered · stock prices from market data</span>
        </div>

        <section *ngFor="let country of countries; trackBy: trackMarket" [attr.aria-labelledby]="'summary-' + country.market">
          <div class="section-heading">
            <div>
              <span class="eyebrow">{{ country.currency }}</span>
              <h2 [id]="'summary-' + country.market">{{ country.market }} portfolio</h2>
            </div>
            <ng-container *ngTemplateOutlet="editButton; context: { $implicit: country.market, label: 'summary' }"></ng-container>
          </div>
          <div class="metric-grid" *ngIf="country.metrics.length">
            <app-metric-card
              *ngFor="let card of country.metrics"
              [title]="card.title"
              [value]="card.value"
              [change]="card.change"
              [detail]="card.detail"
              [tone]="card.tone"
            ></app-metric-card>
          </div>
          <p class="state-note text-success" role="status" *ngIf="country.saved">Saved {{ country.market }} changes.</p>
          <p class="state-note" role="status" *ngIf="country.loading && !country.summary">Loading {{ country.market }} portfolio…</p>
          <p class="dialog-error" role="alert" *ngIf="country.error">
            {{ country.error }}
            <button type="button" class="secondary-button" (click)="loadCountry(country.market)">Try again</button>
          </p>
          <p class="state-note" *ngIf="isEmpty(country)">
            No {{ country.market }} entries yet.
            <button type="button" class="primary-button" (click)="openEntryDialog(country.market)">Add entries</button>
          </p>
        </section>

        <section class="allocation-section" aria-labelledby="allocation-heading">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Portfolio breakdown</span>
              <h2 id="allocation-heading">Asset allocation by country</h2>
            </div>
            <p>Share of each country's current value, in its own currency.</p>
          </div>
          <div class="country-grid">
            <section class="card country-card" *ngFor="let country of countries; trackBy: trackMarket">
              <div class="country-header">
                <div>
                  <span class="eyebrow">{{ country.market }} · {{ country.currency }}</span>
                  <h3>{{ money(country.summary?.totals?.currentValue, country.currency) }}</h3>
                </div>
                <div class="panel-side">
                  <ng-container *ngTemplateOutlet="editButton; context: { $implicit: country.market, label: 'allocation' }"></ng-container>
                  <button type="button" class="secondary-button view-button" *ngIf="country.summary?.assets?.length"
                    [attr.aria-label]="'View ' + country.market + ' allocation'" (click)="viewedMarket = country.market">View</button>
                </div>
              </div>
              <div class="allocation-list">
                <div class="allocation-row" *ngFor="let asset of country.summary?.assets; trackBy: trackAsset">
                  <span class="allocation-name">{{ asset.name }}</span>
                  <div class="allocation-track" role="progressbar"
                    [attr.aria-label]="asset.name + ' allocation'"
                    [attr.aria-valuenow]="asset.allocationPercent ?? 0"
                    aria-valuemin="0" aria-valuemax="100">
                    <span [style.width.%]="asset.allocationPercent ?? 0"></span>
                  </div>
                  <strong>{{ allocation(asset) }}</strong>
                </div>
              </div>
              <p class="state-note" *ngIf="!country.summary?.assets?.length">{{ emptyText(country) }}</p>
            </section>
          </div>
        </section>

        <section class="card panel-block portfolios-panel" aria-labelledby="portfolios-heading">
          <div class="panel-header">
            <span class="eyebrow">Asset types and sub asset types</span>
            <h2 id="portfolios-heading">All portfolios</h2>
          </div>
          <div class="portfolio-table" *ngFor="let country of countries; trackBy: trackMarket">
            <h3>{{ country.market }} portfolio <span class="eyebrow">{{ country.currency }}</span></h3>
            <app-asset-breakdown-table *ngIf="country.summary?.assets?.length; else noAssets"
              [market]="country.market" [assets]="country.summary!.assets" [editable]="true"
              [label]="'All ' + country.market + ' portfolios table'"
              (edit)="openEntryDialog(country.market, $event)"></app-asset-breakdown-table>
            <ng-template #noAssets><p class="state-note">{{ emptyText(country) }}</p></ng-template>
          </div>
        </section>

        <app-sector-allocation [states]="holdings()"></app-sector-allocation>

        <app-stock-holdings-panel *ngFor="let country of countries; trackBy: trackMarket" [market]="country.market"></app-stock-holdings-panel>

        <div class="country-grid">
          <section class="card growth-panel" *ngFor="let country of countries; trackBy: trackMarket"
            [attr.aria-labelledby]="'growth-' + country.market">
            <div class="panel-header split">
              <div>
                <span class="eyebrow">Portfolio performance · {{ country.currency }}</span>
                <h2 [id]="'growth-' + country.market">{{ country.market }} portfolio growth</h2>
              </div>
              <div class="panel-side">
                <span class="growth-return" *ngIf="country.summary?.totals as totals" [ngClass]="gain(totals.profit)">
                  {{ signedMoney(totals.profit, country.currency) }} <small>total profit</small>
                </span>
                <ng-container *ngTemplateOutlet="editButton; context: { $implicit: country.market, label: 'growth' }"></ng-container>
              </div>
            </div>
            <app-portfolio-growth-chart *ngIf="country.summary?.history?.length; else noHistory"
              [market]="country.market" [history]="country.summary!.history"></app-portfolio-growth-chart>
            <ng-template #noHistory><p class="state-note">{{ emptyText(country) }}</p></ng-template>
          </section>
        </div>
      </div>

      <ng-template #editButton let-market let-label="label">
        <button type="button" class="edit-button" [attr.aria-label]="'Edit ' + market + ' ' + label"
          (click)="openEntryDialog(market)">Edit</button>
      </ng-template>

      <app-portfolio-entry-dialog *ngIf="entryDialog as target"
        [market]="target.market" [focusCode]="target.code"
        (closed)="entryDialog = null" (saved)="onEntriesSaved(target.market)"></app-portfolio-entry-dialog>

      <app-portfolio-view-dialog *ngIf="viewedSummary as summary" [summary]="summary" (closed)="viewedMarket = null"
        (edit)="editFromView(summary.country, $event)" (changed)="loadCountry(summary.country)"></app-portfolio-view-dialog>
    </app-shell>
  `,
  styles: [`
    .data-note,.state-note { color:var(--muted); font-size:.75rem; }
    .state-note { margin:0 0 18px; }
    .section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin:26px 0 14px; }
    .section-heading h2,.panel-header h2 { margin:7px 0 0; font-size:1.2rem; }
    .section-heading p { max-width:440px; margin:0; color:var(--muted); font-size:.78rem; text-align:right; }
    .country-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-bottom:20px; }
    .country-card,.panel-block,.growth-panel { padding:20px; }
    .country-header,.panel-header.split { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .country-header { margin-bottom:18px; }
    .country-header h3 { margin:8px 0 0; font-size:1.45rem; }
    .panel-header { margin-bottom:16px; }
    .panel-side { display:flex; align-items:center; gap:12px; }
    .growth-return { font-size:.95rem; font-weight:700; text-align:right; white-space:nowrap; }
    .growth-return small { display:block; margin-top:4px; color:var(--muted); font-size:.68rem; font-weight:400; }
    .allocation-list { display:grid; gap:11px; }
    .allocation-row { display:grid; grid-template-columns:minmax(125px,1fr) minmax(70px,1.3fr) 48px; align-items:center; gap:10px; font-size:.76rem; }
    .allocation-name { color:var(--muted); }
    .allocation-row strong { text-align:right; font-size:.74rem; }
    .allocation-track { height:6px; overflow:hidden; border-radius:99px; background:#ffffff12; }
    .allocation-track span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,var(--primary),var(--accent)); }
    .view-button { border-color:color-mix(in srgb, var(--primary) 55%, transparent); background:color-mix(in srgb, var(--primary) 14%, transparent); color:color-mix(in srgb, var(--primary) 75%, white); font-weight:600; }
    .view-button:hover:not(:disabled) { border-color:var(--primary); background:color-mix(in srgb, var(--primary) 26%, transparent); }
    .portfolios-panel { margin-bottom:18px; }
    .portfolio-table + .portfolio-table { margin-top:26px; }
    .portfolio-table h3 { display:flex; align-items:baseline; gap:10px; margin:0 0 10px; font-size:1rem; }
    @media(max-width:900px) { .country-grid { grid-template-columns:1fr; } }
    @media(max-width:620px) {
      .section-heading p { text-align:left; }
      .country-card,.panel-block,.growth-panel { padding:15px; }
      .allocation-section .section-heading { align-items:flex-start; flex-direction:column; }
      .allocation-row { grid-template-columns:minmax(108px,1fr) minmax(45px,1fr) 44px; gap:7px; font-size:.68rem; }
    }
  `],
})
export class DashboardComponent implements OnInit {
  countries: CountryView[] = [this.emptyCountry('US'), this.emptyCountry('India')];
  entryDialog: EntryDialogTarget | null = null;
  /** What the stocks & ETFs tables show, for the sector allocation. */
  readonly holdings = computed(() => {
    const states: Partial<Record<WatchlistMarket, HoldingsState>> = {};
    for (const panel of this.holdingPanels()) {
      states[panel.market()] = panel.state();
    }
    return states;
  });
  private readonly holdingPanels = viewChildren(StockHoldingsPanelComponent);
  /** Country shown in the breakdown popup. */
  viewedMarket: WatchlistMarket | null = null;

  readonly money = formatMoney;
  readonly signedMoney = formatSignedMoney;
  readonly gain = gainClass;

  constructor(private readonly portfolioEntriesService: PortfolioEntriesService) {}

  ngOnInit(): void {
    this.countries.forEach((country) => this.loadCountry(country.market));
  }

  /** Loads one country; a failure leaves the other country and any values already shown as they are. */
  loadCountry(market: WatchlistMarket): void {
    this.updateCountry(market, { loading: true, error: '' });
    this.portfolioEntriesService.getSummary(environment.currentUserId, market).subscribe({
      next: (summary) => this.updateCountry(market, {
        loading: false, summary, metrics: this.toMetrics(summary),
      }),
      error: (error: unknown) => this.updateCountry(market, {
        loading: false, error: apiErrorMessage(error, `The ${market} portfolio could not be loaded.`),
      }),
    });
  }

  get viewedSummary(): PortfolioEntriesSummary | null {
    return this.countries.find((country) => country.market === this.viewedMarket)?.summary ?? null;
  }

  editFromView(market: WatchlistMarket, code: string): void {
    this.viewedMarket = null;
    this.openEntryDialog(market, code);
  }

  openEntryDialog(market: WatchlistMarket, code: string | null = null): void {
    this.entryDialog = { market, code };
  }

  onEntriesSaved(market: WatchlistMarket): void {
    this.entryDialog = null;
    this.updateCountry(market, { saved: true });
    this.loadCountry(market);
  }

  isEmpty(country: CountryView): boolean {
    return !!country.summary && !country.summary.totals;
  }

  emptyText(country: CountryView): string {
    return country.summary ? 'No entries yet.' : country.error ? 'Not available.' : 'Loading…';
  }

  allocation(asset: PortfolioAssetSummary): string {
    return asset.allocationPercent === null || asset.allocationPercent === undefined
      ? MISSING
      : `${asset.allocationPercent.toFixed(1)}%`;
  }

  trackMarket(_index: number, country: CountryView): string {
    return country.market;
  }

  trackAsset(_index: number, asset: PortfolioAssetSummary): string {
    return asset.assetType;
  }

  private emptyCountry(market: WatchlistMarket): CountryView {
    return { market, currency: currencyOf(market), loading: true, error: '', saved: false, summary: null, metrics: [] };
  }

  private updateCountry(market: WatchlistMarket, changes: Partial<CountryView>): void {
    this.countries = this.countries.map((country) => country.market === market ? { ...country, ...changes } : country);
  }

  private toMetrics(summary: PortfolioEntriesSummary): MetricCardModel[] {
    const { totals, currency } = summary;
    if (!totals) {
      return [];
    }
    const hasMonthlyReturn = totals.monthlyReturnPercent !== null && totals.monthlyReturnPercent !== undefined;
    return [
      { title: 'Net worth', value: formatMoney(totals.currentValue, currency), change: currency, tone: 'neutral', detail: 'current value' },
      { title: 'Total invested', value: formatMoney(totals.investedAmount, currency), change: currency, tone: 'neutral', detail: 'cost of what you hold' },
      { title: 'Total profit', value: formatSignedMoney(totals.profit, currency), change: formatSignedPercent(totals.profitPercent), tone: this.tone(totals.profit), detail: 'value minus invested' },
      { title: 'Monthly return', value: formatSignedPercent(totals.monthlyReturnPercent), change: currency, tone: this.tone(totals.monthlyReturnPercent), detail: hasMonthlyReturn ? 'without new money' : 'needs the previous month' },
    ];
  }

  private tone(value: number | null | undefined): MetricCardModel['tone'] {
    return !value ? 'neutral' : value > 0 ? 'up' : 'down';
  }
}
