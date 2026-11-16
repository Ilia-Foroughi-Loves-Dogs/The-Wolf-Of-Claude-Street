import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPurchase, balances, buy, demoPortfolio, emptyPortfolio, holdings, loadPortfolio, portfolioValue, runAutoInvest, sell, updateAutoInvest, type Portfolio } from '../src/lib/engine';
import { growthProjection, MARKETS, STRATEGIES } from '../src/lib/markets';
import { normalizeChart } from '../src/lib/market-provider';

const at = '2026-11-13T12:00:00.000Z';
function funded(dollars: number): Portfolio {
  // Purchases ending in .01 create a 99-cent round-up; allocation 0 keeps it all in savings.
  let state: Portfolio = { ...emptyPortfolio(), allocation: 0 };
  for (let i = 0; i < dollars; i++) state = addPurchase(state, { id: `p${i}`, merchant: 'Shop', category: 'Shopping', amount: '1.01', at });
  return state;
}

test('buying moves protected savings into a fractional position at the quoted price', () => {
  const state = buy(funded(10), { symbol: 'SPY', name: 'S&P 500 ETF', price: 500, amountCents: 500, at });
  const b = balances(state), [h] = holdings(state);
  assert.equal(b.savings, 990 - 500);
  assert.equal(b.invested, 500);
  assert.equal(h.symbol, 'SPY');
  assert.equal(h.shares, 0.01);
  assert.deepEqual(portfolioValue(state, { SPY: 550 }), { valueCents: 550, costCents: 500, gainCents: 50, gainPercent: 10, priced: true });
  assert.doesNotThrow(() => loadPortfolio(JSON.stringify(state)));
});

test('buying cannot exceed savings and requires a valid price', () => {
  const state = funded(2);
  assert.throws(() => buy(state, { symbol: 'SPY', name: 'S&P 500 ETF', price: 500, amountCents: 199 }), /Only \$1\.98/);
  assert.throws(() => buy(state, { symbol: 'SPY', name: 'S&P 500 ETF', price: 0, amountCents: 100 }), /live price/);
  assert.throws(() => buy(state, { symbol: 'SPY', name: 'S&P 500 ETF', price: 500, amountCents: 0 }), /at least/);
});

test('sells return proceeds to savings and track realized gains with average cost', () => {
  let state = buy(funded(10), { symbol: 'AAPL', name: 'Apple', price: 100, amountCents: 800, at });
  state = sell(state, { symbol: 'AAPL', price: 150, amountCents: 600, at });
  let b = balances(state);
  assert.equal(b.savings, 190 + 600);
  assert.equal(b.realized, 600 - 400);
  assert.equal(b.invested, 400);
  state = sell(state, { symbol: 'AAPL', price: 150, all: true, at });
  b = balances(state);
  assert.equal(holdings(state).length, 0);
  assert.equal(b.invested, 0);
  assert.equal(b.savings, 190 + 1200);
  assert.equal(b.realized, 400);
  assert.throws(() => sell(state, { symbol: 'AAPL', price: 150, all: true }), /do not own/);
  assert.doesNotThrow(() => loadPortfolio(JSON.stringify(state)));
});

test('loading rejects tampered trades', () => {
  const state = buy(funded(10), { symbol: 'SPY', name: 'S&P 500 ETF', price: 500, amountCents: 500, at });
  const trade = state.ledger.at(-1)!;
  assert.throws(() => loadPortfolio(JSON.stringify({ ...state, ledger: [...state.ledger.slice(0, -1), { ...trade, shares: 1 }] })), /Invalid trade amount/);
  const oversold = { ...trade, id: 'x', side: 'sell', shares: 0.02, amountCents: 1000 };
  assert.throws(() => loadPortfolio(JSON.stringify({ ...state, ledger: [...state.ledger, oversold] })), /more shares sold/);
  assert.throws(() => loadPortfolio(JSON.stringify({ ...state, ledger: [...state.ledger.slice(0, -1), { ...trade, amountCents: 5000, shares: 0.1 }] })), /Invalid ledger balance/);
});

