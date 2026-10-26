// Only GET requests to Meta. Never sends a message or prints credentials.
require('dotenv').config({quiet:true});
const fs=require('fs');
async function get(path){const r=await fetch('https://graph.facebook.com/v25.0/'+path,{headers:{Authorization:'Bearer '+process.env.WHATSAPP_TOKEN},signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw {http:r.status,code:data.error?.code,type:data.error?.type};return data;}
(async()=>{const out={checkedAt:new Date().toISOString(),readOnly:true};try{
 const businesses=await get('me/businesses?fields=id&limit=25');
 out.businessCount=businesses.data?.length||0;out.templates=[];
 for(const b of businesses.data||[]){const accounts=await get(b.id+'/owned_whatsapp_business_accounts?fields=id&limit=25');for(const a of accounts.data||[]){const phones=await get(a.id+'/phone_numbers?fields=id&limit=100');if(!(phones.data||[]).some(p=>p.id===process.env.WHATSAPP_PHONE_NUMBER_ID))continue;const templates=await get(a.id+'/message_templates?name=order_returned&fields=name,status,language,components&limit=100');out.templates.push(...(templates.data||[]));}}
}catch(e){out.unavailable={http:e.http,code:e.code,type:e.type||e.name};}
fs.writeFileSync('docs/audit-2026-09-12/wa-template-access.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));})();
