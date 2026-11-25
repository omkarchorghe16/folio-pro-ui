# WealthPilot — Application Architecture and Implementation Plan

> **Status:** Architecture baseline plus a record of what is built (updated 2026-11-15). Sections 1–9 are the target plan; section 0 describes the current implementation, which differs from the plan in places.  
> **Scope:** Angular personal wealth-management application with a Java service and relational database.  
> **Principle:** Begin as a modular monolith. Keep domain boundaries explicit; split services only when scale or team ownership justifies it.

## 0. What is built today

The dashboard and the watchlist feature are connected to backends. Other screens use mock data.

```mermaid
flowchart LR
    Browser[Angular UI :4200\n/dashboard · /watchlists/us · /watchlists/india] -->|/api/v1/* direct, CORS| Inv[folio-portfolio-api :8081\nwatchlists · favorites · CSV import · column prefs\nportfolio entries · stock holdings]
    Browser -->|/api/fmp, /api/india via ng serve proxy| News[folio-market-feed-svc :8082\nFMP · Tapetide · Upstox · news digests]
    Inv -->|Flyway-managed tables| DB[(PostgreSQL folio_pro)]
    News -->|Hibernate ddl-auto tables, cached provider JSON| DB
    News -->|HTTPS, keys server-side| Providers[FMP · Tapetide · Upstox · Finnhub · NewsAPI · Alpha Vantage]
```

| Area | Plan (sections below) | Built |
|---|---|---|
| Backend shape | One Java modular monolith | Two Spring Boot services sharing one database: `folio-portfolio-api` (watchlists, portfolios) and `folio-market-feed-svc` (market data, news digests) |
| Watchlist schema | `watchlist` + `watchlist_item` referencing `instrument`, UUID keys | Split by market: `watchlists_usa` / `watchlists_india` and `watchlist_items_usa` / `watchlist_items_india`; numeric IDs from one shared sequence; `user_id` and `is_favorite` on both watchlist tables; items store symbol and name only (no instrument table) |
| Monthly portfolio | Ledger transactions, derived holdings | `portfolio_entries_usa` / `portfolio_entries_india`: one hand-entered row per user, month and asset type (invested, current value) with fixed country and currency. Totals, allocation and monthly return are calculated by the API, not stored. Users can rename the 11 default asset types and add their own (`portfolio_asset_types_usa` / `portfolio_asset_types_india`, V11); entries refer to a fixed code. One asset type has many sub asset types (`portfolio_sub_asset_types_usa` / `portfolio_sub_asset_types_india`, V12) through a foreign key that includes `user_id`; an entry may refer to one. Types are hidden (`is_hidden`, V13), never deleted, so past months keep them. The dashboard shows no month or year picker and always saves the current calendar month |
| Stock holdings | Derived from ledger transactions | `stock_holdings_usa` / `stock_holdings_india`: symbol, quantity, average cost. The UI joins them with prices by symbol (`fmp_stock_profiles`) or symbol and exchange (`upstox_stock_quotes`) through the existing 8082 endpoints; no foreign keys to those tables |
| User preferences | — | `watchlist_column_preferences` (columns and order per user), shared by both watchlist pages |
| Market data | Provider adapter inside the monolith, values carry source/asOf | `folio-market-feed-svc` caches FMP profiles (US) and Tapetide datasets (India) in PostgreSQL; the UI fetches them per symbol and maps them to table columns. India prices come from Upstox quotes or Tapetide, whichever is newer, and rows can show their price source and time. When Tapetide is paused (quota or plan), its saved fundamentals are shown. Market cap is not stored with watchlist items, so sorting by it happens in the UI |
| Identity | Authentication before personal data | None. Every call uses user `1` (`environment.currentUserId`); services are development-only |
| Watchlist ordering | — | API lists favorites first, then by ID; the UI sorts stocks by market cap (largest first) by default |

## 1. Goals and guardrails

