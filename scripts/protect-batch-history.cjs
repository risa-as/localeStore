const fs=require('node:fs');
const path='lib/actions/batch.actions.ts';
let s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const start=s.indexOf('    // عدّل المخزون');
const end=s.indexOf('    revalidateBatchPages();',start);
s=s.slice(0,start)+`    await prisma.$transaction(async tx => {
      await tx.$queryRaw\`SELECT id FROM "Product" WHERE id = \${parsed.productId}::uuid FOR UPDATE\`;
      const existing = await tx.productBatch.findUniqueOrThrow({ where: { id: parsed.id } });
      if (existing.productId !== parsed.productId) throw new Error("لا يمكن نقل دفعة إلى منتج آخر");
      const used = await tx.inventoryAllocation.count({ where: { batchId: parsed.id } });
      if (used && (existing.quantity !== parsed.quantity || Number(existing.costPrice) !== Number(parsed.costPrice))) throw new Error("هذه الدفعة مرتبطة بحركات مخزون؛ أضف دفعة أو تسوية مستقلة بدلاً من تغيير تاريخها");
      await tx.productBatch.update({ where: { id: parsed.id }, data: { quantity: parsed.quantity, costPrice: parsed.costPrice, notes: parsed.notes || null } });
      await tx.product.update({ where: { id: existing.productId }, data: { stock: { increment: parsed.quantity - existing.quantity } } });
    });
`+s.slice(end);
const ds=s.indexOf('    const existing =',s.indexOf('export async function deleteBatch'));
const de=s.indexOf('    revalidateBatchPages();',ds);
s=s.slice(0,ds)+`    await prisma.$transaction(async tx => {
      const existing = await tx.productBatch.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw\`SELECT id FROM "Product" WHERE id = \${existing.productId}::uuid FOR UPDATE\`;
      if (await tx.inventoryAllocation.count({ where: { batchId: id } })) throw new Error("لا يمكن حذف دفعة استُخدمت في طلبات");
      await tx.productBatch.delete({ where: { id } });
      await tx.product.update({ where: { id: existing.productId }, data: { stock: { decrement: existing.quantity } } });
    });
`+s.slice(de);
fs.writeFileSync(path,s);
