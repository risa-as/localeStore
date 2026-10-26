# Category editing

- Added a labelled Edit button alongside Delete in every category row. It opens
  `/<locale>/admin/categories/<id>` with the existing name/slug prefilled.
- Reused the creation form for edits, retaining slug generation and adding save,
  cancel and locale-preserving return navigation. Slug label now targets its
  actual input instead of the surrounding layout div.
- New page and read/update actions require current staff authorization; invalid
  or absent category IDs yield not-found behavior.
- Updating a name also changes matching values in Product.categories (which
  stores names, not category IDs). Category update and product-array updates are
  one transaction. A category row lock serializes renames, and SQL updates each
  product's current array rather than overwriting a previously loaded snapshot.
  Other category values retain their original order; duplicates are removed.
- Name/slug uniqueness violations fail without partial changes. Schema
  validation and both product/category caches are applied on the server.
- Added Arabic/English labels. No schema migration and no live data changes.

Validation: `node scripts/test-category-edit.cjs` passed with actual actions,
validation and Prisma against synthetic PostgreSQL. Covered rename propagation,
deduplication, unrelated fields, slug-only edits, duplicate-name/slug rollback,
invalid/missing IDs, authorization and invalidation.

Isolated headless browser fixture
`C:/Users/dell/AppData/Local/Temp/category-edit-qa.cjs` passed for list/edit links,
prefilled form, save payload, return/cancel, failed-save retention, existing create
flow and slug generation, and mobile layout. Actions were mocked; the owner's
browser was not used and no live categories/products were modified.