- Deliver portfolio tracking, market research, IPO screening, crypto/instrument views, and watchlists incrementally.
- Keep business rules, authorization, persistence, and financial calculations on the backend; Angular is a presentation client.
- Use transaction records as the source of truth for holdings. Derive holdings and performance rather than editing a cached position as if it were a trade.
- Keep provider-specific market-data code behind an adapter. Record source and observation time, and represent stale or missing data explicitly.
- Start with read-only tracking and research. This plan does **not** include trade execution, custody, or brokerage integrations.
- Treat analysis as informational, not investment advice. Do not describe sample, delayed, or unavailable data as live.

## 2. System context and component architecture

```mermaid
flowchart LR
    User[End user] --> Browser[Browser]
    Browser --> Angular[Angular SPA\nDashboard · Portfolio · Stocks · IPO · Crypto · Watchlists · Profile]
    Angular --> ApiClient[Typed API services\nHTTP interceptors · DTOs · error mapping]
    ApiClient -->|HTTPS / JSON, /api/v1| Api[Java REST API]

    subgraph Backend[Java application — modular monolith]
      Api --> Auth[Identity & access boundary]
      Api --> Portfolio[Portfolio & transaction module]
      Api --> Instruments[Instrument catalog module]
      Api --> Watchlist[Watchlist module]
      Api --> Research[IPO screening & analysis module]
      Portfolio --> Calculations[Holdings & performance calculations]
      Research --> Calculations
      Instruments --> MarketAdapter[Market-data provider adapter]
      Portfolio --> Repositories[Persistence repositories]
      Instruments --> Repositories
      Watchlist --> Repositories
      Research --> Repositories
      Calculations --> Repositories
    end

    Repositories --> DB[(PostgreSQL)]
    MarketAdapter -->|HTTPS; credentials held server-side| Provider[External market-data provider\nwhen selected]
    Provider -->|prices · reference data · IPO data| MarketAdapter
```

### Responsibilities

| Component | Responsibility |
|---|---|
| Angular feature areas | Screens, forms, navigation, client-side presentation and input feedback. No financial authority or provider secrets. |
| Typed API services | Encapsulate HTTP calls and map API DTOs to UI models. Start with mock adapters if backend endpoints are not ready. |
| Java REST/API layer | Versioned contracts, authentication integration, authorization, validation, and consistent error responses. |
| Domain modules | Enforce ownership and business rules for profile, portfolios, transactions, instruments, watchlists, and research. |
| Calculation layer | Derive holdings and returns from ledger entries and prices according to documented calculation policies. |
| Provider adapter | Normalize external provider data, handle timeouts/rate limits, and carry source and freshness metadata into the domain. |
| PostgreSQL | Durable user, portfolio, ledger, reference, and analysis data. Schema changes are applied through versioned migrations. |

## 3. Key request and data flows

### 3.1 Record a portfolio transaction and refresh holdings

```mermaid
sequenceDiagram
    actor User
    participant UI as Angular portfolio UI
    participant API as Java REST API
    participant Auth as Authentication/authorization
    participant Domain as Portfolio & ledger module
    participant DB as PostgreSQL
    participant Calc as Holdings calculator

    User->>UI: Submit transaction
    UI->>API: POST /api/v1/portfolios/{id}/transactions
    API->>Auth: Resolve user and authorize portfolio access
    Auth-->>API: Authorized user context
    API->>Domain: Validate type, dates, currency, quantities, ownership
    Domain->>DB: Persist ledger transaction
    DB-->>Domain: Stored transaction
    Domain->>Calc: Recalculate derived holdings / summary
    Calc->>DB: Read ledger and eligible prices
    DB-->>Calc: Transactions and price observations
    Calc-->>API: Holdings and calculation timestamp
    API-->>UI: Transaction result + refreshed summary
    UI-->>User: Show success, values, currency, and as-of metadata
```

Reject invalid input with actionable field errors. Never trust a client-supplied user ID to establish ownership. Corrections to completed financial records should be auditable (for example, reversal/correction entries) rather than silent mutation.

### 3.2 Market-data and research flow

