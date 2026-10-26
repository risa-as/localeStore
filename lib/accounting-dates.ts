/** Accounting entries use calendar dates, independently of the caller's clock. */
export function accountingDay(value: Date | string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("تاريخ غير صالح");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function inclusiveDays(from: Date, to: Date): number {
  return Math.max(0, Math.round((accountingDay(to).getTime() - accountingDay(from).getTime()) / 86400000) + 1);
}

export function overlappingDays(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): number {
  return inclusiveDays(new Date(Math.max(accountingDay(aFrom).getTime(), accountingDay(bFrom).getTime())), new Date(Math.min(accountingDay(aTo).getTime(), accountingDay(bTo).getTime())));
}
