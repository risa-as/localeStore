const fs = require('node:fs');
const ts = require('typescript');
const path = 'lib/actions/order.actions.ts';
let text = fs.readFileSync(path, 'utf8');
const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
const names = ['updateOrderToPaid', 'syncModonOrders'];
const declarations = source.statements.filter(s => ts.isFunctionDeclaration(s) && names.includes(s.name?.text));
if (declarations.length !== 2) throw new Error('Expected two internal functions');
fs.writeFileSync('lib/orders/internal-operations.ts', `import { prisma } from '@/db/prisma';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { formatError } from '@/lib/utils';
import { getDeliveryProvider } from '@/lib/delivery';
` + declarations.map(s => s.getText(source)).join('\n\n'));
for (const declaration of [...declarations].reverse()) {
 const replacement = declaration.name.text === 'syncModonOrders'
   ? 'export async function syncModonOrders() { await requireStaff(); return syncModonOrdersInternal(); }'
   : '';
 text = text.slice(0, declaration.getStart(source)) + replacement + text.slice(declaration.end);
}
text = text.replace('"use server";', '"use server";\nimport { syncModonOrders as syncModonOrdersInternal } from "@/lib/orders/internal-operations";');
fs.writeFileSync(path, text);
for (const path of ['app/api/modon/sync/route.ts', 'app/api/webhooks/stripe/route.ts']) {
 fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace('@/lib/actions/order.actions', '@/lib/orders/internal-operations'));
}
