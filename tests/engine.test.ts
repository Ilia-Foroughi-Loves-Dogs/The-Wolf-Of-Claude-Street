import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPurchase, balances, demoPortfolio, emptyPortfolio, generateReview, loadPortfolio, parseAmount, projection, purchaseAllocation, riskStatus, roundUp, scenarioMetrics, simulate, updateAllocation, updateLimits, type Portfolio, type Scenario } from '../src/lib/engine';
import { demoExplanation } from '../src/lib/advisor';
const at='2026-11-13T12:00:00.000Z';
const scenario:Scenario={event:'Fictional match',probability:0.6,multiplier:2,stakeCents:10,combined:false,secondProbability:0.5,independent:false};
const purchase=(state:Portfolio,amount='4.35',n=1,date=at)=>addPurchase(state,{id:`purchase-${n}`,merchant:'Coffee',category:'Food & drink',amount,at:date});
function funded(){let state=emptyPortfolio();for(let i=0;i<20;i++)state=purchase(state,'4.01',i,'2026-11-12T12:00:00.000Z');return state;}

test('purchase amounts use cents and reject ambiguous, invalid, and excessive inputs',()=>{
  assert.equal(parseAmount('4.35'),435);assert.equal(parseAmount('0.01'),1);assert.equal(parseAmount('4.3'),430);
  for(const input of ['-1','0','0.00','1.001','NaN','Infinity','1e3','$4.35','10,000','10000.01',''])assert.throws(()=>parseAmount(input));
  for(let cents=1;cents<10000;cents++){const round=roundUp(cents);assert(round>=0&&round<=99);assert.equal((cents+round)%100,0);}
  assert.equal(roundUp(435),65);assert.equal(roundUp(500),0);assert.throws(()=>roundUp(-1));assert.throws(()=>roundUp(4.35));
});
test('the judge demo coffee allocates exactly 52 cents protected and 13 cents virtual',()=>{
  const state=purchase(emptyPortfolio());
  assert.deepEqual(balances(state),{savings:52,risk:13,roundups:65,funding:13,performance:0,spent:435,invested:0,realized:0,total:65});
  assert.equal(state.ledger.length,1);assert.equal(emptyPortfolio().ledger.length,0);
});
test('allocation always conserves integer cents and never exceeds the funding cap',()=>{
  for(let percent=0;percent<=20;percent++){let state=updateAllocation(emptyPortfolio(),percent);for(let n=1;n<200;n++){const amount=(n*37)%9999+1;const split=purchaseAllocation(state,amount);assert.equal(split.roundupCents,split.riskCents+split.savingsCents);assert(Number.isInteger(split.riskCents));state=purchase(state,(amount/100).toFixed(2),n);const b=balances(state);assert(b.funding<=Math.floor(b.roundups*.2));assert.equal(b.total,b.roundups);}}
});
test('whole-dollar purchases create no change; duplicate processing is rejected',()=>{
  const state=purchase(emptyPortfolio(),'5.00');assert.equal(balances(state).roundups,0);assert.throws(()=>purchase(state),/already been processed/);
});
test('changing future allocation never moves existing protected savings',()=>{
  let state=purchase(emptyPortfolio());state=updateAllocation(state,0);assert.equal(balances(state).savings,52);state=purchase(state,'4.35',2);assert.equal(balances(state).savings,117);assert.equal(balances(state).risk,13);assert.throws(()=>updateAllocation(state,21));
});
test('tightening allocation records a one-way protection transfer and conserves funds',()=>{
  const initial=funded(),before=balances(initial),state=updateLimits(initial,{allocation:5,exposure:2,dailyLoss:5},at),after=balances(state);
  assert.equal(after.total,before.total);assert(after.savings>before.savings);assert(after.risk<before.risk);assert.equal(state.ledger.at(-1)?.kind,'protect');assert(after.funding<=Math.floor(after.roundups*.05));assert.equal(state.allocation,5);assert.throws(()=>updateLimits(state,{allocation:21,exposure:5,dailyLoss:10}));assert.throws(()=>updateLimits(state,{allocation:20,exposure:6,dailyLoss:10}));
});
test('EV, implied probability, and payout follow the specified model',()=>{
  const m=scenarioMetrics({...scenario,stakeCents:1000,probability:.6,multiplier:2});assert.equal(m.ev,200);assert.equal(m.payout,2000);assert.equal(m.implied,.5);assert.equal(m.loss,1000);
  const combined={...scenario,combined:true,independent:false};assert.equal(scenarioMetrics(combined).probability,null);assert.equal(scenarioMetrics(combined).ev,null);assert.equal(scenarioMetrics({...combined,independent:true}).probability,.3);
});
test('simulated loss and win settle only against the virtual ledger',()=>{
  const state=funded(),before=balances(state);
  const loss=simulate(state,scenario,()=>.9,at);assert(!loss.error);assert.equal(loss.outcome?.netCents,-10);assert.equal(balances(loss.state).risk,before.risk-10);assert.equal(balances(loss.state).savings,before.savings);
  const win=simulate(state,scenario,()=>.1,at);assert.equal(win.outcome?.netCents,10);assert.equal(balances(win.state).risk,before.risk+10);assert.equal(balances(win.state).savings,before.savings);assert.equal(balances(win.state).total,before.total+10);
});
test('exposure is checked against the available virtual balance, not total assets',()=>{
  const state=funded(),r=riskStatus(state,at);assert.equal(r.exposure,Math.floor(balances(state).risk*.05));const rejected=simulate(state,{...scenario,stakeCents:r.exposure+1},()=>.1,at);assert.match(rejected.error!,/Exposure limit/);assert.deepEqual(balances(rejected.state),balances(state));assert.equal(rejected.state.ledger.length,state.ledger.length);assert.equal(rejected.state.blocked.length,1);
  const protectedOnly=updateLimits(state,{allocation:0,exposure:5,dailyLoss:10},at);assert(balances(protectedOnly).savings>0);const denied=simulate(protectedOnly,{...scenario,stakeCents:1},()=>.1,at);assert.match(denied.error!,/Protected savings/);assert.equal(balances(denied.state).savings,balances(protectedOnly).savings);
});
test('daily gross loss cap cannot be bypassed by wins, new purchases, or refresh',()=>{
  let state=funded();const starting=riskStatus(state,at).start;
  let count=0;while(riskStatus(state,at).maxStake>0&&count<100){const stakeCents=riskStatus(state,at).maxStake;const result=simulate(state,{...scenario,stakeCents},()=>.9,at);assert(!result.error);state=result.state;count++;}
  const risk=riskStatus(state,at);assert.equal(risk.lost,risk.dailyCap);assert.equal(risk.start,starting);const denied=simulate(state,{...scenario,stakeCents:1},()=>.1,at);assert.match(denied.error!,/Daily loss limit/);
  state=purchase(state,'4.01',999);assert.equal(riskStatus(state,at).start,starting);assert.equal(riskStatus(loadPortfolio(JSON.stringify(state)),at).remaining,0);assert(riskStatus(state,'2026-11-14T12:00:00.000Z').remaining>0);
});
test('gross losses do not get offset by a win and combined assumptions are explicit',()=>{
  let state=simulate(funded(),scenario,()=>.9,at).state;state=simulate(state,scenario,()=>.1,at).state;assert.equal(riskStatus(state,at).lost,10);const denied=simulate(state,{...scenario,combined:true,independent:false},()=>.1,at);assert.match(denied.error!,/independence/);
});
test('demo loads exactly 50 purchases, six valid scenarios, a review, and survives serialization',()=>{
  const state=demoPortfolio(new Date(at));assert.equal(state.ledger.filter(e=>e.kind==='purchase').length,50);assert.equal(state.ledger.filter(e=>e.kind==='outcome').length,6);assert.equal(state.reviews.length,1);assert.equal(state.reviews[0].violations,0);assert.deepEqual(loadPortfolio(JSON.stringify(state)),state);const b=balances(state);assert.equal(b.total,b.roundups+b.performance);assert(b.risk>=0);assert(b.savings>0);
});
test('weekly review distinguishes blocked attempts from completed violations and uses a seven-day window',()=>{
  let state=funded();state=simulate(state,{...scenario,stakeCents:1000},()=>.1,at).state;state=simulate(state,scenario,()=>.9,at).state;const report=generateReview(state,at);assert.equal(report.blocked,1);assert.equal(report.violations,0);assert(report.facts.some(f=>f.includes('$0.10 in gross virtual losses')));const later=generateReview(state,'2026-11-22T12:00:00.000Z');assert.equal(later.blocked,0);assert(later.facts.some(f=>f.includes('0 scenarios')));
});
test('invalid persisted financial data and duplicate entries are rejected',()=>{
  const valid=purchase(emptyPortfolio());const duplicate={...valid,ledger:[...valid.ledger,...valid.ledger]};assert.throws(()=>loadPortfolio(JSON.stringify(duplicate)));const wrong=structuredClone(valid);if(wrong.ledger[0].kind==='purchase')wrong.ledger[0].savingsCents=999;assert.throws(()=>loadPortfolio(JSON.stringify(wrong)));assert.throws(()=>loadPortfolio('{}'));assert.throws(()=>loadPortfolio('nope'));
});
test('deterministic advisor uses recorded balances and conditional projections',()=>{
  const state=demoPortfolio();assert.match(demoExplanation('How much could I save in six months?',state),/50 simulated purchases/);assert.match(demoExplanation('Why is this risky?',state,scenario),/unverified input/);assert(projection(state).future>=balances(state).savings);
});
