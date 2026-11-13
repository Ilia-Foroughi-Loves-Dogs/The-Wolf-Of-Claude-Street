import { z } from 'zod';

export const STORAGE_KEY = 'roundup-ai-ledger-v1';
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(cents / 100);
export const id = () => globalThis.crypto.randomUUID();
const timestamp = z.string().datetime();
const cents = z.number().int().min(0).max(100_000_000);
const limitsSchema = z.object({ allocation: z.number().int().min(0).max(20), exposure: z.number().min(0.1).max(5), dailyLoss: z.number().min(0.1).max(10) });
export type Limits = z.infer<typeof limitsSchema>;
const purchaseSchema = z.object({ kind:z.literal('purchase'), id:z.string(), at:timestamp, merchant:z.string().min(1).max(80), category:z.string().max(40), amountCents:cents.min(1).max(1_000_000), roundupCents:cents.max(99), savingsCents:cents, riskCents:cents, allocation:z.number().min(0).max(20) });
const scenarioSchema = z.object({ event:z.string().trim().min(1).max(120), probability:z.number().gt(0).lt(1), multiplier:z.number().min(1.01).max(100), stakeCents:cents.min(1), combined:z.boolean(), secondProbability:z.number().gt(0).lt(1), independent:z.boolean() });
export type Scenario = z.infer<typeof scenarioSchema>;
const outcomeSchema = z.object({ kind:z.literal('outcome'), id:z.string(), at:timestamp, scenario:scenarioSchema, won:z.boolean(), payoutCents:cents, netCents:z.number().int(), limits:limitsSchema, availableBefore:cents, dayStartCents:cents, lossBeforeCents:cents });
const transferSchema = z.object({kind:z.literal('protect'), id:z.string(), at:timestamp, amountCents:cents.min(1), reason:z.string()});
export type Purchase = z.infer<typeof purchaseSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export type LedgerEntry = Purchase | Outcome | z.infer<typeof transferSchema>;
const reviewSchema = z.object({id:z.string(),at:timestamp,from:timestamp,summary:z.string(),facts:z.array(z.string()),violations:z.number().int().min(0),blocked:z.number().int().min(0)});
export type Review = z.infer<typeof reviewSchema>;
const stateSchema = z.object({version:z.literal(1), ledger:z.array(z.discriminatedUnion('kind',[purchaseSchema,outcomeSchema,transferSchema])).max(10000), limits:limitsSchema, allocation:z.number().int().min(0).max(20), goal:z.object({name:z.string().min(1).max(60),targetCents:cents.min(100)}),dayBudgets:z.array(z.object({day:z.string(),startCents:cents})).max(10000),blocked:z.array(z.object({id:z.string(),at:timestamp,reason:z.string(),stakeCents:cents})).max(10000),reviews:z.array(reviewSchema).max(1000)});
export type Portfolio = z.infer<typeof stateSchema>;
export const emptyPortfolio = ():Portfolio => ({version:1,ledger:[],limits:{allocation:20,exposure:5,dailyLoss:10},allocation:20,goal:{name:'A little peace of mind',targetCents:5000},dayBudgets:[],blocked:[],reviews:[]});

