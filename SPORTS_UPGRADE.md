# Live sports simulator upgrade

The existing application, ledger and risk controls are retained. Open `/simulator` for the live schedule and virtual scenario workspace.

## Start

```bash
npm install
cp .env.example .env.local
npm run dev -- --port 3010
```

Open http://127.0.0.1:3010/simulator. If a Next.js development server already runs for this repository, use that server instead of starting a second one. Production: `npm run build`, then `npm start -- --port 3010`.

## Provider and credentials

ESPN’s public scoreboard JSON endpoints supply actual team names, leagues, UTC start times and statuses. There is no sports API key or paid subscription. Requests stay on the server; the client calls `/api/sports?timezone=America%2FLos_Angeles` with its own IANA timezone. The server derives today from its current clock and filters start times by the viewer’s calendar date. Adjacent provider dates cover timezone boundaries. Successful raw responses have a bounded 55-second cache; failures never return expired cached data as a fallback. The browser refreshes every 60 seconds and on tab visibility changes.

This publicly accessible ESPN endpoint is not a contracted API with a published SLA. Loading, unavailable-league warnings, empty schedules and complete failure states are implemented. Soccer covers the leagues listed in `src/lib/sports.ts`, including major European leagues, MLS, Champions League, UEFA/CONMEBOL qualifying and international friendlies; it does not cover every soccer competition worldwide. NFL/MLB have no games on many dates.

For live Claude explanations only, put the following in the gitignored `.env.local`, then restart:

```dotenv
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Use a model enabled for your account. Never use `NEXT_PUBLIC_` for keys. With no key or on provider failure, the advisor clearly identifies its deterministic explanation. No live Claude response has been verified without credentials.

## Scenario behavior

- Each selected game defaults to a **50% hypothetical probability** and **2.00× illustrative multiplier**. The only probability choices are 10%, 20%, …, 90%. Changing probability never changes the multiplier.
- All financial inputs and stored results use integer cents. Exact decimal ratios avoid floating-point payout errors, including combined multipliers. Payout is rounded once; displayed EV is rounded to cents. Payout includes principal, profit excludes it, and maximum loss is the entire amount at risk.
- Up to eight distinct games can be combined. Every selected team must win. Multipliers multiply as a hypothetical payout rule. Probabilities multiply only after explicit independence consent. Otherwise the user must choose a manual combined probability; until then EV and settlement are unavailable. Manual probabilities inconsistent with the individual probability bounds are rejected.
- A soccer draw counts as the selected team not winning at regulation time. Final games are labeled retrospective what-ifs. Unavailable, canceled, delayed or postponed selections cannot run.
- Outcomes are immediate virtual random draws using the assumptions. They do not predict, track, or settle from actual game results. There are no real-money or sportsbook transactions.
- Savings remain inaccessible. The existing exposure, funding and gross daily loss caps run before every settlement. Blocked financial attempts remain auditable. Saved portfolios from before the upgrade continue to load.
- Simulator explanations and the AI Advisor receive selected teams, schedule provenance, individual assumptions, combination model, calculated payout/profit/EV, maximum loss, and budget impact. Selected context remains available when navigating to AI Advisor.

## Verification

```bash
npm run typecheck
npm test
npm run build
node --import tsx scripts/verify-sports.ts
APP_URL=http://127.0.0.1:3010 npm run test:smoke
```

Real provider verification on **2026-11-13 in America/Los_Angeles** returned **24 games: NBA 9, NHL 2, soccer 13; NFL 0 and MLB 0**. All configured league feeds returned valid responses without warnings. Examples included New York Knicks at Indiana Pacers at **2026-11-14T00:00Z = November 13, 4:00 PM PST**, and international friendlies. These are dated verification results, never fallback data. `scripts/verify-sports.ts` retrieves current responses and verifies local dates and team fields each time it runs.

Thirty-one engine/API tests cover probability boundaries, payout and profit, EV, break-even, combined assumptions and constraints, exact cent rounding, statuses, timezone rollover and DST, provider errors, legacy ledger loading and savings isolation. The desktop/mobile browser suite verifies real responses through the application endpoint, all filters, local start times, every probability option, stable odds, team selection, single and combined settlement, explicit/manual probabilities, advisor context, 60-second refresh via a browser clock, empty/error/partial feed states, responsive layouts and no runtime errors. Existing round-ups, charts, transactions, savings goals, allocation, reviews, reset and demo loading are exercised too. Screenshots are saved in `test-results/`.

TypeScript and the optimized production build pass. Claude SDK success/error/empty-output paths are mocked; a live Claude call remains dependent on a user-supplied credential.

## Changed files

| File | Change |
| --- | --- |
| `src/app/api/sports/route.ts` | New timezone-aware server schedule endpoint |
| `src/lib/sports.ts` | Sports/league coverage, provider validation, local date and status normalization |
| `src/lib/sports-provider.ts` | Real ESPN requests, bounded cache, deduplication and failure handling |
| `src/components/sports-simulator.tsx` | Three-column sports lab, controls, combined scenarios, calculations and explanations |
| `src/app/globals.css` | Emerald cards, probability controls and responsive sports layout |
| `src/lib/engine.ts` | Scenario legs, probability enforcement, combined math and exact cent payouts |
| `src/components/application.tsx` | Replace former simulator and pass active context to AI Advisor |
| `src/components/portfolio-provider.tsx` | Hold selected scenario context across navigation |
| `src/app/api/advisor/route.ts` | Accept full scenarios and distinguish schedule facts from assumptions |
| `src/lib/advisor.ts` | Scenario context and numerical deterministic explanations |
| `tests/sports.test.ts` | Provider normalization, date/status and failure tests |
| `tests/scenarios.test.ts` | Probability, cent arithmetic, combined scenarios and savings tests |
| `tests/advisor-api.test.ts` | Full sports scenario context through the advisor API |
| `scripts/smoke-test.mjs` | Expanded browser regressions and actual sports checks |
| `scripts/verify-sports.ts` | Repeatable real provider verification |
| `.env.example` | Explain key-free sports and optional server-only Claude credentials |
| `README.md`, `SPORTS_UPGRADE.md` | Setup, features, coverage, test evidence and limitations |
| `next-env.d.ts` | Next.js regenerated production route type references during build |
