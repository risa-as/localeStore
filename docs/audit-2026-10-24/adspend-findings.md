# Ad spend reconciliation — October 1–24, 2026

The connected database reproduced the owner's USD 1197.08 / 59 rows.
All 15 accounts were queried successfully; all use USD. No manual AdCampaign
entries overlap this period. The live daily Meta snapshot contained 72 rows
across 18 campaigns, totaling USD 1539.86. Current-day amounts continue changing.

## Confirmed causes

- R55 historical data had not been imported: 13 missing campaign/day rows.
  The magnetic holder campaign was missing October 14–22; the other missing
  rows belong to the brake-piston kit on October 1 and brake tools October 5–7.
- Four October 23 observations, USD 42.87, still belonged to the unclassified
  product after their campaigns had been linked. The previous link action only
  saved CampaignProductMap, without moving saved daily expense records.
- The previous daily upsert included productId in its unique key. Importing a
  relinked campaign could insert another observation instead of moving the old
  observation, potentially doubling spending. No such duplicate existed in the
  audited period before this repair.
- A daily sync log with 6 rows / 15 accounts is valid: 15 accounts were queried,
  but only six positive campaign/day observations were saved for that day. It
  does not say only six of the accounts were queried.

## Applied data repair

Saved the complete pre-write snapshot in adspend-before.json and the reviewed
plan in adspend-repair-plan.json. The repair changed 25 rows: 13 inserts, four
product reclassifications and eight amount/FX snapshot updates. Original FX
periods and manual expense entries were untouched. It checked that stored data,
product mappings and FX periods had not changed before committing all changes
in one transaction. adspend-after.json records the verified result.

- Total: USD 1539.86 / IQD 2395017.73, 72 rows.
- Magnetic holder: USD 287.41 / IQD 453245.57, 11 daily observations.
- Unclassified daily observations in this period: zero.

Run script: node --require tsx/cjs scripts/reconcile-adspend-oct24.cjs --apply.
The script refuses to repeat an already-applied repair. No Meta mutations.

## Local code fixes

- Shared storage serializes a campaign's expense writes, respects its latest
  manual mapping, and keeps one observation per campaign/day across products.
  Fresh Meta observations replace duplicate snapshots rather than summing them.
- Linking moves historical records atomically with the mapping, preserving their
  original amounts and FX values. Conflicting duplicate observations require a
  fresh Meta backfill instead of choosing an arbitrary historical amount.
- Range backfill uses daily insights (time_increment=1), one paginated request
  per account instead of one request per account/day. Missing FX and account
  failures remain explicit incomplete results.
- Live campaign rows show saved product spending and any spending still stored
  under a prior product. The sync label distinguishes queried accounts from rows.

Validation: focused Jest tests, TypeScript, ESLint, and an isolated PostgreSQL
storage regression for reclassification, original FX, stale mappings, duplicate
replacement, repeat imports and atomic conflict rollback. The data repair is
applied to the connected database; production code has not been deployed.
