// Dry-run by default. Only configures delivery/read subscriptions, never sends messages.
require('@next/env').loadEnvConfig(process.cwd(), true);
const { prisma } = require('../db/prisma.ts');
const { graphGet, graphPost } = require('../lib/meta/graph.ts');
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
(async () => {
  try {
    const pageId = arg('page'), rawCallback = arg('callback');
    if (!pageId || !rawCallback) throw new Error('Supply --page=PAGE_ID --callback=https://STORE/api/meta/webhook; add --apply after deploying.');
    const callback = new URL(rawCallback);
    if (callback.protocol !== 'https:' || callback.pathname !== '/api/meta/webhook' || callback.search || callback.hash)
      throw new Error('Expected a public HTTPS /api/meta/webhook callback without query or fragment.');
    const conn = await prisma.metaConnection.findUnique({ where: { id: 'default' } });
    const page = conn?.pages?.find(page => page.id === pageId);
    if (!page?.access_token) throw new Error('Page is not in the authorized connection.');
    const appId = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!appId || !secret || !verifyToken) throw new Error('Configure META_APP_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN first.');
    const appToken = `${appId}|${secret}`;
    const [appSubs, pageSubs] = await Promise.all([
      graphGet(`${appId}/subscriptions`, appToken), graphGet(`${pageId}/subscribed_apps`, page.access_token),
    ]);
    const current = appSubs.data?.find(item => item.object === 'page');
    if (current?.callback_url && current.callback_url !== callback.toString()) throw new Error('Another Page callback exists. Reconcile it before changing the subscription.');
    const required = ['message_deliveries', 'message_reads'];
    const fields = [...new Set([...(current?.fields || []).map(field => field.name || field), ...required])];
    const subscribedFields = [...new Set([...(pageSubs.data?.find(item => item.id === appId)?.subscribed_fields || []), ...required])];
    console.log(JSON.stringify({ apply: process.argv.includes('--apply'), pageId, callback: callback.toString(), pageObjectFields: fields, pageSubscribedFields: subscribedFields, otherAppObjectsPreserved: true }));
    if (!process.argv.includes('--apply')) return;
    // No mutation unless the deployed endpoint proves it has the matching verify token.
    const challenge = require('node:crypto').randomBytes(16).toString('hex');
    const probe = new URL(callback);
    probe.searchParams.set('hub.mode', 'subscribe'); probe.searchParams.set('hub.verify_token', verifyToken); probe.searchParams.set('hub.challenge', challenge);
    const response = await fetch(probe, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || await response.text() !== challenge) throw new Error('Deployed callback verification failed; no subscriptions were changed. Deploy code and matching verify token first.');
    await graphPost(`${appId}/subscriptions`, appToken, { object: 'page', callback_url: callback.toString(), verify_token: verifyToken, fields: fields.join(',') });
    await graphPost(`${pageId}/subscribed_apps`, page.access_token, { subscribed_fields: subscribedFields });
    const [verifiedApp, verifiedPage] = await Promise.all([
      graphGet(`${appId}/subscriptions`, appToken), graphGet(`${pageId}/subscribed_apps`, page.access_token),
    ]);
    const appFields = verifiedApp.data?.find(item => item.object === 'page' && item.active)?.fields?.map(field => field.name || field) || [];
    const pageFields = verifiedPage.data?.find(item => item.id === appId)?.subscribed_fields || [];
    if (!required.every(field => appFields.includes(field) && pageFields.includes(field))) throw new Error('Subscription verification incomplete; inspect Meta configuration.');
    console.log('Verified delivery/read subscriptions. No messages sent.');
  } finally { await prisma.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
