import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { API_DOCS } from '../../core/models/api-docs';
import { ADMIN_ACTIONS, AdminAction, AdminActionGroup } from '../../core/models/admin-actions';
import { AdminActionResult, AdminActionsService } from '../../core/services/admin-actions.service';
import { ShellComponent } from '../../shared/components/shell/shell.component';

const GROUPS: readonly { name: AdminActionGroup; description: string }[] = [
  { name: 'Scheduled jobs', description: 'Run a scheduled job now, for example when a scheduled run was missed or failed.' },
  { name: 'Other actions', description: 'Other backend calls, such as health checks.' },
];

/**
 * Admin page: Swagger links for each backend (API_DOCS), then one card per entry in ADMIN_ACTIONS, each with a
 * Run button and the result of its last run.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ShellComponent],
  // Results arrive in HTTP callbacks, so the view must refresh without OnPush inputs changing.
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-shell>
      <div class="page-shell admin-page">
        <div class="page-header">
          <div>
            <h1>Admin</h1>
            <p>Open each service's Swagger UI, and trigger scheduled jobs and other backend calls on demand.</p>
          </div>
        </div>

        <section class="admin-group" aria-labelledby="group-api-docs">
          <div class="group-heading">
            <h2 id="group-api-docs">API documentation</h2>
            <p>Open a service's Swagger UI in a new tab to browse its contract and run requests with "Try it out".</p>
          </div>
          <div class="action-grid">
            <article class="card action-card" *ngFor="let docs of apiDocs">
              <header class="action-header">
                <div>
                  <span class="service-badge" [class.service-8081]="docs.service === 'folio-portfolio-api'">
                    {{ docs.service }}
                  </span>
                  <h3>Swagger UI</h3>
                </div>
                <a class="run-button swagger-button" [href]="docs.swaggerUiUrl" target="_blank" rel="noopener noreferrer"
                  [attr.aria-label]="'Open ' + docs.service + ' Swagger UI in a new tab'">Open Swagger</a>
              </header>
              <p class="action-description">{{ docs.description }}</p>
              <dl class="action-meta">
                <div><dt>Swagger UI</dt><dd><code>{{ docs.swaggerUiUrl }}</code></dd></div>
                <div><dt>OpenAPI</dt><dd><a [href]="docs.openApiUrl" target="_blank" rel="noopener noreferrer"
                  [attr.aria-label]="'Open ' + docs.service + ' OpenAPI JSON in a new tab'"><code>{{ docs.openApiUrl }}</code></a></dd></div>
              </dl>
            </article>
          </div>
        </section>

        <section class="admin-group" *ngFor="let group of groups" [attr.aria-labelledby]="'group-' + slug(group.name)">
          <div class="group-heading">
            <h2 [id]="'group-' + slug(group.name)">{{ group.name }}</h2>
            <p>{{ group.description }}</p>
          </div>
          <div class="action-grid">
            <article class="card action-card" *ngFor="let action of actionsIn(group.name)">
              <header class="action-header">
                <div>
                  <span class="service-badge" [class.service-8081]="action.service === 'folio-portfolio-api'">
                    {{ action.service }}
                  </span>
                  <h3>{{ action.name }}</h3>
                </div>
                <button type="button" class="run-button" [disabled]="isRunning(action)" (click)="run(action)"
                  [attr.aria-label]="'Run ' + action.name">
                  {{ isRunning(action) ? 'Running…' : 'Run now' }}
                </button>
              </header>
              <p class="action-description">{{ action.description }}</p>
              <dl class="action-meta">
                <div *ngIf="action.schedule"><dt>Schedule</dt><dd>{{ action.schedule }}</dd></div>
                <div><dt>Endpoint</dt><dd><code>{{ action.method }} {{ displayUrl(action) }}</code></dd></div>
              </dl>
              <div class="action-result" *ngIf="results[action.id] as result" role="status"
                [class.is-ok]="result.ok" [class.is-error]="!result.ok">
                <div class="result-line">
                  <strong>{{ result.ok ? 'Succeeded' : 'Failed' }}</strong>
                  <span>{{ result.status ? 'HTTP ' + result.status : 'No response' }} · {{ result.durationMs | number }} ms
                    · {{ result.finishedAt | date:'mediumTime' }}</span>
                </div>
                <pre>{{ result.body }}</pre>
              </div>
            </article>
          </div>
        </section>
      </div>
    </app-shell>
  `,
  styles: [`
    .admin-group { margin-bottom:28px; }
    .group-heading { margin-bottom:12px; }
    .group-heading h2 { margin:0; font-size:1.05rem; font-weight:700; }
    .group-heading p { margin:5px 0 0; color:var(--muted); font-size:.8rem; }
    .action-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:14px; }
    .action-card { display:flex; flex-direction:column; gap:12px; padding:18px; }
    .action-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .action-header h3 { margin:8px 0 0; font-size:1rem; }
    .service-badge { display:inline-block; padding:3px 8px; border:1px solid #4b8cff55; border-radius:99px; background:#4b8cff18; color:#9dc0ff; font-size:.66rem; font-weight:600; }
    .service-badge.service-8081 { border-color:#4dd0c455; background:#4dd0c418; color:#4dd0c4; }
    .run-button { flex-shrink:0; min-height:36px; padding:0 14px; border:1px solid var(--positive); border-radius:6px; background:var(--positive); color:#0f2a1e; font-size:.76rem; font-weight:700; white-space:nowrap; }
    .run-button:hover:not(:disabled) { background:#46d196; border-color:#46d196; }
    .run-button:disabled { cursor:progress; opacity:.6; }
    .swagger-button { display:inline-flex; align-items:center; border-color:var(--primary); background:var(--primary); color:white; text-decoration:none; }
    .swagger-button:hover { filter:brightness(1.1); }
    .action-meta a { color:inherit; }
    .action-description { margin:0; color:var(--muted); font-size:.8rem; line-height:1.5; }
    .action-meta { display:grid; gap:6px; margin:0; font-size:.74rem; }
    .action-meta div { display:grid; grid-template-columns:72px minmax(0,1fr); gap:8px; }
    .action-meta dt { color:var(--muted); }
    .action-meta dd { margin:0; overflow-wrap:anywhere; }
    .action-meta code { color:var(--text); font-size:.72rem; }
    .action-result { padding:10px 12px; border:1px solid var(--border); border-radius:6px; background:var(--panel-raised); }
    .action-result.is-ok { border-color:#35be8466; }
    .action-result.is-error { border-color:#eb707b80; }
    .result-line { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; font-size:.74rem; }
    .result-line span { color:var(--muted); }
    .is-ok .result-line strong { color:#56d69c; }
    .is-error .result-line strong { color:#f28a92; }
    pre { max-height:180px; margin:8px 0 0; overflow:auto; color:var(--text); font-size:.7rem; white-space:pre-wrap; overflow-wrap:anywhere; }
    @media(max-width:620px) { .action-grid { grid-template-columns:1fr; } }
  `],
})
export class AdminComponent implements OnDestroy {
  readonly groups = GROUPS;
  readonly apiDocs = API_DOCS;
  results: Record<string, AdminActionResult> = {};
  private readonly running = new Set<string>();
  private readonly subscriptions = new Subscription();

  constructor(private readonly adminActionsService: AdminActionsService) {}

  actionsIn(group: AdminActionGroup): readonly AdminAction[] {
    return ADMIN_ACTIONS.filter((action) => action.group === group);
  }

  isRunning(action: AdminAction): boolean {
    return this.running.has(action.id);
  }

  run(action: AdminAction): void {
    if (this.isRunning(action) || (action.confirm && !window.confirm(action.confirm))) {
      return;
    }
    this.running.add(action.id);
    this.subscriptions.add(this.adminActionsService.run(action).subscribe((result) => {
      this.running.delete(action.id);
      this.results = { ...this.results, [action.id]: result };
      if (!result.ok) {
        console.error(`[Admin] ${action.name} failed`, result);
      }
    }));
  }

  /** Shows 8081 URLs without the host so both services read the same way. */
  displayUrl(action: AdminAction): string {
    return action.url.replace(/^https?:\/\/[^/]+/, '');
  }

  slug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
