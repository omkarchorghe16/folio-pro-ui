# Folio Pro Angular app — guide for Claude Code

`README.md` describes the screens, the three-service setup, and the known gaps.

## Rules

Before any code change, use the `angular-coding-standards` skill
(`.claude/skills/angular-coding-standards/SKILL.md`). It loads the project rules, which live in
`.github/` and are shared with GitHub Copilot:

- `.github/copilot-instructions.md`: product context and the list of rule files.
- `.github/instructions/project.instructions.md`: rules for this app only (backends and proxy paths,
  `ShellComponent`, change detection, watchlist columns, verification, docs).
- `.github/instructions/*.instructions.md` (the rest): shared change-hygiene, Angular coding, UI and
  accessibility rules.
- `.github/skills/*/SKILL.md`: workflows for components, HTTP services and testing.

### Where to change a rule

- Rules for this app only: edit `project.instructions.md` or `copilot-instructions.md` here.
- Shared rules and skills: every file that starts with a `Managed by dev-standards` comment, plus
  `.claude/skills/angular-coding-standards`, is copied from
  https://github.com/omkarchorghe16/dev-standards (cloned at `../dev-standards`) and listed in
  `.github/dev-standards.lock`. Do not edit those copies here. Change them in `../dev-standards`, then
  run `./sync.sh --all` there and commit the result in each repository.
- `../dev-standards/sync.sh --check .` (run from this repository) reports drift.

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
