import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ODDS_LEAGUES, fairMultiplier, mergeBoards, normalizeKalshi, normalizePolymarket } from '../src/lib/odds';
import { addPurchase, emptyPortfolio, scenarioError, scenarioMetrics, simulate, type Portfolio, type Scenario } from '../src/lib/engine';

const now = new Date('2026-11-15T12:00:00Z');
const nba = ODDS_LEAGUES.find(l => l.sport === 'NBA')!, epl = ODDS_LEAGUES.find(l => l.name === 'Premier League')!;
const pmGame = (slug: string, title: string, start: string, prices: [string, string], closed = false) => ({
  id: slug, title, slug, startTime: start, eventDate: start.slice(0, 10),
  markets: [{ sportsMarketType: 'moneyline', outcomes: JSON.stringify(title.split(' vs. ')), outcomePrices: JSON.stringify(prices), closed }],
});
const kx = (event: string, team: string, name: string, bid: string, ask: string, settles = '2026-11-17T03:00:00Z') => ({ ticker: `${event}-${team}`, event_ticker: event, yes_sub_title: name, status: 'active', yes_bid_dollars: bid, yes_ask_dollars: ask, last_price_dollars: bid, occurrence_datetime: settles });

test('Polymarket: keeps upcoming two-way moneylines, skips started, props and lopsided games', () => {
  const games = normalizePolymarket([
    pmGame('nba-orl-bos-2026-11-16', 'Magic vs. Celtics', '2026-11-16T23:00:00Z', ['0.235', '0.765']),
    pmGame('nba-chi-cle-2026-11-14', 'Bulls vs. Cavaliers', '2026-11-14T23:00:00Z', ['0.4', '0.6']),
    pmGame('nba-orl-bos-2026-11-16-player-props', 'Magic vs. Celtics', '2026-11-16T23:00:00Z', ['0.5', '0.5']),
    pmGame('nba-mia-det-2026-11-16', 'Heat vs. Pistons', '2026-11-16T23:00:00Z', ['0.01', '0.99']),
    { junk: true },
  ], nba, now);
  assert.equal(games.length, 1);
  assert.deepEqual(games[0].teams.map(t => [t.name, t.probability]), [['Magic', .235], ['Celtics', .765]]);
  assert.equal(games[0].timeKnown, true);
});

test('Polymarket soccer: per-team Yes prices plus a draw', () => {
  const [game] = normalizePolymarket([{ id: 1, title: 'Arsenal FC vs. Chelsea FC', slug: 'epl-ars-che-2026-11-21', startTime: '2026-11-21T15:00:00Z', eventDate: '2026-11-21', markets: [
    { sportsMarketType: 'moneyline', groupItemTitle: 'Arsenal FC', outcomePrices: '["0.55","0.45"]' },
    { sportsMarketType: 'moneyline', groupItemTitle: 'Draw (Arsenal FC vs. Chelsea FC)', outcomePrices: '["0.25","0.75"]' },
    { sportsMarketType: 'moneyline', groupItemTitle: 'Chelsea FC', outcomePrices: '["0.2","0.8"]' },
  ] }], epl, now);
  assert.deepEqual(game.teams.map(t => t.probability), [.55, .2]); assert.equal(game.draw, .25);
});

test('Kalshi: uses bid/ask midpoints, keeps ticker team order, and merges with Polymarket by date and team', () => {
  const kalshi = normalizeKalshi({ markets: [kx('KXNBAGAME-26NOV16ORLBOS', 'BOS', 'Boston', '0.77', '0.78'), kx('KXNBAGAME-26NOV16ORLBOS', 'ORL', 'Orlando', '0.22', '0.23')] }, nba, now);
  assert.deepEqual(kalshi[0].teams.map(t => [t.name, t.probability]), [['Orlando', .225], ['Boston', .775]]);
  assert.equal(kalshi[0].timeKnown, false);
  const poly = normalizePolymarket([pmGame('nba-orl-bos-2026-11-16', 'Magic vs. Celtics', '2026-11-16T23:00:00Z', ['0.235', '0.765'])], nba, now);
  const [merged] = mergeBoards(poly, kalshi, 7, now);
  assert.equal(merged.name, 'Magic vs Celtics'); assert.equal(merged.timeKnown, true);
  assert.deepEqual(merged.teams.map(t => t.sources), [{ polymarket: .235, kalshi: .225 }, { polymarket: .765, kalshi: .775 }]);
  assert.deepEqual(merged.teams.map(t => t.probability), [.23, .77]);
});

test('fair payout never exceeds 1 / chance', () => {
  for (const p of [.03, .23, .5, .77, .97]) { const m = fairMultiplier(p); assert(m * p <= 1 + 1e-9); assert(m >= 1.01); }
  assert.equal(fairMultiplier(.5), 2); assert.equal(fairMultiplier(.77), 1.29);
});

