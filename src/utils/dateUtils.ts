const MADRID_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function isoDayNumber(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || match[1] === '0000') throw new Error(`Fecha inválida: ${value}.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Fecha inválida: ${value}.`);
  }
  return Math.floor(date.getTime() / 86_400_000);
}

export function todayInMadrid(referenceDate = new Date()) {
  if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
    throw new Error('La fecha de referencia no es válida.');
  }
  const parts = Object.fromEntries(
    MADRID_DATE_FORMATTER.formatToParts(referenceDate).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function daysTogether(startDate: string, referenceDate = new Date()) {
  return Math.max(0, isoDayNumber(todayInMadrid(referenceDate)) - isoDayNumber(startDate));
}

export function isStreakBroken(lastConfirmedDay: string | null, referenceDate = new Date()) {
  if (lastConfirmedDay === null) return false;
  return isoDayNumber(lastConfirmedDay) < isoDayNumber(todayInMadrid(referenceDate)) - 1;
}
