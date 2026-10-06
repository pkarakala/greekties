/** Compact relative time: "now", "2m", "1h", "3d", "5w". */
export function timeAgoShort(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}w`;
  return `${Math.floor(days / 365)}y`;
}

/** Clock time like "2:14 PM" for message bubbles. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
export function eventDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(+date)) return '';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
export function eventClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
export function toLocalDateTimeFields(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(+d)) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
/** Reject rollover and DST gaps. A repeated wall time requires an explicit
 * occurrence; unchanged edits retain the original instant, including seconds. */
export function localDateTimeCandidates(date: string, time: string): Date[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return [];
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  if (y < 100 || m < 1 || m > 12 || d < 1 || h > 23 || min > 59) return [];
  const first = new Date(y, m - 1, d, h, min);
  const matches = (value: Date) => {
    const f = toLocalDateTimeFields(value.toISOString());
    return f.date === date && f.time === time;
  };
  if (!matches(first)) return [];
  const found = [first];
  // Covers non-hour transitions too (e.g. Lord Howe's 30-minute fall back).
  for (let offset = 1; offset <= 180; offset++) {
    const other = new Date(+first + offset * 60000);
    if (matches(other)) found.push(other);
  }
  return found;
}
export function parseLocalDateTime(
  date: string,
  time: string,
  original?: string | null,
  occurrence?: string,
): Date | null {
  if (original) {
    const fields = toLocalDateTimeFields(original);
    if (fields.date === date && fields.time === time && !occurrence) return new Date(original);
  }
  const options = localDateTimeCandidates(date, time);
  return options.length === 1
    ? options[0]
    : (options.find((d) => d.toISOString() === occurrence) ?? null);
}
export function eventPhase(
  event: { starts_at: string; ends_at?: string | null },
  now = Date.now(),
): 'Upcoming' | 'Happening now' | 'Ended' {
  const start = Date.parse(event.starts_at),
    end = event.ends_at ? Date.parse(event.ends_at) : null;
  if (!Number.isFinite(start) || (end !== null && end <= now)) return 'Ended';
  if (start > now) return 'Upcoming';
  return end !== null && end > now ? 'Happening now' : 'Ended';
}
