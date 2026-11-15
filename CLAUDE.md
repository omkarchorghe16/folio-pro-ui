# Folio Pro Angular app — guide for Claude Code

Follow `.github/copilot-instructions.md`; it holds the project conventions and applies here too.
`README.md` describes the screens, the three-service setup, and the known gaps.

## Commands

```bash
npm start                                   # ng serve on 4200 with proxy.conf.json
npx ng build                                # production build; must have no errors or budget warnings
npx tsc --noEmit -p tsconfig.app.json --noUnusedLocals --noUnusedParameters
```

`npm test` does not work yet (no spec files).

## Related repositories (siblings in ../)

- `invesment-management-svc` (8081): watchlists, favorites, CSV import, column preferences. Flyway
  migrations; keep its H2 `test-schema.sql` in step.
- `news-scheduler-svc` (8082): FMP (US) and Tapetide/Upstox (India) market data under `/api/fmp` and
  `/api/india`.

## Before debugging "no data" problems

Check that each process was started after the relevant change (`lsof -nP -iTCP:<port> -sTCP:LISTEN`,
then `ps -o lstart= -p <pid>`). `ng serve` loads `proxy.conf.json` only at startup, and the backends
apply migrations and CORS settings only at startup. A `200` whose body is `<!doctype html>` means the
dev server is not proxying that path.
