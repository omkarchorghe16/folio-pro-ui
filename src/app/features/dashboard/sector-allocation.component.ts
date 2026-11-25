import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { WatchlistMarket } from '../../core/models/wealth.models';
import { SectorAllocationCardComponent } from './sector-allocation-card.component';
import { AllocationBasis, HoldingsState } from './sector-allocation-calculations';

/** Stocks and ETFs by sector, US and India side by side in their own currencies. */
@Component({
  selector: 'app-sector-allocation',
  standalone: true,
  imports: [SectorAllocationCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="sector-allocation-heading">
      <div class="heading">
        <div>
          <span class="eyebrow">US and India</span>
          <h2 id="sector-allocation-heading">Stocks &amp; ETFs portfolio by sector</h2>
        </div>
        <div class="basis" role="group" aria-label="Amounts to show">
          <button type="button" [attr.aria-pressed]="basis() === 'invested'" (click)="basis.set('invested')">Invested</button>
          <button type="button" [attr.aria-pressed]="basis() === 'currentValue'" (click)="basis.set('currentValue')">Current value</button>
        </div>
      </div>
      <div class="cards">
        @for (market of markets; track market) {
          <app-sector-allocation-card [market]="market" [state]="states()[market] ?? null" [basis]="basis()"></app-sector-allocation-card>
        }
      </div>
    </section>
  `,
  styles: [`
    .heading { display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:14px; margin:26px 0 14px; }
    h2 { margin:7px 0 0; font-size:1.2rem; }
    .basis { display:flex; gap:4px; padding:4px; border:1px solid var(--border); border-radius:8px; background:var(--panel-raised); }
    .basis button { padding:7px 12px; border:0; border-radius:5px; background:transparent; color:var(--muted); font-size:.74rem; }
    .basis button[aria-pressed=true] { background:color-mix(in srgb, var(--primary) 22%, transparent); color:var(--text); font-weight:600; }
    .cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-bottom:20px; }
    @media(max-width:900px) { .cards { grid-template-columns:1fr; } }
  `],
})
export class SectorAllocationComponent {
  readonly states = input.required<Partial<Record<WatchlistMarket, HoldingsState>>>();

  readonly markets: WatchlistMarket[] = ['US', 'India'];
  readonly basis = signal<AllocationBasis>('invested');
}
