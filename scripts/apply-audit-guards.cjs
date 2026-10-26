const fs = require('fs');
const ts = require('typescript');
const groups = {
 'lib/actions/user.actions.ts': {requireAdministrator:['getUserById','getAllUsers','deleteUser','updateUser','createUser'],requireUser:['updateUserAddress','updateUserPaymentMethod','updateProfile']},
 'lib/actions/product.actions.ts':{requireAdministrator:['deleteProduct'],requireStaff:['createProduct','updateProduct','getProductById']},
 'lib/actions/batch.actions.ts':{requireAdministrator:['createBatch','updateBatch','deleteBatch','getAllBatchesWithStatus','getBatchesByProduct','getProductsForBatchSelect']},
 'lib/actions/expense.actions.ts':{requireAdministrator:['getExpenses','createExpense','updateExpense','deleteExpense','getAdCampaigns','createAdCampaign','updateAdCampaign','deleteAdCampaign','getExpenseStatsForPeriod']},
 'lib/actions/category.actions.ts':{requireStaff:['createCategory','deleteCategory']},
 'lib/actions/site-settings.actions.ts':{requireAdministrator:['updateLogoUrl']},
 'lib/actions/deal-settings.actions.ts':{requireAdministrator:['updateDealSettings']},
 'lib/actions/order.actions.ts':{requireStaff:['getAllOrders','getOrdersSummaryStats','getAllOrdersForExport','deleteOrder','updateOrder','bulkUpdateOrderStatus','resendOrderToModon','countOrdersByDateAndStatus','bulkUpdateOrderStatusByDateRange','deliverOrder','getModonStats'],requireAdministrator:['getOrderSummery','getOrderProfitStats']},
};
for(const [file,guards] of Object.entries(groups)) {
 let source=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);const edits=[];const found=new Set();
 for(const node of ast.statements) if(ts.isFunctionDeclaration(node)&&node.body&&node.name) for(const [guard,names] of Object.entries(guards)) if(names.includes(node.name.text)){found.add(node.name.text);edits.push({pos:node.body.getStart(ast)+1,text:'\n  await '+guard+'();'});}
 for(const names of Object.values(guards)) for(const name of names) if(!found.has(name)) throw Error('Missing '+file+':'+name);
 for(const e of edits.sort((a,b)=>b.pos-a.pos)) source=source.slice(0,e.pos)+e.text+source.slice(e.pos);
 source=source.replace('"use server";','"use server";\nimport { '+Object.keys(guards).join(', ')+' } from "@/lib/authorization";');fs.writeFileSync(file,source);
}
