// Actual category actions and validation with synthetic PostgreSQL only.
const { PGlite } = require('@electric-sql/pglite');
const { createTestPrisma } = require('./pglite-prisma.cjs');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('esbuild');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');

async function main() {
  const schema = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
  const db = new PGlite(), prisma = createTestPrisma(db), cache = new Map(), invalidations = [];
  let authorized = true;
  function load(file) {
    file = path.resolve(file);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.ts');
    else if (!file.endsWith('.ts')) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const localRequire = name => {
      if (name === '@/db/prisma') return { prisma };
      if (name === '@/lib/authorization') return { requireStaff: async () => { if (!authorized) throw Error('revoked'); return { user: { role: 'admin' } }; } };
      if (name === 'next/cache') return { revalidatePath: p => invalidations.push(p), revalidateTag: t => invalidations.push(t) };
      if (name === '../utils' || name === './utils') return { formatError: e => ({ formError: e.message }) };
      if (name.startsWith('@/')) return load(name.slice(2));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
      return require(name);
    };
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module, exports: module.exports, require: localRequire, Date, Map, Set, console, process: { env: {} } }, { filename: file });
    return module.exports;
  }
  try {
    await db.exec(schema);
    const original = await prisma.category.create({ data: { name: 'عدة يدوية', slug: 'hand-tools' } });
    const other = await prisma.category.create({ data: { name: 'كماليات سيارة', slug: 'car-accessories' } });
    const newName = 'عدد احترافية';
    const productData = { name: 'Synthetic', images: [], colors: [], description: 'Synthetic', stock: 10, price: 25 };
    const linked = await prisma.product.create({ data: { ...productData, slug: 'linked', categories: ['أخرى', original.name, other.name] } });
    const duplicate = await prisma.product.create({ data: { ...productData, slug: 'duplicate', categories: [original.name, newName, 'أخرى'] } });
    const unrelated = await prisma.product.create({ data: { ...productData, slug: 'unrelated', categories: [other.name] } });
    const { updateCategory, getCategoryById } = load('lib/actions/category.actions.ts');
    assert.equal((await updateCategory({ id: original.id, name: newName, slug: 'professional-tools' })).success, true);
    assert.equal((await getCategoryById(original.id)).name, newName);
    assert.deepEqual((await prisma.product.findUniqueOrThrow({ where: { id: linked.id } })).categories, ['أخرى', newName, other.name]);
    assert.deepEqual((await prisma.product.findUniqueOrThrow({ where: { id: duplicate.id } })).categories, [newName, 'أخرى']);
    assert.deepEqual((await prisma.product.findUniqueOrThrow({ where: { id: unrelated.id } })).categories, [other.name]);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: linked.id } })).stock, 10);
    assert(invalidations.includes('products') && invalidations.includes('categories'));
    assert(invalidations.includes('/[locale]/admin/products/[id]'));
    assert.equal((await updateCategory({ id: original.id, name: newName, slug: 'updated-slug-only' })).success, true);
    const snapshot = JSON.stringify(await prisma.product.findMany({ orderBy: { slug: 'asc' } }));
    for (const values of [{ name: other.name, slug: 'unique-slug' }, { name: 'اسم مختلف', slug: other.slug }, { name: 'س', slug: 'valid-slug' }]) {
      assert.equal((await updateCategory({ id: original.id, ...values })).success, false);
      assert.equal((await getCategoryById(original.id)).name, newName);
      assert.equal((await getCategoryById(original.id)).slug, 'updated-slug-only');
      assert.equal(JSON.stringify(await prisma.product.findMany({ orderBy: { slug: 'asc' } })), snapshot);
    }
    assert.equal(await getCategoryById('invalid-uuid'), null);
    assert.equal(await getCategoryById('00000000-0000-4000-8000-000000000001'), null);
    authorized = false;
    await assert.rejects(updateCategory({ id: original.id, name: 'تغيير غير مصرح', slug: 'unauthorized' }), /revoked/);
    await assert.rejects(getCategoryById(original.id), /revoked/);
    assert.equal((await prisma.category.findUniqueOrThrow({ where: { id: original.id } })).name, newName);
    console.log('PASS: category edit, ordered product-category rename/deduplication, unrelated fields preserved, slug-only edit, duplicate-name/slug rollback, validation, invalid/missing IDs, fresh authorization and cache invalidation. Synthetic data only.');
  } finally { await prisma.$disconnect(); await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
