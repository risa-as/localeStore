// Read-only Graph diagnostics. Never sends messages or prints access tokens/customer content.
require('@next/env').loadEnvConfig(process.cwd(), true);
const { prisma } = require('../db/prisma.ts');
const { graphGet } = require('../lib/meta/graph.ts');
const { replyWindow } = require('../lib/meta/inbox.ts');
async function check(label, fn) {
  try { const value = await fn(); console.log(JSON.stringify({ check: label, ...value })); return value; }
  catch (error) { console.log(JSON.stringify({ check: label, error: { code: error.code, status: error.status, message: error.message } })); return null; }
}
(async () => {
  try {
    const conn = await prisma.metaConnection.findUnique({ where: { id: 'default' } });
    if (!conn) throw new Error('No connection');
    const page = (conn.pages || []).find(p => p.id === (process.argv[2] || conn.selectedPageId));
    if (!page?.access_token) throw new Error('Selected page has no token');
    const ctx = { pageId: page.id, token: page.access_token, platform: 'facebook' };
    console.log(JSON.stringify({ check: 'connection', pageId: page.id, appId: process.env.META_APP_ID,
      scopes: conn.scopes, tokenExpires: conn.userTokenExpires, updatedAt: conn.updatedAt }));
    const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
    for (const [label, token] of [['user-token', conn.userAccessToken], ['page-token', page.access_token]]) {
      await check(label, async () => {
        const { data } = await graphGet('debug_token', appToken, { input_token: token });
        return { appId: data.app_id, valid: data.is_valid, type: data.type, profileId: data.profile_id,
          expiresAt: data.expires_at, scopes: data.scopes,
          messagingGrant: data.granular_scopes?.find(s => s.scope === 'pages_messaging') };
      });
    }
    await check('page-token-identity', async () => graphGet('me', ctx.token, { fields: 'id,name' }));
    await check('page-published', async () => graphGet(page.id, ctx.token, { fields: 'id,is_published' }));
    await check('permissions', async () => ({ permissions: (await graphGet('me/permissions', conn.userAccessToken)).data }));
    await check('page-tasks', async () => {
      const accounts = await graphGet('me/accounts', conn.userAccessToken, { fields: 'id,tasks', limit: '100' });
      return { page: accounts.data?.find(p => p.id === page.id) };
    });
    const result = await check('conversation-sample', async () => {
      const res = await graphGet(`${page.id}/conversations`, ctx.token, {
        platform: 'messenger', fields: 'id,participants,updated_time', limit: '5',
      });
      const samples = [];
      for (const conversation of res.data || []) {
        const messages = await graphGet(`${encodeURIComponent(conversation.id)}/messages`, ctx.token,
          { fields: 'id,message,from,created_time', limit: '100' });
        const window = replyWindow(ctx, messages.data || []);
        samples.push({ messages: messages.data?.length || 0, canReply: window.canReply, reason: window.reason,
          recipientPresent: !!window.recipient, recipientMatchesParticipant: !!conversation.participants?.data?.some(p => p.id === window.recipient),
          pageIsParticipant: !!conversation.participants?.data?.some(p => p.id === page.id),
          expiresAt: window.expiresAt,
          outboundCount: messages.data?.filter(m => m.from?.id === page.id).length || 0 });
      }
      return { samples };
    });
    void result;
  } finally { await prisma.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
