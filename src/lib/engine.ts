import { z } from 'zod';
import { MAX_CHANCE, MIN_CHANCE, fairMultiplier } from './odds';

export const STORAGE_KEY = 'roundup-ai-ledger-v1';
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(cents / 100);
export const id = () => globalThis.crypto.randomUUID();
const timestamp = z.string().datetime();
const cents = z.number().int().min(0).max(100_000_000);
const limitsSchema = z.object({ allocation: z.number().int().min(0).max(20), exposure: z.number().min(0.1).max(5), dailyLoss: z.number().min(0.1).max(10) });
export type Limits = z.infer<typeof limitsSchema>;
const purchaseSchema = z.object({ kind:z.literal('purchase'), id:z.string(), at:timestamp, merchant:z.string().min(1).max(80), category:z.string().max(40), amountCents:cents.min(1).max(1_000_000), roundupCents:cents.max(99), savingsCents:cents, riskCents:cents, allocation:z.number().min(0).max(20) });
export const PROBABILITY_OPTIONS = [10,20,30,40,50,60,70,80,90] as const;
const chosenProbability = z.number().refine(p => PROBABILITY_OPTIONS.some(option => p===option/100), 'Choose 10%–90% in steps of 10%.');
export const scenarioLegSchema = z.object({
  eventId:z.string().max(100), event:z.string().min(1).max(200), teamId:z.string().max(50), team:z.string().min(1).max(100),
  league:z.string().max(100), startsAt:timestamp, status:z.string().max(40), source:z.enum(['ESPN public scoreboard','Prediction markets']),
  // ESPN legs carry the user's own 10%-step guess; market legs carry the prediction-market chance.
  probability:z.number().gt(0).lt(1), multiplier:z.number().min(1.01).max(100),
  odds:z.object({ polymarket:z.number().optional(), kalshi:z.number().optional() }).optional(),
  // Where to read the real result: Polymarket event id + outcome label, Kalshi market ticker.
  settle:z.object({ polymarketEvent:z.string().regex(/^\d{1,12}$/).optional(), polymarketOutcome:z.string().max(120).optional(), kalshiMarket:z.string().regex(/^[A-Z0-9.\-]{3,100}$/).optional() }).optional(),
});
const marketLeg=(leg:{source:string})=>leg.source==='Prediction markets';
// Historical records retain their original assumptions. New executions are
// checked below, so portfolios saved before the upgrade remain readable.
export const scenarioSchema = z.object({ event:z.string().trim().min(1).max(240), probability:z.number().gt(0).lt(1), multiplier:z.number().min(1.01).max(1_000_000), stakeCents:cents.min(1), combined:z.boolean(), secondProbability:z.number().gt(0).lt(1), independent:z.boolean(), legs:z.array(scenarioLegSchema).min(1).max(8).optional(), combinedProbability:chosenProbability.optional(), calculationVersion:z.literal(2).optional() });
export type Scenario = z.infer<typeof scenarioSchema>;
const outcomeSchema = z.object({ kind:z.literal('outcome'), id:z.string(), at:timestamp, scenario:scenarioSchema, won:z.boolean(), payoutCents:cents, netCents:z.number().int(), limits:limitsSchema, availableBefore:cents, dayStartCents:cents, lossBeforeCents:cents , pickId:z.string().optional(), void:z.boolean().optional() });
// A pick on a real upcoming game: the stake leaves the practice budget now and
// an outcome entry (with pickId) settles it once the game's real result is known.
const pickSchema = z.object({ kind:z.literal('pick'), id:z.string(), at:timestamp, scenario:scenarioSchema, limits:limitsSchema, availableBefore:cents, dayStartCents:cents, lossBeforeCents:cents });
const transferSchema = z.object({kind:z.literal('protect'), id:z.string(), at:timestamp, amountCents:cents.min(1), reason:z.string()});
// Simulated investing: protected savings buy fractional shares at a quoted price.
// Sells return proceeds to protected savings. Nothing touches the virtual sports budget.
const symbolSchema = z.string().regex(/^[A-Z][A-Z.\-]{0,9}$/);
const tradeSchema = z.object({ kind:z.literal('trade'), id:z.string(), at:timestamp, side:z.enum(['buy','sell']), symbol:symbolSchema, name:z.string().min(1).max(80), shares:z.number().positive().max(1e9), price:z.number().positive().max(10_000_000), amountCents:cents.min(1), auto:z.boolean() });
const mixItemSchema = z.object({ symbol:symbolSchema, name:z.string().min(1).max(80), weight:z.number().int().min(1).max(100) });
export const autoInvestSchema = z.object({ enabled:z.boolean(), thresholdCents:cents.min(100).max(1_000_000), percent:z.number().int().min(10).max(100), mix:z.array(mixItemSchema).min(1).max(6) })
  .refine(rule => rule.mix.reduce((n,item)=>n+item.weight,0)===100, 'Auto-invest weights must add up to 100%.')
  .refine(rule => new Set(rule.mix.map(item=>item.symbol)).size===rule.mix.length, 'Each fund or stock can appear once in the mix.');
