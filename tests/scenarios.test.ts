import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPurchase, balances, emptyPortfolio, loadPortfolio, payoutCents, PROBABILITY_OPTIONS, scenarioError, scenarioMetrics, simulate, type Scenario, type Portfolio } from '../src/lib/engine';
import { advisorContext, demoExplanation } from '../src/lib/advisor';
const at = '2026-11-13T12:00:00.000Z';
function funded(): Portfolio { let state = emptyPortfolio(); for (let i = 0; i < 30; i++) state = addPurchase(state, { id: String(i), merchant: 'Coffee', category: 'Food & drink', amount: '4.01', at: '2026-11-12T12:00:00.000Z' }); return state; }
const leg = (id: string, p = .5, multiplier = 2) => ({ eventId: id, event: 'Test schedule fixture', teamId: `team-${id}`, team: 'Selected test team', league: 'NBA', startsAt: at, status: 'Upcoming', source: 'ESPN public scoreboard' as const, probability: p, multiplier });
const scenario: Scenario = { event: 'Test scenario', stakeCents: 10, probability: .5, multiplier: 2, secondProbability: .5, combined: false, independent: false, legs: [leg('1')] };
test('all nine probabilities are accepted and update EV without changing payout or multiplier', () => {
  const state = funded();
  for (const option of PROBABILITY_OPTIONS) {
    const p = option / 100, s = { ...scenario, probability: p, legs: [leg('1', p)] };
    assert.equal(scenarioError(state, s, at), null); const m = scenarioMetrics(s);
    assert.equal(m.payout, 20); assert.equal(m.profit, 10); assert.equal(m.multiplier, 2); assert.equal(m.ev, Math.round(p * 20 - 10)); assert.equal(m.implied, .5);
  }
  for (const p of [0, .01, .15, .95, 1, 1.2, NaN]) assert(scenarioError(state, { ...scenario, probability: p, legs: [leg('1',p)] }, at));
});
test('cent settlement is accurate at decimal rounding boundaries', () => {
  assert.equal(payoutCents(100, 1.255), 126); assert.equal(payoutCents(50, 1.01), 51); assert.equal(payoutCents(10000, 2.35), 23500);
  assert.equal(payoutCents(75, [1.1, 1.4]), 116);
  assert.equal(scenarioMetrics({...scenario,combined:true,independent:true,multiplier:15,probability:.1,legs:[leg('1',.1,3),leg('2',.7,5)]}).ev,1);
  const newGeneric=simulate(funded(),{...scenario,legs:undefined,multiplier:1.255,stakeCents:2},()=>0,at).state;
  assert.deepEqual(loadPortfolio(JSON.stringify(newGeneric)),JSON.parse(JSON.stringify(newGeneric)));
  const m = scenarioMetrics({ ...scenario, stakeCents: 1000, multiplier: 2.5, probability: .6, legs: [leg('1', .6, 2.5)] });
  assert.equal(m.payout,2500); assert.equal(m.profit,1500); assert.equal(m.loss,1000); assert.equal(m.ev,500); assert.equal(m.implied,.4);
});
test('multiple games require explicit independence or a feasible manual joint probability', () => {
  const state = funded(), combined: Scenario = { ...scenario, combined: true, multiplier: 6, legs: [leg('1', .5, 2), leg('2', .6, 3)] };
  assert.equal(scenarioMetrics(combined).probability,null); assert.equal(scenarioMetrics(combined).ev,null); assert.match(scenarioError(state,combined,at)!, /manual/);
  const independent = { ...combined, independent: true };
  assert.equal(scenarioError(state,independent,at),null); assert.equal(scenarioMetrics(independent).probability,.3); assert.equal(scenarioMetrics(independent).multiplier,6); assert.equal(scenarioMetrics(independent).payout,60); assert.equal(scenarioMetrics(independent).ev,8);
  const manual = { ...combined, combinedProbability: .4 };
  assert.equal(scenarioError(state,manual,at),null); assert.equal(scenarioMetrics(manual).probability,.4); assert.equal(scenarioMetrics(manual).ev,14);
  assert.match(scenarioError(state,{...combined,combinedProbability:.9},at)!,/inconsistent/);
  assert(scenarioError(state,{...independent,legs:[leg('1'),leg('1')]},at));
  assert(scenarioError(state,{...independent,multiplier:3},at));
});
test('single, independent and manual combined outcomes preserve savings and persistence', () => {
  const state = funded(), before = balances(state);
  for (const s of [scenario, {...scenario, combined:true,independent:true,multiplier:4,legs:[leg('1'),leg('2')]}, {...scenario,combined:true,multiplier:4,combinedProbability:.3,legs:[leg('1'),leg('2')]}]) {
    for (const draw of [0,.99]) { const result = simulate(state,s,()=>draw,at); assert.equal(result.error,undefined); assert.equal(balances(result.state).savings,before.savings); assert.deepEqual(loadPortfolio(JSON.stringify(result.state)),result.state); }
  }
  const excessive = simulate(state,{...scenario,stakeCents:100000},()=>0,at); assert(excessive.error); assert.deepEqual(balances(excessive.state),before);
  const legacy=simulate(state,{...scenario,legs:undefined},()=>0,at).state;
  const oldOutcome=legacy.ledger.at(-1); if(oldOutcome?.kind==='outcome'){delete oldOutcome.scenario.calculationVersion;oldOutcome.scenario.probability=.58;}
  assert.deepEqual(loadPortfolio(JSON.stringify(legacy)),JSON.parse(JSON.stringify(legacy)));
});
test('advisor includes real schedule provenance, user assumptions, calculations and budget impact', () => {
  const state = funded(), context = advisorContext(state,scenario);
  assert.equal(context.scenario?.legs?.[0].team,'Selected test team'); assert.equal(context.scenario?.virtualBalanceAfterLoss,balances(state).risk-10);
  const explanation = demoExplanation('Explain this selected sports scenario',state,scenario);
  for (const pattern of [/ESPN schedule snapshot/, /user assumptions/, /leaves the multiplier/, /maximum virtual loss is \$0.10/, /Estimated EV/]) assert.match(explanation,pattern);
});
