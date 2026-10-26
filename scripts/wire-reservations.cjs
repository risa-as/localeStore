const fs=require('node:fs');
const ts=require('typescript');
const path='lib/actions/order.actions.ts';
let source=fs.readFileSync(path,'utf8');
const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
const edits=[];
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='prisma.$transaction'&&node.getStart(ast)<source.indexOf('export async function getOrderById')){
  const callback=node.arguments[0];
  if(callback&&ts.isArrowFunction(callback)&&ts.isBlock(callback.body)){
   const body=callback.body.getText(ast);
   if(body.includes('recentOrder.id'))edits.push({at:callback.body.end-1,text:'\n      await reserveOrderStock(tx, recentOrder.id);\n'});
   else if(body.includes('return insertedOrder.id;')){
    const at=source.indexOf('return insertedOrder.id;',callback.body.getStart(ast));
    edits.push({at,text:'await reserveOrderStock(tx, insertedOrder.id);\n      '});
   }
  }
 }
 ts.forEachChild(node,visit);
}
visit(ast);
if(edits.length!==4)throw new Error('Expected four checkout transactions, found '+edits.length);
for(const edit of edits.sort((a,b)=>b.at-a.at))source=source.slice(0,edit.at)+edit.text+source.slice(edit.at);
source=source.replace('"use server";','"use server";\nimport { reserveOrderStock } from "@/lib/orders/reservations";');
fs.writeFileSync(path,source);
