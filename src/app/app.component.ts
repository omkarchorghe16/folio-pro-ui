import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  // Angular 22 defaults to OnPush, and an OnPush root that is never marked dirty stops change detection
  // from reaching routed pages. Eager here lets pages that update plain fields asynchronously
  // (e.g. the watchlists) refresh without a user click.
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterOutlet],
  template: `
    <div class="app-shell">
      <router-outlet></router-outlet>
    </div>
  `,
})
export class AppComponent {}
