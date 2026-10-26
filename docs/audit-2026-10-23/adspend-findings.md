# Ad spend reconciliation — 2026-10-23

The connected database reproduced the owner's October 1–23 total of USD 1061.13.
No overlapping manual ad campaigns existed in this period.

## Confirmed cause and repair

The owner configured 1370 IQD/USD from February 8 through October 5, followed by
1577 from October 6. FX lookup used `toDate > day`, excluding October 5 despite
the UI treating the end date as inclusive. Daily insights from the six accounts
identified exactly three omitted rows, all dated October 5:

| Account | Campaign | USD | Rate | IQD |
| --- | --- | ---: | ---: | ---: |
| R51 | 120247087554310037 — مفتاح تمديد | 9.96 | 1370 | 13645.20 |
| R54 | 120248243531640570 — حقنة تفريغ السوائل | 18.22 | 1370 | 24961.40 |
| R57 | 120251499871400308 — مخرطة فولاذية | 6.36 | 1370 | 8713.20 |
| Total | | 34.54 | | 47319.80 |

`scripts/reconcile-adspend-oct5.cjs` verified the live historical amounts, account
scope, currency, FX rate and product mappings, saved a pre-write report, and
upserted only these three rows in one database transaction. No Meta mutation,
FX-rate edit, current-day reimport or production code deployment was performed.
The report with `applied: true` contains before/after records and row IDs:
`adspend-oct5-2026-10-23T19-25-57-662Z.json`.

Post-repair October 1–23 stored total: **1095.67 USD / 1701007.13 IQD**.
The endpoint requires a page refresh to show the repaired rows.

## Separate snapshot and display issues

- The owner's live range snapshot reported the R52 campaign as 273.11 USD,
  whereas its stored daily total was 273.17 USD. Live daily insights later
  reported 273.84 USD; the only differing stored day was October 23 (18.17
  stored versus 18.84 live at that check). This is separate from the missing
  historical 34.54 USD: live spend during the current day keeps changing.
- FX usage counters loaded only at mount and after rate edits. Importing spend
  refreshed the unified table but left the rate card stale. Actual usage after
  repair is 260 stored rows / 6114.65 USD at 1370, and 41 rows / 965.89 USD at
  1577, across all stored dates. The card now reloads after imports and syncs.
- The counter is rows, not distinct calendar days; the label now says rows.

## Local code changes

- Inclusive FX date lookup shared by imports, manual expense conversion and
  profit calculations; Baghdad's calendar date selects the current rate.
- Missing-rate imports return an incomplete result with each excluded date,
  currency and amount, persisted visibly below the period controls.
- Live campaigns reload after import and show a fetch timestamp. Current-day
  spend is explicitly described as changing between snapshots.
- Account and insight requests follow all Graph pagination cursors.
- No schema migration is needed. These code/UI fixes require deployment to
  update the published application; only the scoped data repair is already applied.