```mermaid
flowchart LR
    UI[Angular research screen] -->|GET /api/v1/instruments or /prices| API[Java API]
    API --> Auth[Authorize user / validate query]
    Auth --> Domain[Instrument & research modules]
    Domain --> Cache[(Optional cache in a later phase)]
    Domain --> Adapter[Provider adapter]
    Adapter --> Provider[Selected provider]
    Provider --> Adapter
    Adapter --> Normalize[Normalize values, currency, source, observedAt, status]
    Normalize --> Store[(Persist market observation when policy requires)]
    Store --> Domain
    Domain --> API
    API --> UI
    UI --> Label[Display source and data freshness]
```

A provider outage or absent observation must not silently become a zero price. Define whether each endpoint returns stored last-known data, an unavailable status, or an explicit error. Any last-known value must include its `asOf` time and freshness status.

## 4. Domain model and initial relational schema

Use UUID primary keys, UTC timestamps, ISO currency codes, and `NUMERIC`/decimal types for financial quantities and amounts (never binary floating point). Add foreign keys, `NOT NULL` constraints where applicable, and indexes based on actual query patterns. The schema below is a conceptual baseline; choose exact precision, scale, enum strategy, and deletion policy during migrations.

```mermaid
erDiagram
    APP_USER ||--|| USER_PROFILE : has
    APP_USER ||--o{ PORTFOLIO : owns
    PORTFOLIO ||--o{ INVESTMENT_TRANSACTION : records
    INSTRUMENT o|--o{ INVESTMENT_TRANSACTION : referenced_by
    APP_USER ||--o{ WATCHLIST : owns
    WATCHLIST ||--o{ WATCHLIST_ITEM : contains
    INSTRUMENT ||--o{ WATCHLIST_ITEM : listed_in
    INSTRUMENT ||--o{ MARKET_PRICE : priced_by
    INSTRUMENT o|--o{ IPO_OFFERING : associated_with
    APP_USER ||--o{ ANALYSIS_RUN : requests
```

| Entity/table | Initial fields and constraints |
|---|---|
| `app_user` | `id`, normalized unique `email`, `status`, `created_at`. Authentication credential storage/integration is a security design decision; never store credentials in the Angular app. |
| `user_profile` | `user_id` (PK/FK), `display_name`, `locale`, `timezone`, `preferred_currency`. |
| `portfolio` | `id`, `user_id` (FK), `name`, `base_currency`, `created_at`, nullable `archived_at`. Scope all reads and writes by the authenticated owner. |
| `instrument` | `id`, `symbol`, `name`, `asset_type`, `exchange`, `currency`, `country`, `provider_symbol`, `active`. Define symbol/exchange uniqueness and provider mapping rules. |
| `investment_transaction` | `id`, `portfolio_id` (FK), nullable `instrument_id` (FK for cash-only entries), `type`, `trade_date`, `quantity`, `unit_price`, `fee`, `currency`, `cash_amount`, `notes`, `created_at`. Validate required fields by transaction type. |
| `watchlist` | `id`, `user_id` (FK), `name`, `created_at`. |
| `watchlist_item` | `watchlist_id` (FK), `instrument_id` (FK), `added_at`; unique (`watchlist_id`, `instrument_id`). |
| `market_price` | `id`, `instrument_id` (FK), `price`, `currency`, `observed_at`, `source`, `data_status`. Index (`instrument_id`, `observed_at`). Never overwrite provenance. |
| `ipo_offering` | `id`, nullable `instrument_id` (FK), `company_name`, `exchange`, `expected_date`, `price_low`, `price_high`, `status`, `source`, `updated_at`. Record source/freshness and allow unconfirmed fields. |
| `analysis_run` | `id`, `user_id` (FK), `analysis_type`, `inputs_json`, `result_json`, `data_as_of`, `created_at`. Store criteria and relevant data timestamp to make outputs interpretable. |

### Data integrity and calculation policies

- Store money, quantities, unit prices, and fees using explicit decimal precision and currency. Do not add unlike currencies without an explicit FX conversion rule.
- Keep original transaction facts immutable after posting where feasible. Model corrections with an auditable reversal or correction record and retain actor/time metadata where appropriate.
- Derive a position from transactions. Any cached/materialized summary is disposable and rebuildable from the ledger and price observations.
- Distinguish trade date from record/creation time. Decide how time zones, market close, and non-trading days affect valuation.
- Persist provider/source, observed time, currency, and quality/freshness status with external observations.
- Enforce foreign keys and user ownership in backend logic; test that one user's IDs cannot expose another user's data.

