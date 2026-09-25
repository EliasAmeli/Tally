/** Parses "9:00am", "9am", "17:00" etc into minutes since midnight. */
export function parseTimeToMinutes(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];

  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/** Hours between two time-of-day strings, handling shifts that cross midnight. */
export function hoursBetween(start: string, end: string): number {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin === null || endMin === null) return 0;

  const diff = endMin >= startMin ? endMin - startMin : 24 * 60 - startMin + endMin;
  return Math.round((diff / 60) * 100) / 100;
}
