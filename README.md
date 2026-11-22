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
| `/admin` | Run scheduled jobs and other backend calls on demand | real (8081, 8082) |

### Admin page

Opened from **Admin** in the right-hand rail. Each card runs one backend call and shows the HTTP status, time
and response body. Scheduled jobs (all in news-scheduler-svc; invesment-management-svc has none): daily news
digest (`POST /api/digest/run`, asks for confirmation), NSE symbol sync (`POST /api/india/nse/sync`), US symbol
sync (`POST /api/us/nasdaq/sync`). Other actions: health checks for both services. To add a call, add an entry
to `ADMIN_ACTIONS` in `src/app/core/models/admin-actions.ts` (and its path prefix to `proxy.conf.json` if it
is a new 8082 path).

### Watchlist pages

- Opens with a watchlist already selected (US: `TOP`; India: the first in the list) and loads its stocks.
- Dropdown lists every watchlist, starred (favorite) lists first. The star saves to the backend.
- Table columns are chosen under **Edit columns** and saved per user (shared by both pages). The India
  page adds India-only columns (NSE/BSE codes, cap category, promoter holding, ROCE, growth, analyst
  ratings, pros/cons, …).
- All stocks of the selected watchlist are listed on one scrolling page (no pagination); the backend
  returns every watchlist and item in one response.
- India page: ETF rows have a soft violet tint and an **ETF** tag, and are always listed after the stocks
  (the column sort applies within each group). ETFs are recognised from NSE's ETF list
  (`GET /api/india/nse/symbols?type=ETF`, loaded once), a Tapetide stock type of ETF, or an ETF-style ticker.
- Every column header sorts (▲ ascending, ▼ descending, off). Each watchlist opens sorted by market
  cap, largest first. Market cap is shown as T / B / M; Change % has two decimals.
- The **Name** column links to the company's own website (from the FMP or Tapetide profile, new tab);
  it stays plain text until the profile loads or when the profile has no website.
- **Company description** column: *View* opens the description, plus research links that open in a
  new tab — US: Yahoo, TradingView, Finviz, Google Finance, IMG (Google search); India: TradingView,
  Screener, Finology, IMG (ETF rows show **ETF**, ETF Screen at `https://etfscreen.in/etf/{symbol}`, in place of Finology).
- **＋ Add stocks** (next to the dropdown) opens a dialog to pick stocks. Typing searches tickers and names:
  NSE on the India page (`GET /api/india/nse/symbols`), the US symbol directory on the US page
  (`GET /api/us/nasdaq/symbols`), both on 8082. Picking a match puts it under *Stocks to add*; **Save**
  writes them to the selected watchlist for user 1, all or none
  (`POST /api/v1/watchlists/{us|india}/{id}/items?userId=1` → `watchlist_items_usa` / `watchlist_items_india`).
- The trash icon next to a ticker's star removes that stock from the selected watchlist in the database
  after a confirm (`DELETE /api/v1/watchlists/{us|india}/{id}/items/{symbol}?userId=1`). It is hidden on
  the Favorites view.
- **Import CSV** adds to the current market: a column named like one of your existing watchlists adds its new symbols there (symbols already in it are skipped), and other columns create new watchlists. Nothing is deleted. **Export CSV** downloads all of the user's watchlists for the current market, whichever list is selected, in the same format (every watchlist name in row 1, each list's ticker symbols in its column from row 2; cells that would start a spreadsheet formula, such as `=HYPERLINK(...)`, are written as plain text) from `GET /api/v1/watchlists/export?market=…&userId=1` (8081), so the file can be imported again.

## Running locally

The watchlist pages need all three services:

| Service | Repo | Port | Start |
|---|---|---|---|
| Angular UI | this repo | 4200 | `npm install` then `npm start` |
| Watchlists API | `../invesment-management-svc` | 8081 | IntelliJ or `mvn spring-boot:run` |
| Market data (FMP, Tapetide) | `../news-scheduler-svc` | 8082 | IntelliJ or `mvn spring-boot:run` |

Both backends use the shared PostgreSQL database `folio_pro`. Open http://localhost:4200.

`npm start` runs `ng serve --proxy-config proxy.conf.json`. The proxy forwards `/api/fmp`, `/api/us`, `/api/digest` and
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
      watchlist-export.service.ts              CSV export (8081)
      watchlist-column-preferences.service.ts  saved table columns (8081)
      fmp-profiles.service.ts                  US profiles via /api/fmp (8082)
      tapetide-profile.service.ts              India profiles via /api/india (8082)
      nse-symbols.service.ts                   NSE ticker/name search via /api/india (8082)
      us-symbols.service.ts                    US ticker/name search via /api/us (8082)
      wealth.service.ts                        mock data for the other screens
    features/             one standalone component per screen
    shared/components/    ShellComponent (top nav + rail), auth shell, metric card
proxy.conf.json           dev-server proxy for /api/fmp, /api/us, /api/digest and /api/india
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