test('portfolios saved before investing load with a default auto-invest rule', () => {
  const legacy = JSON.parse(JSON.stringify(funded(1))); delete legacy.autoInvest;
  const loaded = loadPortfolio(JSON.stringify(legacy));
  assert.equal(loaded.autoInvest.enabled, false);
  assert.equal(loaded.autoInvest.mix.reduce((n, m) => n + m.weight, 0), 100);
});

test('auto-invest sweeps a share of savings across the mix once the threshold is reached', () => {
  const prices = { SPY: 500, QQQ: 400 };
  let state = updateAutoInvest(funded(10), { enabled: true, thresholdCents: 1000, percent: 50, mix: [{ symbol: 'SPY', name: 'S&P 500 ETF', weight: 70 }, { symbol: 'QQQ', name: 'Nasdaq-100 ETF', weight: 30 }] });
  assert.equal(runAutoInvest(state, prices, at).investedCents, 0, 'below threshold');
  state = addPurchase(state, { id: 'p-extra', merchant: 'Shop', category: 'Shopping', amount: '1.01', at });
  const result = runAutoInvest(state, prices, at);
  // $10.89 cash → 50% = $5.44 → SPY $3.80, QQQ $1.63
  assert.equal(result.investedCents, 380 + 163);
  assert.deepEqual(holdings(result.state).map(h => [h.symbol, h.costCents]), [['SPY', 380], ['QQQ', 163]]);
  assert(result.state.ledger.filter(e => e.kind === 'trade').every(e => e.kind === 'trade' && e.auto));
  assert.equal(runAutoInvest({ ...state, autoInvest: { ...state.autoInvest, enabled: false } }, prices, at).investedCents, 0, 'disabled');
  assert.equal(runAutoInvest(state, { SPY: 500 }, at).investedCents, 0, 'missing price');
});

test('auto-invest rules must be valid', () => {
  const state = emptyPortfolio();
  assert.throws(() => updateAutoInvest(state, { ...state.autoInvest, mix: [{ symbol: 'SPY', name: 'S&P', weight: 60 }] }), /add up to 100/);
  assert.throws(() => updateAutoInvest(state, { ...state.autoInvest, mix: [{ symbol: 'SPY', name: 'S&P', weight: 50 }, { symbol: 'SPY', name: 'S&P', weight: 50 }] }), /once/);
  for (const strategy of STRATEGIES) {
    assert.equal(strategy.mix.reduce((n, m) => n + m.weight, 0), 100, strategy.name);
    assert(strategy.mix.every(m => MARKETS.some(info => info.symbol === m.symbol)), strategy.name);
  }
});

test('the demo portfolio includes valid trades and enabled auto-invest', () => {
  const demo = demoPortfolio(new Date(at));
  assert.equal(holdings(demo).length, 4);
  assert(demo.autoInvest.enabled);
  assert(balances(demo).savings >= 0);
  assert.doesNotThrow(() => loadPortfolio(JSON.stringify(demo)));
});

test('growth projection compounds monthly and reports contributions', () => {
  const flat = growthProjection(10000, 1000, 2, 0);
  assert.deepEqual(flat.at(-1), { year: 2, contributed: 340, value: 340 });
  const grown = growthProjection(0, 10000, 10, 0.1);
  assert.equal(grown.length, 11);
  assert(grown.at(-1)!.value > grown.at(-1)!.contributed);
});

test('chart normalization uses the live price and rejects empty data', () => {
  const info = MARKETS[0];
  const closes = Array.from({ length: 250 }, (_, i) => 100 + i);
  const quote = normalizeChart(info, { chart: { result: [{ meta: { regularMarketPrice: 400, regularMarketTime: 1_700_000_000 }, indicators: { quote: [{ close: [...closes, null] }] } }] } })!;
  assert.equal(quote.price, 400);
  assert.equal(quote.previousClose, 348);
  assert.equal(quote.history.at(-1), 400);
  assert(quote.history.length <= 61);
  assert.equal(quote.yearChangePercent, 300);
  assert.equal(normalizeChart(info, { chart: { result: [] } }), null);
  assert.equal(normalizeChart(info, { chart: { result: [{ meta: { regularMarketPrice: 0 }, indicators: { quote: [{ close: [1, 2] }] } }] } }), null);
});
