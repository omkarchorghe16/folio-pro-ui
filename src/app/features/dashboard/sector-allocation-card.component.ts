import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { currencyOf } from '../../core/models/portfolio-entries.models';
import { WatchlistMarket } from '../../core/models/wealth.models';
import { MISSING, formatMoney } from './dashboard-format';
import { AllocationBasis, HoldingsState, allocateBySector } from './sector-allocation-calculations';

const SECTORS_SHOWN = 8;

/** One country's stocks and ETFs by sector, as ranked bars. A sector opens to the stocks in it. */
@Component({
  selector: 'app-sector-allocation-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card sector-card" [attr.aria-labelledby]="headingId()">
      <header class="sector-header">
        <div>
          <span class="eyebrow">{{ market() }} · {{ currency() }}</span>
          <h3 [id]="headingId()"><span class="visually-hidden">{{ market() }} sector allocation, </span>{{ allocation().slices.length ? money(allocation().total) : missing }}</h3>
          <p>{{ basis() === 'invested' ? 'total invested in stocks & ETFs' : 'current value of stocks & ETFs' }}</p>
        </div>
        @if (largest(); as top) {
          <dl class="facts">
            <div><dt>Sectors</dt><dd>{{ allocation().slices.length }}</dd></div>
            <div><dt>Holdings</dt><dd>{{ allocation().holdingCount }}</dd></div>
            <div class="wide"><dt>Largest</dt><dd [title]="top.name">{{ top.name }}</dd></div>
          </dl>
        }
      </header>

      @if (largest(); as top) {
        <div class="sector-list">
          @for (slice of shownSlices(); track slice.name) {
            <details>
              <summary>
                <span class="sector-name">{{ slice.name }}<small>{{ symbols(slice.holdings) }}</small></span>
                <span class="bar" aria-hidden="true"><span [style.width.%]="top.amount ? slice.amount / top.amount * 100 : 0"></span></span>
                <span class="amount">{{ money(slice.amount) }}</span>
                <strong class="share">{{ percent(slice.share) }}</strong>
                <span class="chevron" aria-hidden="true">›</span>
              </summary>
              <ul>
                @for (holding of slice.holdings; track holding.symbol) {
                  <li><span><strong>{{ holding.symbol }}</strong> {{ holding.name }}</span>
                    <span class="amount">{{ money(holding.amount) }}</span><span class="share">{{ percent(holding.share) }}</span></li>
                }
              </ul>
            </details>
          }
        </div>
        @if (allocation().slices.length > sectorsShown) {
          <button type="button" class="secondary-button more" [attr.aria-expanded]="showAll()" (click)="showAll.set(!showAll())">
            {{ showAll() ? 'Show fewer' : 'Show all ' + allocation().slices.length + ' sectors' }}</button>
        }
      } @else {
        <p class="note">{{ emptyText() }}</p>
      }
      @if (allocation().leftOut.length) {
        <p class="note">Not counted, no {{ basis() === 'invested' ? 'quantity' : 'quantity or price' }}: {{ allocation().leftOut.join(', ') }}</p>
      }
    </section>
  `,
  styles: [`
    :host { display:block; min-width:0; }
    .sector-card { height:100%; padding:20px; }
    .sector-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:14px; }
    h3 { margin:8px 0 0; font-size:1.65rem; letter-spacing:-.02em; }
    .sector-header p,.note { margin:5px 0 0; color:var(--muted); font-size:.74rem; }
    .facts { display:flex; gap:20px; margin:0; text-align:right; }
    .facts div { min-width:0; }
    .facts dt { color:var(--muted); font-size:.66rem; letter-spacing:.04em; text-transform:uppercase; }
    .facts dd { margin:6px 0 0; font-size:.86rem; font-weight:600; }
    .facts .wide dd { max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    details { border-top:1px solid var(--border); }
    summary { display:grid; grid-template-columns:minmax(110px,1.1fr) minmax(60px,1.3fr) minmax(74px,auto) 48px 10px; align-items:center; gap:12px; padding:9px 4px; border-radius:5px; cursor:pointer; list-style:none; }
    summary::-webkit-details-marker { display:none; }
    summary:hover,details[open] summary { background:#ffffff08; }
    summary:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
    .sector-name { min-width:0; font-size:.8rem; font-weight:600; overflow-wrap:anywhere; }
    .sector-name small { display:block; margin-top:3px; overflow:hidden; color:var(--muted); font-size:.68rem; font-weight:400; text-overflow:ellipsis; white-space:nowrap; }
    .bar span { display:block; height:10px; min-width:2px; border-radius:0 4px 4px 0; background:var(--primary); transition:width .3s ease; }
    summary:hover .bar span { filter:brightness(1.15); }
    .amount,.share { font-size:.78rem; font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; }
    .amount { color:var(--muted); }
    .chevron { color:var(--muted); transition:transform .2s ease; }
    details[open] .chevron { transform:rotate(90deg); }
    ul { display:grid; gap:7px; margin:0; padding:4px 26px 12px 16px; list-style:none; }
    li { display:grid; grid-template-columns:minmax(0,1fr) minmax(74px,auto) 48px; gap:12px; color:var(--muted); font-size:.74rem; }
    li strong { color:var(--text); }
    li .amount,li .share { font-size:.74rem; }
    .more { margin-top:12px; }
    .note { margin-top:12px; }
    .visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
    @media(prefers-reduced-motion:reduce) { .bar span,.chevron { transition:none; } }
    @media(max-width:620px) {
      .sector-card { padding:15px; }
      .sector-header { flex-direction:column; gap:12px; }
      .facts { align-self:stretch; text-align:left; }
      .facts .wide dd { max-width:none; }
      summary { grid-template-columns:minmax(0,1fr) auto 46px 10px; gap:7px 8px; }
      .bar { grid-column:1 / -1; grid-row:2; }
    }
  `],
})
export class SectorAllocationCardComponent {
  readonly market = input.required<WatchlistMarket>();
  readonly state = input<HoldingsState | null>(null);
  readonly basis = input.required<AllocationBasis>();

  readonly missing = MISSING;
  readonly sectorsShown = SECTORS_SHOWN;
  readonly showAll = signal(false);
  readonly currency = computed(() => currencyOf(this.market()));
  readonly headingId = computed(() => `sectors-${this.market().toLowerCase()}`);
  readonly allocation = computed(() => allocateBySector(this.state()?.rows ?? [], this.basis()));
  readonly largest = computed(() => this.allocation().slices.at(0) ?? null);
  readonly shownSlices = computed(() =>
    this.showAll() ? this.allocation().slices : this.allocation().slices.slice(0, SECTORS_SHOWN));
  readonly emptyText = computed(() => {
    const state = this.state();
    if (state?.failed) {
      return 'Not available.';
    }
    if (!state || state.loading) {
      return 'Loading…';
    }
    return state.rows.length ? 'No amounts to show yet.' : `No ${this.market()} stocks or ETFs yet. Add them in the table below.`;
  });

  money(value: number): string {
    return formatMoney(value, this.currency());
  }

  percent(share: number): string {
    return `${share.toFixed(1)}%`;
  }

  symbols(holdings: readonly { symbol: string }[]): string {
    return holdings.map((holding) => holding.symbol).join(', ');
  }
}
