# Folio Pro (WealthPilot)

Angular 22 front end for a personal wealth and market-research workspace: a dark, charcoal UI with blue
highlights and warm-yellow accents.

The **dashboard** and the **US and India watchlist pages** use real backend data. Every other screen
(portfolio, stock screener, IPO, crypto, profile, settings) still shows mock data from
`core/services/wealth.service.ts`. Login is a UI prototype only; there is no authentication, and every
backend call acts as user `1`. Nothing on any screen is investment advice.

## Screens

| Route | Screen | Data |
|---|---|---|
| `/login`, `/register` | Sign-in / sign-up prototype | none (not connected) |
| `/dashboard` | Ideas dashboard | live: folio-portfolio-api (monthly entries, holdings) + FMP and Upstox prices via folio-market-feed-svc |
| `/portfolio`, `/stocks`, `/ipo`, `/crypto` | Portfolio, stock screener, IPO pipeline, crypto | mock |
| `/watchlists/us` | **US watchlist** (`/watchlists` redirects here) | live: folio-portfolio-api + FMP via folio-market-feed-svc |
| `/watchlists/india` | **India watchlist** | live: folio-portfolio-api + Tapetide and Upstox via folio-market-feed-svc |
| `/profile`, `/settings` | Profile and settings | mock |
| `/admin` | Run scheduled jobs and other backend calls on demand | real (8081, 8082) |

### Admin page

Opened from **Admin** in the right-hand rail. **API documentation** at the top links each service's Swagger UI
(`http://localhost:8081/swagger-ui.html`, `http://localhost:8082/swagger-ui.html`) and OpenAPI JSON
(`/v3/api-docs`). They open in a new tab on the service's own host, not through the dev proxy, so "Try it out"
sends requests straight to that service. The links are in `API_DOCS` (`src/app/core/models/api-docs.ts`) and
use `environment.apiBaseUrl` and `environment.marketFeedBaseUrl`.

Below that, each card runs one backend call and shows the HTTP status, time
and response body. Scheduled jobs (all in folio-market-feed-svc; folio-portfolio-api has none): daily news
digest (`POST /api/digest/run`, asks for confirmation), NSE symbol sync (`POST /api/india/nse/sync`), US symbol
sync (`POST /api/us/nasdaq/sync`). Other actions: health checks for both services. To add a call, add an entry
to `ADMIN_ACTIONS` in `src/app/core/models/admin-actions.ts` (and its path prefix to `proxy.conf.json` if it
is a new 8082 path).

### Dashboard

US (USD) and India (INR) are separate everywhere and never converted or added together.

- **Monthly portfolio** (summary cards, growth, allocation, All portfolios): every **Edit** opens the same popup for
  that country. Pick a month (not in the future) and enter *Invested* (total cost still held) and *Current value* for
  each asset type. **＋ Add asset type** adds your own type and every type name can be edited; new and renamed types
  are kept per country and apply to every month. **＋ Sub asset type** adds any number of named entries (Home, Rental
  flat, …) under an asset type, which then shows their total; in one month an asset type has either its own amounts or
  sub asset type amounts. Types are never deleted: **Hide** keeps them in saved months and leaves them out of new ones,
  and **Show hidden types** brings them back. A month with no data is filled in from the latest earlier month until saved. Saving replaces
  that country's month and stores the types in one request (`PUT /api/v1/users/{userId}/portfolio-entries/{US|India}/months/{yyyy-MM}`); totals,
  allocation, profit and monthly return come from `GET …/portfolio-entries/{US|India}/summary`.
- *Monthly return* is the change in profit divided by the previous calendar month's value, so new money is not
  counted as a gain. It is `—` without the previous month. Realized profit from sales is not tracked, and an asset
  added with an existing gain counts that gain in the month it is added.
- **US / India stocks & ETFs**: symbol, quantity and average cost are saved in 8081
  (`/api/v1/users/{userId}/stock-holdings/{US|India}`); the browser adds prices from `POST /api/fmp/profiles` (US) and
  `GET /api/india/upstox/quotes` (India) and calculates value and profit (`holding-calculations.ts`). US prices
  refresh at most once a day and use the FMP quota shared with the US watchlist. India prices are live and reload
  every 60 seconds while the tab is visible and NSE is in normal hours. Holdings without a price show `—` and are
  left out of the totals. These widgets are not included in the monthly net worth.

