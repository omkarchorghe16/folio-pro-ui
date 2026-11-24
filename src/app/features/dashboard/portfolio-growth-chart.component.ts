import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PortfolioHistoryPoint, currencyOf } from '../../core/models/portfolio-entries.models';
import { WatchlistMarket } from '../../core/models/wealth.models';
import { formatMoney, formatMonth, shiftMonth } from './dashboard-format';

const MONTHS_SHOWN = 12;
const WIDTH = 900;
const TOP = 24;
const BOTTOM = 200;
const BASELINE = 220;

interface ChartPoint {
  x: number;
  y: number;
  label: string;
}

/** Portfolio value over the 12 calendar months that end at the latest recorded month. */
@Component({
  selector: 'app-portfolio-growth-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="growth-chart-wrap">
      <svg class="growth-chart" viewBox="0 0 900 230" role="img" [attr.aria-label]="description()" preserveAspectRatio="none">
        <defs>
          <linearGradient [attr.id]="gradientId()" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity=".28"/>
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="42" x2="900" y2="42" class="chart-gridline"/>
        <line x1="0" y1="98" x2="900" y2="98" class="chart-gridline"/>
        <line x1="0" y1="154" x2="900" y2="154" class="chart-gridline"/>
        @if (points().length > 1) {
          <path [attr.d]="areaPath()" [attr.fill]="'url(#' + gradientId() + ')'"/>
          <path class="chart-line" [attr.d]="linePath()"/>
        }
        @for (point of points(); track point.x) {
          <!-- A zero-length round-capped line stays a circle although the chart is stretched. -->
          <path class="chart-point" [attr.d]="'M' + point.x + ' ' + point.y + 'h.01'"><title>{{ point.label }}</title></path>
        }
      </svg>
    </div>
    <div class="chart-months" aria-hidden="true">
      @for (month of months(); track month) {
        <span>{{ monthLabel(month) }}</span>
      }
    </div>
  `,
  styles: [`
    .growth-chart-wrap { height:210px; }
    .growth-chart { display:block; width:100%; height:100%; overflow:visible; }
    .chart-gridline { stroke:var(--border); stroke-width:1; stroke-dasharray:4 6; }
    .chart-line { fill:none; stroke:var(--primary); stroke-width:3; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
    .chart-point { fill:none; stroke:var(--accent); stroke-width:9; stroke-linecap:round; vector-effect:non-scaling-stroke; }
    .chart-months { display:grid; grid-template-columns:repeat(12,1fr); gap:4px; margin-top:7px; color:var(--muted); font-size:.65rem; text-align:center; }
    @media(max-width:620px) { .growth-chart-wrap { height:165px; } .chart-months { font-size:.56rem; } }
  `],
})
export class PortfolioGrowthChartComponent {
  readonly market = input.required<WatchlistMarket>();
  /** Oldest first, at least one point. */
  readonly history = input.required<PortfolioHistoryPoint[]>();

  readonly gradientId = computed(() => `growth-fill-${this.market().toLowerCase()}`);

  readonly months = computed(() => {
    const latest = this.history().at(-1)?.month;
    return latest
      ? Array.from({ length: MONTHS_SHOWN }, (_, index) => shiftMonth(latest, index - MONTHS_SHOWN + 1))
      : [];
  });

  private readonly shownHistory = computed(() => this.history().filter((point) => this.months().includes(point.month)));

  readonly points = computed<ChartPoint[]>(() => {
    const shown = this.shownHistory();
    const values = shown.map((point) => point.currentValue);
    const low = Math.min(...values);
    const range = Math.max(...values) - low;
    // Each point is centred over its month label.
    const columnWidth = WIDTH / MONTHS_SHOWN;
    return shown.map((point) => ({
      x: (this.months().indexOf(point.month) + 0.5) * columnWidth,
      y: range === 0 ? (TOP + BOTTOM) / 2 : BOTTOM - ((point.currentValue - low) / range) * (BOTTOM - TOP),
      label: this.pointLabel(point),
    }));
  });

  readonly linePath = computed(() => `M${this.points().map((point) => `${point.x} ${point.y}`).join(' L')}`);

  readonly areaPath = computed(() => {
    const points = this.points();
    return `${this.linePath()} L${points.at(-1)?.x} ${BASELINE} L${points[0]?.x} ${BASELINE} Z`;
  });

  readonly description = computed(() => `${this.market()} portfolio value by month. `
    + this.shownHistory().map((point) => this.pointLabel(point)).join('; '));

  monthLabel(month: string): string {
    return formatMonth(month).slice(0, 3);
  }

  private pointLabel(point: PortfolioHistoryPoint): string {
    return `${formatMonth(point.month)}: ${formatMoney(point.currentValue, currencyOf(this.market()))}`;
  }
}
