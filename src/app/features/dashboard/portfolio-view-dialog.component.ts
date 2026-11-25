import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { environment } from '../../../environments/environment';
import { PortfolioEntriesSummary } from '../../core/models/portfolio-entries.models';
import { apiErrorMessage } from '../../core/services/api-error';
import { PortfolioEntriesService } from '../../core/services/portfolio-entries.service';
import { AssetBreakdownTableComponent, DeleteTarget } from './asset-breakdown-table.component';
import { currentMonth, formatMoney, formatSignedMoney, gainClass } from './dashboard-format';

/** Breakdown of one country's asset types and sub asset types, with edit and delete for each. */
@Component({
  selector: 'app-portfolio-view-dialog',
  standalone: true,
  imports: [AssetBreakdownTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dashboard-dialog" aria-labelledby="view-dialog-title" (close)="closed.emit()">
      <header class="dialog-header">
        <div>
          <span class="eyebrow">{{ summary().country }} · {{ summary().currency }}</span>
          <h2 id="view-dialog-title">{{ summary().country }} portfolio breakdown</h2>
        </div>
        <button type="button" class="dialog-close" aria-label="Close portfolio breakdown" (click)="dialog.close()">×</button>
      </header>
      <app-asset-breakdown-table [market]="summary().country" [assets]="summary().assets" [showShare]="true"
        [editable]="true" [deletable]="true" [deleting]="deleting()" (edit)="edit.emit($event)" (remove)="remove($event)"
        [totalValue]="summary().totals?.currentValue ?? null" [label]="summary().country + ' portfolio breakdown table'"></app-asset-breakdown-table>
      @if (!summary().assets.length) { <p class="dialog-note">No entries yet.</p> }
      <p class="dialog-note" role="status">{{ notice() }}</p>
      @if (error()) { <p class="dialog-error" role="alert">{{ error() }}</p> }
      @if (summary().totals; as totals) {
        <p class="dialog-totals">
          Invested <strong>{{ money(totals.investedAmount) }}</strong> ·
          Value <strong>{{ money(totals.currentValue) }}</strong> ·
          Profit <strong [class]="gain(totals.profit)">{{ signedMoney(totals.profit) }}</strong>
        </p>
      }
      <footer class="dialog-actions">
        <button type="button" class="secondary-button" (click)="dialog.close()">Close</button>
      </footer>
    </dialog>
  `,
  styles: ['.dashboard-dialog { width:min(1180px,calc(100vw - 32px)); }'],
})
export class PortfolioViewDialogComponent implements AfterViewInit {
  readonly summary = input.required<PortfolioEntriesSummary>();
  readonly closed = output<void>();
  /** Emits the code of the asset type or sub asset type to edit. */
  readonly edit = output<string>();
  /** Emits after a delete, so that the summary is loaded again. */
  readonly changed = output<void>();

  readonly deleting = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly gain = gainClass;

  private readonly portfolioEntriesService = inject(PortfolioEntriesService);
  private readonly dialogElement = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    this.dialogElement().nativeElement.showModal();
  }

  remove(target: DeleteTarget): void {
    if (this.deleting() || !window.confirm(this.confirmText(target))) {
      return;
    }
    this.deleting.set(true);
    this.notice.set('');
    this.error.set('');
    this.portfolioEntriesService
      .deleteType(environment.currentUserId, this.summary().country, currentMonth(), target.code)
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.notice.set(`Deleted ${target.name}.`);
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.error.set(apiErrorMessage(error, `${target.name} could not be deleted.`));
        },
      });
  }

  private confirmText(target: DeleteTarget): string {
    const subs = target.subCount ? ` and its ${target.subCount} sub asset ${target.subCount === 1 ? 'type' : 'types'}` : '';
    const isLast = this.summary().assets.length === 1 && this.summary().assets[0].subAssets.length < 2;
    return `Delete ${target.name}${subs} from the ${this.summary().country} portfolio? The current amounts are removed. `
      + 'You can bring the type back in Edit with "Show hidden types", but not its amounts.'
      + (isLast || this.summary().assets.every((asset) => asset.assetType === target.code)
        ? ' It is the last entry: if earlier amounts are saved, the dashboard shows those instead.' : '');
  }

  money(value: number): string {
    return formatMoney(value, this.summary().currency);
  }

  signedMoney(value: number): string {
    return formatSignedMoney(value, this.summary().currency);
  }
}
