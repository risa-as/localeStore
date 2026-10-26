// Read-only audit: no status changes, no outbox processing, no customer sends.
require('@next/env').loadEnvConfig(process.cwd(), true);
const { prisma } = require('../db/prisma.ts');
const { WA_TEMPLATE_BODY_PREFIX, getWaConfig } = require('../lib/whatsapp.ts');
const clean = value => String(value || '').replace(/https?:\/\/\S+/g, '[URL]').replace(/EAA[A-Za-z0-9]+/g, '[TOKEN]').replace(/\b\d{8,}\b/g, '[NUMBER]').slice(0, 500);
(async () => {
  try {
    const states = ['failed', 'returned', 'returnReceived'];
    const orderCounts = await prisma.order.groupBy({ by: ['status'], where: { status: { in: states }, isArchived: false }, _count: { _all: true } });
    const coverage = [];
    for (const status of states) coverage.push({ status,
      withInquiry: await prisma.order.count({ where: { status, isArchived: false, messageOutbox: { some: { template: 'order_returned' } } } }),
      withoutInquiry: await prisma.order.count({ where: { status, isArchived: false, messageOutbox: { none: { template: 'order_returned' } } } }),
    });
    const outbox = await prisma.messageOutbox.groupBy({ by: ['status'], where: { template: 'order_returned' }, _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true } });
    const issues = await prisma.messageOutbox.groupBy({ by: ['status', 'lastError'], where: { template: 'order_returned', status: { in: ['review', 'failed', 'sending'] } }, _count: { _all: true } });
    const recorded = {};
    for (const kind of ['confirmation', 'returned']) {
      const where = { direction: 'out', type: 'template', body: { startsWith: WA_TEMPLATE_BODY_PREFIX[kind] } };
      const [messages, conversations, dates] = await Promise.all([
        prisma.waMessage.count({ where }), prisma.waMessage.groupBy({ by: ['conversationId'], where, _count: { _all: true } }),
        prisma.waMessage.aggregate({ where, _min: { timestamp: true }, _max: { timestamp: true } }),
      ]);
      recorded[kind] = { messages, conversations: conversations.length, first: dates._min.timestamp, latest: dates._max.timestamp };
    }
    const events = await prisma.orderStatusEvent.groupBy({ by: ['toStatus', 'source'], where: { toStatus: { in: states } }, _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true } });
    const report = { checkedAt: new Date().toISOString(), whatsappConfigured: !!getWaConfig(), cronSecretConfigured: !!process.env.CRON_SECRET,
      orderCounts, coverage, outbox, issues: issues.map(issue => ({ status: issue.status, count: issue._count._all, error: clean(issue.lastError) })), recorded, events };
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
})().catch(error => { console.error(clean(error.message)); process.exitCode = 1; });