export type AutoInvest = z.infer<typeof autoInvestSchema>;
export const defaultAutoInvest = (): AutoInvest => ({ enabled:false, thresholdCents:1000, percent:50, mix:[{symbol:'SPY',name:'S&P 500 ETF',weight:70},{symbol:'QQQ',name:'Nasdaq-100 ETF',weight:30}] });
export type Purchase = z.infer<typeof purchaseSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export type SportsPick = z.infer<typeof pickSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type LedgerEntry = Purchase | Outcome | SportsPick | Trade | z.infer<typeof transferSchema>;
const reviewSchema = z.object({id:z.string(),at:timestamp,from:timestamp,summary:z.string(),facts:z.array(z.string()),violations:z.number().int().min(0),blocked:z.number().int().min(0)});
export type Review = z.infer<typeof reviewSchema>;
const stateSchema = z.object({version:z.literal(1), ledger:z.array(z.discriminatedUnion('kind',[purchaseSchema,outcomeSchema,pickSchema,transferSchema,tradeSchema])).max(10000), limits:limitsSchema, autoInvest:autoInvestSchema.default(defaultAutoInvest), allocation:z.number().int().min(0).max(20), goal:z.object({name:z.string().min(1).max(60),targetCents:cents.min(100)}),dayBudgets:z.array(z.object({day:z.string(),startCents:cents})).max(10000),blocked:z.array(z.object({id:z.string(),at:timestamp,reason:z.string(),stakeCents:cents})).max(10000),reviews:z.array(reviewSchema).max(1000)});
export type Portfolio = z.infer<typeof stateSchema>;
export const emptyPortfolio = ():Portfolio => ({version:1,ledger:[],limits:{allocation:20,exposure:5,dailyLoss:10},autoInvest:defaultAutoInvest(),allocation:20,goal:{name:'A little peace of mind',targetCents:5000},dayBudgets:[],blocked:[],reviews:[]});

export function parseAmount(value:string) {
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a purchase from $0.01 to $10,000 with no more than two decimals.');
  const [whole,fraction=''] = value.trim().split('.');
  const amount = Number(whole)*100 + Number(fraction.padEnd(2,'0'));
  if (amount < 1 || amount > 1_000_000) throw new Error('Purchase must be between $0.01 and $10,000.');
  return amount;
}
export const roundUp = (amountCents:number) => {if(!Number.isSafeInteger(amountCents)||amountCents<1) throw new Error('Use a positive amount in integer cents.'); return (100 - amountCents % 100) % 100;};
export function balances(state:Pick<Portfolio,'ledger'>) {
  let savings=0,risk=0,roundups=0,funding=0,performance=0,spent=0,realized=0;
  const positions=new Map<string,{shares:number;costCents:number}>();
  for (const entry of state.ledger) {
    if(entry.kind==='purchase'){savings+=entry.savingsCents;risk+=entry.riskCents;roundups+=entry.roundupCents;funding+=entry.riskCents;spent+=entry.amountCents;}
    if(entry.kind==='outcome'){risk+=entry.pickId?entry.payoutCents:entry.netCents;performance+=entry.netCents;}
    if(entry.kind==='pick'){risk-=entry.scenario.stakeCents;}
    if(entry.kind==='protect'){risk-=entry.amountCents;savings+=entry.amountCents;funding-=entry.amountCents;}
    if(entry.kind==='trade'){
      const position=positions.get(entry.symbol)??{shares:0,costCents:0};
      if(entry.side==='buy'){savings-=entry.amountCents;positions.set(entry.symbol,{shares:position.shares+entry.shares,costCents:position.costCents+entry.amountCents});}
      else{
        const closing=entry.shares>=position.shares-1e-9, cost=closing?position.costCents:Math.round(position.costCents*entry.shares/position.shares);
        savings+=entry.amountCents;realized+=entry.amountCents-cost;
        if(closing)positions.delete(entry.symbol);else positions.set(entry.symbol,{shares:position.shares-entry.shares,costCents:position.costCents-cost});
      }
    }
  }
  const invested=[...positions.values()].reduce((n,p)=>n+p.costCents,0);
  return {savings,risk,roundups,funding,performance,spent,invested,realized,total:savings+risk+invested};
}