## 5. Initial API contract map

All routes are versioned under `/api/v1`. Use JSON DTOs, consistent validation/error envelopes, pagination for collections, and explicit currency/source/`asOf` metadata. Exact HTTP methods and payloads should be captured in an OpenAPI contract before frontend/backend integration.

| Area | Initial routes |
|---|---|
| Profile | `GET /profile`, `PUT /profile` |
| Portfolios | `GET /portfolios`, `POST /portfolios`, `GET /portfolios/{portfolioId}`, `PATCH /portfolios/{portfolioId}` |
| Ledger | `GET /portfolios/{portfolioId}/transactions`, `POST /portfolios/{portfolioId}/transactions`; correction behavior to be specified explicitly |
| Derived views | `GET /portfolios/{portfolioId}/holdings`, `GET /portfolios/{portfolioId}/summary` |
| Instruments | `GET /instruments?query=...`, `GET /instruments/{instrumentId}`, `GET /instruments/{instrumentId}/prices` |
| Watchlists | `GET /watchlists`, `POST /watchlists`, `POST /watchlists/{watchlistId}/items`, `DELETE /watchlists/{watchlistId}/items/{instrumentId}` |
| IPO research | `GET /ipos` with filters and pagination; provider-backed data availability is a later decision |
| Analysis | `POST /analysis` with a defined type and validated inputs; response identifies assumptions and data timestamp |

Use stable API error codes and a predictable shape, for example: `code`, `message`, optional `fieldErrors`, and `requestId`. Do not expose stack traces or provider credentials to clients.

## 6. Frontend and backend organization

### Angular

```text
src/app/
  core/          # app-wide configuration, auth integration, API client, interceptors
  shared/        # reusable UI, formatting, loading/error states
  features/
    dashboard/
    portfolio/   # portfolio views, transactions, holdings
    stocks/      # instrument search/details
    ipo/
    crypto/
    watchlists/
    profile/
    auth/        # screens/integration only; backend remains auth authority
```

Keep feature-specific state local initially (Angular Signals or existing project conventions). Introduce broader state management only when cross-feature complexity warrants it. Put HTTP access behind typed feature services; keep mock implementations behind the same interface during incremental integration.

### Java service

Organize by domain feature rather than a single large controller/service package:

```text
<base-package>/
  shared/          # error model, clock, shared primitives
  identity/        # auth integration and user context
  portfolio/       # API, application/domain logic, persistence
  instrument/      # catalog and provider-neutral models
  watchlist/
  research/        # IPO and analysis use cases
  marketdata/      # provider port, adapter, normalization
```

Keep controllers thin. Put validation and use-case coordination in application services; keep business rules testable without HTTP or database dependencies. Use database migrations as the reviewed schema source of truth.

## 7. Security, reliability, and operations baseline

- Use HTTPS outside local development; keep secrets in the server-side secret/configuration system, not source control or Angular bundles.
- Integrate a suitable authentication provider/flow before exposing personal data. Enforce authorization on every object-level operation.
- Validate and bound user inputs; rate-limit sensitive or expensive endpoints as appropriate. Avoid logging credentials, tokens, or unnecessary financial details.
- Add database backups and a restore test before relying on persisted user records. Define retention/deletion requirements and audit needs.
- Add health/readiness endpoints, structured logs with request IDs, metrics, and monitoring for API and provider failures.
- Make provider calls time-bounded and handle rate limits/outages. A provider adapter should support contract tests and a deterministic stub for local development.
- Test financial calculations with decimal arithmetic, boundary cases, and fixed test fixtures. Avoid asserting performance results without agreed calculation definitions.

## 8. Implementation phases and acceptance checkpoints

