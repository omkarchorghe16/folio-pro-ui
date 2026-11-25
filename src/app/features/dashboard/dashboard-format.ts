import { Currency } from '../../core/models/portfolio-entries.models';

export const MISSING = '—';

type OptionalNumber = number | null | undefined;

/** Shown in front of amount fields. */
export function currencySymbol(currency: Currency): string {
  return currency === 'INR' ? '₹' : '$';
}

/** Whole amounts without decimals, others with two; Indian digit grouping for INR. */
export function formatMoney(value: OptionalNumber, currency: Currency): string {
  if (value === null || value === undefined) {
    return MISSING;
  }
  const rounded = Math.round(value * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(rounded);
}

/** Adds + to gains; losses already carry a minus sign. */
export function formatSignedMoney(value: OptionalNumber, currency: Currency): string {
  const text = formatMoney(value, currency);
  return value !== null && value !== undefined && value > 0 ? `+${text}` : text;
}

export function formatSignedPercent(value: OptionalNumber): string {
  if (value === null || value === undefined) {
    return MISSING;
  }
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatQuantity(value: OptionalNumber): string {
  return value === null || value === undefined ? MISSING : new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value);
}

/** CSS class for a gain or loss; none for zero or missing. */
export function gainClass(value: OptionalNumber): string {
  return !value ? '' : value > 0 ? 'text-success' : 'text-danger';
}

/** The current calendar month as yyyy-MM, in local time. */
export function currentMonth(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-11" to "Nov 2026". */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));
}

/** The yyyy-MM month `offset` months after `month` (negative for earlier). */
export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

/**
 * Reads a typed non-negative decimal, ignoring $, ₹, thousands separators and spaces. Null when it is not a number or has
 * more digits than the backend stores.
 */
export function parseDecimal(text: string, maxIntegerDigits: number, maxFractionDigits: number): number | null {
  const cleaned = text.replace(/[$₹,\s]/g, '');
  const pattern = new RegExp(`^(\\d{1,${maxIntegerDigits}}(\\.\\d{0,${maxFractionDigits}})?|\\.\\d{1,${maxFractionDigits}})$`);
  return pattern.test(cleaned) ? Number(cleaned) : null;
}