export type Holding = {symbol:string;name:string;shares:number;costCents:number};
export function holdings(state:Pick<Portfolio,'ledger'>):Holding[] {
  const positions=new Map<string,Holding>();
  for(const entry of state.ledger){
    if(entry.kind!=='trade')continue;
    const position=positions.get(entry.symbol)??{symbol:entry.symbol,name:entry.name,shares:0,costCents:0};
    if(entry.side==='buy'){positions.set(entry.symbol,{...position,shares:position.shares+entry.shares,costCents:position.costCents+entry.amountCents});continue;}
    if(entry.shares>=position.shares-1e-9){positions.delete(entry.symbol);continue;}
    const cost=Math.round(position.costCents*entry.shares/position.shares);
    positions.set(entry.symbol,{...position,shares:position.shares-entry.shares,costCents:position.costCents-cost});
  }
  return [...positions.values()].sort((a,b)=>b.costCents-a.costCents);
}
export const marketValueCents=(holding:Pick<Holding,'shares'>,price:number)=>Math.round(holding.shares*price*100);
export function portfolioValue(state:Pick<Portfolio,'ledger'>,prices:Record<string,number|undefined>) {
  const list=holdings(state);
  const valueCents=list.reduce((n,h)=>n+(prices[h.symbol]?marketValueCents(h,prices[h.symbol]!):h.costCents),0);
  const costCents=list.reduce((n,h)=>n+h.costCents,0);
  return {valueCents,costCents,gainCents:valueCents-costCents,gainPercent:costCents?(valueCents-costCents)/costCents*100:0,priced:list.every(h=>prices[h.symbol]!==undefined)};
}
export function buy(state:Portfolio,input:{symbol:string;name:string;price:number;amountCents:number;auto?:boolean;id?:string;at?:string}):Portfolio {
  if(!Number.isSafeInteger(input.amountCents)||input.amountCents<1) throw new Error('Enter an amount of at least $0.01.');
  if(!(input.price>0)||!Number.isFinite(input.price)) throw new Error('A live price is required to invest. Try again when prices load.');
  const cash=balances(state).savings;
  if(input.amountCents>cash) throw new Error(`Only ${money(cash)} of protected savings is available to invest.`);
  const entry=tradeSchema.parse({kind:'trade',id:input.id??id(),at:input.at??new Date().toISOString(),side:'buy',symbol:input.symbol,name:input.name,shares:input.amountCents/100/input.price,price:input.price,amountCents:input.amountCents,auto:input.auto??false});
  return {...state,ledger:[...state.ledger,entry]};
}
export function sell(state:Portfolio,input:{symbol:string;price:number;amountCents?:number;all?:boolean;id?:string;at?:string}):Portfolio {
  const position=holdings(state).find(h=>h.symbol===input.symbol);
  if(!position) throw new Error('You do not own this investment.');
  if(!(input.price>0)||!Number.isFinite(input.price)) throw new Error('A live price is required to sell. Try again when prices load.');
  const value=marketValueCents(position,input.price);
  const all=input.all||(input.amountCents??0)>=value;
  const amountCents=all?value:input.amountCents??0;
  if(!Number.isSafeInteger(amountCents)||amountCents<1) throw new Error('Enter an amount of at least $0.01.');
  const shares=all?position.shares:amountCents/100/input.price;
  const entry=tradeSchema.parse({kind:'trade',id:input.id??id(),at:input.at??new Date().toISOString(),side:'sell',symbol:position.symbol,name:position.name,shares,price:input.price,amountCents,auto:false});
  return {...state,ledger:[...state.ledger,entry]};
}
export function updateAutoInvest(state:Portfolio,rule:AutoInvest):Portfolio {
  const parsed=autoInvestSchema.safeParse(rule);
  if(!parsed.success) throw new Error(parsed.error.issues[0]?.message??'Invalid auto-invest rule.');
  return {...state,autoInvest:parsed.data};
}
// Sweep rule: once uninvested savings reach the threshold, invest a share of it across the mix.
export function runAutoInvest(state:Portfolio,prices:Record<string,number|undefined>,at=new Date().toISOString(),force=false):{state:Portfolio;investedCents:number} {
  const rule=state.autoInvest, cash=balances(state).savings;
  if((!rule.enabled&&!force)||cash<rule.thresholdCents||rule.mix.some(item=>!prices[item.symbol])) return {state,investedCents:0};
  const budget=Math.floor(cash*rule.percent/100);
  let next=state,investedCents=0;
  for(const item of rule.mix){
    const amountCents=Math.floor(budget*item.weight/100);
    if(amountCents<1)continue;
    next=buy(next,{symbol:item.symbol,name:item.name,price:prices[item.symbol]!,amountCents,auto:true,at});
    investedCents+=amountCents;
  }
  return {state:next,investedCents};
}
export function purchaseAllocation(state:Portfolio,amountCents:number) {
  const roundupCents = roundUp(amountCents), b=balances(state);
  const headroom=Math.max(0,Math.floor((b.roundups+roundupCents)*state.limits.allocation/100)-b.funding);
  const riskCents=Math.min(Math.floor(roundupCents*state.allocation/100),headroom);
  return {roundupCents,riskCents,savingsCents:roundupCents-riskCents};
}
export function addPurchase(state:Portfolio,input:{id:string;merchant:string;category:string;amount:string;at?:string}):Portfolio {
  if(state.ledger.some(e=>e.id===input.id)) throw new Error('This purchase has already been processed.');
  const amountCents=parseAmount(input.amount);
  const entry=purchaseSchema.parse({kind:'purchase',id:input.id,at:input.at??new Date().toISOString(),merchant:input.merchant.trim(),category:input.category,amountCents,...purchaseAllocation(state,amountCents),allocation:state.allocation});
  return {...state,ledger:[...state.ledger,entry]};
}
export function updateAllocation(state:Portfolio,allocation:number):Portfolio {
  if(!Number.isInteger(allocation)||allocation<0||allocation>state.limits.allocation) throw new Error('Allocation must be within your configured limit.');
  return {...state,allocation};
}
export function updateLimits(state:Portfolio,limits:Limits,at=new Date().toISOString()):Portfolio {
  limitsSchema.parse(limits);
  const b=balances(state), excess=Math.max(0,b.funding-Math.floor(b.roundups*limits.allocation/100));
  if(excess>b.risk) throw new Error('The remaining virtual balance cannot cover this reduction yet. Choose a smaller reduction.');
  return {...state,limits,allocation:Math.min(state.allocation,limits.allocation),ledger:excess?[...state.ledger,{kind:'protect',id:id(),at,amountCents:excess,reason:'Stricter allocation limit: virtual funds moved into protected savings.'}]:state.ledger};
}
export function effectiveProbability(s:Scenario) {
  if(s.legs?.length) return s.combined ? (s.independent ? s.legs.reduce((p,leg)=>p*leg.probability,1) : s.combinedProbability??null) : s.legs[0].probability;
  return s.combined ? (s.independent ? s.probability*s.secondProbability : s.combinedProbability??null) : s.probability;
}
export function effectiveMultiplier(s:Scenario) {return s.legs?.length ? s.legs.reduce((n,leg)=>n*leg.multiplier,1) : s.multiplier;}
function decimalProduct(factors:number[]) {
  let numerator=1n,denominator=1n;
  for(const factor of factors){
    const [coefficient, exponent='0']=factor.toString().split('e');
    const [whole,fraction='']=coefficient.split('.');
    const power=fraction.length-Number(exponent);
    numerator*=BigInt(whole+fraction);
    if(power<=0)numerator*=10n**BigInt(-power);else denominator*=10n**BigInt(power);
  }
  return {numerator,denominator};
}
function roundedCents(numerator:bigint,denominator:bigint) {
  const whole=numerator/denominator,remainder=numerator%denominator;
  // Round to nearest cent, with half-cent ties toward positive infinity.
  return Number(whole+(remainder*2n>=denominator?1n:remainder*2n < -denominator?-1n:0n));
}
export function payoutCents(stakeCents:number,multiplier:number|number[]) {
  // Apply every exact decimal ratio before rounding once.
  const {numerator,denominator}=decimalProduct(Array.isArray(multiplier)?multiplier:[multiplier]);
  return roundedCents(BigInt(stakeCents)*numerator,denominator);
}
function expectedValueCents(s:Scenario,payout:number) {
  const probabilities=s.combined?(s.independent?(s.legs?.map(leg=>leg.probability)??[s.probability,s.secondProbability]):[s.combinedProbability!]):[s.legs?.[0]?.probability??s.probability];
  const {numerator,denominator}=decimalProduct(probabilities);
  return roundedCents(numerator*BigInt(payout)-BigInt(s.stakeCents)*denominator,denominator);
}
export function scenarioMetrics(s:Scenario) {
  const p=effectiveProbability(s),multiplier=effectiveMultiplier(s);
  const payout=Number.isFinite(multiplier)&&Number.isSafeInteger(s.stakeCents)&&s.stakeCents>=0?payoutCents(s.stakeCents,s.legs?.map(leg=>leg.multiplier)??multiplier):0;
  return {probability:p,multiplier,implied:1/multiplier,payout,profit:payout-s.stakeCents,ev:p===null?null:expectedValueCents(s,payout),loss:s.stakeCents};
}
function dayKey(at:string){return at.slice(0,10);}
export function riskStatus(state:Portfolio,at=new Date().toISOString()) {
  const day=dayKey(at), b=balances(state);
  const before=balances({ledger:state.ledger.filter(e=>e.at<`${day}T00:00:00.000Z`)}).risk;
  const start=state.dayBudgets.find(d=>d.day===day)?.startCents??(before>0?before:b.risk);
  // Instant outcomes count on their day; a real-game pick counts on the day it was placed,
  // at its full stake until it settles (it could still lose all of it).
  const settledBy=new Map(state.ledger.flatMap(e=>e.kind==='outcome'&&e.pickId?[[e.pickId,e] as const]:[]));
  const lost=state.ledger.reduce((n,e)=>{
    if(dayKey(e.at)!==day) return n;
    if(e.kind==='outcome'&&!e.pickId) return n+Math.max(0,-e.netCents);
    if(e.kind==='pick'){const settled=settledBy.get(e.id);return n+(settled?Math.max(0,-settled.netCents):e.scenario.stakeCents);}
    return n;
  },0);
  const exposure=Math.floor(b.risk*state.limits.exposure/100), dailyCap=Math.floor(start*state.limits.dailyLoss/100), remaining=Math.max(0,dailyCap-lost);
  return {day,start,lost,exposure,dailyCap,remaining,maxStake:Math.max(0,Math.min(b.risk,exposure,remaining))};
}
export function scenarioError(state:Portfolio,scenario:Scenario,at=new Date().toISOString()):string|null {
  const parsed=scenarioSchema.safeParse(scenario);
  if(!parsed.success) return 'Choose a game, probabilities from 10%–90% in steps of 10%, multipliers from 1.01–100 per game, and at least $0.01.';
  const fromMarkets=!!scenario.legs?.length&&scenario.legs.every(marketLeg);
  if(fromMarkets){
    for(const leg of scenario.legs!){
      if(leg.probability<MIN_CHANCE||leg.probability>MAX_CHANCE) return 'This game’s market odds are too lopsided to offer. Pick another game.';
      if(Math.abs(leg.multiplier-fairMultiplier(leg.probability))>1e-9) return 'The payout must match the market odds.';
      if(!(Date.parse(leg.startsAt)>Date.parse(at))) return 'This game has already started. Pick an upcoming game.';
    }
  } else {
    if(scenario.legs?.some(marketLeg)) return 'Mixing market odds with your own guesses is not supported.';
    if(scenario.legs?.some(leg=>!chosenProbability.safeParse(leg.probability).success)) return 'Choose probabilities from 10%–90% in steps of exactly 10%.';
    if(!chosenProbability.safeParse(scenario.probability).success||!chosenProbability.safeParse(scenario.secondProbability).success) return 'Choose probabilities from 10%–90% in steps of exactly 10%.';
  }
  if(scenario.legs){
    if(scenario.combined!==(scenario.legs.length>1)||new Set(scenario.legs.map(leg=>leg.eventId)).size!==scenario.legs.length) return 'Select different games for a combined scenario.';
    if(scenario.probability!==scenario.legs[0].probability||Math.abs(scenario.multiplier-effectiveMultiplier(scenario))>1e-8) return 'Scenario totals must match the selected games.';
    if(scenario.combined&&!scenario.independent&&scenario.combinedProbability!==undefined){
      const lower=Math.max(0,scenario.legs.reduce((sum,leg)=>sum+leg.probability,0)-(scenario.legs.length-1));
      if(scenario.combinedProbability>Math.min(...scenario.legs.map(leg=>leg.probability))+1e-10||scenario.combinedProbability<lower-1e-10) return 'The manual combined probability is inconsistent with the individual probabilities. Revise your assumptions.';
    }
  }
  if(!Number.isFinite(effectiveMultiplier(scenario))||effectiveMultiplier(scenario)>1_000_000||scenarioMetrics(scenario).payout>100_000_000) return 'Reduce the amount or multipliers: the maximum modeled payout is $1,000,000 and combined multiplier is 1,000,000×.';
  if(effectiveProbability(scenario)===null) return 'Combined predictions require an explicit independence assumption or a manually entered combined probability. Correlation can invalidate multiplication.';
  const b=balances(state),r=riskStatus(state,at);
  if(scenario.stakeCents>b.risk) return `Only ${money(b.risk)} is available. Protected savings cannot fund scenarios.`;
  if(scenario.stakeCents>r.exposure) return `Exposure limit: maximum ${money(r.exposure)} (${state.limits.exposure}% of your available virtual budget).`;
  if(scenario.stakeCents>r.remaining) return `Daily loss limit: only ${money(r.remaining)} of loss capacity remains today (UTC).`;
  return null;
}
export function simulate(state:Portfolio,scenario:Scenario,random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296,at=new Date().toISOString()):{state:Portfolio;error?:string;outcome?:Outcome} {
  const r=riskStatus(state,at);
  const opened={...state,dayBudgets:state.dayBudgets.some(d=>d.day===r.day)?state.dayBudgets:[...state.dayBudgets,{day:r.day,startCents:r.start}]};
  const error=scenarioError(opened,scenario,at);
  if(error) return {state:{...opened,blocked:[...opened.blocked,{id:id(),at,reason:error,stakeCents:Number.isSafeInteger(scenario.stakeCents)&&scenario.stakeCents>=0?scenario.stakeCents:0}]},error};
  const draw=random();
  if(!Number.isFinite(draw)||draw<0||draw>=1) throw new Error('Invalid random sample.');
  const won=draw<(effectiveProbability(scenario)??0),payout=won?scenarioMetrics(scenario).payout:0;
  const outcome:Outcome={kind:'outcome',id:id(),at,scenario:{...scenario,calculationVersion:2},won,payoutCents:payout,netCents:payout-scenario.stakeCents,limits:{...state.limits},availableBefore:balances(state).risk,dayStartCents:r.start,lossBeforeCents:r.lost};
  return {state:{...opened,ledger:[...opened.ledger,outcome]},outcome};
}
export function pendingPicks(state:Pick<Portfolio,'ledger'>):SportsPick[] {
  const settled=new Set(state.ledger.flatMap(e=>e.kind==='outcome'&&e.pickId?[e.pickId]:[]));
  return state.ledger.filter((e):e is SportsPick=>e.kind==='pick'&&!settled.has(e.id));
}
/** Place a pick on a real upcoming game; it stays pending until settlePick records the real result. */
export function placePick(state:Portfolio,scenario:Scenario,at=new Date().toISOString()):{state:Portfolio;error?:string;pick?:SportsPick} {
  const r=riskStatus(state,at);
  const opened={...state,dayBudgets:state.dayBudgets.some(d=>d.day===r.day)?state.dayBudgets:[...state.dayBudgets,{day:r.day,startCents:r.start}]};
  const error=scenario.legs?.length!==1||!scenario.legs.every(marketLeg)?'Pick one upcoming game with market odds.':scenarioError(opened,scenario,at);
  if(error) return {state:{...opened,blocked:[...opened.blocked,{id:id(),at,reason:error,stakeCents:Number.isSafeInteger(scenario.stakeCents)&&scenario.stakeCents>=0?scenario.stakeCents:0}]},error};
  const pick:SportsPick={kind:'pick',id:id(),at,scenario:{...scenario,calculationVersion:2},limits:{...state.limits},availableBefore:balances(state).risk,dayStartCents:r.start,lossBeforeCents:r.lost};
  return {state:{...opened,ledger:[...opened.ledger,pick]},pick};
}
export type PickResult='won'|'lost'|'void';
/** Record the real result of a pending pick: a win pays the market payout, a void (canceled game) refunds the stake. */
export function settlePick(state:Portfolio,pickId:string,result:PickResult,at=new Date().toISOString()):Portfolio {
  const pick=pendingPicks(state).find(p=>p.id===pickId);
  if(!pick) return state;
  const stake=pick.scenario.stakeCents, payout=result==='won'?scenarioMetrics(pick.scenario).payout:result==='void'?stake:0;
  const outcome:Outcome={kind:'outcome',id:id(),at,scenario:pick.scenario,won:result==='won',payoutCents:payout,netCents:payout-stake,limits:pick.limits,availableBefore:pick.availableBefore,dayStartCents:pick.dayStartCents,lossBeforeCents:pick.lossBeforeCents,pickId,...(result==='void'?{void:true}:{})};
  return {...state,ledger:[...state.ledger,outcome]};
}
export function generateReview(state:Portfolio,at=new Date().toISOString()):Review {
  const from=new Date(new Date(at).getTime()-7*86400000).toISOString(), b=balances(state);
  const outcomes=state.ledger.filter((e):e is Outcome=>e.kind==='outcome'&&e.at>=from&&e.at<=at);
  const blocked=state.blocked.filter(e=>e.at>=from&&e.at<=at).length;
  const violations=outcomes.filter(e=>e.scenario.stakeCents>Math.floor(e.availableBefore*e.limits.exposure/100)||e.lossBeforeCents+e.scenario.stakeCents>Math.floor(e.dayStartCents*e.limits.dailyLoss/100)||e.scenario.stakeCents>e.availableBefore).length;
  const losses=outcomes.reduce((n,e)=>n+Math.max(0,-e.netCents),0), maxExposure=Math.max(0,...outcomes.map(e=>e.availableBefore?100*e.scenario.stakeCents/e.availableBefore:0));
  const reached=outcomes.some(e=>e.scenario.stakeCents===Math.floor(e.availableBefore*e.limits.exposure/100)||e.lossBeforeCents+Math.max(0,-e.netCents)>=Math.floor(e.dayStartCents*e.limits.dailyLoss/100));
  return {id:id(),at,from,violations,blocked,summary:violations?'Recorded scenarios need attention.':outcomes.length?'Your guardrails held. Your savings stayed protected.':'Your savings are protected. No scenarios were run this week.',facts:[`${money(b.funding)} allocated to virtual simulations, ${b.roundups?(b.funding/b.roundups*100).toFixed(1):'0.0'}% of accumulated round-ups; current cap ${state.limits.allocation}%.`,`${outcomes.length} scenarios in the last 7 days; ${money(losses)} in gross virtual losses.`, `Highest recorded scenario exposure: ${maxExposure.toFixed(2)}% of the then-available virtual budget.`,`${violations} completed scenario limit violations; ${blocked} rejected attempts. ${reached?'At least one configured boundary was reached.':'No recorded scenario reached a configured boundary.'}`,`${money(b.savings)} protected. The ledger has no savings-to-simulator transfer operation.`, losses>0||blocked>0?'Consider reducing exposure: losses or rejected attempts were recorded. No recovery is guaranteed.':'Keep exposure small. These illustrative outcomes do not demonstrate a real advantage.']};
}
export function saveReview(state:Portfolio,at=new Date().toISOString()):Portfolio {return {...state,reviews:[generateReview(state,at),...state.reviews].slice(0,100)};}

