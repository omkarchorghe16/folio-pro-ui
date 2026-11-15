# Copilot instructions — Folio Pro

## Product context
Folio Pro is a personal wealth and market-research dashboard. Its visual language: charcoal/dark
surfaces, restrained borders, muted gray text, bright blue actions, and small warm-yellow accents. The
login page uses a split layout with a branded feature panel and a focused sign-in form.

The US and India watchlist pages use real backend data (`invesment-management-svc` on 8081 for
watchlists, `news-scheduler-svc` on 8082 for FMP/Tapetide market data). All other screens use mock
data from `core/services/wealth.service.ts`. There is no authentication; the user ID is
`environment.currentUserId` (1).

## Engineering conventions
- Standalone Angular components, strict TypeScript, SCSS. Reuse `ShellComponent` for product pages.
- **Change detection:** Angular 22 makes components `OnPush` by default. A component that updates
  plain fields from HTTP/RxJS callbacks must set `changeDetection: ChangeDetectionStrategy.Eager`
  (as `AppComponent` and `WatchlistsComponent` do), or use signals / `markForCheck()`. Otherwise the
  view only refreshes after a click. `main.ts` enables `provideZoneChangeDetection`.
- Keep HTTP access in typed services under `core/services`; components never build URLs.
  Watchlist API URLs come from `environment.apiBaseUrl`; market-data calls use the relative
  `/api/fmp` and `/api/india` paths served by the dev proxy (`proxy.conf.json`).
- Use typed models in `core/models/wealth.models.ts`. New table columns need a `WatchlistMetricKey`,
  an entry in `availableColumns`, and a `getColumnValue` case.
- Show missing values as `—`, never as `0`. Keep raw numbers for sorting and format only for display
  (market cap as T/B/M, percentages with two decimals).
- Surface load failures to the user (status message), not only in the console.
- Keep the UI responsive and accessible: labelled inputs, keyboard-operable controls, semantic
  headings, visible focus states, adequate contrast. External links use
  `target="_blank" rel="noopener noreferrer"`.
- Do not imply that sample prices, insights, screener results, or returns are live or investment advice.
- Never store real passwords or add production auth behaviour without a backend contract.
- No secrets or API keys in the frontend; provider keys stay in the backends.
- Do not claim tests or builds passed unless they were actually run.

## Verifying changes
- `npx ng build` must finish without errors or budget warnings.
- `npx tsc --noEmit -p tsconfig.app.json --noUnusedLocals --noUnusedParameters` must report nothing.
- For watchlist changes, load `/watchlists/us` and `/watchlists/india` with all three services running.
  After editing `proxy.conf.json`, restart `ng serve`.

## Documentation
When behaviour, routes, services, or setup change, update `README.md` and, for architecture or data
flow changes, `docs/architecture.md` (section "What is built today" and the decision log).
