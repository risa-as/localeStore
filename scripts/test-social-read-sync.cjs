// Isolated UI regression: mock all server actions and block external network traffic.
// Requires Playwright Chromium; set PLAYWRIGHT_CORE_PATH if not installed locally.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'inbox-read-sync-'));
fs.mkdirSync(out, {recursive:true});
const esbuild = require(root+'/node_modules/esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const actions = `
const rows=[1,2,3].map(i=>({id:'c'+i,handle:'c'+i,title:'زبون '+i,text:'السعر؟',time:new Date().toISOString(),outgoing:false,lastMessageId:'in'+i,unread:1}));
window.readCalls=[];window.sendCalls=[];window.sentRecords={};window.incomingRecords={};
window.finishRead=(index,metaSynced=true,marked=true)=>window.readCalls[index].resolve({ok:true,data:{marked,metaSynced}});
window.finishSend=(index)=>{const job=window.sendCalls[index];const item={id:'mid'+index,handle:'',title:'الصفحة',text:job.input.text||'',time:new Date().toISOString(),outgoing:true,deliveryStatus:'sent'};(window.sentRecords[job.input.handle]||=[]).push(item);job.resolve({ok:true,data:{id:item.id,stateSaved:true,previousMessageIds:['in'+job.input.handle.slice(1)]}});};
export async function getSocialInboxList(){return {ok:true,data:{items:rows.map(row=>{const m=(window.incomingRecords[row.id]||[]).at(-1);return m?{...row,text:m.text,lastMessageId:m.id,outgoing:false,unread:1}:row}),after:null}};}
export async function getSocialInboxDetail(input){const items=[{id:'in'+input.handle.slice(1),handle:'',title:input.handle,text:'رسالة واردة',time:new Date(Date.now()-60000).toISOString(),outgoing:false},...(window.sentRecords[input.handle]||[]),...(window.incomingRecords[input.handle]||[])];return {ok:true,data:{items,after:null,latestMessageId:items.at(-1).id,window:{canReply:true,expiresAt:new Date(Date.now()+3600000).toISOString()}}};}
export async function getSocialInboxDelivery(){return {ok:true,data:[]};}
export function markSocialInboxRead(input){return new Promise((resolve,reject)=>window.readCalls.push({input,resolve,reject}));}
export async function getSocialInboxOrigin(){return {ok:true,data:null};}
export async function searchSocialInboxProducts(){return {ok:true,data:[]};}
export async function searchSocialInboxOrdersByPhone(){return {ok:true,data:{orders:[]}};}
export async function prepareSocialInboxOrder(){return {ok:false,message:'Not used'};}
export async function approveSocialInboxOrder(){throw new Error('Not used');}
export function replyToSocialInbox(input){return new Promise((resolve,reject)=>window.sendCalls.push({input,resolve,reject}));}
export function sendSocialInboxMedia(input){return new Promise((resolve,reject)=>window.sendCalls.push({input,resolve,reject}));}
`;
(async()=>{
 await esbuild.build({absWorkingDir:root,stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Inbox from './app/[locale]/admin/social-inbox/social-inbox-client';createRoot(document.getElementById('root')).render(<Inbox setup={{userId:'fixture',configured:true,connected:true,selectedPageId:'page',pages:[{id:'page',name:'صفحة تجريبية',igId:'ig'},{id:'page2',name:'صفحة أخرى'}]}}/>);`,resolveDir:root,loader:'tsx'},bundle:true,outfile:out+'/app.js',jsx:'automatic',define:{'process.env':'{}'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/social-inbox\.actions$/},()=>({path:'actions',namespace:'fixture'}));
 b.onResolve({filter:/^@\/lib\/uploadthing$/},()=>({path:'upload',namespace:'fixture'}));
 b.onResolve({filter:/^(next\/link|next\/image|next-intl)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'jsx',resolveDir:root,contents:a.path==='actions'?actions:a.path==='upload'?`export function useUploadThing(){return{startUpload:async(files)=>{await new Promise(r=>setTimeout(r,300));const f=files[0];return[{serverData:{kind:f.type.startsWith('image/')?'image':'video',url:'https://demo.ufs.sh/f/file',name:f.name,size:f.size,ticket:'test-ticket'}}]}};}`:a.path==='next-intl'?`export const useLocale=()=> 'ar';export const useTranslations=()=>key=>key;`:a.path==='next/link'?`import React from'react';export default function Link(p){return<a {...p}/>;}`:`import React from'react';export default function Image({unoptimized,...p}){return<img {...p}/>;}`}));
 }}]});
 cp.execFileSync(process.execPath,[root+'/node_modules/tailwindcss/lib/cli.js','-i',root+'/assets/styles/globals.css','-o',out+'/style.css','--minify'],{cwd:root,stdio:'pipe'});
 const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{font-family:Arial}main{padding:12px}header{height:56px;padding:16px;border-bottom:1px solid #ddd}</style><header>صندوق الصفحات — اختبار معزول</header><main id="root"></main><script src="/app.js"></script></html>`;
 const server=http.createServer((req,res)=>{const f=req.url==='/app.js'?'app.js':req.url==='/style.css'?'style.css':null;res.setHeader('Content-Type',f?(f.endsWith('.js')?'text/javascript':'text/css'):'text/html;charset=utf-8');res.end(f?fs.readFileSync(path.join(out,f)):html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());

  await page.goto('http://127.0.0.1:'+server.address().port);
  const conversation=(n)=>page.locator('aside button[aria-pressed].w-full').nth(n);
  const composer=page.getByRole('textbox',{name:'نص الرد'}), send=page.getByRole('button',{name:'إرسال',exact:true}), region=page.getByRole('region',{name:'الرسائل',exact:true});
  const waitReads=(n)=>page.waitForFunction(n=>window.readCalls.length===n,n);
  await conversation(0).click();await waitReads(1);
  // Opening no longer blocks replies on a slow read acknowledgement.
  await composer.fill('المسودة');assert.equal(await send.isEnabled(),true);
  await page.evaluate(()=>window.finishRead(0,false));
  await page.getByText(/Meta لم تؤكد مزامنة القراءة/).waitFor();
  // A locally marked read must still retry Meta with exactly the same message.
  await page.getByRole('button',{name:'إعادة مزامنة القراءة'}).click();await waitReads(2);
  assert.equal(await page.evaluate(()=>window.readCalls[1].input.messageId),'in1');
  await page.evaluate(()=>window.finishRead(1));
  await page.getByRole('button',{name:'إعادة مزامنة القراءة'}).waitFor({state:'detached'});
  assert.equal(await composer.inputValue(),'المسودة');
  await page.getByRole('button',{name:'تحديث الصندوق',exact:true}).click();await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.readCalls.length),2);
  await composer.fill('رد مؤكد');await send.click();await page.waitForFunction(()=>window.sendCalls.length===1);
  await page.evaluate(()=>window.finishSend(0));await waitReads(3);
  assert.equal(await page.evaluate(()=>window.readCalls[2].input.messageId),'mid0');
  await region.getByText('تم الإرسال',{exact:true}).waitFor();
  await composer.fill('كتابة أثناء المزامنة');assert.equal(await send.isEnabled(),true);
  await page.evaluate(()=>window.finishRead(2,false));await page.getByText(/Meta لم تؤكد مزامنة القراءة/).waitFor();
  assert.equal(await page.evaluate(()=>window.sendCalls.length),1);
  // Switching threads neither hides the old warning forever nor leaks it into another thread.
  await conversation(1).click();await waitReads(4);
  assert.equal(await page.getByText(/Meta لم تؤكد مزامنة القراءة/).count(),0);
  await page.evaluate(()=>window.finishRead(3));await conversation(0).click();await waitReads(5);
  await page.evaluate(()=>window.finishRead(4));
  await page.getByRole('button',{name:'إعادة مزامنة القراءة'}).waitFor({state:'detached'});
  assert.equal(await composer.inputValue(),'كتابة أثناء المزامنة');
  // Do not erase a new incoming thumbs-up while acknowledging the older sent message.
  await composer.fill('رد آخر');await send.click();await page.waitForFunction(()=>window.sendCalls.length===2);
  await page.evaluate(()=>{window.finishSend(1);window.incomingRecords.c1=[{id:'new-thumb',handle:'',title:'زبون 1',text:'👍',time:new Date().toISOString(),outgoing:false}];});await waitReads(6);
  await page.evaluate(()=>window.finishRead(5,false,false));await page.getByText(/تغيّرت المحادثة لدى Meta/).waitFor();
  await page.getByRole('button',{name:'إعادة مزامنة القراءة'}).click();await waitReads(7);
  assert.equal(await page.evaluate(()=>window.readCalls[6].input.messageId),'new-thumb');await region.getByText('👍',{exact:true}).waitFor();
  await page.evaluate(()=>window.finishRead(6));await page.getByRole('button',{name:'إعادة مزامنة القراءة'}).waitFor({state:'detached'});
  // Media uses the same independent read sync, and never resends on sync failure.
  await page.getByLabel('اختيار صورة أو فيديو',{exact:true}).setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
  await page.getByRole('button',{name:'إرسال المرفق',exact:true}).click();await page.waitForFunction(()=>window.sendCalls.length===3);
  await page.evaluate(()=>window.finishSend(2));await waitReads(8);await page.evaluate(()=>window.readCalls[7].reject(new Error('network')));
  await page.getByText(/تعذرت مزامنة القراءة مع Meta/).waitFor();assert.equal(await page.evaluate(()=>window.sendCalls.length),3);
  // A send completed after switching Pages still starts the scoped read acknowledgement.
  await composer.fill('رد أثناء تغيير الصفحة');await send.click();await page.waitForFunction(()=>window.sendCalls.length===4);
  await page.getByRole('button',{name:'إعدادات الصفحة والمنصة',exact:true}).click();
  await page.getByLabel('الصفحة',{exact:true}).selectOption('page2');await page.keyboard.press('Escape');
  await page.evaluate(()=>window.finishSend(3));await waitReads(9);
  assert.equal(await page.evaluate(()=>window.readCalls[8].input.pageId),'page');
  await page.evaluate(()=>window.finishRead(8));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:'local read versus Meta acknowledgement; retry same ID; no repeat confirmed read; non-blocking composer; post-send text/media sync; no message resend; scoped warnings; newer inbound preserved; Page switch during send'}));

 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