export function loadPortfolio(raw:string):Portfolio {
  const state=stateSchema.parse(JSON.parse(raw));
  const seen=new Set<string>();
  let running=emptyPortfolio();
  for(const entry of state.ledger){
    if(seen.has(entry.id)) throw new Error('Duplicate ledger entry.');
    seen.add(entry.id);
    if(entry.kind==='purchase'&&(roundUp(entry.amountCents)!==entry.roundupCents||entry.savingsCents+entry.riskCents!==entry.roundupCents||entry.riskCents>Math.floor(entry.roundupCents*entry.allocation/100))) throw new Error('Invalid purchase allocation.');
    if(entry.kind==='pick'){
      const b=balances(running), leg=entry.scenario.legs?.[0];
      if(entry.scenario.legs?.length!==1||!leg||!marketLeg(leg)||Math.abs(leg.multiplier-fairMultiplier(leg.probability))>1e-9||entry.availableBefore!==b.risk||entry.scenario.stakeCents>b.risk||entry.scenario.stakeCents>Math.floor(b.risk*entry.limits.exposure/100)||entry.lossBeforeCents+entry.scenario.stakeCents>Math.floor(entry.dayStartCents*entry.limits.dailyLoss/100)) throw new Error('Invalid sports pick.');
    }
    if(entry.kind==='outcome'&&entry.pickId){
      const pick=pendingPicks(running).find(p=>p.id===entry.pickId), stake=entry.scenario.stakeCents;
      const expected=entry.void?stake:entry.won?scenarioMetrics(entry.scenario).payout:0;
      if(!pick||JSON.stringify(pick.scenario)!==JSON.stringify(entry.scenario)||(entry.void&&entry.won)||entry.payoutCents!==expected||entry.netCents!==expected-stake) throw new Error('Invalid pick settlement.');
    }
    else if(entry.kind==='outcome'){
      const expected=entry.won?(entry.scenario.calculationVersion===2||entry.scenario.legs?scenarioMetrics(entry.scenario).payout:Math.round(entry.scenario.stakeCents*entry.scenario.multiplier)):0;
      const b=balances(running);
      if(entry.netCents!==expected-entry.scenario.stakeCents||entry.payoutCents!==expected||entry.availableBefore!==b.risk||entry.scenario.stakeCents>b.risk||entry.scenario.stakeCents>Math.floor(b.risk*entry.limits.exposure/100)||entry.lossBeforeCents+entry.scenario.stakeCents>Math.floor(entry.dayStartCents*entry.limits.dailyLoss/100)||effectiveProbability(entry.scenario)===null) throw new Error('Invalid simulation ledger.');
    }
    if(entry.kind==='trade'){
      if(Math.abs(entry.shares*entry.price*100-entry.amountCents)>1) throw new Error('Invalid trade amount.');
      if(entry.side==='sell'&&entry.shares>(holdings(running).find(h=>h.symbol===entry.symbol)?.shares??0)+1e-9) throw new Error('Invalid trade: more shares sold than owned.');
    }
    running={...running,ledger:[...running.ledger,entry]};
    const b=balances(running);
    if(b.savings<0||b.risk<0||b.funding<0||b.funding>Math.floor(b.roundups*0.2))throw new Error('Invalid ledger balance.');
  }
  const b=balances(state);
  if(state.allocation>state.limits.allocation||b.funding>Math.floor(b.roundups*state.limits.allocation/100))throw new Error('Invalid allocation limits.');
  return state;
}

