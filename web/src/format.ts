import type { Cards } from './types';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = MONTHS.map((m) => m.slice(0, 3));

const nf = new Intl.NumberFormat('en-US');
export const num = (n: number | null | undefined) => (n == null ? '–' : nf.format(Math.round(n)));

/** 85 -> "85", 4812 -> "4.8k", 12345 -> "12k" */
export function compact(n: number | null | undefined): string {
  if (n == null) return '–';
  const r = Math.round(n);
  if (r < 1000) return String(r);
  if (r < 10000) return (r / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(r / 1000) + 'k';
}

/** +31.4 -> "▲ 31%", -12.5 -> "▼ 13%", 855 -> "▲ 9.6×" */
export function pctShort(p: number | null | undefined): string {
  if (p == null) return '–';
  const arrow = p > 0 ? '▲' : p < 0 ? '▼' : '';
  if (p >= 200) return `${arrow}${(p / 100 + 1).toFixed(p >= 900 ? 0 : 1)}×`;
  return `${arrow}${Math.abs(Math.round(p))}%`;
}

export function pctLong(p: number | null | undefined): string {
  if (p == null) return 'no average to compare with';
  const r = Math.round(p);
  if (r === 0) return 'equal to the average';
  if (p >= 200) return `▲ ${(p / 100 + 1).toFixed(1)}× the average`;
  return r > 0 ? `▲ ${r}% above average` : `▼ ${Math.abs(r)}% below average`;
}

/** 1 -> "1st", 22 -> "22nd" */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

/** "1715" -> "17:15 UTC" (FIRMS acquisition time) */
export const timeUtc = (hhmm: string) => `${hhmm.slice(0, 2)}:${hhmm.slice(2)} UTC`;

/** "2020-09-14" -> "14 Sep 2020" */
export function dateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${d} ${MON[m - 1]} ${y}` : iso;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** The tool's one message for a month (wording only: every number is the API's). Shared with the landing page. */
export function headlineFor(c: Cards): string {
  const month = MONTHS[c.ref_month - 1];
  const p = c.vs_avg_pct;
  const scope = c.partial ? `the first ${c.days_covered} days of ${month}` : month;
  if (!c.count) return `No fires detected around you in ${scope}`;
  if (p == null) return `${num(c.count)} fire-days around you in ${scope}`;
  if (p >= 200) return `Fire activity around you is ${(p / 100 + 1).toFixed(1)}× the normal level`;
  if (p >= 20) return `Fire activity around you is ${Math.round(p)}% above normal`;
  if (p <= -20) return `Fire activity around you is ${Math.abs(Math.round(p))}% below normal`;
  return 'Fire activity around you is close to normal';
}
