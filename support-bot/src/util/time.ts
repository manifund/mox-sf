/** Timezone-aware helpers. Everything the bot decides by the clock goes through here. */

export type Hhmm = `${number}:${number}` | string;

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface LocalParts {
  hour: number;
  minute: number;
  /** 0 = Sunday */
  dow: number;
  dayKey: DayKey;
  /** minutes since local midnight */
  minutesOfDay: number;
  ymd: string; // YYYY-MM-DD
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date: Date, tz: string): LocalParts {
  const parts = fmt(tz).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some ICU versions render midnight as 24
  const minute = parseInt(get("minute"), 10);
  const dow = WEEKDAY_INDEX[get("weekday")] ?? 0;
  return {
    hour,
    minute,
    dow,
    dayKey: DAY_KEYS[dow] ?? "sun",
    minutesOfDay: hour * 60 + minute,
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function parseHhmm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Bad HH:MM value: "${s}"`);
  const h = parseInt(m[1]!, 10);
  const mi = parseInt(m[2]!, 10);
  if (h > 24 || mi > 59) throw new Error(`Bad HH:MM value: "${s}"`);
  return h * 60 + mi;
}

/**
 * Half-open interval test [start, end) in minutes-of-day, wrapping past midnight
 * when start > end. "24:00" as an end means "until midnight".
 * 16:59 with 00:00–17:00 -> true; 17:00 -> false; 23:59 -> false; 00:00 -> true.
 */
export function inWindow(minutesOfDay: number, start: string, end: string): boolean {
  const s = parseHhmm(start);
  const e = parseHhmm(end);
  if (s === e) return true; // whole day
  if (s < e) return minutesOfDay >= s && minutesOfDay < e;
  return minutesOfDay >= s || minutesOfDay < e; // wraps midnight
}

export interface HoursWindow {
  start: string;
  end: string;
  days: readonly string[];
  tz: string;
}

export function isInsideHours(now: Date, w: HoursWindow): boolean {
  const lp = localParts(now, w.tz);
  if (!w.days.map((d) => d.toLowerCase()).includes(lp.dayKey)) return false;
  return inWindow(lp.minutesOfDay, w.start, w.end);
}

/**
 * How many minutes between `from` and `to` fall inside the staffed window
 * (every day, no weekend rule — the spec's "staffed hours" is a time-of-day window).
 * Walks minute-by-minute across at most ~14 days; tickets older than that just
 * saturate, which is all the nudge job needs.
 */
export function staffedMinutesBetween(from: Date, to: Date, w: HoursWindow): number {
  if (to <= from) return 0;
  const capMs = 14 * 24 * 60 * 60 * 1000;
  const end = Math.min(to.getTime(), from.getTime() + capMs);
  let total = 0;
  // step in 5-minute increments for speed; precision of 5 min is plenty for a 4h rule
  const step = 5 * 60 * 1000;
  for (let t = from.getTime(); t < end; t += step) {
    if (isInsideHours(new Date(t), w)) total += 5;
  }
  return total;
}

/** Midnight at the start of today in `tz`, as an ISO instant. */
export function startOfLocalDayIso(tz: string, now = new Date()): string {
  const lp = localParts(now, tz);
  const back = lp.minutesOfDay * 60000 + now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();
  return new Date(now.getTime() - back).toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function minutesSince(iso: string, now = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / 60000;
}

/** "8m", "2h", "3d" */
export function ageShort(iso: string, now = new Date()): string {
  const mins = Math.max(0, Math.floor(minutesSince(iso, now)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

/** "12 min ago", "2h ago", "3d ago" */
export function ageLong(iso: string, now = new Date()): string {
  const mins = Math.max(0, Math.floor(minutesSince(iso, now)));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Duration between two ISO stamps as "2h", "45m", "3d" */
export function durationShort(fromIso: string, toIso: string): string {
  return ageShort(fromIso, new Date(toIso));
}

export function isoDaysAgo(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86400000).toISOString();
}
