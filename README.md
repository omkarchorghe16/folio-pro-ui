# Folio Pro (WealthPilot)

Angular 22 front end for a personal wealth and market-research workspace: a dark, charcoal UI with blue
highlights and warm-yellow accents.

The **US and India watchlist pages** use real backend data. Every other screen (dashboard, portfolio,
stock screener, IPO, crypto, profile, settings) still shows mock data from
`core/services/wealth.service.ts`. Login is a UI prototype only; there is no authentication, and every
backend call acts as user `1`. Nothing on any screen is investment advice.

## Screens

| Route | Screen | Data |
|---|---|---|
| `/login`, `/register` | Sign-in / sign-up prototype | none (not connected) |
| `/dashboard` | Ideas dashboard | mock |
| `/portfolio`, `/stocks`, `/ipo`, `/crypto` | Portfolio, stock screener, IPO pipeline, crypto | mock |
| `/watchlists/us` | **US watchlist** (`/watchlists` redirects here) | live: invesment-management-svc + FMP via news-scheduler-svc |
| `/watchlists/india` | **India watchlist** | live: invesment-management-svc + Tapetide via news-scheduler-svc |
| `/profile`, `/settings` | Profile and settings | mock |

### Watchlist pages

- Opens with a watchlist already selected (US: `TOP`; India: the first in the list) and loads its stocks.
- Dropdown lists every watchlist, starred (favorite) lists first. The star saves to the backend.
- Table columns are chosen under **Edit columns** and saved per user (shared by both pages). The India
  page adds India-only columns (NSE/BSE codes, cap category, promoter holding, ROCE, growth, analyst
  ratings, pros/cons, …).
- Every column header sorts (▲ ascending, ▼ descending, off). Each watchlist opens sorted by market
  cap, largest first. Market cap is shown as T / B / M; Change % has two decimals.
- **Company description** column: *View* opens the description, plus research links that open in a
  new tab — US: Yahoo, TradingView, Finviz, Google Finance, IMG (Google search); India: TradingView,
  Screener, Finology, IMG.
- **＋ Add stocks** (next to the dropdown) opens a dialog to pick stocks. On the India page, typing
  searches NSE tickers and company names (`GET /api/india/nse/symbols`, 8082); picking a match puts it
  under *Stocks to add*. **Save** writes them to the selected watchlist for user 1
  (`POST /api/v1/watchlists/india/{id}/items?userId=1` → `watchlist_items_india`, all or none). The US
  page suggests symbols from the loaded watchlists and keeps added stocks for the session only.
- **Import CSV** creates watchlists for the current market; **Export CSV** downloads the current list.

## Running locally

The watchlist pages need all three services:

| Service | Repo | Port | Start |
|---|---|---|---|
| Angular UI | this repo | 4200 | `npm install` then `npm start` |
| Watchlists API | `../invesment-management-svc` | 8081 | IntelliJ or `mvn spring-boot:run` |
| Market data (FMP, Tapetide) | `../news-scheduler-svc` | 8082 | IntelliJ or `mvn spring-boot:run` |

Both backends use the shared PostgreSQL database `folio_pro`. Open http://localhost:4200.

`npm start` runs `ng serve --proxy-config proxy.conf.json`. The proxy forwards `/api/fmp` and
`/api/india` to port 8082; watchlist calls go straight to `environment.apiBaseUrl`
(`http://localhost:8081`).

**Restart after configuration changes.** `ng serve` reads `proxy.conf.json` only at startup, Flyway
migrations in invesment-management-svc run only at startup, and CORS changes in either backend need a
restart. A stale process is the usual cause of empty tables or a `200` response that contains the
Angular `index.html` instead of JSON.

## Build

```bash
npm run build                                  # production build into dist/
npx ng build --configuration development       # faster, unoptimized
```

There are no unit tests yet, so `npm test` currently fails with "No inputs were found" (see Known gaps).

## Project structure

```text
src/
  main.ts                 bootstrap: zone change detection, HttpClient, router
  environments/           apiBaseUrl (8081) and currentUserId (1)
  app/
    app.routes.ts         routes, including /watchlists/us and /watchlists/india
    core/models/          wealth.models.ts (WatchlistItem, WatchlistMetricKey, …)
    core/services/
      watchlists.service.ts                    list watchlists, star/un-star (8081)
      watchlist-import.service.ts              CSV import (8081)
      watchlist-column-preferences.service.ts  saved table columns (8081)
      fmp-profiles.service.ts                  US profiles via /api/fmp (8082)
      tapetide-profile.service.ts              India profiles via /api/india (8082)
      nse-symbols.service.ts                   NSE ticker/name search via /api/india (8082)
      wealth.service.ts                        mock data for the other screens
    features/             one standalone component per screen
    shared/components/    ShellComponent (top nav + rail), auth shell, metric card
proxy.conf.json           dev-server proxy for /api/fmp and /api/india
docs/architecture.md      architecture plan and what is built so far
WealthManagement.drawio   system diagram
```

## Known gaps

- No unit tests; `tsconfig.spec.json` matches no files and the Karma test builder is deprecated.
- `watchlists.component.ts` is ~1,900 lines (UI, provider mapping, sorting, CSV). Mapping and sorting
  should move into tested services.
- No production environment: `apiBaseUrl` is hard-coded to localhost and the `/api/fmp`, `/api/india`
  paths only work through the dev proxy.
- Favorite *stocks* (the star in each table row) are stored in browser `localStorage`, unlike favorite
  watchlists, which are stored in the backend.

## Conventions

See `.github/copilot-instructions.md` (also used by Claude Code through `CLAUDE.md`).
