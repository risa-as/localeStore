# Advertising totals: August–September versus August–October

## Follow-up: confirmed page-level defect and fix

The user's subsequent screenshot/text showed the applied-period label ending
September 30 while totals still included October. Inspection of the actual
profit page identified the cause: both branches of `defaultTo` used today's
Iraq date; the branch for a supplied `searchParams.to` ignored its value.
The prior direct action checks bypassed this defective page wiring, and the
prior picker-only UI test did not execute the server page. Thus the previous
UI improvement did not fix the underlying defect.

The supplied end date is now parsed and passed to all report queries, including
orders, expenses, campaign detail and the preceding comparison window. Applied
labels are derived from those actual Date values. The unified expenses table's
profit link now carries the dates of the loaded data, even if the user has
subsequently edited unapplied date inputs.

`lib/profit-page.test.ts` executes the actual async page with mocked read actions
and checks all query periods, the rendered order count and dates, plus the
default at an Iraq/UTC day boundary. Two regression tests pass. No financial
records were changed; the fix is local and has not been deployed to production.

The pasted expense table specifies 2026-08-01 through 2026-09-30. Read-only
queries reproduce USD 6047.55 / IQD 8285143.50 from 255 daily observations across
16 products. The UI rounds the IQD total to 8285144.

October 1–24 stored spend is IQD 2395017.73. Adding it yields IQD 10680161.23,
exactly the imported ad total pasted from the profit report. That larger period
has 19 advertised products. Its completed-order count (1511) and collected amount
(IQD 45282000) also exactly match the pasted profit report. August–September
alone has 1269 completed orders and IQD 38577000 collected.

Both actual local read functions were executed against the connected database
with a diagnostic administrator stub (no session/browser access or mutations):
getExpenseStatsForPeriod at noon UTC, and getUnifiedCampaignRows at midnight UTC.
They both return IQD 8285143.50 for August–September and IQD 10680161.23 for
August 1–October 24. There are no overlapping manual ad entries in August–September.
The evidence establishes that the pasted reports represent different effective
periods. It does not establish which interaction or deployed version produced
the wider profit period, despite the supplied link ending on September 30.

Local UI improvement: the server-rendered profit header states its applied
period explicitly; changed but unapplied date inputs show a warning; invalid
ranges cannot submit; applying a period shows a navigation pending state. The
picker is keyed by the applied range so browser/server navigation cannot leave
old draft dates displayed against a different report.

Checks: TypeScript, ESLint, and an isolated browser regression for draft warning,
query navigation, applied range stability and date reset on report navigation.
No financial data was changed and no production deployment was performed.
