import { differenceInCalendarDays, isBefore, startOfDay, subDays } from 'date-fns';

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

export function daysTogether(startDate) {
  const date = toDate(startDate);
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.max(0, differenceInCalendarDays(new Date(), date));
}

export function isStreakBroken(lastConfirmedDay) {
  const date = toDate(lastConfirmedDay);
  if (!date || Number.isNaN(date.getTime())) return false;
  return isBefore(startOfDay(date), startOfDay(subDays(new Date(), 1)));
}