### Watchlist pages

- Opens with a watchlist already selected (US: `TOP`; India: the first in the list) and loads its stocks.
- Dropdown lists every watchlist, starred (favorite) lists first. The star saves to the backend. A filter box
  at the top of the open dropdown has focus, so typing narrows the list to names containing the text (any
  case); typing on the closed dropdown opens it with that letter. Enter opens the first match, Escape closes.
- Table columns are chosen under **Edit columns** and saved per user (shared by both pages). The India
  page adds India-only columns (NSE/BSE codes, cap category, promoter holding, ROCE, growth, analyst
  ratings, pros/cons, …).
- All stocks of the selected watchlist are listed on one scrolling page (no pagination); the backend
  returns every watchlist and item in one response.
- India page data: fundamentals come from Tapetide (`GET /api/india/tapetide/profile/{symbol}`, one request per
  stock). Prices come from Upstox (`GET /api/india/upstox/quotes`, batches of 100) or Tapetide, whichever is
  newer: price, Change %, open, day high/low, previous close, price change and volume. Upstox has no
  fundamentals. When folio-market-feed-svc has paused Tapetide (quota used up, plan expired or token
  rejected; `GET /api/india/tapetide/status`), a notice above the table says so. Fundamentals then show
  Tapetide's last saved values and prices come from Upstox. The optional **Price source**, **Price as of**
  and **Fundamentals as of** columns (India market group) show where each row's numbers come from.
- India page: ETF rows have a soft violet tint and an **ETF** tag, and are always listed after the stocks
  (the column sort applies within each group). ETFs are recognised from NSE's ETF list
  (`GET /api/india/nse/symbols?type=ETF`, loaded once), a Tapetide stock type of ETF, or an ETF-style ticker.
- US page: ETF rows get the same violet tint and **ETF** tag but keep their place in the sort. ETFs are
  recognised from the US symbol directory's ETF list (`GET /api/us/nasdaq/symbols?type=ETF`, loaded once) or
  FMP's `isEtf` profile flag, which also sets *Asset type* to ETF.
- Every column header sorts (▲ ascending, ▼ descending, off). Each watchlist opens sorted by market
  cap, largest first. Market cap is shown as T / B / M; Change % has two decimals.
- The **Name** column links to the company's own website (from the FMP or Tapetide profile, new tab);
  it stays plain text until the profile loads or when the profile has no website.
- **Company description** column: *View* opens the description, plus research links that open in a
  new tab — US: Yahoo, TradingView, Finviz, Google Finance, IMG (Google search for the ticker plus the asset name, e.g.
  `NVDA NVIDIA Corporation business products services images photos`); India: TradingView,
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

The dashboard and watchlist pages need all three services:

| Service | Repo | Port | Start |
|---|---|---|---|
| Angular UI | this repo | 4200 | `npm install` then `npm start` |
| Portfolio and watchlists API | `../folio-portfolio-api` | 8081 | IntelliJ or `mvn spring-boot:run` |
| Market data (FMP, Tapetide) | `../folio-market-feed-svc` | 8082 | IntelliJ or `mvn spring-boot:run` |

Both backends use the shared PostgreSQL database `folio_pro`. Open http://localhost:4200.

`npm start` runs `ng serve --proxy-config proxy.conf.json`. The proxy forwards `/api/fmp`, `/api/us`, `/api/digest` and
`/api/india` to port 8082; watchlist calls go straight to `environment.apiBaseUrl`
(`http://localhost:8081`).

**Restart after configuration changes.** `ng serve` reads `proxy.conf.json` only at startup, Flyway
migrations in folio-portfolio-api run only at startup, and CORS changes in either backend need a
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
      tapetide-profile.service.ts              India profiles and Tapetide pause status via /api/india (8082)
      upstox-quotes.service.ts                 India live quotes (price fallback) via /api/india (8082)
      nse-symbols.service.ts                   NSE ticker/name search via /api/india (8082)
      us-symbols.service.ts                    US ticker/name search via /api/us (8082)
      portfolio-entries.service.ts             monthly portfolio entries and summary (8081)
      stock-holdings.service.ts                held stocks and ETFs (8081)
      holding-prices.service.ts                prices of holdings (FMP, Upstox; 8082)
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
