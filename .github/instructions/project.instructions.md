---
applyTo: "**"
---

# Project rules: Folio Pro Angular app

Repository-specific rules. The shared rules in the other `.github/instructions/` files (managed by
dev-standards) also apply; where this file is more specific, it wins. Edit this file here.

## Backends

- `folio-portfolio-api` (8081): monthly portfolio entries, stock holdings, watchlists, favorites, CSV import,
  column preferences. URLs
  come from `environment.apiBaseUrl`.
- `folio-market-feed-svc` (8082): FMP (US) and Tapetide/Upstox (India) market data, US symbol search and digests under the relative
  `/api/fmp`, `/api/india`, `/api/us` and `/api/digest` paths served by the dev proxy (`proxy.conf.json`). `SectorsService` calls
  `/api/sectors` and `/api/stocks` at `environment.marketFeedBaseUrl`.
- There is no authentication; the user ID is `environment.currentUserId` (1).
- India page: fundamentals from Tapetide (`/api/india/tapetide/profile`), prices from Upstox
  (`/api/india/upstox/quotes`, `UpstoxQuotesService`) or Tapetide, whichever is newer
  (`withNewestIndiaPrice`). `/api/india/tapetide/status` reports when the backend has paused Tapetide.
- Dashboard: US and India amounts are never converted or added together. Stock holdings are valued in the browser
  (`holding-calculations.ts`) and stay out of the monthly net worth.
- The dashboard and the US and India watchlist pages use real backend data. All other screens use mock data from
  `core/services/wealth.service.ts`.

## Components

- Reuse `ShellComponent` for product pages.
- `main.ts` enables `provideZoneChangeDetection`. Components that update plain fields
  asynchronously set `changeDetection: ChangeDetectionStrategy.Eager`, as `AppComponent`,
  `AdminComponent` and `WatchlistsComponent` do.
- Existing components use inline templates and styles, `@Input()` decorators, `*ngIf`/`*ngFor` and
  constructor injection. Keep that style in existing files.

## Models and watchlist tables

- Typed models live in `core/models/wealth.models.ts`.
- A new watchlist table column needs a `WatchlistMetricKey`, an entry in `availableColumns` and a
  `getColumnValue` case.

## Tests and verification

- `npm test` does not work yet (no spec files). Verify with `npx ng build` and the strict `tsc`
  check.
- For watchlist changes, load `/watchlists/us` and `/watchlists/india` with all three services
  running.

## Documentation

When behavior, routes, services or setup change, update `README.md`; for architecture or data-flow
changes also update `docs/architecture.md` (section "What is built today" and the decision log).
