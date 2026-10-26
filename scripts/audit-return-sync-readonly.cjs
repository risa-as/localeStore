// Read-only: database SELECTs and the carrier's GET listing. Never runs sync or sends messages.
require('@next/env').loadEnvConfig(process.cwd(), true);
const { prisma } = require('../db/prisma.ts');

(async () => {
  const report = { checkedAt: new Date().toISOString(), readOnly: true };
  try {
    const messages = await prisma.waMessage.findMany({
      where: { direction: 'out', type: 'template', body: { startsWith: '↩️ قالب الطلب الراجع' }, timestamp: { gte: new Date('2026-10-25T00:00:00+03:00') } },
      select: { timestamp: true, status: true, orderId: true }, orderBy: { timestamp: 'desc' }, take: 20,
    });
    report.todaysReturnMessages = messages.map(m => ({ timestamp: m.timestamp, status: m.status, hasOrderLink: !!m.orderId }));
    report.recentStatusEvents = await prisma.orderStatusEvent.groupBy({ by: ['source', 'toStatus'], where: { createdAt: { gte: new Date('2026-10-01T00:00:00+03:00') } }, _count: { _all: true } });
    report.provider = (process.env.DELIVERY_PROVIDER || 'modon').trim().toLowerCase();
    if (report.provider !== 'modon' || !process.env.MODON_TOKEN) { report.carrierUnavailable = 'Provider is not Modon or token is missing'; return; }
    const orders = await prisma.order.findMany({ where: { deliveryTrackingId: { not: null }, isArchived: false }, select: { status: true, deliveryTrackingId: true, messageOutbox: { where: { template: 'order_returned' }, select: { id: true }, take: 1 } } });
    const response = await fetch('https://mcht.modon-express.net/v1/merchant/merchant-orders?token=' + encodeURIComponent(process.env.MODON_TOKEN), { signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (!response.ok) { report.carrierUnavailable = { httpStatus: response.status }; return; }
    const data = await response.json();
    const remote = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(remote)) { report.carrierUnavailable = 'Unrecognized response shape'; return; }
    report.remoteRows = remote.length;
    report.hasPaginationMetadata = !Array.isArray(data) && ['links', 'meta', 'next_page_url', 'last_page'].some(k => data?.[k] != null);
    const byId = new Map(remote.map(o => [String(o.id ?? o.qr_id ?? ''), o]));
    const groups = new Map();
    let unmatched = 0;
    for (const o of orders) {
      const r = byId.get(String(o.deliveryTrackingId));
      if (!r) { unmatched++; continue; }
      const raw = String(r.status_id ?? 'unknown');
      if (!['15', '19', '17', '32', '25', '26', '27', '28', '31', '38', '39', '41'].includes(raw)) continue;
      const key = raw + ':' + o.status;
      const group = groups.get(key) || { carrierStatus: raw, localStatus: o.status, count: 0, withoutInquiry: 0 };
      group.count++; if (!o.messageOutbox.length) group.withoutInquiry++;
      groups.set(key, group);
    }
    report.currentMatches = [...groups.values()].sort((a, b) => Number(a.carrierStatus) - Number(b.carrierStatus) || a.localStatus.localeCompare(b.localStatus));
    report.localTrackedOrders = orders.length;
    report.unmatchedLocalTrackedOrders = unmatched;
  } catch (error) {
    report.unavailable = { type: error.name, code: error.code || undefined };
  } finally {
    await prisma.$disconnect();
    console.log(JSON.stringify(report, null, 2));
  }
})();
