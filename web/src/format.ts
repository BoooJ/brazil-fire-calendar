import type { Cards, Coverage, SatelliteKey } from './types';

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
  // arrows only outside the ±20% "near average" band (as the legends); inside it a plain sign
  const arrow = p >= 20 ? '▲' : p <= -20 ? '▼' : Math.round(p) > 0 ? '+' : Math.round(p) < 0 ? '−' : '';
  if (p >= 200) return `${arrow}${(p / 100 + 1).toFixed(p >= 900 ? 0 : 1)}×`;
  return `${arrow}${Math.abs(Math.round(p))}%`;
}

/** Plain words for the quick view: "▲ 31% above typical", "● close to typical", "▲ 7.0× typical" */
export function vsTypical(p: number | null | undefined): string {
  if (p == null) return 'nothing to compare with yet';
  if (p >= 200) return `▲ ${(p / 100 + 1).toFixed(1)}× typical`;
  if (p >= 20) return `▲ ${Math.round(p)}% above typical`;
  if (p <= -20) return `▼ ${Math.abs(Math.round(p))}% below typical`;
  return '● close to typical';
}

export function pctLong(p: number | null | undefined): string {
  if (p == null) return 'no average to compare with';
  const r = Math.round(p);
  if (r === 0) return 'equal to the average';
  if (p >= 200) return `▲ ${(p / 100 + 1).toFixed(1)}× the average`;
  // within ±20% the legends call it "near average": a neutral ● instead of an arrow (same band as trendOf)
  const mark = p >= 20 ? '▲' : p <= -20 ? '▼' : '●';
  return r > 0 ? `${mark} ${r}% above average` : `${mark} ${Math.abs(r)}% below average`;
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

/** "2026-11-14", "2026-11-20" -> "14–20 Nov 2026" (same month) or "28 Nov – 4 Dec 2026" */
export function dateRange(from: string, to: string): string {
  const a = dateShort(from).split(' ');
  const b = dateShort(to).split(' ');
  if (a.length !== 3 || b.length !== 3) return `${from} – ${to}`;
  if (a[2] !== b[2]) return `${dateShort(from)} – ${dateShort(to)}`;
  if (a[1] !== b[1]) return `${a[0]} ${a[1]} – ${b.join(' ')}`;
  return `${a[0]}–${b.join(' ')}`;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Up, down or near a typical month: drives the ▲/▼/● mark and its calm colour (display only). */
export const trendOf = (c: Cards): 'up' | 'down' | 'flat' | null =>
  !c.count || c.vs_avg_pct == null ? null : c.vs_avg_pct >= 20 ? 'up' : c.vs_avg_pct <= -20 ? 'down' : 'flat';

/** The tool's one message for a month, in three parts so the middle can be set in ink and the rest in grey:
 *  "Fire activity is" + "31% higher" + "than a typical November". Wording only: every number is the API's.
 *  `n` is the number inside `strong` (so it can roll when the data changes). Shared with the landing page. */
export function headlineParts(c: Cards): { lead: string; strong: string; tail: string; n?: number } {
  const month = MONTHS[c.ref_month - 1];
  const p = c.vs_avg_pct;
  if (!c.count) return { lead: '', strong: 'No fire detected', tail: c.partial ? `here so far this ${month}` : `here in ${month} ${c.ref_year}` };
  if (p == null) return { lead: '', strong: 'Fire was detected', tail: `here in ${month}, with no earlier year to compare` };
  if (p >= 200) return { lead: 'Fire activity is', strong: `${(p / 100 + 1).toFixed(1)}×`, tail: `a typical ${month}` };
  if (p >= 20) return { lead: 'Fire activity is', strong: `${Math.round(p)}% higher`, tail: `than a typical ${month}`, n: Math.round(p) };
  if (p <= -20) return { lead: 'Fire activity is', strong: `${Math.abs(Math.round(p))}% lower`, tail: `than a typical ${month}`, n: Math.abs(Math.round(p)) };
  return { lead: 'Fire activity is', strong: 'close to', tail: `a typical ${month}` };
}
export const headlineFor = (c: Cards): string => {
  const h = headlineParts(c);
  return [h.lead, h.strong, h.tail].filter(Boolean).join(' ');
};

/** "One of the most active Novembers in 24 years", only for the top three (the API's rank, as is). */
export function rankLine(c: Cards): string | null {
  if (c.rank == null || c.of_years == null || c.of_years < 5 || c.rank > 3 || !c.count) return null;
  const month = MONTHS[c.ref_month - 1];
  return c.rank === 1
    ? `The most active ${month} in ${c.of_years} years${c.partial ? ' so far' : ''}`
    : `One of the ${c.rank === 2 ? 'two' : 'three'} most active ${month}s in ${c.of_years} years${c.partial ? ' so far' : ''}`;
}

/** A satellite that started or stopped inside (or stopped before) a month: "ended 2 Nov 2026" / "from 20 Jan 2012" (also explains "no data" before launch). From /api/status coverage, display only. */
export function coverageNote(coverage: Coverage[] | null | undefined, sat: SatelliteKey, year: number, month: number): string | null {
  const c = coverage?.find((x) => x.satellite === sat);
  if (!c) return null;
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = `${year}-${String(month).padStart(2, '0')}-31`;
  if (c.to && c.to < last) return `ended ${dateShort(c.to)}`;
  if (c.from > first) return `from ${dateShort(c.from)}`;
  return null;
}
