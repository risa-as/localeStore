import { accountingDay, inclusiveDays, overlappingDays } from "./accounting-dates";

export function manualAdPortion(params: { amount: number; from: Date; to: Date; periodFrom: Date; periodTo: Date; coveredDates: string[] }) {
  const days = inclusiveDays(params.from, params.to);
  const overlap = overlappingDays(params.from, params.to, params.periodFrom, params.periodTo);
  const start = Math.max(accountingDay(params.from).getTime(), accountingDay(params.periodFrom).getTime());
  const end = Math.min(accountingDay(params.to).getTime(), accountingDay(params.periodTo).getTime());
  const covered = [...new Set(params.coveredDates)].filter(day => { const date = accountingDay(day).getTime(); return date >= start && date <= end; }).length;
  return { amount: days ? params.amount * Math.max(0, overlap - covered) / days : 0, replaced: days ? params.amount * covered / days : 0, remainingDays: Math.max(0, overlap - covered) };
}
