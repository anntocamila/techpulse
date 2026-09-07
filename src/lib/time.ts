const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** "hace 3 horas" for past dates, "dentro de 5 días" for future ones. */
export function timeAgo(isoDate: string): string {
  const diff = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  const seconds = Math.abs(diff);
  if (seconds < 60) return "ahora";

  for (const [unit, secondsInUnit] of UNITS) {
    if (seconds >= secondsInUnit) {
      const value = Math.floor(seconds / secondsInUnit);
      return rtf.format(diff > 0 ? -value : value, unit);
    }
  }
  return "ahora";
}

/** "15 sep" or "15 sep – 17 sep" for event ranges. */
export function formatEventDate(startIso: string, endIso?: string): string {
  const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });
  const start = fmt.format(new Date(startIso));
  if (!endIso || endIso === startIso) return start;
  return `${start} – ${fmt.format(new Date(endIso))}`;
}