export function demoPortfolio(now=new Date()):Portfolio {
  let state=emptyPortfolio();
  const merchants=[['Blue Bottle Coffee','Food & drink','4.75'],['Whole Foods Market','Groceries','36.42'],['Metro Transit','Transport','12.60'],['Sweetgreen','Food & drink','14.25'],['Local Supply Co.','Shopping','58.99'],['Sunday Coffee','Food & drink','4.35'],['Trader Joe’s','Groceries','28.13'],['City Books','Shopping','18.05'],['Corner Bakery','Food & drink','7.21'],['Lyft','Transport','16.12']];
  const events:Array<{at:string;index:number}>=Array.from({length:50},(_,index)=>({index,at:new Date(now.getTime()-(29-Math.floor(index*29/49))*86400000-3600000+index*60000).toISOString()}));
  for(const {at,index} of events){
    const m=merchants[index%merchants.length];
    state=addPurchase(state,{id:`demo-purchase-${index}`,merchant:m[0],category:m[1],amount:m[2],at});
    if([16,22,28,34,40,46].includes(index)){
      const names=['Historical demo A · illustrative outcome','Historical demo B · illustrative outcome','Historical demo C · illustrative outcome'];
      const r=riskStatus(state,at), stakeCents=Math.min(8,r.maxStake);
      if(stakeCents>0) state=simulate(state,{event:names[Math.floor(index/6)%3],probability:0.6,multiplier:1.85,stakeCents,combined:false,secondProbability:0.5,independent:false},()=>Math.floor(index/6)%3===0?0.8:0.2,new Date(new Date(at).getTime()+1000).toISOString()).state;
    }
    // Illustrative demo trades at fixed example prices; live quotes value them today.
    const tradeAt=new Date(new Date(at).getTime()+2000).toISOString();
    if(index===30){
      state=buy(state,{id:'demo-trade-spy',symbol:'SPY',name:'S&P 500 ETF',price:712.4,amountCents:800,auto:true,at:tradeAt});
      state=buy(state,{id:'demo-trade-qqq',symbol:'QQQ',name:'Nasdaq-100 ETF',price:641.15,amountCents:400,auto:true,at:tradeAt});
    }
    if(index===44){
      state=buy(state,{id:'demo-trade-nvda',symbol:'NVDA',name:'NVIDIA',price:151.3,amountCents:300,at:tradeAt});
      state=buy(state,{id:'demo-trade-aapl',symbol:'AAPL',name:'Apple',price:338.9,amountCents:200,at:tradeAt});
    }
  }
  state={...state,autoInvest:{...defaultAutoInvest(),enabled:true},ledger:[...state.ledger].sort((a,b)=>a.at.localeCompare(b.at))};
  return saveReview(state,now.toISOString());
}

export function activityData(state:Portfolio,days:number,now=new Date()) {
  const count=days===365?12:days===90?13:days===30?15:7;
  const start=now.getTime()-(days-1)*86400000;
  return Array.from({length:count},(_,i)=>{
    const time=start+(now.getTime()-start)*i/(count-1),date=new Date(time);
    const b=balances({ledger:state.ledger.filter(e=>new Date(e.at).getTime()<=time)});
    return {label:date.toLocaleDateString('en-US',{month:'short',day:'numeric'}),roundups:b.roundups/100,savings:b.savings/100,invested:b.invested/100,risk:b.risk/100,performance:b.performance/100};
  });
}
export function projection(state:Portfolio,months=6) {
  const purchases=state.ledger.filter((e):e is Purchase=>e.kind==='purchase');
  if(!purchases.length)return {monthly:0,future:balances(state).savings,days:0};
  const days=Math.max(1,Math.ceil((Date.now()-Math.min(...purchases.map(e=>new Date(e.at).getTime())))/86400000));
  const monthly=Math.round(purchases.reduce((n,e)=>n+e.roundupCents,0)/days*30*(100-state.allocation)/100);
  return {monthly,future:balances(state).savings+monthly*months,days};
}
