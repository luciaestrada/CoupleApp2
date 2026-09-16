const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  if (value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function parseCalendarDate(value) {
  const input = value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : input;
  return isIsoDate(iso) ? iso : null;
}
