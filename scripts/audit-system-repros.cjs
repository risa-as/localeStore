// Isolated reproductions of repository logic; DB/network are mocked.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {transformSync}=require('esbuild');
function load(file,mocks={},globals={}) {
  const module={exports:{}};
  const code=transformSync(fs.readFileSync(file,'utf8'),{loader:'ts',format:'cjs',target:'node20'}).code;
  vm.runInNewContext(code,{module,exports:module.exports,require:(id)=>{if(id in mocks)return mocks[id];if(id==='zod')return require('zod');throw Error('Unexpected dependency '+id);},console,Date,Map,Set,process:{env:{}},...globals},{filename:file});
  return module.exports;
}
const d=s=>new Date(s+'T00:00:00Z');
const noon=s=>new Date(s+'T12:00:00Z');
function matches(row,where){return Object.entries(where||{}).every(([k,v])=>(!v.gte||row[k]>=v.gte)&&(!v.lte||row[k]<=v.lte));}
function expensesModule({expenses=[],campaigns=[],imported=[]}) {
 const prisma={expense:{findMany:async({where})=>expenses.filter(r=>matches(r,where))},adCampaign:{findMany:async({where})=>campaigns.filter(r=>matches(r,where))},adSpendDaily:{findMany:async({where})=>imported.filter(r=>matches(r,where))},product:{findMany:async()=>[{id:'p',name:'test'}]}};
 return load('lib/actions/expense.actions.ts',{'@/db/prisma':{prisma},'next/cache':{revalidatePath(){}}});
}
(async()=>{
 const results=[];
 const e={fromDate:d('2026-09-01'),toDate:d('2026-09-01'),amount:100,category:'test'};
 let r=await expensesModule({expenses:[e]}).getExpenseStatsForPeriod(noon('2026-09-01'),noon('2026-09-01'));
 assert.equal(r.totalExpenses,0);results.push({case:'One-day expense disappears with profit-page noon boundaries',expected:100,actual:r.totalExpenses});
 r=await expensesModule({imported:[{productId:'p',date:d('2026-09-01'),amountIQD:100000,amount:100}]}).getExpenseStatsForPeriod(noon('2026-09-01'),noon('2026-09-01'));
 assert.equal(r.totalAdCost,0);results.push({case:'First-day imported spend disappears',expected:100,actual:r.totalAdCost});
 r=await expensesModule({campaigns:[{id:'c',productId:'p',product:{name:'test'},fromDate:d('2026-09-01'),toDate:d('2026-09-10'),amount:100,currency:'IQD'}],imported:[{productId:'p',date:d('2026-09-05'),amountIQD:10000,amount:10}]}).getExpenseStatsForPeriod(d('2026-09-01'),d('2026-09-10'));
 assert.equal(r.totalAdCost,10);results.push({case:'One imported day removes whole ten-day manual campaign',expectedIfOnlyCoveredDayReplaced:100,actual:r.totalAdCost});
 const fefo=load('lib/fefo.ts');
 const batches=[{id:'b1',quantity:1,costPrice:10,createdAt:d('2026-01-01')},{id:'b2',quantity:1,costPrice:20,createdAt:d('2026-03-01')}];
 const f=fefo.computeFefo(batches,[{key:'sale',qty:2,date:d('2026-02-01')}],99);
 assert.equal(f.saleCost.get('sale'),30);results.push({case:'February sale consumes March batch',expectedWithFutureBatchExcluded:109,actual:f.saleCost.get('sale')});
 const before=fefo.computeFefo(batches,[{key:'a',qty:1,date:d('2026-03-02')},{key:'b',qty:1,date:d('2026-03-03')}],99);
 const after=fefo.computeFefo(batches,[{key:'b',qty:1,date:d('2026-03-03')}],99);
 results.push({case:'Returning earlier order changes another order historical cost',before:before.saleCost.get('b'),after:after.saleCost.get('b')});
 const pricing=load('lib/pricing.ts');
 results.push({case:'Offer differs from linear cart total',cart:27*2+5,saved:pricing.computeOrderPricing({quantity:2,unitPrice:27,shippingPrice:5,offers:'سعر القطعتين ب47 الف'}).totalPrice});
 let payload;const wa=load('lib/whatsapp.ts',{'@/db/prisma':{prisma:{waConversation:{upsert:async()=>({id:'c'})},waMessage:{create:async()=>({})}}}},{process:{env:{WHATSAPP_TOKEN:'fake',WHATSAPP_PHONE_NUMBER_ID:'fake'}},fetch:async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({messages:[{id:'mock'}]})};}});
 await wa.sendOrderReturned({fullName:'اختبار',phoneNumber:'07700000000',product:'منتج اختبار',price:'32'});
 assert.equal(payload.template.name,'order_returned');assert.equal(payload.template.language.code,'ar');assert.equal(payload.to,'9647700000000');
 results.push({case:'Return template payload, mocked API only',template:payload.template,recipientNormalization:'passed'});
 fs.writeFileSync('docs/audit-2026-09-12/reproductions.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
