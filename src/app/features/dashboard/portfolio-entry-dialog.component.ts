import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, computed, inject,
  input, output, signal, viewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PortfolioAssetType, PortfolioEntry, PortfolioMonth, PortfolioSubAssetType, currencyOf,
} from '../../core/models/portfolio-entries.models';
import { WatchlistMarket } from '../../core/models/wealth.models';
import { apiErrorMessage } from '../../core/services/api-error';
import { PortfolioEntriesService } from '../../core/services/portfolio-entries.service';
import { currencySymbol, formatMoney, formatMonth, formatSignedMoney, gainClass, parseDecimal } from './dashboard-format';

const YEARS_OFFERED = 15;
const MAX_INTEGER_DIGITS = 13;
const MAX_FRACTION_DIGITS = 2;
const MAX_NAME_LENGTH = 60;

type AmountField = 'invested' | 'value';
type RowField = 'name' | AmountField;

/** One asset type or sub asset type as typed; both amounts blank means not held. */
interface AmountRow {
  code: string;
  name: string;
  /** Name in the database; empty for one that is not saved yet. */
  savedName: string;
  /** Hidden ones are kept for past months but not offered for new ones. */
  hidden: boolean;
  savedHidden: boolean;
  invested: string;
  value: string;
}

/** An asset type with its many sub asset types. Its amounts are its own or the sum of the sub asset types. */
interface AssetRow extends AmountRow {
  subs: AmountRow[];
}

