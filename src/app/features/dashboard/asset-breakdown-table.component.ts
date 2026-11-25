import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  PortfolioAssetSummary, PortfolioSubAssetSummary, currencyOf,
} from '../../core/models/portfolio-entries.models';
import { WatchlistMarket } from '../../core/models/wealth.models';
import { DeleteButtonComponent } from '../../shared/components/delete-button/delete-button.component';
import { MISSING, formatMoney, formatSignedMoney, formatSignedPercent, gainClass } from './dashboard-format';

/** An asset type or sub asset type whose delete icon was used. */
export interface DeleteTarget {
  code: string;
  name: string;
  /** Sub asset types that are deleted with it. */
  subCount: number;
}

/** One asset type, or one of its sub asset types (then assetName is only its parent). */
interface BreakdownRow {
  code: string;
  assetName: string;
  subName: string;
  subCount: number;
  amounts: PortfolioAssetSummary | PortfolioSubAssetSummary;
  share: number | null;
}

/** One country's asset types, each followed by its sub asset types. */
@Component({
  selector: 'app-asset-breakdown-table',
  standalone: true,
  imports: [DeleteButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="label()">
      <table>
        <thead>
          <tr>
            <th class="name" scope="col">Asset type</th><th class="name" scope="col">Sub asset type</th>
            <th class="num" scope="col">Invested</th><th class="num" scope="col">Current value</th>
            <th class="num" scope="col">Profit</th><th class="num" scope="col">Profit %</th>
            @if (showShare()) { <th class="num" scope="col">Share</th> }
            @if (editable()) { <th class="action" scope="col">Actions</th> }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.code) {
            <tr [class]="row.subName ? 'sub-row' : 'asset-row'">
              @if (row.subName) {
                <td></td>
                <th scope="row"><span class="sub-arrow" aria-hidden="true">↳</span>{{ row.subName }}</th>
              } @else {
                <th scope="row"><span class="asset-name">{{ row.assetName }}
                  @if (row.subCount) { <span class="sub-count">{{ row.subCount }} sub {{ row.subCount === 1 ? 'type' : 'types' }}</span> }
                </span></th>
                <td></td>
              }
              <td class="num">{{ money(row.amounts.investedAmount) }}</td>
              <td class="num">{{ money(row.amounts.currentValue) }}</td>
              <td class="num"><span [class]="gain(row.amounts.profit)">{{ signedMoney(row.amounts.profit) }}</span></td>
              <td class="num"><span [class]="gain(row.amounts.profit)">{{ percent(row.amounts.profitPercent) }}</span></td>
              @if (showShare()) { <td class="num">{{ shareText(row.share) }}</td> }
              @if (editable()) {
                <td class="actions">
                  <!-- With sub asset types the amounts are their total, so there is nothing to edit here. -->
                  @if (!row.subCount) {
                    <button type="button" class="edit-button" (click)="edit.emit(row.code)"
                      [attr.aria-label]="'Edit ' + market() + ' ' + row.assetName + (row.subName ? ', ' + row.subName : '')">Edit</button>
                  }
                  @if (deletable()) {
                    <app-delete-button [disabled]="deleting()" (pressed)="remove.emit(deleteTarget(row))"
                      [label]="'Delete ' + market() + ' ' + row.assetName + (row.subName ? ', ' + row.subName : '')"></app-delete-button>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    table { min-width:700px; }
    .name { width:22%; }
    .action { width:90px; text-align:right; }
    th.num { width:12%; }
    .num { text-align:right; white-space:nowrap; }
    tbody th { color:var(--text); font-size:13px; letter-spacing:0; text-transform:none; }
    .actions { text-align:right; white-space:nowrap; }
    .asset-row th { font-weight:700; }
    .sub-row > * { background:#ffffff05; }
    .sub-row td { color:var(--muted); }
    .sub-arrow { margin-right:8px; color:var(--muted); }
    .asset-name { display:flex; align-items:center; flex-wrap:wrap; gap:4px 10px; }
    .sub-count { padding:3px 9px; border:1px solid var(--border); border-radius:99px; color:var(--muted); font-size:.7rem; font-weight:500; white-space:nowrap; }
  `],
})
export class AssetBreakdownTableComponent {
  readonly market = input.required<WatchlistMarket>();
  readonly assets = input.required<PortfolioAssetSummary[]>();
  /** Names the table for screen readers. */
  readonly label = input.required<string>();
  /** The country's total value; needed for the shares of sub asset types. */
  readonly totalValue = input<number | null>(null);
  readonly showShare = input(false);
  /** Shows Edit, except for asset types that are the total of sub asset types. */
  readonly editable = input(false);
  /** Adds a delete icon next to Edit. */
  readonly deletable = input(false);
  readonly deleting = input(false);
  /** Emits the code of the asset type or sub asset type to edit. */
  readonly edit = output<string>();
  readonly remove = output<DeleteTarget>();

  readonly percent = formatSignedPercent;
  readonly gain = gainClass;

  private readonly currency = computed(() => currencyOf(this.market()));

  readonly rows = computed<BreakdownRow[]>(() => this.assets().flatMap((asset) => [
    {
      code: asset.assetType, assetName: asset.name, subName: '', subCount: asset.subAssets.length, amounts: asset,
      share: asset.allocationPercent ?? null,
    },
    ...asset.subAssets.map((sub) => ({
      code: sub.subAssetType, assetName: asset.name, subName: sub.name, subCount: 0, amounts: sub,
      share: this.shareOf(sub.currentValue),
    })),
  ]));

  deleteTarget(row: BreakdownRow): DeleteTarget {
    return { code: row.code, name: row.subName || row.assetName, subCount: row.subCount };
  }

  money(value: number): string {
    return formatMoney(value, this.currency());
  }

  signedMoney(value: number): string {
    return formatSignedMoney(value, this.currency());
  }

  shareText(share: number | null): string {
    return share === null ? MISSING : `${share.toFixed(1)}%`;
  }

  private shareOf(value: number): number | null {
    const total = this.totalValue();
    return total ? (value / total) * 100 : null;
  }
}
