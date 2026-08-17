function toLocalDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Fecha inválida.');
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Fecha inválida: ${value}.`);
  const [, year, month, day] = match.map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Fecha inválida: ${value}.`);
  }
  return date;
}

export function nextSpecialDate(dateValue, recurring, referenceDate = new Date()) {
  const original = toLocalDate(dateValue);
  if (!recurring) return original;

  const reference = toLocalDate(referenceDate);
  const month = original.getMonth();
  const day = original.getDate();

  function occurrenceForYear(year) {
    const monthEnd = new Date(0);
    monthEnd.setHours(0, 0, 0, 0);
    monthEnd.setFullYear(year, month + 1, 0);
    const lastDay = monthEnd.getDate();
    const occurrence = new Date(0);
    occurrence.setHours(0, 0, 0, 0);
    occurrence.setFullYear(year, month, Math.min(day, lastDay));
    return occurrence;
  }

  let occurrence = occurrenceForYear(reference.getFullYear());
  if (occurrence < reference) {
    occurrence = occurrenceForYear(reference.getFullYear() + 1);
  }
  return occurrence;
}
