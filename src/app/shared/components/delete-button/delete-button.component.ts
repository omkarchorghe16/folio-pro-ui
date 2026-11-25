import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Icon-only delete button. */
@Component({
  selector: 'app-delete-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [disabled]="disabled()" [title]="label()" [attr.aria-label]="label()" (click)="pressed.emit()">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>
      </svg>
    </button>
  `,
  styles: [`
    :host { display:inline-block; vertical-align:middle; }
    button { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; margin-left:6px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--muted); }
    button:hover:not(:disabled) { background:color-mix(in srgb, var(--negative) 14%, transparent); color:var(--negative); }
    button:disabled { cursor:progress; opacity:.4; }
  `],
})
export class DeleteButtonComponent {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly pressed = output<void>();
}