function funded(): Portfolio { let s = emptyPortfolio(); for (let i = 0; i < 30; i++) s = addPurchase(s, { id: String(i), merchant: 'Coffee', category: 'Food & drink', amount: '4.01', at: '2026-11-14T12:00:00.000Z' }); return s; }
const at = now.toISOString();
const marketScenario = (p: number, multiplier = fairMultiplier(p), startsAt = '2026-11-16T23:00:00.000Z'): Scenario => ({
  event: 'Magic vs Celtics', probability: p, secondProbability: .5, multiplier, stakeCents: 10, combined: false, independent: false,
  legs: [{ eventId: 'pm:1', event: 'Magic vs Celtics', teamId: 'ORL', team: 'Magic', league: 'NBA', startsAt, status: 'Upcoming', source: 'Prediction markets', probability: p, multiplier, odds: { polymarket: p } }],
});

test('engine: market odds set the chance and payout; mismatched payouts and started games are refused', () => {
  const state = funded();
  assert.equal(scenarioError(state, marketScenario(.23), at), null);
  const m = scenarioMetrics(marketScenario(.23));
  assert.equal(m.multiplier, 4.34); assert.equal(m.payout, 43); assert(m.ev !== null && m.ev <= 0);
  assert.match(scenarioError(state, marketScenario(.23, 5), at)!, /match the market/);
  assert.match(scenarioError(state, marketScenario(.23, fairMultiplier(.23), '2026-11-15T11:00:00.000Z'), at)!, /already started/);
  assert.match(scenarioError(state, marketScenario(.01, 1.01), at)!, /lopsided/);
  assert.equal(simulate(state, marketScenario(.23), () => .2, at).outcome?.won, true);
  assert.equal(simulate(state, marketScenario(.23), () => .3, at).outcome?.won, false);
});

import { balances, loadPortfolio, pendingPicks, placePick, riskStatus, settlePick } from '../src/lib/engine';
import { kalshiResult, polymarketResult } from '../src/lib/odds';

test('real-game picks: stake leaves now, settles later on the real result, and survives reload', () => {
  const state = funded(), before = balances(state), s = marketScenario(.23);
  const placed = placePick(state, s, at);
  assert.equal(placed.error, undefined);
  assert.equal(balances(placed.state).risk, before.risk - 10);
  assert.equal(balances(placed.state).savings, before.savings);
  assert.equal(pendingPicks(placed.state).length, 1);
  assert.equal(riskStatus(placed.state, at).lost, 10, 'a pending pick counts fully against today’s loss limit');
  assert.deepEqual(loadPortfolio(JSON.stringify(placed.state)), JSON.parse(JSON.stringify(placed.state)));
  const id = placed.pick!.id;
  const won = settlePick(placed.state, id, 'won', '2026-11-17T03:00:00.000Z');
  assert.equal(balances(won).risk, before.risk - 10 + 43); assert.equal(pendingPicks(won).length, 0);
  assert.equal(riskStatus(won, at).lost, 0);
  assert.deepEqual(loadPortfolio(JSON.stringify(won)), JSON.parse(JSON.stringify(won)));
  assert.equal(settlePick(won, id, 'lost'), won, 'a pick settles only once');
  assert.equal(balances(settlePick(placed.state, id, 'lost')).risk, before.risk - 10);
  assert.equal(balances(settlePick(placed.state, id, 'void')).risk, before.risk);
  assert.equal(placePick(state, marketScenario(.23, fairMultiplier(.23), '2026-11-15T11:00:00.000Z'), at).error?.includes('already started'), true);
  const tampered = JSON.parse(JSON.stringify(won)); tampered.ledger.at(-1).payoutCents = 500;
  assert.throws(() => loadPortfolio(JSON.stringify(tampered)));
});

test('reads real results from Kalshi and Polymarket', () => {
  assert.equal(kalshiResult({ market: { status: 'finalized', result: 'yes' } }), 'won');
  assert.equal(kalshiResult({ market: { status: 'finalized', result: 'no' } }), 'lost');
  assert.equal(kalshiResult({ market: { status: 'active', result: '' } }), 'pending');
  const ev = (prices: string, closed = true) => ({ id: 1, title: 'Thunder vs. Kings', slug: 'nba-okc-sac-2026-11-15', markets: [{ sportsMarketType: 'moneyline', outcomes: '["Thunder","Kings"]', outcomePrices: prices, closed }] });
  assert.equal(polymarketResult(ev('["1","0"]'), 'Thunder'), 'won');
  assert.equal(polymarketResult(ev('["1","0"]'), 'Kings'), 'lost');
  assert.equal(polymarketResult(ev('["0.6","0.4"]', false), 'Kings'), 'pending');
  assert.equal(polymarketResult(ev('["0.5","0.5"]'), 'Kings'), 'void');
  const soccer = { id: 2, title: 'Arsenal FC vs. Chelsea FC', slug: 'epl-ars-che-2026-11-21', markets: [
    { sportsMarketType: 'moneyline', groupItemTitle: 'Arsenal FC', outcomePrices: '["0","1"]', closed: true },
    { sportsMarketType: 'moneyline', groupItemTitle: 'Draw (Arsenal FC vs. Chelsea FC)', outcomePrices: '["1","0"]', closed: true },
    { sportsMarketType: 'moneyline', groupItemTitle: 'Chelsea FC', outcomePrices: '["0","1"]', closed: true }] };
  assert.equal(polymarketResult(soccer, 'Arsenal FC'), 'lost', 'a draw is a loss');
});
