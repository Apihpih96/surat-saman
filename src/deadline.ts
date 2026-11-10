/** Deadline helpers. All "today" calculations use Malaysia time (UTC+8, no DST). */
export const MY_TZ = 'Asia/Kuala_Lumpur';

/** Today's calendar date in Malaysia as YYYY-MM-DD. */
export function todayInMalaysia(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MY_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Normalise whatever the model gave us into YYYY-MM-DD or null.
 * Accepts ISO (2026-11-27, 2026-11-27T00:00:00Z) and Malaysian
 * day-first formats (27/11/2026, 27-11-2026, 27.11.2026).
 */
export function normalizeDeadline(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || /^(null|none|n\/a|tiada|-)$/i.test(v)) return null;
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Whole days from today (Malaysia) to the deadline. Negative = overdue. */
export function daysLeft(deadline: string | null, now: Date = new Date()): number | null {
  const iso = normalizeDeadline(deadline);
  if (!iso) return null;
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(iso) - toUtc(todayInMalaysia(now))) / 86_400_000);
}

export type Urgency = 'low' | 'medium' | 'high';

/** Never let the model under-state urgency when the date says otherwise. */
export function adjustUrgency(modelUrgency: Urgency, days: number | null): Urgency {
  if (days === null) return modelUrgency;
  if (days <= 7) return 'high';
  if (days <= 21 && modelUrgency === 'low') return 'medium';
  return modelUrgency;
}

export function describeDaysLeft(days: number | null, lang: 'ms' | 'en'): string {
  if (days === null) return lang === 'ms' ? 'Tiada tarikh akhir' : 'No deadline';
  if (days < 0) {
    const n = -days;
    return lang === 'ms' ? `Lewat ${n} hari` : `${n} day${n === 1 ? '' : 's'} overdue`;
  }
  if (days === 0) return lang === 'ms' ? 'Hari ini!' : 'Due today!';
  if (days === 1) return lang === 'ms' ? 'Esok' : 'Tomorrow';
  return lang === 'ms' ? `${days} hari lagi` : `${days} days left`;
}
