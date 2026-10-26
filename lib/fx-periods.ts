import { accountingDay } from "./accounting-dates";

/** Both dates entered in the FX editor are inclusive calendar dates. */
export function fxPeriodWhere(value: Date) {
  const day = accountingDay(value);
  return { fromDate: { lte: day }, OR: [{ toDate: null }, { toDate: { gte: day } }] };
}

export function fxPeriodIncludes(period: { fromDate: Date; toDate: Date | null }, value: Date) {
  const day = accountingDay(value);
  return period.fromDate <= day && (period.toDate === null || period.toDate >= day);
}
