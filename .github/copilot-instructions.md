# Copilot instructions — Folio Pro

## Product context
Folio Pro is a personal wealth and market-research dashboard. Its visual language: charcoal/dark
surfaces, restrained borders, muted gray text, bright blue actions, and small warm-yellow accents. The
login page uses a split layout with a branded feature panel and a focused sign-in form.

The US and India watchlist pages use real backend data (`folio-portfolio-api` on 8081 for
watchlists, `folio-market-feed-svc` on 8082 for FMP/Tapetide/Upstox market data). All other screens use mock
data.

## Rules

For every code change, follow:

- `.github/instructions/project.instructions.md`: backends and proxy paths, component and model
  conventions, watchlist column rules, verification and documentation for this app. Edited here.
- Shared standards, copied from https://github.com/omkarchorghe16/dev-standards (do not edit them
  here; change them there and run its `sync.sh`):
  - `.github/instructions/change-hygiene.instructions.md`
  - `.github/instructions/angular-coding-standards.instructions.md`
  - `.github/instructions/angular-ui-and-accessibility.instructions.md`

Reusable workflows are in `.github/skills/*/SKILL.md` (components, HTTP services, testing). Use the
relevant skill; the instruction files stay authoritative for rules that apply to every change.
`project.instructions.md` wins where it is more specific.
