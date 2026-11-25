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

- **Portfolio** (summary cards, allocation, All portfolios, and growth at the end of the page): every **Edit** opens the same popup for
  that country. Enter *Invested* (total cost still held) and *Current value* for
  each asset type; there is no month or year to pick. Amounts are stored as the current calendar month, and the growth
  chart and *Monthly return* use those monthly snapshots. Earlier months stay saved but cannot be edited here. **＋ Add asset type** adds your own type and every type name can be edited; new and renamed types
  are kept per country. **＋ Sub asset type** adds any number of named entries (Home, Rental
  flat, …) under an asset type, which then shows their total; an asset type has either its own amounts or
  sub asset type amounts. Types are never deleted: **Hide** keeps them in saved months and leaves them out of new ones,
  and **Show hidden types** brings them back. In a new calendar month the popup is filled in from the latest saved amounts. Saving replaces
  that country's current month and stores the types in one request (`PUT /api/v1/users/{userId}/portfolio-entries/{US|India}/months/{yyyy-MM}`); totals,
  allocation, profit and monthly return come from `GET …/portfolio-entries/{US|India}/summary`.
- **Asset allocation by country**: **View** opens a popup with every asset type and sub asset type of that country
  (invested, current value, profit, share of the country's value) and **Edit** and a trash icon on each row.
- **Delete** (trash icon in the View and Edit popups; immediate after a confirm in View, with Save in Edit) removes the
  current amounts of an asset type, with its sub asset types, or of a sub asset type, and hides it. The API has no type
  delete, so earlier months keep their amounts and **Show hidden types** brings the type back.
- **All portfolios**: one table for the US and one for India. Asset type rows show the number of their sub asset types;
  sub asset type rows below them are muted, with a ↳ and an empty *Asset type* cell. An asset type with sub asset types
  is their total, so it has no **Edit** (here and in View); its sub asset types do.
- *Monthly return* is the change in profit divided by the previous calendar month's value, so new money is not
  counted as a gain. It is `—` without the previous month. Realized profit from sales is not tracked, and an asset
  added with an existing gain counts that gain in the month it is added.
- **Sector allocation** (US and India side by side, above the stocks & ETFs tables and from the same rows): money and
  percentage per sector, largest first; a sector opens to its stocks. *Invested* (quantity × average cost) or *Current
  value*. Holdings without a quantity (or, for current value, a price) are named and not counted.
- **US / India stocks & ETFs**: **＋ Add** searches tickers and company names in a dropdown (NSE or US symbol
  directory, as on the watchlist pages). **Sector** has a separate list per country from table
  `sectors` (`GET /api/sectors?market=US|INDIA`, 8082; fill it with `scripts/seed-sectors.sql` there). The sectors a stock
  is in come from `GET /api/stocks?ticker=` (8082) for the US and the user's India watchlists (8081) for India. A default is filled in. ETF: the sector it was listed under
  first in our own list, or `ETF` for a US ETF in none. US stock: the sector of its FMP profile. India stock: the sector
  in our own list. A stock in several sectors (`TOP` not counted) has its industry instead (FMP; India: the saved Tapetide
  profile), or the sector it was listed under first when there is no profile. The sector can be changed or left empty. Symbol, sector, quantity and average cost are saved in 8081
  (`/api/v1/users/{userId}/stock-holdings/{US|India}`); the browser adds prices from `POST /api/fmp/profiles` (US) and
  `GET /api/india/upstox/quotes` (India) and calculates value and profit (`holding-calculations.ts`). US prices
  refresh at most once a day and use the FMP quota shared with the US watchlist. India prices are live and reload
  every 60 seconds while the tab is visible and NSE is in normal hours. Quantity is optional. Holdings without a
  price or quantity show `—` and are left out of the totals; profit % needs only the price. These widgets are a detailed breakdown and are not included in net worth.

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

Both backends use the shared PostgreSQL database `folio_pro`. Start the database first (next section), then the
backends, then the UI. Open http://localhost:4200.

### Start the database

Use this after starting the laptop, or when pgAdmin or a backend reports `Connection refused` on port 5432
(macOS with Homebrew `postgresql@16`). Run it either way:

- **IntelliJ:** choose **Start Local Database** in the run configuration list and click ▶.
- **Terminal** (IntelliJ may also show a ▶ next to this command in the README editor):

```bash
npm run db:start
```

The script (`scripts/start-local-db.sh`) starts PostgreSQL if it is not running, checks that `folio_pro` can log in,
and opens pgAdmin. If the server does not start, it prints the last lines of the PostgreSQL log. It is safe to run
when the database is already running. `npm run db:start -- --no-open` leaves pgAdmin closed.

pgAdmin connection: host `localhost`, port `5432`, database `folio_pro`, user `folio_pro`.

To start PostgreSQL automatically at login, turn on **postgres** once under **System Settings → General → Login Items
& Extensions → Allow in the Background**. While it is off, macOS does not start the database after a restart.

`npm start` runs `ng serve --proxy-config proxy.conf.json`. The proxy forwards `/api/fmp`, `/api/us`, `/api/digest` and
`/api/india` to port 8082; watchlist calls go straight to `environment.apiBaseUrl`
(`http://localhost:8081`) and sector calls to `environment.marketFeedBaseUrl` (`http://localhost:8082`).

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
      sectors.service.ts                       sector lists (8082) and the sectors of a stock
      holding-prices.service.ts                prices of holdings (FMP, Upstox; 8082)
      wealth.service.ts                        mock data for the other screens
    features/             one standalone component per screen
    shared/components/    ShellComponent (top nav + rail), auth shell, metric card
proxy.conf.json           dev-server proxy for /api/fmp, /api/us, /api/digest and /api/india
scripts/start-local-db.sh starts PostgreSQL, checks the login and opens pgAdmin
.run/                     shared IntelliJ run configurations
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
