const fs = require('node:fs');
const path='lib/actions/order.actions.ts';
let s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const start=s.indexOf('export async function getOrderSummery()');
const end=s.indexOf('export async function getOrderProfitStats',start);
let section=s.slice(start,end);
section=section.replace('FROM "Order" GROUP BY', 'FROM "Order" WHERE status IN (\'completed\', \'completedAccountant\') GROUP BY');
section=section.replace('WHERE "createdAt" >= ${thirtyDaysAgo}', 'WHERE status IN (\'completed\', \'completedAccountant\') AND "createdAt" >= ${thirtyDaysAgo}');
const ps=section.indexOf('  // Calculate total profit');
const pe=section.indexOf('  // --- Real Stats Calculation',ps);
section=section.slice(0,ps)+`  const [profitStats, expenses] = await Promise.all([
    getOrderProfitStats(currentMonthStart, now),
    getExpenseStatsForPeriod(currentMonthStart, now),
  ]);
  const totalProfit = profitStats.totalProfit - expenses.totalOverheadCost;

`+section.slice(pe);
section=section.replace('_sum: { totalPrice: true },\n      where: {', '_sum: { totalPrice: true },\n      where: {\n        status: { in: REVENUE_STATUSES },');
s=s.slice(0,start)+section+s.slice(end);
fs.writeFileSync(path,s);
