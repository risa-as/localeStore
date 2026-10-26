// Read-only audit: never emits credentials or customer identifiers.
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const fs=require('fs');
const queries={
  orderSummary:`SELECT status,count(*)::int orders,min("createdAt") first,max("createdAt") last FROM "Order" GROUP BY status ORDER BY orders DESC`,
  multiProduct:`WITH x AS (SELECT o.id,o.status,o."createdAt",count(i."productId") n FROM "Order" o LEFT JOIN "OrderItem" i ON i."orderId"=o.id GROUP BY o.id) SELECT CASE WHEN "createdAt">=now()-interval '30 days' THEN 'last30' ELSE 'older' END period,status,count(*)::int orders,count(*) FILTER (WHERE n>1)::int multi FROM x GROUP BY 1,2 ORDER BY 1,2`,
  units:`SELECT min("totalPrice") total_min,max("totalPrice") total_max,min("actualShippingCost") shipping_min,max("actualShippingCost") shipping_max,count(*) FILTER(WHERE "actualShippingCost">=1000)::int full_unit_shipping,count(*) FILTER(WHERE "totalPrice"<1000 AND "actualShippingCost">=1000)::int mixed_unit_orders FROM "Order"`,
  shippingSettings:`SELECT "baghdadCost","othersCost" FROM "ShippingSettings"`,
  stock:`WITH s AS (SELECT i."productId",sum(i.qty) sold FROM "OrderItem" i JOIN "Order" o ON o.id=i."orderId" WHERE o.status IN ('completed','completedAccountant','pending') GROUP BY 1) SELECT count(*)::int products,count(*) FILTER(WHERE p.stock>0 AND p.stock-coalesce(s.sold,0)<=0)::int displayed_available_but_empty,count(*) FILTER(WHERE p.rating=0)::int no_rating FROM "Product" p LEFT JOIN s ON s."productId"=p.id`,
  waReturned:`SELECT status,"errorCode",count(*)::int messages,min(timestamp) first,max(timestamp) last FROM "WaMessage" WHERE direction='out' AND type='template' AND body LIKE '%قالب الطلب الراجع%' GROUP BY 1,2`,
  waTemplates:`SELECT status,"errorCode",count(*)::int messages FROM "WaMessage" WHERE direction='out' AND type='template' GROUP BY 1,2`,
  returnCoverage:`SELECT count(*)::int returned_orders,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM "WaConversation" c JOIN "WaMessage" m ON m."conversationId"=c.id WHERE c.phone=o."phoneNumber" AND m.body LIKE '%قالب الطلب الراجع%' AND m.timestamp>=o."createdAt"))::int possible_message_matches FROM "Order" o WHERE o.status IN ('returned','returnReceived')`,
  adSync:`SELECT date,ok,rows,unlinked,"accountsErr" FROM "AdSpendSyncLog" ORDER BY "createdAt" DESC LIMIT 5`,
  collections:`SELECT count(*)::int orders,count(*) FILTER(WHERE "modonCollectedPrice" IS NOT NULL)::int has_collection,count(*) FILTER(WHERE "modonCollectedPrice" IS NOT NULL AND abs("modonCollectedPrice"-"totalPrice")>0.01)::int collection_diff FROM "Order" WHERE status IN ('completed','completedAccountant')`,
  invalidExpenseDates:`SELECT (SELECT count(*)::int FROM "Expense" WHERE "toDate"<"fromDate") expenses,(SELECT count(*)::int FROM "AdCampaign" WHERE "toDate"<"fromDate") campaigns`,
  manualOverlap:`SELECT count(*)::int manual_entries,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM "AdSpendDaily" d WHERE d."productId"=c."productId" AND d.date BETWEEN c."fromDate" AND c."toDate"))::int entries_with_overlap FROM "AdCampaign" c`,
  oneDayCosts:`SELECT 'expenses' source,count(*)::int rows,sum(amount) amount FROM "Expense" WHERE "fromDate"="toDate" UNION ALL SELECT 'manual_ads',count(*)::int,sum(amount) FROM "AdCampaign" WHERE "fromDate"="toDate"`,
  waFailureDates:`SELECT "errorCode",count(*)::int messages,min(timestamp) first,max(timestamp) last,count(*) FILTER(WHERE timestamp>=now()-interval '30 days')::int last30 FROM "WaMessage" WHERE direction='out' AND status='failed' GROUP BY 1`,
  paidFlags:`SELECT count(*)::int completed,count(*) FILTER(WHERE NOT "isPaid")::int not_marked_paid,count(*) FILTER(WHERE NOT "isDelivered")::int not_marked_delivered FROM "Order" WHERE status IN ('completed','completedAccountant')`,
  guests:`SELECT count(*)::int orders,count(*) FILTER(WHERE "userId" IS NULL)::int guest_orders FROM "Order"`,
  adImportedCount:`SELECT count(*)::int rows FROM "AdSpendDaily"`
};
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const out={checkedAt:new Date().toISOString()};try {await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout = '25s'");for(const [k,q] of Object.entries(queries)){out[k]=(await c.query(q)).rows;}await c.query('ROLLBACK');fs.mkdirSync('docs/audit-2026-09-12',{recursive:true});fs.writeFileSync('docs/audit-2026-09-12/aggregate-evidence.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));} finally {await c.end();}})().catch(e=>{console.error('Audit failed:',e.code||e.name);process.exitCode=1;});
