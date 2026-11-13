import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/app/api/advisor/route';
import { addPurchase, emptyPortfolio } from '../src/lib/engine';

const portfolio=addPurchase(emptyPortfolio(),{id:'api-purchase',merchant:'Coffee',category:'Food & drink',amount:'4.35'});
const request=(body:unknown)=>new Request('http://localhost/api/advisor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
// Test credentials are process-local placeholders. Provider tests replace fetch and never call the network.
process.env.ANTHROPIC_API_KEY='';

test('advisor demo endpoint uses the submitted ledger and labels its source',async()=>{
  const response=await POST(request({question:'How does my coffee round-up work?',portfolio}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.mode,'demo');assert.match(data.answer,/\$0.52/);assert.match(data.answer,/\$0.13/);assert.match(data.answer,/\$0.65 in total/);
});
test('advisor endpoint retains selected sports legs, joint model and exact scenario calculations',async()=>{
  const leg={eventId:'test-fixture',event:'Test scheduled game',teamId:'a',team:'Selected test team',league:'NBA',startsAt:'2026-11-13T20:00:00.000Z',status:'Upcoming',source:'ESPN public scoreboard',probability:.6,multiplier:2.5};
  const scenario={event:'Test combined fixture',probability:.6,secondProbability:.5,multiplier:5,stakeCents:1,combined:true,independent:false,combinedProbability:.3,legs:[leg,{...leg,eventId:'second-fixture',probability:.5,multiplier:2}]};
  const response=await POST(request({question:'Explain the selected scenario.',portfolio,scenario}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.mode,'demo');
  assert.match(data.answer,/Selected test team/);assert.match(data.answer,/manually supplied/);assert.match(data.answer,/ESPN schedule snapshot/);assert.match(data.answer,/5.00×/);
});
test('advisor rejects malformed, oversized, and inconsistent portfolio requests',async()=>{
  assert.equal((await POST(request({question:'',portfolio}))).status,400);
  assert.equal((await POST(request({question:'hello',portfolio:{version:1}}))).status,400);
  const invalid=structuredClone(portfolio);if(invalid.ledger[0].kind==='purchase')invalid.ledger[0].savingsCents=1000;
  assert.equal((await POST(request({question:'hello',portfolio:invalid}))).status,400);
  assert.equal((await POST(new Request('http://localhost/api/advisor',{method:'POST',body:'{broken'}))).status,400);
  assert.equal((await POST(new Request('http://localhost/api/advisor',{method:'POST',body:'x'.repeat(500001)}))).status,413);
});
test('Claude SDK wiring sends structured context and keeps credentials out of its response',async()=>{
  const originalFetch=globalThis.fetch;
  process.env.ANTHROPIC_API_KEY='test-placeholder-not-a-real-key';
  process.env.ANTHROPIC_MODEL='test-model';
  let called=false;
  try{
    globalThis.fetch=async(input,init)=>{
      called=true;
      assert.match(String(input),/api.anthropic.com\/v1\/messages/);
      const body=JSON.parse(String(init?.body));assert.equal(body.model,'test-model');assert(!body.tools);
      const content=JSON.parse(body.messages[0].content);assert.equal(content.context.balancesInCents.savings,52);assert.equal(content.context.transactionCount,1);assert.match(body.system,/cannot modify balances/);
      return new Response(JSON.stringify({id:'msg_test',type:'message',role:'assistant',model:'test-model',content:[{type:'text',text:'Your $0.52 in protected savings stays isolated.'}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:10,output_tokens:10}}),{headers:{'Content-Type':'application/json'}});
    };
    const response=await POST(request({question:'Explain my savings.',portfolio}));const data=await response.json();assert(called);assert.equal(data.mode,'claude');assert.match(data.answer,/\$0.52/);assert(!JSON.stringify(data).includes('test-placeholder'));
  }finally{globalThis.fetch=originalFetch;process.env.ANTHROPIC_API_KEY='';delete process.env.ANTHROPIC_MODEL;}
});
test('provider errors return an explicitly labeled deterministic fallback',async()=>{
  const originalFetch=globalThis.fetch;process.env.ANTHROPIC_API_KEY='test-placeholder';
  try{globalThis.fetch=async()=>new Response(JSON.stringify({type:'error',error:{type:'overloaded_error',message:'Test provider unavailable'}}),{status:503,headers:{'Content-Type':'application/json'}});const response=await POST(request({question:'Explain my risk limits.',portfolio}));const data=await response.json();assert.equal(data.mode,'demo');assert.match(data.notice,/Claude is unavailable/);assert.match(data.answer,/Protected savings of \$0.52/);}finally{globalThis.fetch=originalFetch;process.env.ANTHROPIC_API_KEY='';}
});
test('empty provider text also falls back instead of displaying a blank message',async()=>{
  const originalFetch=globalThis.fetch;process.env.ANTHROPIC_API_KEY='test-placeholder';
  try{globalThis.fetch=async()=>new Response(JSON.stringify({id:'msg_empty',type:'message',role:'assistant',model:'test-model',content:[],stop_reason:'max_tokens',stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}),{headers:{'Content-Type':'application/json'}});const data=await(await POST(request({question:'What is EV?',portfolio}))).json();assert.equal(data.mode,'demo');assert(data.answer.length>0);}finally{globalThis.fetch=originalFetch;process.env.ANTHROPIC_API_KEY='';}
});
