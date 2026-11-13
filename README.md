# Wolf of Claude Street · RoundUp AI

A working, savings-first fintech prototype. Simulated purchase round-ups build protected savings while a separate virtual budget lets you explore probability, expected value, and risk limits. All funds and generated outcomes are simulated. Sports schedules come from the ESPN public scoreboard; probabilities and multipliers are user-selected hypothetical assumptions. No actual wagering, investment execution, or bank connections.

## Run locally

Requirements: Node.js 20.9+ and npm.

```bash
cd /Users/iliaforoughi/The-Wolf-Of-Claude-Street
npm install
cp .env.example .env.local
npm run dev -- --port 3010
```

Open [http://127.0.0.1:3010](http://127.0.0.1:3010). The first visit automatically loads a clearly labeled simulated portfolio. No sports API key is required. Live schedules require internet access to site.api.espn.com. Claude responses require the optional server-only key below; without it the advisor uses a labeled deterministic explanation.

Production:

```bash
npm run build
npm start -- --port 3010
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Optional server-only Anthropic credential. Without it, explanations run in clearly labeled deterministic demo mode. |
| `ANTHROPIC_MODEL` | Optional Claude model ID; defaults to `claude-sonnet-4-6`. Use a model available to your Anthropic account. |
| `APP_URL` | Optional browser test target; defaults to `http://127.0.0.1:3010`. |

Never prefix credentials with `NEXT_PUBLIC_`. Restart the server after changing `.env.local`. Keys are used only by `src/app/api/advisor/route.ts`. The route uses the official [Anthropic Messages API](https://platform.claude.com/docs/en/api/typescript/messages/create).

## Features

- Six responsive screens: Dashboard, Transactions, Savings, Risk Simulator, AI Advisor, Settings.
- Dark emerald dashboard, interactive Recharts, 7D / 1M / 3M / 1Y ranges, independent series toggles, and hover details.
- Integer-cent round-ups with an immediate split preview, input validation, and duplicate purchase protection. A $4.35 purchase produces exactly $0.65: $0.52 protected and $0.13 virtual at the default allocation.
- Searchable transactions, category filtering, and CSV export.
- Protected savings history, editable savings goal, progress bar, and conditional monthly / six-month projections.
- Real NBA, NFL, NHL, MLB and selected soccer schedules for the viewer’s current local date, local start times, live/final/upcoming status, 60-second refresh, sport filters, and individual game selection. Unavailable leagues show warnings; empty or failed feeds never substitute fictional events.
- A three-column sports lab with team selection, exactly nine probability buttons (10%–90%, default 50%), independent illustrative multiplier inputs, integer-cent virtual amounts, payout, profit, maximum loss, EV, break-even probability, and budget impact.
- Up to eight real games per combined scenario. Each game has its own team, probability and multiplier. Multiply probabilities only with explicit independence consent, or supply a manual combined probability. Inconsistent manual joint probabilities are rejected.
- Immediate virtual outcome settlement, with every outcome recorded in the ledger. Production simulations use browser cryptographic randomness; the seeded demo uses fixed illustrative outcomes.
- Enforced funding, scenario exposure, and daily gross-loss limits. Rejected attempts are recorded without moving funds.
- Configurable stricter limits and a factual seven-day risk report with completed violations distinguished from rejected attempts.
- Secure, read-only Claude explanations using structured portfolio context, including an explanation directly in the simulator. API failures visibly fall back to deterministic mode.
- Browser-local persistence, validation on load and every write, serialized writes across tabs using Web Locks where supported, and cross-tab updates.
- One-click demo loader with 50 purchases, six historical scenarios, and a sample review; confirmed reset to an empty portfolio.

## A judge demo in under three minutes

1. **0:00–0:25 — Dashboard.** The demo begins with 50 purchases. Point out round-ups, protected savings, the separate virtual budget, and the activity chart. Toggle the range or a chart series.
2. **0:25–0:50 — Add purchase.** Keep Coffee at **$4.35** and allocation at **80% protected / 20% virtual**. Show the **$0.65** preview, then save. The ledger adds **$0.52** to savings and **$0.13** to the virtual budget.
3. **0:50–1:30 — Risk Simulator.** Select an actual game from today’s schedule, choose a team, try the probability buttons, and run a **$0.01** virtual scenario. Then enter **$100.00** and run again: it is blocked with a recorded rejection and no balance movement. Protected savings stay unchanged.
4. **1:30–2:00 — Explain uncertainty.** Click **Explain this scenario’s uncertainty**, or visit AI Advisor and ask **How much could I save in six months?** The response identifies Claude or deterministic demo mode and uses the actual recorded data.
5. **2:00–2:30 — Review My Risk Limits.** Show the saved seven-day report, rejected attempt, exposure, losses, and savings isolation. Refresh to demonstrate persistence.

Use **Load Demo Portfolio** to restore the original portfolio before another presentation. The action replaces this browser’s progress after a confirmation dialog.

## Financial and risk rules

The ledger is the source of truth. There are three entry types: `purchase` (round-up split), `outcome` (virtual payout minus virtual exposure), and `protect` (one-way transfer from virtual contributions into savings when a cap is tightened). There is **no savings-to-simulator operation**. Displayed balances are reductions of these entries, never independently writable values.

- Round-up cents: `(100 - purchaseCents % 100) % 100`; whole-dollar purchases produce zero.
- Virtual contribution: `floor(roundupCents × allocation / 100)`, also bounded by the cumulative funding cap. The remaining cents go to savings, so no cent is lost.
- Default maximum funding allocation: **20% of accumulated round-ups**. This limits contributed principal; virtual gains are separately tracked.
- Default maximum scenario exposure: **5% of the available virtual balance**, rounded down to cents.
- Default maximum gross daily loss: **10% of the day’s starting virtual balance**, rounded down to cents. The engine reserves the full possible loss before permitting a scenario; wins cannot offset gross losses.
- Days use **UTC**. Opening balance is derived from the ledger before midnight. If no virtual funds existed at midnight, the first simulation attempt locks the current balance as that day’s baseline. Later contributions and reloads cannot increase it. An initial rejected attempt with a zero balance therefore leaves zero capacity until the next UTC day.
- Settings allow only values within the default ceilings. Tightening the funding cap records a transfer of excess available virtual contributions into protected savings; if funds cannot cover that transfer, the change is rejected.
- Allocation slider changes apply to **new purchases**. Existing protected savings are never reallocated. The purchase dialog updates the dollar split before committing it.
- Decimal multipliers are converted to exact integer ratios. All leg multipliers are applied before payout is rounded once to cents; for example 75 cents × 1.10 × 1.40 pays 116 cents. EV uses the rounded payout: `p × payoutCents − stakeCents`, rounded to the nearest cent for display. Historical records from before this upgrade retain their original settlement rounding.
- Combined `p = p1 × … × pn` is available only after explicit independence consent. Otherwise a user-entered joint probability is required for EV/settlement. It must be consistent with the individual probability bounds. Multiplier products remain hypothetical and do not imply statistical independence. Positive estimated EV does not establish a real advantage.
- Six-month savings projection uses recorded average round-ups per day and the currently selected future savings allocation. It assumes constant activity, 30-day months, no interest, and no returns. It is not a promise.

## Verification

```bash
npm run typecheck
npm test
npm run build
node --import tsx scripts/verify-sports.ts

# With a local server running:
npm run test:smoke
```

Engine and API tests cover cent arithmetic, exact combined payout rounding, all nine probabilities, allocation conservation, isolated savings, both outcome branches, exposure/daily-loss limits, legacy persistence, combined/manual assumptions, demo integrity, and factual reviews. Sports tests cover timezone rollover, DST, status mapping, all sport integrations, malformed provider responses, and partial/total failures.

The Playwright smoke test exercises the full demo flow, refresh persistence, filtering, a blocked and a permitted simulation, AI demo context, reviews, goal editing, stricter limits, reset, demo reload, mobile navigation, layout overflow, and browser errors. Run it against a server without an API key so answers are deterministic and incur no provider charges. It uses installed Google Chrome on macOS; otherwise install a Playwright browser with `npx playwright install chromium`. Screenshots are written to `test-results/`.

Verified for the sports upgrade: **31 engine/API tests**, TypeScript compilation, the optimized production build, and the desktop/mobile smoke suite. Browser checks include exact local times, every sport filter, all probability controls, independent odds, calculator formulas, multiple real games, manual/independent combined probabilities, 60-second refresh using a controlled browser clock, API failure/empty states, savings isolation and all existing pages. Real schedule verification on **2026-11-13, America/Los_Angeles** returned **9 NBA, 2 NHL and 13 soccer games**, valid empty NFL/MLB schedules, and no league warnings. No live Claude request was made; provider wiring and fallbacks are tested with mocked responses.

## Implementation

Next.js App Router, TypeScript, Tailwind CSS v4, shadcn/ui-style Button and Dialog components using Radix primitives, Lucide icons, Recharts, Zod validation, and the Anthropic TypeScript SDK. `components.json` supports adding further shadcn/ui components.

Sports upgrade implementation, provider coverage, setup and changed-file inventory: [SPORTS_UPGRADE.md](SPORTS_UPGRADE.md).

Key files: `src/lib/engine.ts` (ledger and controls), `src/lib/advisor.ts` (context and fallback), `src/components/portfolio-provider.tsx` (persistence), `src/components/application.tsx` (screens), and `src/app/api/advisor/route.ts` (server-only AI).

## Sports data access

The server reads ESPN’s unauthenticated public JSON scoreboards at `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard`. **No key, account, paid subscription, private credentials, or access bypass is used.** This is a public endpoint rather than a contracted developer API; ESPN publishes no availability guarantee for this integration. Provider changes may require adapter updates. Requests time out after 12 seconds; successful responses are cached for at most 55 seconds, concurrent requests are deduplicated, and expired data is never used as an error fallback. The browser refreshes every 60 seconds and when the tab becomes visible.

Soccer coverage: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, MLS, Champions League, UEFA and CONMEBOL World Cup qualifying, and international friendlies. It is not a complete worldwide soccer feed. Off-season or no-game days legitimately show an empty list. Postponed/canceled/delayed games are identified; final games can be explored only as labeled retrospective what-ifs. No market odds are imported; every multiplier is explicitly illustrative.

## Known limitations

- No Plaid Sandbox integration or deployment; these optional features were excluded to keep the requested local prototype complete.
- No real money, interest, investment execution, pending scenarios, or scheduled background reviews. Reviews are generated on demand and saved locally. Virtual outcomes are generated immediately using the selected probability; they are never settled from real sports results.
- Browser storage is editable by its owner, not a secure financial database. Data is specific to the browser and origin. Clearing site data removes it. This prototype is not suitable for production financial use.
- Browser storage must be enabled. Corrupt saved data is preserved and normal writes are blocked until a deliberate reset/demo reload. Web Locks require a supporting browser; cross-tab serialization falls back to single-tab behavior elsewhere.
- Fifty purchases can generate less than $50 in total round-ups. The dashboard deliberately uses the real computed demo amounts rather than invented larger balances. Charts show only recorded history, so longer ranges can include a flat early period.
- Live Claude responses require a valid key, account access to the chosen model, and network connectivity. Live provider access cannot be verified without credentials. Deterministic explanations are tested and clearly identified; chat text itself is not persisted between page visits.
- The AI endpoint is intended for localhost. Production deployment would require authentication and provider rate limiting.