1. **Agree on product and data policies** — transaction types, cost basis, returns, FX, provider, freshness, authentication approach, privacy/retention, and MVP scope. Record decisions below.
2. **Backend foundation** — confirm Java framework/build conventions, create migrations, health/error conventions, API contract, and test baseline.
3. **Ledger MVP** — portfolios, transaction recording/listing, ownership enforcement, and derived holdings. Test validation, reversals/corrections, decimal calculations, and cross-user access denial.
4. **Angular API integration** — typed API services and loading/empty/error states; replace mock data incrementally while preserving a mock adapter for development.
5. **Instrument catalog and watchlists** — search and organization of instruments; support unavailable data explicitly.
6. **Market data and research** — choose provider and licensing, implement adapter and provenance/freshness, then IPO screening and analysis with visible assumptions.
7. **Production readiness** — auth and security review, backup/restore test, monitoring, rate limits, privacy requirements, and documented operational procedures.

A phase is complete only when its API behavior is documented, authorization is tested, errors/loading/empty states are handled, and any displayed financial values carry the required currency and data timing context.

## 9. Decisions to resolve before production calculations

- Which transaction types ship first (buy, sell, dividend, fee, deposit, withdrawal, split, transfer)?
- Which cost-basis method is required (for example, FIFO or average cost), and how are corrections and corporate actions represented?
- Are returns time-weighted, money-weighted, or both? How are deposits/withdrawals treated?
- Which FX source and timestamp convention apply to multi-currency valuation?
- Which market-data/IPO provider is licensed and available? What do freshness tiers and outage behavior mean?
- What is the authentication model, user deletion/retention policy, and audit requirement?
- Is analysis limited to user-entered holdings and public information, and what disclosures are required?

Until these are decided, label relevant functionality as prototype/sample and avoid claiming authoritative live valuation or investment recommendations.

## 10. Decision log

| Date | Decision | Status / owner |
|---|---|---|
| 2026-11-08 | Start with an Angular SPA and Java modular monolith, backed by PostgreSQL; keep provider integration behind an adapter. | Baseline proposal; validate with project owner |
| 2026-11-08 | Ledger transactions are the source of truth; holdings are derived. | Baseline proposal; calculation policies still open |
| 2026-11-08 | Initial scope excludes order execution and brokerage custody. | Baseline proposal |
| 2026-11-14 | Watchlists stored in separate USA and India tables; `user_id` hardcoded to 1 until authentication exists. | Implemented (folio-portfolio-api V2–V6) |
| 2026-11-14 | US and India watchlists are separate routes (`/watchlists/us`, `/watchlists/india`) sharing one component. | Implemented |
| 2026-11-14 | Market data comes from `folio-market-feed-svc` (FMP for US, Tapetide for India), reached through the Angular dev proxy. | Implemented; production routing still open |
| 2026-11-15 | Favorite watchlists persisted in `is_favorite` and listed first by the API. | Implemented (V7) |
| 2026-11-15 | Legacy `/api/v1/preferences` and `user_preferences` removed in favour of column preferences and `is_favorite`. | Implemented (V8) |
| 2026-11-15 | Default market-cap sort done in the UI, not the API, because the watchlist service has no market data. | Implemented; backend sort available as a best-effort option |
| 2026-11-22 | India page uses Upstox quotes as the price fallback; folio-market-feed-svc pauses Tapetide after quota or plan-expired answers and serves saved fundamentals. No other configured provider covers Indian fundamentals on its current plan (FMP 402, Finnhub 403, Alpha Vantage premium-only). | Implemented |
| 2026-11-23 | Dashboard uses hand-entered monthly snapshots per asset type plus current stock holdings, in separate USA and India tables, instead of the planned ledger. Holdings are valued in the UI from existing price endpoints and kept out of net worth to avoid double counting. | Implemented (V9–V10); realized profit not tracked |
| 2026-11-24 | Month and year removed from the dashboard (pickers, labels, table column). Monthly snapshots stay in the API and database; the UI always edits the current calendar month. | Implemented |
| 2026-11-24 | Holdings store the sector as a name (`stock_holdings_*`.`sector`, V14) picked from a separate list per country in folio-market-feed-svc's `sectors` (`is_us`, `is_india`), seeded from FMP profiles, India watchlists and Tapetide profiles. No foreign key, so renaming a sector does not change saved holdings. | Implemented |
