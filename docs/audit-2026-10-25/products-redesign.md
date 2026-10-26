# Products page redesign

Updated `/ar/admin/products` while retaining all 12 existing table fields:
row number, image, name/categories, sale price, purchase price, delivery price,
profit, offers, original stock, remaining stock, rating, and actions. Create,
per-product batch creation, edit, landing-page preview, delete confirmation,
search and pagination remain available.

## Presentation and behavior

- Four compact inventory summaries: total remaining pieces, products with a
  positive balance, low-balance products (1–5 pieces), and the existing purchase
  value summary for administrators.
- Summary covers all products, not only the current page or search results.
  Total pieces sums each positive `stock - dispatched quantity` balance. A
  negative balance remains visible in its row and a separate deficit notice;
  it does not cancel another product's positive physical balance.
- Existing stock/value calculation and warehouse-consumed status list are
  unchanged. Home reservations are still physically in the warehouse and are not
  subtracted from this warehouse summary.
- Grouped column headings, sticky header on wide screens, clearer
  stock labels, empty-result treatment and an action group per product.
- Two summary columns on small screens, four for administrators on desktop.
- 10px corners on cards, buttons, inputs, images, badges and page-scoped portal
  dialogs/controls. Styles for portals only apply while this page is present.
- Links/forms include the active locale. Search preserves an active category;
  clear removes search/category filters. Pagination retains the existing filters.
- Delete trigger has a product-specific accessible label; other uses receive a
  default label through an optional backwards-compatible component prop.
- Pagination accepts optional labels; this page shows السابق/التالي, while
  existing callers retain their original default labels.

## Validation

- TypeScript and focused ESLint passed, including the final component changes.
- An isolated headless Chromium fixture bundled the actual page and actual
  table, batch dialog, delete dialog and pagination components. Only data,
  authentication, server actions and navigation adapters were mocked. No use of
  the owner's browser/session and no product mutations.
- Verified 12 columns, all actions, the summary including off-page products,
  deficit handling, search/category preservation, locale URLs, pagination,
  computed 10px radii including portal dialogs, retained batch form fields,
  sticky table heading, empty/staff/dark states and no document overflow at
  320/390/768/1440/1536px. Repeated successfully after mobile layout changes.
- Fixture: `C:/Users/dell/AppData/Local/Temp/products-design-qa.cjs`.
- Screenshots: `C:/Users/dell/AppData/Local/Temp/products-design-qa/`.

## Existing inventory data limitation

Read-only checks against the connected database found 85 product records and
987 positive remaining pieces under the existing page's stock formula. One
product has a negative balance; archived products contribute no positive units.
Independently confirmed with SQL: 62 product stock fields do not equal their
summed batch quantities. All stock-bearing products do have batch records; none
of those mismatches is explained simply by the stock field already storing
batch quantity minus the current consumed-order quantities.

This redesign does not establish which historical balance is correct and does
not reconcile inventory or revalue products. The displayed total is explicitly
the sum of the existing remaining-stock column. No live product/batch/order data
was changed. The owner was informed of the mismatch.

## Follow-up: full page width and one vertical scrollbar

The owner requested full-width header/table and document scrolling instead of a
separately scrolling table. The products-page marker now removes the admin main
container and navigation-container maximum widths, with 16px content padding.
Other admin pages retain their previous widths.

Removed the table maximum height, overscroll containment and scrollbar gutter.
The entire table grows with its rows and scrolls with the document. On screens
at least 1440px wide, its wrapper uses visible overflow and the heading sticks
56px below the admin navigation. On narrower screens, only horizontal table
scrolling remains; the table still has no independent vertical overflow.
The rounded card uses overflow clip, which does not create a competing scrolling
ancestor. An optional `containerClassName` prop on Table preserves defaults for
all other callers.

The visual fixture now renders the actual AdminLayout (navigation content only
is mocked) and checks full-width main/navigation at 1920px, document scrolling
over table rows, no vertical table scroll, and sticky heading behavior.
