/* Test-only pg Pool adapter. No TCP connections are opened. */
const pg = require('pg');
const { EventEmitter } = require('node:events');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
function createTestPrisma(db) {
  class MemoryPool extends pg.Pool {
    async query(config, values) {
      const query = typeof config === 'string' ? { text: config, values } : config;
      const parsers = query.types ? Object.fromEntries([...new Set([...Object.values(pg.types.builtins), 1000, 1005, 1007, 1009, 1016, 1021, 1022, 1115, 1182, 1185, 1231, 2951, 3807])].map(oid => [oid, query.types.getTypeParser(oid, 'text')])) : undefined;
      const result = await db.query(query.text, query.values, { rowMode: query.rowMode, parsers });
      return { rows: result.rows, fields: result.fields, rowCount: result.affectedRows ?? result.rows.length };
    }
    async connect() {
      const client = new EventEmitter();
      client.query = this.query.bind(this);
      client.release = () => {};
      return client;
    }
  }
  return new PrismaClient({ adapter: new PrismaPg(new MemoryPool()) });
}
module.exports = { createTestPrisma };