export function parseAmount(value:string) {
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a purchase from $0.01 to $10,000 with no more than two decimals.');
  const [whole,fraction=''] = value.trim().split('.');
  const amount = Number(whole)*100 + Number(fraction.padEnd(2,'0'));
  if (amount < 1 || amount > 1_000_000) throw new Error('Purchase must be between $0.01 and $10,000.');
  return amount;
}
export const roundUp = (amountCents:number) => {if(!Number.isSafeInteger(amountCents)||amountCents<1) throw new Error('Use a positive amount in integer cents.'); return (100 - amountCents % 100) % 100;};
export function balances(state:Pick<Portfolio,'ledger'>) {
  let savings=0,risk=0,roundups=0,funding=0,performance=0,spent=0;
  for (const entry of state.ledger) {
    if(entry.kind==='purchase'){savings+=entry.savingsCents;risk+=entry.riskCents;roundups+=entry.roundupCents;funding+=entry.riskCents;spent+=entry.amountCents;}
    if(entry.kind==='outcome'){risk+=entry.netCents;performance+=entry.netCents;}
    if(entry.kind==='protect'){risk-=entry.amountCents;savings+=entry.amountCents;funding-=entry.amountCents;}
  }
  return {savings,risk,roundups,funding,performance,spent,total:savings+risk};
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
export function effectiveProbability(s:Scenario) {return s.combined ? (s.independent ? s.probability*s.secondProbability : null) : s.probability;}
export function scenarioMetrics(s:Scenario) {
  const p=effectiveProbability(s),payout=Math.round(s.stakeCents*s.multiplier);
  return {probability:p,implied:1/s.multiplier,payout,ev:p===null?null:p*payout-s.stakeCents,loss:s.stakeCents};
}
function dayKey(at:string){return at.slice(0,10);}
export function riskStatus(state:Portfolio,at=new Date().toISOString()) {
  const day=dayKey(at), b=balances(state);
  const before=balances({ledger:state.ledger.filter(e=>e.at<`${day}T00:00:00.000Z`)}).risk;
  const start=state.dayBudgets.find(d=>d.day===day)?.startCents??(before>0?before:b.risk);
  const lost=state.ledger.filter((e):e is Outcome=>e.kind==='outcome'&&dayKey(e.at)===day).reduce((n,e)=>n+Math.max(0,-e.netCents),0);
  const exposure=Math.floor(b.risk*state.limits.exposure/100), dailyCap=Math.floor(start*state.limits.dailyLoss/100), remaining=Math.max(0,dailyCap-lost);
  return {day,start,lost,exposure,dailyCap,remaining,maxStake:Math.max(0,Math.min(b.risk,exposure,remaining))};
}
export function scenarioError(state:Portfolio,scenario:Scenario,at=new Date().toISOString()):string|null {
  const parsed=scenarioSchema.safeParse(scenario);
  if(!parsed.success) return 'Enter a named event, probabilities between 1–99%, a multiplier from 1.01–100, and at least $0.01.';
  if(effectiveProbability(scenario)===null) return 'Combined predictions require an explicit independence assumption. Correlation can invalidate multiplication.';
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
  const won=draw<(effectiveProbability(scenario)??0),payoutCents=won?Math.round(scenario.stakeCents*scenario.multiplier):0;
  const outcome:Outcome={kind:'outcome',id:id(),at,scenario:{...scenario},won,payoutCents,netCents:payoutCents-scenario.stakeCents,limits:{...state.limits},availableBefore:balances(state).risk,dayStartCents:r.start,lossBeforeCents:r.lost};
  return {state:{...opened,ledger:[...opened.ledger,outcome]},outcome};
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
    if(entry.kind==='outcome'){
      const expected=entry.won?Math.round(entry.scenario.stakeCents*entry.scenario.multiplier):0;
      const b=balances(running);
      if(entry.netCents!==expected-entry.scenario.stakeCents||entry.payoutCents!==expected||entry.availableBefore!==b.risk||entry.scenario.stakeCents>b.risk||entry.scenario.stakeCents>Math.floor(b.risk*entry.limits.exposure/100)||entry.lossBeforeCents+entry.scenario.stakeCents>Math.floor(entry.dayStartCents*entry.limits.dailyLoss/100)||effectiveProbability(entry.scenario)===null) throw new Error('Invalid simulation ledger.');
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
      const names=['Harbor FC · Match outcome','Atlas United · Team total','North Stars · Match outcome'];
      const r=riskStatus(state,at), stakeCents=Math.min(8,r.maxStake);
      if(stakeCents>0) state=simulate(state,{event:names[Math.floor(index/6)%3],probability:0.58,multiplier:1.85,stakeCents,combined:false,secondProbability:0.5,independent:false},()=>Math.floor(index/6)%3===0?0.8:0.2,new Date(new Date(at).getTime()+1000).toISOString()).state;
    }
  }
  state={...state,ledger:[...state.ledger].sort((a,b)=>a.at.localeCompare(b.at))};
  return saveReview(state,now.toISOString());
}

export function activityData(state:Portfolio,days:number,now=new Date()) {
  const count=days===365?12:days===90?13:days===30?15:7;
  const start=now.getTime()-(days-1)*86400000;
  return Array.from({length:count},(_,i)=>{
    const time=start+(now.getTime()-start)*i/(count-1),date=new Date(time);
    const b=balances({ledger:state.ledger.filter(e=>new Date(e.at).getTime()<=time)});
    return {label:date.toLocaleDateString('en-US',{month:'short',day:'numeric'}),roundups:b.roundups/100,savings:b.savings/100,risk:b.risk/100,performance:b.performance/100};
  });
}
export function projection(state:Portfolio,months=6) {
  const purchases=state.ledger.filter((e):e is Purchase=>e.kind==='purchase');
  if(!purchases.length)return {monthly:0,future:balances(state).savings,days:0};
  const days=Math.max(1,Math.ceil((Date.now()-Math.min(...purchases.map(e=>new Date(e.at).getTime())))/86400000));
  const monthly=Math.round(purchases.reduce((n,e)=>n+e.roundupCents,0)/days*30*(100-state.allocation)/100);
  return {monthly,future:balances(state).savings+monthly*months,days};
}
