const fs=require('node:fs');
const path='app/api/whatsapp/webhook/route.ts';
let s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
s=s.replace('  button?: { text: string };','  context?: { id?: string };\n  button?: { text: string; payload?: string };');
s=s.replace('button_reply?: { title: string }; list_reply?: { title: string }','button_reply?: { title: string; id?: string }; list_reply?: { title: string; id?: string }');
const start=s.indexOf('  const conversation = await prisma.waConversation.upsert');
const end=s.indexOf('\n}\n\n// ترتيب',start);
let section=s.slice(start,end).replaceAll('prisma.', 'tx.');
section=section.replace('        waMessageId: msg.id,','        waMessageId: msg.id,\n        orderId: reply?.orderId,\n        replyToMessageId: msg.context?.id,\n        buttonPayload: msg.button?.payload ?? msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id,');
section=section.replace('    .catch((err: { code?: string }) => {\n      if (err?.code !== "P2002") throw err; // P2002 = رسالة مكررة، نتجاهلها\n    });',';');
s=s.slice(0,start)+`  await prisma.$transaction(async tx => {
    await tx.$queryRaw\`SELECT pg_advisory_xact_lock(hashtext(\${msg.id}))\`;
    if (await tx.waMessage.findUnique({ where: { waMessageId: msg.id }, select: { id: true } })) return;
    const reply = msg.context?.id ? await tx.waMessage.findFirst({ where: { waMessageId: msg.context.id, direction: "out", conversation: { phone: localPhone } }, select: { orderId: true } }) : null;
`+section+`
    if (reply?.orderId && body) await tx.order.updateMany({ where: { id: reply.orderId, status: { in: ["returned", "returnReceived"] } }, data: { returnReasonText: body } });
  });`+s.slice(end);
s=s.replace('  failed: 4,','  failed: 1,');
s=s.replace('if (newRank > oldRank)', 'if (newRank > oldRank || (status.status === "failed" && oldRank < 2))');
s=s.replace('  // سلوك n8n السابق كما هو: الفشل يسجَّل والنجاح يمسح سجلات الرقم', `  await prisma.messageOutbox.updateMany({ where: { waMessageId: status.id, status: { notIn: status.status === "read" ? [] : ["read"] } }, data: { status: status.status, lastError: errorCode } });
  // Keep failures scoped to the same message; unrelated successes must not hide them.`);
s=s.replace('    await prisma.whatsAppFailedDelivery.create({','    const duplicate = await prisma.whatsAppFailedDelivery.findFirst({ where: { messageId: status.id } });\n    if (!duplicate) await prisma.whatsAppFailedDelivery.create({');
s=s.replace('where: { phone: localPhone },\n    });\n  }\n}', 'where: { messageId: status.id },\n    });\n  }\n}');
s=s.replace('  if (config?.appSecret) {','  if (!config?.appSecret) return new Response("Webhook secret is not configured", { status: 503 });\n  if (config.appSecret) {');
s=s.replace('    console.error("❌ WhatsApp webhook error:", err);','    console.error("❌ WhatsApp webhook error:", err);\n    return NextResponse.json({ success: false }, { status: 500 });');
fs.writeFileSync(path,s);