/** Edits one country's amounts for one month and saves the whole month. */
@Component({
  selector: 'app-portfolio-entry-dialog',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dashboard-dialog wide" aria-labelledby="entry-dialog-title" (cancel)="requestClose($event)"
      (keydown.escape)="requestClose($event)" (close)="onNativeClose()">
      <header class="dialog-header">
        <div>
          <span class="eyebrow">{{ market() }} · {{ currency() }}</span>
          <h2 id="entry-dialog-title">Update {{ market() }} portfolio</h2>
        </div>
        <button type="button" class="dialog-close" aria-label="Close portfolio dialog" (click)="requestClose()">×</button>
      </header>
      <form (submit)="save($event)" novalidate>
        <div class="month-row">
          <label>Month
            <select [disabled]="saving()" (change)="changeMonth($event)">
              @for (name of monthNames; track $index) {
                <option [value]="$index + 1" [selected]="$index + 1 === monthNumber()"
                  [disabled]="year() === currentYear && $index + 1 > currentMonthNumber">{{ name }}</option>
              }
            </select>
          </label>
          <label>Year
            <select [disabled]="saving()" (change)="changeYear($event)">
              @for (option of years; track option) {
                <option [value]="option" [selected]="option === year()">{{ option }}</option>
              }
            </select>
          </label>
        </div>
        <p class="dialog-note" role="status">{{ notice() }}</p>
        <div class="dialog-scroll">
          <table class="entry-table">
            <thead>
              <tr><th>Asset type</th><th>Sub asset type</th><th>Invested ({{ symbol() }})</th><th>Current value ({{ symbol() }})</th></tr>
            </thead>
            @for (row of visibleRows(); track row.code) {
              <tbody [class.is-hidden]="row.hidden">
                <tr class="asset-row">
                  <th scope="row">
                    <ng-container *ngTemplateOutlet="nameField; context: { $implicit: row, label: 'Asset type' }"></ng-container>
                  </th>
                  <td>
                    <button type="button" class="secondary-button" [disabled]="!ready() || saving()"
                      [attr.aria-label]="'Add sub asset type to ' + (row.name || 'new asset type')" (click)="addSubAssetType(row)">＋ Sub asset type</button>
                    <ng-container *ngTemplateOutlet="hideButton; context: { $implicit: row, label: row.name }"></ng-container>
                  </td>
                  @if (isSummed(row)) {
                    <td class="sum" data-label="Invested">{{ money(sumOf(row).invested) }}</td>
                    <td class="sum" data-label="Current value">{{ money(sumOf(row).value) }}</td>
                  } @else {
                    <ng-container *ngTemplateOutlet="amountFields; context: { $implicit: row, label: row.name }"></ng-container>
                  }
                </tr>
                @for (sub of visibleSubs(row); track sub.code) {
                  <tr class="sub-row" [class.is-hidden]="sub.hidden">
                    <td class="indent" aria-hidden="true">↳</td>
                    <th scope="row">
                      <span class="sub-name">
                        <ng-container *ngTemplateOutlet="nameField; context: { $implicit: sub, label: 'Sub asset type' }"></ng-container>
                        @if (!sub.savedName) {
                          <button type="button" class="remove-sub" [disabled]="saving()"
                            [attr.aria-label]="'Remove new sub asset type ' + sub.name" (click)="removeSubAssetType(row, sub)">×</button>
                        }
                        <ng-container *ngTemplateOutlet="hideButton; context: { $implicit: sub, label: row.name + ', ' + sub.name }"></ng-container>
                      </span>
                    </th>
                    <ng-container *ngTemplateOutlet="amountFields; context: { $implicit: sub, label: row.name + ', ' + sub.name }"></ng-container>
                  </tr>
                }
              </tbody>
            }
          </table>
        </div>
        <ng-template #hideButton let-item let-label="label">
          @if (item.savedName) {
            <button type="button" class="hide-button" [disabled]="!ready() || saving()"
              [attr.aria-label]="(item.hidden ? 'Show ' : 'Hide ') + label" (click)="toggleHidden(item)">{{ item.hidden ? 'Show' : 'Hide' }}</button>
          }
        </ng-template>
        <ng-template #nameField let-item let-label="label">
          <input type="text" class="name-input" autocomplete="off" [placeholder]="label + ' name'"
            [id]="inputId(item.code, 'name')" [maxLength]="maxNameLength"
            [attr.aria-label]="label + ' name' + (item.savedName ? ', ' + item.savedName : '')"
            [attr.aria-invalid]="isNameInvalid(item)" [class.invalid]="isNameInvalid(item)"
            [disabled]="!ready() || saving()" [value]="item.name" (input)="updateRow(item.code, 'name', $event)">
        </ng-template>
        <ng-template #amountFields let-item let-label="label">
          @for (field of amountFieldNames; track field) {
            <td [attr.data-label]="field === 'invested' ? 'Invested' : 'Current value'">
              <span class="money-field"><span aria-hidden="true">{{ symbol() }}</span>
              <input type="text" inputmode="decimal" autocomplete="off" placeholder="0" [id]="inputId(item.code, field)"
                [attr.aria-label]="label + (field === 'invested' ? ' invested, ' : ' current value, ') + currency()"
                [attr.aria-invalid]="isInvalid(item, field)" [class.invalid]="isInvalid(item, field)"
                [disabled]="!ready() || saving()" [value]="item[field]" (input)="updateRow(item.code, field, $event)"></span>
            </td>
          }
        </ng-template>
        <button type="button" class="secondary-button add-type" [disabled]="!ready() || saving()" (click)="addAssetType()">＋ Add asset type</button>
        @if (hiddenCount()) {
          <button type="button" class="hide-button" [attr.aria-pressed]="showHidden()" (click)="showHidden.set(!showHidden())">
            {{ showHidden() ? 'Hide hidden types' : 'Show hidden types (' + hiddenCount() + ')' }}</button>
        }
        <p class="dialog-totals">
          Invested <strong>{{ money(totals().invested) }}</strong> ·
          Value <strong>{{ money(totals().value) }}</strong> ·
          Profit <strong [class]="gain(totals().value - totals().invested)">{{ signedMoney(totals().value - totals().invested) }}</strong>
        </p>
        <p class="dialog-hint">Invested is the total cost of what you still hold. Leave both amounts blank for assets you do not hold. With sub asset types, an asset type is their total. New and renamed types apply to every month. Hide a type you no longer hold: it stays in saved months but is not offered for new ones.</p>
        @if (error()) { <p class="dialog-error" role="alert">{{ error() }}</p> }
        @if (loadFailed()) {
          <p class="dialog-hint">Amounts are locked until this month loads, so that saved data is not overwritten.
            <button type="button" class="secondary-button" (click)="loadMonth()">Try again</button></p>
        }
        <footer class="dialog-actions">
          <button type="button" class="secondary-button" (click)="requestClose()">Cancel</button>
          <button type="submit" class="primary-button" [disabled]="!ready() || saving()">
            {{ saving() ? 'Saving…' : 'Save' }}
          </button>
        </footer>
      </form>
    </dialog>
  `,
  styles: [`
    .month-row { display:flex; gap:12px; }
    .month-row label { display:grid; gap:5px; color:var(--muted); font-size:.72rem; }
    .entry-table th,.entry-table td { padding:3px 8px; }
    .entry-table tbody th { color:var(--text); font-size:.78rem; text-transform:none; letter-spacing:0; }
    .entry-table input { width:100%; min-width:92px; text-align:right; }
    .entry-table .name-input { min-width:120px; text-align:left; }
    .add-type { margin-top:10px; }
    .asset-row > * { border-top:1px solid var(--border); border-bottom:0; }
    .sub-row > * { border-bottom:0; }
    .sub-row .indent { color:var(--muted); text-align:right; }
    .sub-name { display:flex; align-items:center; gap:4px; }
    .remove-sub { border:0; background:transparent; color:var(--negative); font-size:1.1rem; line-height:1; }
    .hide-button { padding:6px 8px; border:0; background:transparent; color:var(--muted); font-size:.72rem; text-decoration:underline; text-underline-offset:3px; }
    .hide-button:hover { color:var(--text); }
    .is-hidden .name-input { color:var(--muted); font-style:italic; }
    .sum { padding-right:18px !important; text-align:right; font-weight:700; }
    /* Phone: names on one line, both amounts on the next. */
    @media(max-width:620px) {
      .entry-table thead,.sub-row .indent { display:none; }
      .entry-table tr { display:grid; grid-template-columns:1fr 1fr; gap:4px 8px; padding:6px 0; }
      .entry-table th,.entry-table td { padding:0; }
      .asset-row > * { border-top:0; }
      .entry-table tbody { border-top:1px solid var(--border); }
      .sub-row { margin-left:18px; }
      .sub-row th { grid-column:1 / -1; }
      .entry-table input,.entry-table .name-input { min-width:0; }
      td[data-label]::before { content:attr(data-label); display:block; color:var(--muted); font-size:.66rem; font-weight:400; text-align:left; }
    }
  `],
})
export class PortfolioEntryDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly market = input.required<WatchlistMarket>();
  /** Asset type or sub asset type whose field gets focus when the dialog opens. */
  readonly focusCode = input<string | null>(null);
  readonly closed = output<void>();
  /** Emits the saved month (yyyy-MM). */
  readonly saved = output<string>();

  readonly maxNameLength = MAX_NAME_LENGTH;
  readonly amountFieldNames: AmountField[] = ['invested', 'value'];
  readonly monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, index, 1))));
  readonly currentYear = new Date().getFullYear();
  readonly currentMonthNumber = new Date().getMonth() + 1;
  readonly years = Array.from({ length: YEARS_OFFERED }, (_, index) => this.currentYear - index);

  readonly year = signal(this.currentYear);
  readonly monthNumber = signal(this.currentMonthNumber);
  readonly rows = signal<AssetRow[]>([]);
  readonly notice = signal('');
  readonly error = signal('');
  readonly saving = signal(false);
  /** False until the month has loaded, so that a failed load cannot be saved over existing data. */
  readonly ready = signal(false);
  readonly loadFailed = signal(false);
  readonly showHidden = signal(false);
  private readonly monthIsSaved = signal(false);
  private readonly showErrors = signal(false);

  readonly currency = computed(() => currencyOf(this.market()));
  readonly symbol = computed(() => currencySymbol(this.currency()));
  readonly month = computed(() => `${this.year()}-${String(this.monthNumber()).padStart(2, '0')}`);
  readonly monthLabel = computed(() => formatMonth(this.month()));
  /** Hidden asset types are listed while they hold amounts, until the hiding is saved, or on request. */
  readonly visibleRows = computed(() => this.rows().filter((row) =>
    this.showHidden() || !this.isTuckedAway(row) || row.subs.some((sub) => !isBlank(sub))));
  readonly hiddenCount = computed(() => {
    const listed = this.rows().filter((row) => !this.isTuckedAway(row));
    return this.rows().length - listed.length + listed.flatMap((row) => row.subs).filter((sub) => this.isTuckedAway(sub)).length;
  });
  readonly totals = computed(() => addUp(this.rows().flatMap((row) => [row, ...row.subs])));

  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly portfolioEntriesService = inject(PortfolioEntriesService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  /** Amounts as loaded, by code. */
  private loadedAmounts = new Map<string, { invested: string; value: string }>();
  private loadedRows = '';
  private loadSubscription?: Subscription;
  private focusPending = true;

  ngOnInit(): void {
    this.loadMonth();
  }

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  ngOnDestroy(): void {
    this.loadSubscription?.unsubscribe();
  }

  inputId(code: string, field: RowField): string {
    return `entry-${code}-${field}`;
  }

  money(value: number): string {
    return formatMoney(value, this.currency());
  }

  signedMoney(value: number): string {
    return formatSignedMoney(value, this.currency());
  }

  gain(value: number): string {
    return gainClass(value);
  }

  changeMonth(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!this.confirmDiscard()) {
      select.value = String(this.monthNumber());
      return;
    }
    this.monthNumber.set(Number(select.value));
    this.loadMonth();
  }

  changeYear(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!this.confirmDiscard()) {
      select.value = String(this.year());
      return;
    }
    this.year.set(Number(select.value));
    if (this.year() === this.currentYear && this.monthNumber() > this.currentMonthNumber) {
      this.monthNumber.set(this.currentMonthNumber);
    }
    this.loadMonth();
  }

  updateRow(code: string, field: RowField, event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    const update = <T extends AmountRow>(row: T): T => row.code === code ? { ...row, [field]: text } : row;
    this.rows.update((rows) => rows.map((row) => ({ ...update(row), subs: row.subs.map(update) })));
  }

  /** Adds an empty row; it is stored with the next save. */
  addAssetType(): void {
    const row = { ...newRow('CUSTOM'), subs: [] };
    this.rows.update((rows) => [...rows, row]);
    this.focusName(row.code);
  }

  /** Amounts the asset type has of its own move to the new sub asset type, so that nothing is lost or counted twice. */
  addSubAssetType(row: AssetRow): void {
    const sub = { ...newRow('SUB'), invested: row.invested, value: row.value };
    this.replaceRow({ ...row, invested: '', value: '', subs: [...row.subs, sub] });
    this.focusName(sub.code);
  }

  /** Only for one that is not saved yet. The last amounts go back to the asset type. */
  removeSubAssetType(row: AssetRow, sub: AmountRow): void {
    const subs = row.subs.filter((other) => other.code !== sub.code);
    const takesBack = isBlank(row) && subs.every(isBlank);
    this.replaceRow({ ...row, subs, ...(takesBack ? { invested: sub.invested, value: sub.value } : {}) });
  }

  visibleSubs(row: AssetRow): AmountRow[] {
    return row.subs.filter((sub) => this.showHidden() || !this.isTuckedAway(sub));
  }

  /**
   * Takes effect with the next save. Amounts of a saved month stay. In a month that is not saved yet they are only
   * suggestions, so hiding clears them and showing brings them back.
   */
  toggleHidden(item: AmountRow): void {
    const hidden = !item.hidden;
    const toggle = <T extends AmountRow>(row: T): T => ({ ...row, hidden });
    const withAmounts = <T extends AmountRow>(row: T, isAffected: boolean): T => {
      if (!isAffected || this.monthIsSaved()) {
        return row;
      }
      return { ...row, ...(hidden ? { invested: '', value: '' } : this.loadedAmounts.get(row.code)) };
    };
    this.rows.update((rows) => rows.map((row) => {
      const isRow = row.code === item.code;
      const changed = withAmounts(isRow ? toggle(row) : row, isRow);
      return {
        ...changed,
        subs: row.subs.map((sub) => {
          const isSub = sub.code === item.code;
          return withAmounts(isSub ? toggle(sub) : sub, isSub || (isRow && !sub.hidden));
        }),
      };
    }));
  }

  /** Whether the amounts shown are the total of the sub asset types. */
  isSummed(row: AssetRow): boolean {
    return isBlank(row) && row.subs.some((sub) => !isBlank(sub));
  }

  sumOf(row: AssetRow): { invested: number; value: number } {
    return addUp(row.subs);
  }

  isNameInvalid(row: AmountRow): boolean {
    return this.showErrors() && this.nameError(row) !== '';
  }

  /** An entered amount must be a number, and one filled field needs the other. */
  isInvalid(row: AmountRow, field: AmountField): boolean {
    if (!this.showErrors() || isBlank(row)) {
      return false;
    }
    return parseAmount(row[field]) === null || this.hasBothAmounts(row);
  }

  save(event: Event): void {
    event.preventDefault();
    if (!this.ready() || this.saving()) {
      return;
    }
    this.error.set('');
    this.showErrors.set(true);
    const allRows = this.rows().flatMap((row) => [row, ...row.subs]);
    const misnamed = allRows.find((row) => this.nameError(row));
    if (misnamed) {
      this.showError(this.nameError(misnamed), this.inputId(misnamed.code, 'name'));
      return;
    }
    const doubled = this.rows().find((row) => this.hasBothAmounts(row));
    if (doubled) {
      this.showError(`${doubled.name} has amounts of its own and of its sub asset types. Clear one of them.`,
        this.inputId(doubled.code, 'invested'));
      return;
    }
    const invalid = allRows.find((row) => !isBlank(row)
      && (parseAmount(row.invested) === null || parseAmount(row.value) === null));
    if (invalid) {
      this.showError(`${invalid.name}: enter both amounts as numbers of 0 or more, with at most two decimals.`,
        this.inputId(invalid.code, parseAmount(invalid.invested) === null ? 'invested' : 'value'));
      return;
    }
    const assetTypes: PortfolioAssetType[] = this.rows().filter(isChanged)
      .map((row) => ({ assetType: row.code, name: row.name.trim(), hidden: row.hidden }));
    const subAssetTypes: PortfolioSubAssetType[] = this.rows().flatMap((row) => row.subs.filter(isChanged)
      .map((sub) => ({ subAssetType: sub.code, assetType: row.code, name: sub.name.trim(), hidden: sub.hidden })));
    const entries: PortfolioEntry[] = this.rows().flatMap((row) => [
      ...toAmounts(row).map((amounts) => ({ assetType: row.code, ...amounts })),
      ...row.subs.flatMap((sub) =>
        toAmounts(sub).map((amounts) => ({ assetType: row.code, subAssetType: sub.code, ...amounts }))),
    ]);
    if (!entries.length && !assetTypes.length && !subAssetTypes.length && !this.monthIsSaved()) {
      this.error.set('Enter at least one asset.');
      return;
    }
    if (!entries.length && this.monthIsSaved() && !window.confirm(`Remove all ${this.market()} entries for ${this.monthLabel()}?`)) {
      return;
    }
    this.saving.set(true);
    this.portfolioEntriesService.saveMonth(
      environment.currentUserId, this.market(), this.month(), { entries, assetTypes, subAssetTypes },
    ).subscribe({
      next: () => this.saved.emit(this.month()),
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error, 'The month could not be saved.'));
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
    if (!this.saving() && this.confirmDiscard()) {
      this.closed.emit();
    }
  }

  /** Empty when the name is fine. An untouched new row is ignored when saving. */
  private nameError(row: AmountRow): string {
    const assetRow = this.rows().find((candidate) => candidate.code === row.code);
    const parent = this.rows().find((candidate) => candidate.subs.some((sub) => sub.code === row.code));
    const kind = parent ? 'sub asset type' : 'asset type';
    const name = normalizedName(row);
    if (!name) {
      const isUsed = row.savedName || !isBlank(row)
        || assetRow?.subs.some((sub) => normalizedName(sub) || !isBlank(sub));
      return isUsed ? `Every ${kind} needs a name.` : '';
    }
    const siblings: AmountRow[] = parent ? parent.subs : this.rows();
    return siblings.some((other) => other.code !== row.code && normalizedName(other) === name)
      ? `There is more than one ${kind} named ${row.name.trim()}${parent ? ` in ${parent.name.trim()}` : ''}`
        + `${siblings.some((other) => other.hidden && normalizedName(other) === name) ? ' (one is hidden)' : ''}.` : '';
  }

  /** Hidden in the database and without amounts; one loaded with amounts stays listed while they are retyped. */
  private isTuckedAway(row: AmountRow): boolean {
    const loaded = this.loadedAmounts.get(row.code);
    return row.hidden && row.savedHidden && isBlank(row) && !loaded?.invested && !loaded?.value;
  }

  /** An asset type may have its own amounts or amounts of sub asset types, not both. */
  private hasBothAmounts(row: AmountRow): boolean {
    const assetRow = this.rows().find((candidate) => candidate.code === row.code);
    return !!assetRow && !isBlank(assetRow) && assetRow.subs.some((sub) => !isBlank(sub));
  }

  private replaceRow(changed: AssetRow): void {
    this.rows.update((rows) => rows.map((row) => row.code === changed.code ? changed : row));
  }

  private focusName(code: string): void {
    // Renders the new row now, so that it can take the focus.
    this.changeDetector.detectChanges();
    document.getElementById(this.inputId(code, 'name'))?.focus();
  }

  private showError(message: string, inputId: string): void {
    this.error.set(message);
    if (!document.getElementById(inputId)) {
      this.showHidden.set(true);
      this.changeDetector.detectChanges();
    }
    document.getElementById(inputId)?.focus();
  }

  private confirmDiscard(): boolean {
    const changed = this.ready() && JSON.stringify(this.rows()) !== this.loadedRows;
    return !changed || window.confirm('Discard your unsaved changes?');
  }

  loadMonth(): void {
    this.loadSubscription?.unsubscribe();
    this.loadFailed.set(false);
    this.ready.set(false);
    this.error.set('');
    this.showErrors.set(false);
    this.notice.set(`Loading ${this.monthLabel()}…`);
    this.rows.set([]);
    this.loadSubscription = this.portfolioEntriesService
      .getMonth(environment.currentUserId, this.market(), this.month())
      .subscribe({
        next: (month) => {
          if (!month.assetTypes || !month.subAssetTypes) {
            // An older folio-portfolio-api; saving an empty table would clear the month.
            this.notice.set('');
            this.loadFailed.set(true);
            this.error.set('Asset types could not be loaded. Restart the portfolio service (port 8081) to update it.');
            return;
          }
          this.monthIsSaved.set(month.saved);
          this.setRows(month);
          this.notice.set(month.saved
            ? `Saved amounts for ${this.monthLabel()}.`
            : month.sourceMonth
              ? `${this.monthLabel()} is not saved yet. Filled in from ${formatMonth(month.sourceMonth)}; update and save.`
              : `${this.monthLabel()} is not saved yet.`);
          this.ready.set(true);
          this.focusFirstField();
        },
        error: (error: unknown) => {
          this.notice.set('');
          this.loadFailed.set(true);
          this.error.set(apiErrorMessage(error, `${this.monthLabel()} could not be loaded.`));
        },
      });
  }

  private setRows(month: PortfolioMonth): void {
    const entriesByCode = new Map(month.entries.map((entry) => [entry.subAssetType ?? entry.assetType, entry]));
    const toRow = (code: string, name: string, hidden: boolean): AmountRow => {
      const entry = entriesByCode.get(code);
      return {
        code,
        name,
        savedName: name,
        hidden,
        savedHidden: hidden,
        invested: entry ? String(entry.investedAmount) : '',
        value: entry ? String(entry.currentValue) : '',
      };
    };
    const rows: AssetRow[] = month.assetTypes.map(({ assetType, name, hidden }) => ({
      ...toRow(assetType, name, hidden),
      subs: month.subAssetTypes.filter((sub) => sub.assetType === assetType)
        .map((sub) => toRow(sub.subAssetType, sub.name, sub.hidden)),
    }));
    this.loadedAmounts = new Map(rows.flatMap((row) => [row, ...row.subs])
      .map((row) => [row.code, { invested: row.invested, value: row.value }]));
    this.loadedRows = JSON.stringify(rows);
    this.rows.set(rows);
  }

  /** Once per dialog, after the fields are enabled. */
  private focusFirstField(): void {
    if (!this.focusPending) {
      return;
    }
    this.focusPending = false;
    const row = this.rows().find((candidate) => candidate.code === this.focusCode()) ?? this.visibleRows()[0];
    const isSub = this.rows().some((candidate) => candidate.subs.some((sub) => sub.code === this.focusCode()));
    // A summed asset type has no field of its own; its first used sub asset type takes the focus.
    const code = isSub ? this.focusCode() : row && this.isSummed(row) ? row.subs.find((sub) => !isBlank(sub))?.code : row?.code;
    if (code) {
      setTimeout(() => document.getElementById(this.inputId(code, 'invested'))?.focus());
    }
  }
}

/** The client picks the code, so that a repeated save does not add the row twice. */
function newRow(prefix: 'CUSTOM' | 'SUB'): AmountRow {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const digits = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return { code: `${prefix}_${digits}`, name: '', savedName: '', hidden: false, savedHidden: false, invested: '', value: '' };
}

function addUp(rows: readonly AmountRow[]): { invested: number; value: number } {
  return {
    invested: rows.reduce((sum, row) => sum + (parseAmount(row.invested) ?? 0), 0),
    value: rows.reduce((sum, row) => sum + (parseAmount(row.value) ?? 0), 0),
  };
}

/** No amounts for a blank row, else one. Call only after both amounts were checked. */
function toAmounts(row: AmountRow): { investedAmount: number; currentValue: number }[] {
  const investedAmount = parseAmount(row.invested);
  const currentValue = parseAmount(row.value);
  return investedAmount === null || currentValue === null ? [] : [{ investedAmount, currentValue }];
}

function isChanged(row: AmountRow): boolean {
  return row.name.trim() !== row.savedName || row.hidden !== row.savedHidden;
}

function normalizedName(row: AmountRow): string {
  return row.name.trim().toLowerCase();
}

function parseAmount(text: string): number | null {
  return parseDecimal(text, MAX_INTEGER_DIGITS, MAX_FRACTION_DIGITS);
}

function isBlank(row: AmountRow): boolean {
  return !row.invested.trim() && !row.value.trim();
}
